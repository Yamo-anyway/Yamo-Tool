import os from "os";
import dgram from "dgram";
import { execSync } from "child_process";

export const PM100_PORT = 1500; // ✅ 장치가 수신하는 포트
export const SEARCH_MASK = "255.255.255.0";

function xorChecksum(buf: Buffer): number {
  let x = 0;
  for (const b of buf) x ^= b;
  return x & 0xff;
}

export function buildDiscoveryPacket(): Buffer {
  const body = Buffer.from([
    0x43, 0x47, 0x5f, 0x43, 0x4d, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
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

function pickLocalIPv4Fallback(): string | null {
  const nets = os.networkInterfaces();
  const ips: string[] = [];

  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || (a as any).family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      ips.push(a.address);
    }
  }

  if (ips.length === 0) return null;

  // ✅ 장치가 있는 대역 우선
  return (
    ips.find((ip) => ip.startsWith("192.168.1.")) || // ⭐️ 추가
    ips.find((ip) => ip.startsWith("192.168.")) ||
    ips.find((ip) => ip.startsWith("10.")) ||
    ips.find((ip) => ip.startsWith("172.16.")) ||
    ips[0]
  );
}

// ✅ 브로드캐스트 타겟은 “전부” (원래 방식 유지)
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

export type PM100DeviceInfo = {
  mac: string;
  ip: string;
  serverIp: string;
  subnetMask: string;
  gateway: string;
  serverPort: number;
  version: string;
};

export type UdpPayload = {
  from: string;
  size: number;
  hex?: string;
} & Partial<PM100DeviceInfo>;

function formatMac(buf: Buffer, offset: number) {
  return [...buf.slice(offset, offset + 6)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(":")
    .toUpperCase();
}
function formatIp(buf: Buffer, offset: number) {
  return [...buf.slice(offset, offset + 4)].join(".");
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

export class PM100Scanner {
  private socket: dgram.Socket | null = null;
  private resendTimer: NodeJS.Timeout | null = null;
  private isStopping = false;
  private cmdSocket: dgram.Socket | null = null;

  constructor(
    private onLog: (line: string) => void,
    private onUdp: (payload: UdpPayload) => void,
  ) {}

  start() {
    if (this.socket) {
      this.onLog("Scan already running (socket exists) - ignored");
      return;
    }

    const localIp = pickLocalIPv4Fallback();
    if (!localIp) {
      this.onLog("No local IPv4 found (cannot start scan)");
      return;
    }

    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    this.socket = socket;

    socket.on("error", (err) => {
      this.onLog(`UDP error: ${err.message}`);
      this.stop();
    });

    socket.on("message", (msg, rinfo) => {
      const parsed = parsePM100Response(msg);
      if (parsed) {
        this.onUdp({
          from: `${rinfo.address}:${rinfo.port}`,
          size: msg.length,
          ...parsed,
        });
      } else {
        const hex =
          msg
            .toString("hex")
            .match(/.{1,2}/g)
            ?.join(" ") ?? "";
        this.onUdp({
          from: `${rinfo.address}:${rinfo.port}`,
          size: msg.length,
          hex,
        });
      }
    });

    // ✅ localIp NIC에 정확히 붙임 (예전처럼)
    socket.bind(PM100_PORT, () => {
      const packet = buildDiscoveryPacket();

      socket.setBroadcast(true);
      socket.setRecvBufferSize(1024 * 1024);

      const targets = getBroadcastTargets(SEARCH_MASK);

      this.onLog(`Bind OK: ${localIp}`);
      this.onLog(
        `Scan start: port=${PM100_PORT}, mask=${SEARCH_MASK}, targets=${targets.join(", ")}`,
      );
      this.onLog(
        `Send ${packet.length} bytes: ${packet
          .toString("hex")
          .match(/.{1,2}/g)
          ?.join(" ")}`,
      );

      // 🔁 한 번에 여러 target으로 보내는 함수

      const sendOnce = () => {
        const packet = buildDiscoveryPacket();
        for (const host of targets) {
          socket.send(packet, PM100_PORT, host, (err) => {
            if (err)
              this.onLog(`Send fail -> ${host}:${PM100_PORT} : ${err.message}`);
            else this.onLog(`Sent -> ${host}:${PM100_PORT}`);
          });
        }
      };

      // ✅ 즉시 1회 전송
      sendOnce();

      // ✅ 2초 간격으로 최대 5회 재전송
      let count = 1;

      this.resendTimer = setInterval(() => {
        count += 1;

        if (count > 5) {
          if (this.resendTimer) {
            clearInterval(this.resendTimer);
            this.resendTimer = null;
          }
          return;
        }

        this.onLog(`Resend (${count}/5)`);
        sendOnce();
      }, 2000);
    });
  }

  stop() {
    if (!this.socket) return;

    this.isStopping = true;

    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }

    const s = this.socket;
    this.socket = null;

    try {
      s.removeAllListeners(); // ✅ 이전 리스너 완전 제거
      s.close();
    } catch {}

    this.onLog("Scan stopped (socket closed)");
    this.isStopping = false;
  }

  sendReset(deviceIp: string, mac: string) {
    const socket = this.ensureCmdSocket();
    const packet = buildResetPacket(mac);

    // 같은 서브넷 브로드캐스트 계산
    const bcast = broadcastByMask(deviceIp, SEARCH_MASK);

    this.onLog(
      `Reset TX (broadcast) -> ${bcast}:${PM100_PORT} (${packet.length} bytes)`,
    );

    socket.send(packet, PM100_PORT, bcast, (err) => {
      if (err)
        this.onLog(
          `Reset send fail -> ${bcast}:${PM100_PORT} : ${err.message}`,
        );
      else this.onLog(`Reset sent -> ${bcast}:${PM100_PORT}`);
    });
  }

  private ensureCmdSocket() {
    if (this.cmdSocket) return this.cmdSocket;

    const s = dgram.createSocket({ type: "udp4", reuseAddr: true });

    s.on("error", (err) => {
      this.onLog(`CMD UDP error: ${err.message}`);
      try {
        s.close();
      } catch {}
      if (this.cmdSocket === s) this.cmdSocket = null;
    });

    // ✅ 장치가 255.255.255.255:1500로도 뿌리니까, 받는 용도로도 유리
    s.bind(PM100_PORT, "0.0.0.0", () => {
      s.setBroadcast(true);
      this.onLog(`CMD socket ready on 0.0.0.0:${PM100_PORT}`);
    });

    this.cmdSocket = s;
    return s;
  }
}

export function buildResetPacket(macStr: string): Buffer {
  // "AA:BB:CC:DD:EE:FF" → 6 bytes
  const mac = Buffer.from(macStr.split(":").map((h) => parseInt(h, 16)));

  const cmd = Buffer.from("Camguard_Initialize", "ascii");

  return Buffer.concat([mac, cmd]);
}
