import os from "os";
import dgram from "dgram";

export const PM100_TOOL_UDP_PORT = 1500;
export const SEARCH_MASK = "255.255.255.0";

/* =========================
   Helpers
========================= */

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
  return Buffer.concat([body, Buffer.from([cs])]);
}

function bytes(buf: Buffer, offset: number, len: number) {
  return Array.from(buf.slice(offset, offset + len));
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

/* =========================
   Types
========================= */

export type ToolUdpDevicePayload = {
  from: string;
  size: number;

  // 표시용
  mac: string;
  ip: string;
  serverIp: string;
  subnetMask: string;
  gateway: string;
  serverPort: number;
  version: string;

  // 설정용 (bytes)
  tagBytes: number[];
  macBytes: number[];
  cmd: number;
  versionBytes: number[];
  ipBytes: number[];
  serverIpBytes: number[];
  temp4Bytes: number[];
  subnetBytes: number[];
  gatewayBytes: number[];
  serverPortBytes: number[];
  temp2Bytes: number[];
  active: number;
  mode: number;
  auth: number;
  tamper: number;
  temp3Bytes: number[];

  rawBytes: Uint8Array;
};

function ipStrToBytes(ip: string): number[] {
  return ip
    .trim()
    .split(".")
    .map((x) => Number(x) & 0xff);
}

export function buildUpdatePacket(args: {
  macStr: string;
  deviceIp: string;
  subnetMask: string;
  gateway: string;
  serverIp: string;
  serverPort: number;
}): Buffer {
  const tag = Buffer.from("CG_CMD", "ascii"); // 6 bytes
  const mac = Buffer.from(args.macStr.split(":").map((h) => parseInt(h, 16)));
  const cmd = Buffer.from([0x0e]);

  const devIp = Buffer.from(ipStrToBytes(args.deviceIp)); // 4
  const subnet = Buffer.from(ipStrToBytes(args.subnetMask)); // 4
  const gateway = Buffer.from(ipStrToBytes(args.gateway)); // 4
  const serverIp = Buffer.from(ipStrToBytes(args.serverIp)); // 4

  const port = Buffer.from([
    (args.serverPort >> 8) & 0xff,
    args.serverPort & 0xff,
  ]); // 2

  const body = Buffer.concat([
    tag,
    mac,
    cmd,
    devIp,
    subnet,
    gateway,
    serverIp,
    port,
  ]);

  const cs = xorChecksum(body);
  return Buffer.concat([body, Buffer.from([cs])]);
}
/* =========================
   Parser
========================= */

function parseResponse(msg: Buffer): ToolUdpDevicePayload | null {
  if (msg.length < 46) return null;

  const tagAscii = msg.slice(0, 6).toString("ascii");
  if (tagAscii !== "CG_RES") return null;

  const tagBytes = bytes(msg, 0, 6);
  const macBytes = bytes(msg, 6, 6);
  const cmd = msg[12] & 0xff;
  const versionBytes = bytes(msg, 13, 2);

  const ipBytes = bytes(msg, 15, 4);
  const serverIpBytes = bytes(msg, 19, 4);
  const temp4Bytes = bytes(msg, 23, 4);
  const subnetBytes = bytes(msg, 27, 4);
  const gatewayBytes = bytes(msg, 31, 4);
  const serverPortBytes = bytes(msg, 35, 2);
  const temp2Bytes = bytes(msg, 37, 2);

  const active = msg[39] & 0xff;
  const mode = msg[40] & 0xff;
  const auth = msg[41] & 0xff;
  const tamper = msg[42] & 0xff;

  const temp3Bytes = bytes(msg, 43, 3);

  const mac = macBytes.map((b) => b.toString(16).padStart(2, "0")).join(":");

  const ip = ipBytes.join(".");
  const serverIp = serverIpBytes.join(".");
  const subnetMask = subnetBytes.join(".");
  const gateway = gatewayBytes.join(".");
  const serverPort = msg.readUInt16BE(35);
  const version = `${versionBytes[0]}.${versionBytes[1]}`;

  return {
    from: "",
    size: msg.length,

    mac,
    ip,
    serverIp,
    subnetMask,
    gateway,
    serverPort,
    version,

    tagBytes,
    macBytes,
    cmd,
    versionBytes,
    ipBytes,
    serverIpBytes,
    temp4Bytes,
    subnetBytes,
    gatewayBytes,
    serverPortBytes,
    temp2Bytes,
    active,
    mode,
    auth,
    tamper,
    temp3Bytes,

    rawBytes: new Uint8Array(msg),
  };
}

export function buildResetPacket(macStr: string): Buffer {
  const mac = Buffer.from(macStr.split(":").map((h) => parseInt(h, 16)));
  const cmd = Buffer.from("Camguard_Initialize", "ascii");
  return Buffer.concat([mac, cmd]);
}

/* =========================
   Scanner Class
========================= */

export class PM100ToolUdpScanner {
  private socket: dgram.Socket | null = null;
  private resendTimer: NodeJS.Timeout | null = null;
  private cmdSocket: dgram.Socket | null = null;

  constructor(
    private onLog: (line: string) => void,
    private onDevice: (payload: ToolUdpDevicePayload) => void,
  ) {}

  start() {
    if (this.socket) return;

    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.socket = socket;

    socket.on("error", (err) => {
      this.onLog(`UDP error: ${err.message}`);
      this.stop();
    });

    socket.on("message", (msg, rinfo) => {
      const parsed = parseResponse(msg);
      if (!parsed) return;

      parsed.from = `${rinfo.address}:${rinfo.port}`;
      parsed.size = msg.length;

      this.onDevice(parsed);
    });

    socket.bind(PM100_TOOL_UDP_PORT, () => {
      socket.setBroadcast(true);
      socket.setRecvBufferSize(1024 * 1024);

      const targets = getBroadcastTargets(SEARCH_MASK);
      const packet = buildDiscoveryPacket();

      const sendOnce = () => {
        for (const host of targets) {
          socket.send(packet, PM100_TOOL_UDP_PORT, host);
        }
      };

      sendOnce();

      let count = 1;
      this.resendTimer = setInterval(() => {
        count++;
        if (count > 5) {
          clearInterval(this.resendTimer!);
          this.resendTimer = null;
          return;
        }
        this.onLog(`Resend (${count}/5)`);
        sendOnce();
      }, 2000);
    });
  }

  stop() {
    if (!this.socket) return;

    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }

    try {
      this.socket.removeAllListeners();
      this.socket.close();
    } catch {}

    this.socket = null;
    this.onLog("UDP scan stopped");

    if (this.cmdSocket) {
      try {
        this.cmdSocket.removeAllListeners();
        this.cmdSocket.close();
      } catch {}
      this.cmdSocket = null;
    }
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

    s.bind(PM100_TOOL_UDP_PORT, "0.0.0.0", () => {
      s.setBroadcast(true);
      this.onLog(`CMD socket ready on 0.0.0.0:${PM100_TOOL_UDP_PORT}`);
    });

    this.cmdSocket = s;
    return s;
  }

  sendReset(deviceIp: string, mac: string) {
    const socket = this.ensureCmdSocket();
    const packet = buildResetPacket(mac);

    const bcast = broadcastByMask(deviceIp, SEARCH_MASK);

    this.onLog(
      `Reset TX (broadcast) -> ${bcast}:${PM100_TOOL_UDP_PORT} (${packet.length} bytes)`,
    );

    socket.send(packet, PM100_TOOL_UDP_PORT, bcast, (err) => {
      if (err)
        this.onLog(
          `Reset send fail -> ${bcast}:${PM100_TOOL_UDP_PORT} : ${err.message}`,
        );
      else this.onLog(`Reset sent -> ${bcast}:${PM100_TOOL_UDP_PORT}`);
    });
  }

  sendUpdateConfig(p: {
    macStr: string;
    deviceIp: string;
    subnetMask: string;
    gateway: string;
    serverIp: string;
    serverPort: number;
  }) {
    const socket = this.ensureCmdSocket(); // reset에서 쓰던 cmdSocket 재사용
    const packet = buildUpdatePacket(p);

    // ✅ 보낼 대상: 일반적으로 "브로드캐스트:1500" 또는 "장치 IP:1500"
    // 여기서는 장치 IP로 직접 보냄(가장 명확)
    const host = p.deviceIp;

    this.onLog(
      `Update TX -> ${host}:${PM100_TOOL_UDP_PORT} (${packet.length} bytes)`,
    );

    socket.send(packet, PM100_TOOL_UDP_PORT, host, (err) => {
      if (err)
        this.onLog(
          `Update send fail -> ${host}:${PM100_TOOL_UDP_PORT} : ${err.message}`,
        );
      else this.onLog(`Update sent -> ${host}:${PM100_TOOL_UDP_PORT}`);
    });
  }
}
