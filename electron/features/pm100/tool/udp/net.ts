import os from "os";
import dgram from "dgram";
import { DeviceRow } from "../../../../../src/PM100Tool/PM100Tool";

export const PM100_PORT = 1500; // ✅ 장치 수신(목표) 포트

/**
 * ✅ 응답 구조(실데이터 검증 완료)
 * tag(6) = "CG_RES"
 * mac(6)
 * block(27) =
 *   cmd(1)
 *   version(2)
 *   deviceIp(4)
 *   subnetMask(4)
 *   gateway(4)
 *   serverIp(4)
 *   serverPort(2)        // ✅ UInt16BE
 *   ncno(3)              // s1,s2,s3 mode
 *   delayTime(3)         // s1,s2,s3 delay
 * xorBlock(1) = XOR(block 27 bytes)
 * xorAll(1)   = XOR( tag+mac+block+xorBlock )  (즉, 마지막 1바이트 직전까지 전부 XOR)
 *
 * 총 길이 = 6+6+27+1+1 = 41 bytes
 */
export type PM100DeviceInfo = {
  mac: string;
  cmd: number;
  version: string;

  ip: string;
  subnetMask: string;
  gateway: string;
  serverIp: string;
  serverPort: number; // uint16

  s1Mode: number;
  s2Mode: number;
  s3Mode: number;

  s1Enable: number;
  s2Enable: number;
  s3Enable: number;

  s1DelayTime: number;
  s2DelayTime: number;
  s3DelayTime: number;

  // 검증/디버깅용
  receivedXorBlock: number;
  receivedXorAll: number;
  calcXorBlock: number;
  calcXorAll: number;
};

export type UdpScanStartOptions = {
  /** ✅ 우리(PC) 수신(bind) 포트. 기본: 1500 */
  port?: number;
  intervalMs?: number; // default 2000
  count?: number; // default 5
};

export type UdpScanEvents = {
  log: (line: string) => void;
  raw: (payload: { from: any; bytes: number[] }) => void;
  discovered: (row: DeviceRow) => void;
  stopped: (payload: { reason: string; found: number }) => void;
};

// ---------- util ----------
function xorChecksum(buf: Buffer): number {
  let x = 0;
  for (const b of buf) x ^= b;
  return x & 0xff;
}

export function buildDiscoveryPacket(): Buffer {
  const body = Buffer.from([
    0x43,
    0x47,
    0x5f,
    0x43,
    0x4d,
    0x44, // "CG_CMD"
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00, // MAC 6 bytes (0)
  ]);
  const cs = xorChecksum(body);
  return Buffer.concat([body, Buffer.from([cs])]); // ✅ 13 bytes
}

function ipToU32(ip: string) {
  const [a, b, c, d] = ip.split(".").map((x) => parseInt(x, 10));
  return (((a << 24) >>> 0) | (b << 16) | (c << 8) | d) >>> 0;
}

function u32ToIp(u: number) {
  const a = (u >>> 24) & 255;
  const b = (u >>> 16) & 255;
  const c = (u >>> 8) & 255;
  const d = u & 255;
  return `${a}.${b}.${c}.${d}`;
}

function broadcastByMask(ip: string, mask: string) {
  const ipU = ipToU32(ip);
  const maskU = ipToU32(mask);
  const bcast = (ipU | (~maskU >>> 0)) >>> 0;
  return u32ToIp(bcast);
}

function getBroadcastTargets() {
  const nets = os.networkInterfaces();
  const targets = new Set<string>();

  // ✅ 전역 브로드캐스트도 항상 포함
  targets.add("255.255.255.255");

  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || (a as any).family === 4;
      if (!isV4) continue;
      if (a.internal) continue;

      const address = (a as any).address;
      const mask = (a as any).netmask;

      if (!address || !mask) continue;

      const bcast = broadcastByMask(address, mask);
      targets.add(bcast);
    }
  }

  // 192.168.x.255 전체 추가
  for (let x = 0; x <= 255; x++) {
    targets.add(`192.168.${x}.255`);
  }

  return Array.from(targets);
}

// function getBroadcastTargets() {
//   const nets = os.networkInterfaces();
//   const targets = new Set<string>();

//   for (const ifname of Object.keys(nets)) {
//     for (const a of nets[ifname] || []) {
//       const isV4 = a.family === "IPv4" || (a as any).family === 4;
//       if (!isV4) continue;
//       if (a.internal) continue;

//       const mask = (a as any).netmask;
//       if (!mask) continue;

//       targets.add(broadcastByMask(a.address, mask));
//     }
//   }

//   if (targets.size === 0) targets.add("255.255.255.255");
//   return Array.from(targets);
// }

function formatMac(msg: Buffer, offset: number) {
  return Array.from(msg.slice(offset, offset + 6))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(":")
    .toUpperCase();
}

function formatIp(msg: Buffer, offset: number) {
  return `${msg[offset]}.${msg[offset + 1]}.${msg[offset + 2]}.${msg[offset + 3]}`;
}

export function parsePM100Response(msg: Buffer): PM100DeviceInfo | null {
  // 총 길이 = 47
  if (msg.length < 47) return null;

  const tag = msg.slice(0, 6).toString("ascii");
  if (tag !== "CG_RES") return null;

  let o = 6;

  const mac = formatMac(msg, o);
  o += 6;

  const blockOffset = o;
  let blockLen = 0;

  // block(27) 파싱
  const cmd = msg[o];
  o += 1;
  blockLen += 1;

  const verMajor = msg[o];
  const verMinor = msg[o + 1];
  const version = `${verMajor}.${verMinor}`;
  o += 2;
  blockLen += 2;

  const ip = formatIp(msg, o);
  o += 4;
  blockLen += 4;

  const subnetMask = formatIp(msg, o);
  o += 4;
  blockLen += 4;

  const gateway = formatIp(msg, o);
  o += 4;
  blockLen += 4;

  const serverIp = formatIp(msg, o);
  o += 4;
  blockLen += 4;

  // ✅ serverPort = 2 bytes (실데이터 기준)
  const serverPort = msg.readUInt16BE(o);
  o += 2;
  blockLen += 2;

  // ncno(3) = s1,s2,s3 mode
  const s1Mode = msg[o];
  const s2Mode = msg[o + 1];
  const s3Mode = msg[o + 2];
  o += 3;
  blockLen += 3;

  const s1Enable = msg[o];
  const s2Enable = msg[o + 1];
  const s3Enable = msg[o + 2];
  o += 3;
  blockLen += 3;

  // delayTime(3) = s1,s2,s3 delay
  const s1DelayTime = msg[o];
  const s2DelayTime = msg[o + 1];
  const s3DelayTime = msg[o + 2];
  o += 3;
  blockLen += 3;

  // status
  o += 3;
  blockLen += 3;

  o += 1;
  blockLen += 1;

  // xorBlock(1), xorAll(1)
  const receivedXorBlock = msg[o];
  const receivedXorAll = msg[o + 1];

  // ✅ 계산
  const block = msg.slice(blockOffset, blockOffset + blockLen); // cmd..delay 까지 27 bytes
  const calcXorBlock = xorChecksum(block);

  // xorAll = 마지막 바이트(xorAll) 제외한 전체 XOR
  const calcXorAll = xorChecksum(msg.slice(0, msg.length - 1));

  // ✅ 검증 (틀리면 버림)
  if (receivedXorBlock !== calcXorBlock) return null;
  if (receivedXorAll !== calcXorAll) return null;

  return {
    mac,
    cmd,
    version,

    ip,
    subnetMask,
    gateway,
    serverIp,
    serverPort,

    s1Mode,
    s2Mode,
    s3Mode,

    s1Enable,
    s2Enable,
    s3Enable,

    s1DelayTime,
    s2DelayTime,
    s3DelayTime,

    receivedXorBlock,
    receivedXorAll,
    calcXorBlock,
    calcXorAll,
  };
}

// ✅ UI 안정성: MAC 기반 key 고정
function keyFromMac(mac: string) {
  return (
    (mac
      .replace(/[^0-9A-F]/gi, "")
      .slice(-6)
      .split("")
      .reduce((acc, ch) => (acc * 16 + parseInt(ch, 16)) >>> 0, 0) %
      900000) +
    100000
  );
}

function toDeviceRow(info: PM100DeviceInfo, rawBytes: Uint8Array): DeviceRow {
  return {
    key: keyFromMac(info.mac),
    type: "UDP",
    isDetail: false,
    isEdit: false,

    macStr: info.mac,
    deviceIpStr: info.ip,
    subnetStr: info.subnetMask,
    gatewayStr: info.gateway,
    serverIpStr: info.serverIp,
    serverPort: info.serverPort,

    s1Mode: info.s1Mode,
    s2Mode: info.s2Mode,
    s3Mode: info.s3Mode,

    s1Enable: info.s1Enable,
    s2Enable: info.s2Enable,
    s3Enable: info.s3Enable,

    s1DelayTime: info.s1DelayTime,
    s2DelayTime: info.s2DelayTime,
    s3DelayTime: info.s3DelayTime,

    // 응답 구조에 status 없으면 0 유지
    s1Status: 0,
    s2Status: 0,
    s3Status: 0,

    raw: {
      rawBytes,
      cmd: info.cmd,
      version: info.version,
      xorBlock: info.receivedXorBlock,
      xorAll: info.receivedXorAll,
    },
  };
}

// ---------- scanner ----------
export function createPM100UdpScanner(events: UdpScanEvents) {
  let socket: dgram.Socket | null = null;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const deviceMap = new Map<string, DeviceRow>();

  const defaults = {
    port: PM100_PORT,
    intervalMs: 2000,
    count: 5,
  };

  function cleanup(reason?: string) {
    running = false;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (socket) {
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {}
      socket = null;
    }

    if (reason) events.log(`UDP 검색 멈춤: ${reason}`);

    if (reason !== "restart") {
      events.stopped({ reason: reason ?? "", found: deviceMap.size });
    }

    deviceMap.clear();
  }

  async function start(opts?: UdpScanStartOptions) {
    if (running) {
      events.log("scanStart ignored: already running");
      return;
    }

    const intervalMs = Number(opts?.intervalMs ?? defaults.intervalMs);
    const countMax = Number(opts?.count ?? defaults.count);
    const bindPort = Number(opts?.port ?? defaults.port);

    cleanup("restart");
    running = true;

    socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    socket.on("error", (err) => {
      events.log(`UDP error: ${err.message}`);
      cleanup("socket error");
    });

    socket.on("message", (msg, rinfo) => {
      if (!running) return;

      events.raw({
        from: {
          address: rinfo.address,
          port: rinfo.port,
          family: rinfo.family,
          size: rinfo.size,
        },
        bytes: Array.from(msg),
      });

      const info = parsePM100Response(msg);
      if (!info) return;

      const row = toDeviceRow(info, new Uint8Array(msg));

      const prev = deviceMap.get(row.macStr);
      deviceMap.set(row.macStr, row);

      // ✅ 변동 감지(새 필드 반영)
      if (
        !prev ||
        prev.deviceIpStr !== row.deviceIpStr ||
        prev.subnetStr !== row.subnetStr ||
        prev.gatewayStr !== row.gatewayStr ||
        prev.serverIpStr !== row.serverIpStr ||
        prev.serverPort !== row.serverPort ||
        prev.s1Mode !== row.s1Mode ||
        prev.s2Mode !== row.s2Mode ||
        prev.s3Mode !== row.s3Mode ||
        prev.s1DelayTime !== row.s1DelayTime ||
        prev.s2DelayTime !== row.s2DelayTime ||
        prev.s3DelayTime !== row.s3DelayTime
      ) {
        events.discovered(row);
      }
    });

    await new Promise<void>((resolve, reject) => {
      try {
        socket!.bind(bindPort, () => {
          try {
            socket!.setBroadcast(true);
            socket!.setRecvBufferSize(1024 * 1024);
          } catch {}
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });

    const targets = getBroadcastTargets();

    // events.log(
    //   `Scan start: bindPort=${bindPort}, devicePort=${PM100_PORT}, targets=${targets.join(", ")}`,
    // );

    const sendOnce = () => {
      if (!socket || !running) return;

      const packet = buildDiscoveryPacket();

      for (const host of targets) {
        socket.send(packet, PM100_PORT, host, (err) => {
          if (err) {
            events.log(`Send fail -> ${host}:${PM100_PORT} : ${err.message}`);
          }
        });
      }
    };

    let count = 1;
    sendOnce();

    timer = setInterval(() => {
      count += 1;

      if (count > countMax) {
        cleanup("completed");
        return;
      }

      sendOnce();
    }, intervalMs);
  }

  function stop(reason?: string) {
    if (!running) return;
    cleanup(reason ?? "manual stop");
  }

  return { start, stop, isRunning: () => running };
}
