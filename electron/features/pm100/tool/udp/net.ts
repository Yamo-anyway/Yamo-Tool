import os from "os";
import dgram from "dgram";
import { DeviceRow } from "../../../../../src/PM100Tool/PM100Tool";

export const PM100_PORT = 1500; // ✅ 장치 수신 포트
export const SEARCH_MASK = "255.255.255.0"; // ✅ 기존처럼 마스크 기반 브로드캐스트 계산

export type PM100DeviceInfo = {
  mac: string;
  ip: string;
  serverIp: string;
  subnetMask: string;
  gateway: string;
  serverPort: number;
  version: string;
};

export type UdpScanStartOptions = {
  port?: number; // ✅ 장치 포트(기본 1500) - 여기선 PM100_PORT로 고정 사용해도 됨
  intervalMs?: number; // default 2000
  count?: number; // default 5
  mask?: string; // ✅ SEARCH_MASK 대체 가능
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

// function toHex(bytes: Uint8Array | Buffer) {
//   return Array.from(bytes)
//     .map((b) => b.toString(16).padStart(2, "0"))
//     .join(" ");
// }

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

// ✅ 브로드캐스트 타겟은 NIC별로 계산 (기존 “잘 되는 코드” 방식)
function getBroadcastTargets(mask: string) {
  const nets = os.networkInterfaces();
  const targets = new Set<string>();

  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || (a as any).family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      targets.add(broadcastByMask(a.address, mask));
    }
  }

  if (targets.size === 0) targets.add("255.255.255.255");
  return Array.from(targets);
}

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
  if (msg.length < 46) return null;

  const tag = msg.slice(0, 6).toString("ascii");
  if (tag !== "CG_RES") return null;

  const mac = formatMac(msg, 6);
  const version = `${msg[13]}.${msg[14]}`;

  const ip = formatIp(msg, 15);
  const serverIp = formatIp(msg, 19);
  const subnetMask = formatIp(msg, 27);
  const gateway = formatIp(msg, 31);
  const serverPort = msg.readUInt16BE(35);

  return { mac, ip, serverIp, subnetMask, gateway, serverPort, version };
}

function toDeviceRow(info: PM100DeviceInfo, rawBytes: Uint8Array): DeviceRow {
  return {
    key: "sss",
    type: "UDP", // ✅ 여기 추가
    isDetail: false,
    macStr: info.mac,
    deviceIpStr: info.ip,
    serverIpStr: info.serverIp,
    subnetStr: info.subnetMask,
    gatewayStr: info.gateway,
    serverPort: info.serverPort,
    raw: {
      rawBytes,
      version: info.version,
    },
  };
}

// ---------- scanner ----------
export function createPM100UdpScanner(events: UdpScanEvents) {
  let socket: dgram.Socket | null = null;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  // ✅ mac 중복 제거 저장소 (스캔 1회 동안 유지)
  const deviceMap = new Map<string, DeviceRow>();

  const defaults = {
    port: PM100_PORT,
    intervalMs: 2000,
    count: 5,
    mask: SEARCH_MASK,
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

    // ✅ restart는 UI 토글 깨질 수 있으니 stopped 이벤트 안 보냄
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
    const mask = String(opts?.mask ?? defaults.mask);

    // 내부 정리(렌더러 UI 건드리면 안 됨)
    cleanup("restart");

    running = true;

    // ✅ 기존 “잘 되는 코드”처럼 reuseAddr 사용 + 1500 bind
    socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    socket.on("error", (err) => {
      events.log(`UDP error: ${err.message}`);
      cleanup("socket error");
    });

    socket.on("message", (msg, rinfo) => {
      if (!running) return;

      // ✅ UDP RX 로그
      // events.log(`UDP RX: ${rinfo.address}:${rinfo.port}  ${toHex(msg)}`);

      // raw 이벤트
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

      // ✅ mac 중복 제거 저장 + 갱신/추가
      const prev = deviceMap.get(row.macStr);
      deviceMap.set(row.macStr, row);

      // ✅ 변동 있을 때만 discovered 쏘기(원하면 단순히 매번 보내도 OK)
      if (
        !prev ||
        prev.deviceIpStr !== row.deviceIpStr ||
        prev.serverIpStr !== row.serverIpStr ||
        prev.serverPort !== row.serverPort
      ) {
        events.discovered(row);
      }
    });

    // ✅ PM100_PORT(1500)로 bind (너 “잘 되는 코드”와 동일)
    await new Promise<void>((resolve, reject) => {
      try {
        socket!.bind(PM100_PORT, () => {
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

    const targets = getBroadcastTargets(mask);
    events.log(
      `Scan start: port=${PM100_PORT}, mask=${mask}, targets=${targets.join(", ")}`,
    );

    const sendOnce = () => {
      if (!socket || !running) return;

      const packet = buildDiscoveryPacket();

      // ✅ TX 로그(전체 패킷)
      // events.log(`UDP TX: ${toHex(packet)}`);

      // 여러 target으로 브로드캐스트
      for (const host of targets) {
        socket.send(packet, PM100_PORT, host, (err) => {
          if (err) {
            events.log(`Send fail -> ${host}:${PM100_PORT} : ${err.message}`);
          }
          // else {
          //   events.log(`Sent -> ${host}:${PM100_PORT}`);
          // }
        });
      }
    };

    // ✅ 즉시 1회 + 2초 간격 총 countMax회
    let count = 1;
    sendOnce();

    timer = setInterval(() => {
      count += 1;

      if (count > countMax) {
        cleanup("completed");
        return;
      }

      // events.log(`Resend (${count}/${countMax})`);
      sendOnce();
    }, intervalMs);
  }

  function stop(reason?: string) {
    if (!running) return;
    cleanup(reason ?? "manual stop");
  }

  return { start, stop, isRunning: () => running };
}
