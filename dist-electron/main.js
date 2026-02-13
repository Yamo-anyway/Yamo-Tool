import { ipcMain, app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import dgram from "dgram";
import net from "net";
const PM100_CHANNELS = {
  discovery: {
    scanStart: "pm100:discovery:scanStart",
    scanStop: "pm100:discovery:scanStop",
    log: "pm100:discovery:log",
    udp: "pm100:discovery:udp",
    reset: "pm100:discovery:reset"
  },
  setup: {
    start: "pm100:setup:start",
    stop: "pm100:setup:stop",
    status: "pm100:setup:status",
    log: "pm100:setup:log",
    getLocalIPv4s: "pm100:setup:getLocalIPv4s",
    device: "pm100:setup:device",
    getConnectedIps: "pm100:setup:getConnectedIps"
  },
  tool: {
    udp: {
      scanStart: "pm100tool:udp:scanStart",
      scanStop: "pm100tool:udp:scanStop",
      log: "pm100tool:udp:log",
      udp: "pm100tool:udp:udp",
      reset: "pm100tool:udp:reset",
      updateConfig: "pm100tool:udp:updateConfig"
    },
    log: {
      openWindow: "pm100tool:log:openWindow",
      append: "pm100tool:log:append",
      clear: "pm100tool:log:clear",
      getAll: "pm100tool:log:getAll",
      updated: "pm100tool:log:updated"
    }
  },
  /**
   * Backward-compatible aliases (temporary).
   * Remove after you migrate renderer + ipcMain handlers.
   */
  legacy: {
    // discovery
    discoveryScanStart: "pm100discovery:scanStart",
    discoveryScanStop: "pm100discovery:scanStop",
    discoveryLog: "pm100discovery:log",
    discoveryUdp: "pm100discovery:udp",
    discoveryReset: "pm100discovery:reset",
    // setup
    setupStart: "pm100setup:start",
    setupStop: "pm100setup:stop",
    setupStatus: "pm100setup:status",
    setupLog: "pm100setup:log",
    setupGetLocalIPv4s: "pm100setup:getLocalIPv4s",
    setupDevice: "pm100setup:device",
    setupGetConnectedIps: "pm100setup:getConnectedIps"
  }
};
const PM100_PORT = 1500;
const SEARCH_MASK$1 = "255.255.255.0";
function xorChecksum$2(buf) {
  let x = 0;
  for (const b of buf) x ^= b;
  return x & 255;
}
function buildDiscoveryPacket$1() {
  const body = Buffer.from([
    67,
    71,
    95,
    67,
    77,
    68,
    0,
    0,
    0,
    0,
    0,
    0
  ]);
  const cs = xorChecksum$2(body);
  return Buffer.concat([body, Buffer.from([cs])]);
}
function ipToU32$1(ip2) {
  const [a, b, c, d] = ip2.split(".").map((x) => parseInt(x, 10));
  return (a << 24 >>> 0 | b << 16 | c << 8 | d) >>> 0;
}
function u32ToIp$1(u) {
  const a = u >>> 24 & 255;
  const b = u >>> 16 & 255;
  const c = u >>> 8 & 255;
  const d = u & 255;
  return `${a}.${b}.${c}.${d}`;
}
function broadcastByMask$1(ip2, mask) {
  const ipU = ipToU32$1(ip2);
  const maskU = ipToU32$1(mask);
  const bcast = (ipU | ~maskU >>> 0) >>> 0;
  return u32ToIp$1(bcast);
}
function getBroadcastTargets$1(mask) {
  const nets = os.networkInterfaces();
  const targets = /* @__PURE__ */ new Set();
  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || a.family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      targets.add(broadcastByMask$1(a.address, mask));
    }
  }
  if (targets.size === 0) targets.add("255.255.255.255");
  return Array.from(targets);
}
function formatMac(buf, offset) {
  return [...buf.slice(offset, offset + 6)].map((b) => b.toString(16).padStart(2, "0")).join(":").toUpperCase();
}
function formatIp(buf, offset) {
  return [...buf.slice(offset, offset + 4)].join(".");
}
function parsePM100Response(msg) {
  if (msg.length < 46) return null;
  const tag = msg.slice(0, 6).toString("ascii");
  if (tag !== "CG_RES") return null;
  const mac = formatMac(msg, 6);
  const version = `${msg[13]}.${msg[14]}`;
  const ip2 = formatIp(msg, 15);
  const serverIp = formatIp(msg, 19);
  const subnetMask = formatIp(msg, 27);
  const gateway = formatIp(msg, 31);
  const serverPort = msg.readUInt16BE(35);
  return { mac, ip: ip2, serverIp, subnetMask, gateway, serverPort, version };
}
class PM100Scanner {
  constructor(onLog, onUdp) {
    this.onLog = onLog;
    this.onUdp = onUdp;
  }
  socket = null;
  resendTimer = null;
  isStopping = false;
  cmdSocket = null;
  start() {
    if (this.socket) {
      this.onLog("Scan already running (socket exists) - ignored");
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
          ...parsed
        });
      } else {
        const hex = msg.toString("hex").match(/.{1,2}/g)?.join(" ") ?? "";
        this.onUdp({
          from: `${rinfo.address}:${rinfo.port}`,
          size: msg.length,
          hex
        });
      }
    });
    socket.bind(PM100_PORT, () => {
      const packet = buildDiscoveryPacket$1();
      socket.setBroadcast(true);
      socket.setRecvBufferSize(1024 * 1024);
      const targets = getBroadcastTargets$1(SEARCH_MASK$1);
      this.onLog(
        `Scan start: port=${PM100_PORT}, mask=${SEARCH_MASK$1}, targets=${targets.join(", ")}`
      );
      this.onLog(
        `Send ${packet.length} bytes: ${packet.toString("hex").match(/.{1,2}/g)?.join(" ")}`
      );
      const sendOnce = () => {
        const packet2 = buildDiscoveryPacket$1();
        for (const host of targets) {
          socket.send(packet2, PM100_PORT, host, (err) => {
            if (err)
              this.onLog(`Send fail -> ${host}:${PM100_PORT} : ${err.message}`);
            else this.onLog(`Sent -> ${host}:${PM100_PORT}`);
          });
        }
      };
      sendOnce();
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
      }, 2e3);
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
      s.removeAllListeners();
      s.close();
    } catch {
    }
    this.onLog("Scan stopped (socket closed)");
    this.isStopping = false;
  }
  sendReset(deviceIp, mac) {
    const socket = this.ensureCmdSocket();
    const packet = buildResetPacket$1(mac);
    const bcast = broadcastByMask$1(deviceIp, SEARCH_MASK$1);
    this.onLog(
      `Reset TX (broadcast) -> ${bcast}:${PM100_PORT} (${packet.length} bytes)`
    );
    socket.send(packet, PM100_PORT, bcast, (err) => {
      if (err)
        this.onLog(
          `Reset send fail -> ${bcast}:${PM100_PORT} : ${err.message}`
        );
      else this.onLog(`Reset sent -> ${bcast}:${PM100_PORT}`);
    });
  }
  ensureCmdSocket() {
    if (this.cmdSocket) return this.cmdSocket;
    const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
    s.on("error", (err) => {
      this.onLog(`CMD UDP error: ${err.message}`);
      try {
        s.close();
      } catch {
      }
      if (this.cmdSocket === s) this.cmdSocket = null;
    });
    s.bind(PM100_PORT, "0.0.0.0", () => {
      s.setBroadcast(true);
      this.onLog(`CMD socket ready on 0.0.0.0:${PM100_PORT}`);
    });
    this.cmdSocket = s;
    return s;
  }
}
function buildResetPacket$1(macStr) {
  const mac = Buffer.from(macStr.split(":").map((h) => parseInt(h, 16)));
  const cmd = Buffer.from("Camguard_Initialize", "ascii");
  return Buffer.concat([mac, cmd]);
}
let scanner$1 = null;
function send$1(getWin, channel, payload) {
  const w = getWin();
  if (!w) return;
  w.webContents.send(channel, payload);
}
function registerPM100DiscoveryMainIPC(getWin) {
  const ensureScanner = () => {
    if (!scanner$1) {
      scanner$1 = new PM100Scanner(
        // ✅ 새 채널로 송신 + (선택) legacy도 같이 송신
        (line) => {
          send$1(getWin, PM100_CHANNELS.discovery.log, line);
          send$1(getWin, PM100_CHANNELS.legacy.discoveryLog, line);
        },
        (payload) => {
          send$1(getWin, PM100_CHANNELS.discovery.udp, payload);
          send$1(getWin, PM100_CHANNELS.legacy.discoveryUdp, payload);
        }
      );
    }
    return scanner$1;
  };
  const scanStartHandler = () => {
    ensureScanner().start();
    return true;
  };
  const scanStopHandler = () => {
    if (scanner$1) scanner$1.stop();
    return true;
  };
  const resetHandler = (_evt, ip2, mac) => {
    try {
      ensureScanner().sendReset(ip2, mac);
      return true;
    } catch {
      return false;
    }
  };
  ipcMain.handle(PM100_CHANNELS.discovery.scanStart, scanStartHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.discoveryScanStart, scanStartHandler);
  ipcMain.handle(PM100_CHANNELS.discovery.scanStop, scanStopHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.discoveryScanStop, scanStopHandler);
  ipcMain.handle(PM100_CHANNELS.discovery.reset, resetHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.discoveryReset, resetHandler);
}
const FRAME_LEN = 36;
function ip(buf, off) {
  return `${buf[off]}.${buf[off + 1]}.${buf[off + 2]}.${buf[off + 3]}`;
}
function u16be(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function xorChecksum$1(buf) {
  let x = 0;
  for (let i = 0; i < buf.length - 1; i++) x ^= buf[i];
  return x & 255;
}
function tryParseFrames(chunk) {
  const frames = [];
  let offset = 0;
  while (offset + FRAME_LEN <= chunk.length) {
    if (chunk[offset] !== 67 || // 'C'
    chunk[offset + 1] !== 71 || // 'G'
    chunk[offset + 2] !== 68 || // 'D'
    chunk[offset + 3] !== 73 || // 'I'
    chunk[offset + 4] !== 127) {
      offset += 1;
      continue;
    }
    const frameBuf = chunk.slice(offset, offset + FRAME_LEN);
    const expected = frameBuf[FRAME_LEN - 1];
    const actual = xorChecksum$1(frameBuf);
    if (expected !== actual) {
      offset += 1;
      continue;
    }
    const deviceIp = ip(frameBuf, 5);
    const subnet = ip(frameBuf, 9);
    const gateway = ip(frameBuf, 13);
    const serverIp = ip(frameBuf, 17);
    const serverPort = u16be(frameBuf, 21);
    const sensorNcNo = [
      frameBuf[23],
      frameBuf[24],
      frameBuf[25]
    ];
    const sensorEnable = [
      frameBuf[26],
      frameBuf[27],
      frameBuf[28]
    ];
    const sensorCheckTime = [
      frameBuf[29],
      frameBuf[30],
      frameBuf[31]
    ];
    const sensorStatus = [
      frameBuf[32],
      frameBuf[33],
      frameBuf[34]
    ];
    frames.push({
      deviceIp,
      subnet,
      gateway,
      serverIp,
      serverPort,
      sensorNcNo,
      sensorEnable,
      sensorCheckTime,
      sensorStatus,
      raw: frameBuf
    });
    offset += FRAME_LEN;
  }
  return { frames, rest: chunk.slice(offset) };
}
class PM100SetupServer {
  constructor(onLog, onStatus, onDeviceFrame) {
    this.onLog = onLog;
    this.onStatus = onStatus;
    this.onDeviceFrame = onDeviceFrame;
  }
  server = null;
  port = null;
  host = null;
  clients = /* @__PURE__ */ new Set();
  stopping = null;
  start(port, host) {
    if (this.server) {
      this.onLog(
        `Start ignored: already running on ${this.host ?? "?"}:${this.port ?? "?"}`
      );
      return;
    }
    if (this.stopping) {
      this.onLog("Start ignored: server is stopping (wait close)");
      return;
    }
    this.onLog(`Server start requested: ${host}:${port}`);
    const server2 = net.createServer((sock) => {
      this.clients.add(sock);
      this.onLog(`Client connected: ${sock.remoteAddress}:${sock.remotePort}`);
      let carry = Buffer.alloc(0);
      sock.on("data", (buf) => {
        this.onLog(`RAW RX ${buf.length} bytes`);
        carry = Buffer.concat([carry, buf]);
        const { frames, rest } = tryParseFrames(carry);
        carry = rest;
        for (const f of frames) this.onDeviceFrame(f);
      });
      sock.on("close", () => {
        this.clients.delete(sock);
        this.onLog(
          `Client disconnected: ${sock.remoteAddress}:${sock.remotePort}`
        );
        this.onStatus({
          running: true,
          port: this.port ?? void 0,
          host: this.host ?? void 0
        });
      });
      sock.on("error", (e) => this.onLog(`Client error: ${e.message}`));
      sock.setKeepAlive(true, 5e3);
      sock.setTimeout(3e3);
      sock.on("timeout", () => {
        this.onLog(
          `Socket timeout -> ${sock.remoteAddress}:${sock.remotePort}`
        );
        sock.destroy();
      });
    });
    server2.on("error", (e) => {
      this.onLog(`Server error: ${e?.message ?? e}`);
      try {
        server2.close();
      } catch {
      }
      this.server = null;
      this.port = null;
      this.host = null;
      this.onStatus({ running: false });
    });
    server2.listen(port, "0.0.0.0", () => {
      this.server = server2;
      this.port = port;
      this.host = host;
      this.onLog(
        `Server listening on 0.0.0.0:${port} (requested host=${host})`
      );
      this.onStatus({ running: true, port, host });
    });
  }
  // ✅ Stop을 완료까지 기다릴 수 있게
  async stopAsync() {
    if (this.stopping) return this.stopping;
    if (!this.server) {
      this.onLog("Stop ignored: server not running");
      this.onStatus({ running: false });
      return;
    }
    this.onLog("Server stop requested");
    const s = this.server;
    this.stopping = new Promise((resolve) => {
      for (const sock of this.clients) {
        try {
          sock.end();
          setTimeout(() => {
            try {
              sock.destroy();
            } catch {
            }
          }, 500);
        } catch {
        }
      }
      this.clients.clear();
      try {
        s.close(() => {
          this.server = null;
          this.port = null;
          this.host = null;
          this.onLog("Server stopped");
          this.onStatus({ running: false });
          const done = this.stopping;
          this.stopping = null;
          resolve();
        });
      } catch {
        this.server = null;
        this.port = null;
        this.host = null;
        this.onLog("Server stopped");
        this.onStatus({ running: false });
        this.stopping = null;
        resolve();
      }
    });
    return this.stopping;
  }
  status() {
    return {
      running: !!this.server,
      port: this.port ?? void 0,
      host: this.host ?? void 0
    };
  }
  getConnectedIps() {
    const ips = /* @__PURE__ */ new Set();
    for (const s of this.clients) {
      const ra = s.remoteAddress ?? "";
      const ip2 = ra.startsWith("::ffff:") ? ra.slice(7) : ra;
      if (ip2) ips.add(ip2);
    }
    return Array.from(ips);
  }
}
let server = null;
function getLocalIPv4s() {
  const nets = os.networkInterfaces();
  const ips = /* @__PURE__ */ new Set();
  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || a.family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      ips.add(a.address);
    }
  }
  return Array.from(ips);
}
function getWC(getWin) {
  const w = getWin();
  if (!w) throw new Error("Window not ready");
  return w.webContents;
}
function registerPM100SetupMainIPC(getWin) {
  const ensureServer = () => {
    const wc = getWC(getWin);
    if (!server) {
      server = new PM100SetupServer(
        // log
        (line) => {
          wc.send(PM100_CHANNELS.setup.log, line);
          wc.send(PM100_CHANNELS.legacy.setupLog, line);
        },
        // status
        (s) => {
          wc.send(PM100_CHANNELS.setup.status, s);
          wc.send(PM100_CHANNELS.legacy.setupStatus, s);
        },
        // device
        (f) => {
          wc.send(PM100_CHANNELS.setup.device, f);
          wc.send(PM100_CHANNELS.legacy.setupDevice, f);
        }
      );
    }
    return { wc, server };
  };
  const startHandler = (_evt, port, host) => {
    const { server: server2 } = ensureServer();
    server2.start(port, host);
    return true;
  };
  ipcMain.handle(PM100_CHANNELS.setup.start, startHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.setupStart, startHandler);
  const stopHandler = async () => {
    if (server) {
      await server.stopAsync();
      server = null;
    }
    const wc = getWC(getWin);
    const stopped = { running: false };
    wc.send(PM100_CHANNELS.setup.status, stopped);
    wc.send(PM100_CHANNELS.legacy.setupStatus, stopped);
    return true;
  };
  ipcMain.handle(PM100_CHANNELS.setup.stop, stopHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.setupStop, stopHandler);
  const statusHandler = () => {
    return server ? server.status() : { running: false };
  };
  ipcMain.handle(PM100_CHANNELS.setup.status, statusHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.setupStatus, statusHandler);
  const ipsHandler = () => getLocalIPv4s();
  ipcMain.handle(PM100_CHANNELS.setup.getLocalIPv4s, ipsHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.setupGetLocalIPv4s, ipsHandler);
  const connectedIpsHandler = () => server ? server.getConnectedIps() : [];
  ipcMain.handle(PM100_CHANNELS.setup.getConnectedIps, connectedIpsHandler);
  ipcMain.handle(
    PM100_CHANNELS.legacy.setupGetConnectedIps,
    connectedIpsHandler
  );
}
async function stopPM100SetupServer() {
  if (server) {
    await server.stopAsync();
    server = null;
  }
}
const PM100_TOOL_UDP_PORT = 1500;
const SEARCH_MASK = "255.255.255.0";
function xorChecksum(buf) {
  let x = 0;
  for (const b of buf) x ^= b;
  return x & 255;
}
function buildDiscoveryPacket() {
  const body = Buffer.from([
    67,
    71,
    95,
    67,
    77,
    68,
    0,
    0,
    0,
    0,
    0,
    0
  ]);
  const cs = xorChecksum(body);
  return Buffer.concat([body, Buffer.from([cs])]);
}
function bytes(buf, offset, len) {
  return Array.from(buf.slice(offset, offset + len));
}
function ipToU32(ip2) {
  const [a, b, c, d] = ip2.split(".").map((x) => parseInt(x, 10));
  return (a << 24 >>> 0 | b << 16 | c << 8 | d) >>> 0;
}
function u32ToIp(u) {
  const a = u >>> 24 & 255;
  const b = u >>> 16 & 255;
  const c = u >>> 8 & 255;
  const d = u & 255;
  return `${a}.${b}.${c}.${d}`;
}
function broadcastByMask(ip2, mask) {
  const ipU = ipToU32(ip2);
  const maskU = ipToU32(mask);
  const bcast = (ipU | ~maskU >>> 0) >>> 0;
  return u32ToIp(bcast);
}
function getBroadcastTargets(mask) {
  const nets = os.networkInterfaces();
  const targets = /* @__PURE__ */ new Set();
  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || a.family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      targets.add(broadcastByMask(a.address, mask));
    }
  }
  if (targets.size === 0) targets.add("255.255.255.255");
  return Array.from(targets);
}
function ipStrToBytes(ip2) {
  return ip2.trim().split(".").map((x) => Number(x) & 255);
}
function buildUpdatePacket(args) {
  const tag = Buffer.from("CG_CMD", "ascii");
  const mac = Buffer.from(args.macStr.split(":").map((h) => parseInt(h, 16)));
  const cmd = Buffer.from([14]);
  const devIp = Buffer.from(ipStrToBytes(args.deviceIp));
  const subnet = Buffer.from(ipStrToBytes(args.subnetMask));
  const gateway = Buffer.from(ipStrToBytes(args.gateway));
  const serverIp = Buffer.from(ipStrToBytes(args.serverIp));
  const port = Buffer.from([
    args.serverPort >> 8 & 255,
    args.serverPort & 255
  ]);
  const body = Buffer.concat([
    tag,
    mac,
    cmd,
    devIp,
    subnet,
    gateway,
    serverIp,
    port
  ]);
  const cs = xorChecksum(body);
  return Buffer.concat([body, Buffer.from([cs])]);
}
function parseResponse(msg) {
  if (msg.length < 46) return null;
  const tagAscii = msg.slice(0, 6).toString("ascii");
  if (tagAscii !== "CG_RES") return null;
  const tagBytes = bytes(msg, 0, 6);
  const macBytes = bytes(msg, 6, 6);
  const cmd = msg[12] & 255;
  const versionBytes = bytes(msg, 13, 2);
  const ipBytes = bytes(msg, 15, 4);
  const serverIpBytes = bytes(msg, 19, 4);
  const temp4Bytes = bytes(msg, 23, 4);
  const subnetBytes = bytes(msg, 27, 4);
  const gatewayBytes = bytes(msg, 31, 4);
  const serverPortBytes = bytes(msg, 35, 2);
  const temp2Bytes = bytes(msg, 37, 2);
  const active = msg[39] & 255;
  const mode = msg[40] & 255;
  const auth = msg[41] & 255;
  const tamper = msg[42] & 255;
  const temp3Bytes = bytes(msg, 43, 3);
  const mac = macBytes.map((b) => b.toString(16).padStart(2, "0")).join(":");
  const ip2 = ipBytes.join(".");
  const serverIp = serverIpBytes.join(".");
  const subnetMask = subnetBytes.join(".");
  const gateway = gatewayBytes.join(".");
  const serverPort = msg.readUInt16BE(35);
  const version = `${versionBytes[0]}.${versionBytes[1]}`;
  return {
    from: "",
    size: msg.length,
    mac,
    ip: ip2,
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
    rawBytes: new Uint8Array(msg)
  };
}
function buildResetPacket(macStr) {
  const mac = Buffer.from(macStr.split(":").map((h) => parseInt(h, 16)));
  const cmd = Buffer.from("Camguard_Initialize", "ascii");
  return Buffer.concat([mac, cmd]);
}
class PM100ToolUdpScanner {
  constructor(onLog, onDevice) {
    this.onLog = onLog;
    this.onDevice = onDevice;
  }
  socket = null;
  resendTimer = null;
  cmdSocket = null;
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
          clearInterval(this.resendTimer);
          this.resendTimer = null;
          return;
        }
        this.onLog(`Resend (${count}/5)`);
        sendOnce();
      }, 2e3);
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
    } catch {
    }
    this.socket = null;
    this.onLog("UDP scan stopped");
    if (this.cmdSocket) {
      try {
        this.cmdSocket.removeAllListeners();
        this.cmdSocket.close();
      } catch {
      }
      this.cmdSocket = null;
    }
  }
  ensureCmdSocket() {
    if (this.cmdSocket) return this.cmdSocket;
    const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
    s.on("error", (err) => {
      this.onLog(`CMD UDP error: ${err.message}`);
      try {
        s.close();
      } catch {
      }
      if (this.cmdSocket === s) this.cmdSocket = null;
    });
    s.bind(PM100_TOOL_UDP_PORT, "0.0.0.0", () => {
      s.setBroadcast(true);
      this.onLog(`CMD socket ready on 0.0.0.0:${PM100_TOOL_UDP_PORT}`);
    });
    this.cmdSocket = s;
    return s;
  }
  sendReset(deviceIp, mac) {
    const socket = this.ensureCmdSocket();
    const packet = buildResetPacket(mac);
    const bcast = broadcastByMask(deviceIp, SEARCH_MASK);
    this.onLog(
      `Reset TX (broadcast) -> ${bcast}:${PM100_TOOL_UDP_PORT} (${packet.length} bytes)`
    );
    socket.send(packet, PM100_TOOL_UDP_PORT, bcast, (err) => {
      if (err)
        this.onLog(
          `Reset send fail -> ${bcast}:${PM100_TOOL_UDP_PORT} : ${err.message}`
        );
      else this.onLog(`Reset sent -> ${bcast}:${PM100_TOOL_UDP_PORT}`);
    });
  }
  sendUpdateConfig(p) {
    const socket = this.ensureCmdSocket();
    const packet = buildUpdatePacket(p);
    const host = p.deviceIp;
    this.onLog(
      `Update TX -> ${host}:${PM100_TOOL_UDP_PORT} (${packet.length} bytes)`
    );
    socket.send(packet, PM100_TOOL_UDP_PORT, host, (err) => {
      if (err)
        this.onLog(
          `Update send fail -> ${host}:${PM100_TOOL_UDP_PORT} : ${err.message}`
        );
      else this.onLog(`Update sent -> ${host}:${PM100_TOOL_UDP_PORT}`);
    });
  }
}
let scanner = null;
function send(getWin, channel, payload) {
  const w = getWin();
  if (!w) return;
  w.webContents.send(channel, payload);
}
function registerPM100ToolUdpMainIPC(getWin) {
  const ensureScanner = () => {
    if (!scanner) {
      scanner = new PM100ToolUdpScanner(
        (line) => send(getWin, PM100_CHANNELS.tool.udp.log, line),
        (payload) => send(getWin, PM100_CHANNELS.tool.udp.udp, payload)
      );
    }
    return scanner;
  };
  ipcMain.handle(PM100_CHANNELS.tool.udp.scanStart, () => {
    ensureScanner().start();
    return true;
  });
  ipcMain.handle(PM100_CHANNELS.tool.udp.scanStop, () => {
    if (scanner) {
      scanner.stop();
      scanner = null;
    }
    return true;
  });
  ipcMain.handle(
    PM100_CHANNELS.tool.udp.reset,
    (_evt, ip2, mac) => {
      try {
        ensureScanner().sendReset(ip2, mac);
        return true;
      } catch {
        return false;
      }
    }
  );
  ipcMain.handle(PM100_CHANNELS.tool.udp.updateConfig, (_evt, p) => {
    try {
      ensureScanner().sendUpdateConfig(p);
      return true;
    } catch {
      return false;
    }
  });
}
let logWin = null;
const MAX_LINES = 5e3;
let lines = [];
function pushLine(line) {
  lines.push(line);
  if (lines.length > MAX_LINES) lines = lines.slice(lines.length - MAX_LINES);
}
function broadcast(getMainWin) {
  const payload = lines.join("\n");
  const main = getMainWin();
  if (main && !main.isDestroyed()) {
    main.webContents.send(PM100_CHANNELS.tool.log.updated, payload);
  }
  if (logWin && !logWin.isDestroyed()) {
    logWin.webContents.send(PM100_CHANNELS.tool.log.updated, payload);
  }
}
function attachTopPolicy(win2) {
  const setTop = (on) => {
    if (win2.isDestroyed()) return;
    if (on) win2.setAlwaysOnTop(true, "floating");
    else win2.setAlwaysOnTop(false);
  };
  setTop(true);
  const onMove = () => setTop(true);
  const onWinFocus = () => setTop(true);
  const onWinShow = () => setTop(true);
  const onWinBlur = () => setTop(false);
  win2.on("move", onMove);
  win2.on("focus", onWinFocus);
  win2.on("show", onWinShow);
  win2.on("blur", onWinBlur);
  const onAnyWindowBlur = () => {
    setTimeout(() => {
      const focused = BrowserWindow.getFocusedWindow();
      if (!focused) {
        setTop(false);
      }
    }, 0);
  };
  const onAnyWindowFocus = () => {
    setTop(true);
  };
  app.on("browser-window-blur", onAnyWindowBlur);
  app.on("browser-window-focus", onAnyWindowFocus);
  win2.once("closed", () => {
    app.removeListener("browser-window-blur", onAnyWindowBlur);
    app.removeListener("browser-window-focus", onAnyWindowFocus);
  });
  return { setTop };
}
let mainFocusHooked = false;
function registerPM100ToolLogMainIPC(getMainWin, preloadPath) {
  if (!mainFocusHooked) {
    mainFocusHooked = true;
    const hookMainFocus = () => {
      const main = getMainWin();
      if (!main || main.isDestroyed()) return;
      main.on("focus", () => {
        if (!logWin || logWin.isDestroyed()) return;
        logWin.setAlwaysOnTop(true, "floating");
      });
    };
    hookMainFocus();
    app.on("browser-window-created", hookMainFocus);
  }
  ipcMain.on(PM100_CHANNELS.tool.log.append, (_evt, line) => {
    if (typeof line !== "string") return;
    pushLine(line);
    broadcast(getMainWin);
  });
  ipcMain.handle(PM100_CHANNELS.tool.log.clear, () => {
    lines = [];
    broadcast(getMainWin);
    return true;
  });
  ipcMain.handle(PM100_CHANNELS.tool.log.getAll, () => lines.join("\n"));
  ipcMain.handle(PM100_CHANNELS.tool.log.openWindow, async () => {
    if (logWin && !logWin.isDestroyed()) {
      logWin.setAlwaysOnTop(true, "floating");
      logWin.show();
      logWin.focus();
      logWin.moveTop();
      return true;
    }
    logWin = new BrowserWindow({
      width: 500,
      height: 500,
      title: "PM100 Log",
      parent: void 0,
      // ✅ top 창은 parent 없이가 안정적
      show: false,
      // ✅ 로드 후 show
      webPreferences: {
        preload: preloadPath
      }
    });
    const { setTop } = attachTopPolicy(logWin);
    logWin.setVisibleOnAllWorkspaces(true);
    logWin.setFullScreenable(false);
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
      await logWin.loadURL(`${devUrl}#/pm100-log`);
    } else {
      await logWin.loadFile(path.join(process.cwd(), "index.html"), {
        hash: "/pm100-log"
      });
    }
    if (!logWin.isDestroyed()) {
      logWin.show();
      logWin.focus();
      logWin.moveTop();
      setTop(true);
      logWin.webContents.send(
        PM100_CHANNELS.tool.log.updated,
        lines.join("\n")
      );
    }
    logWin.once("closed", () => {
      logWin = null;
    });
    return true;
  });
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
let win = null;
function createWindow() {
  const preloadPath = path.join(__dirname$1, "preload.mjs");
  win = new BrowserWindow({
    width: 1140,
    height: 800,
    title: "Launcher",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  win.on("closed", () => {
    win = null;
  });
  registerPM100ToolLogMainIPC(() => win, preloadPath);
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(process.cwd(), "index.html"));
}
app.whenReady().then(() => {
  createWindow();
  registerPM100DiscoveryMainIPC(() => win);
  registerPM100SetupMainIPC(() => win);
  registerPM100ToolUdpMainIPC(() => win);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", async () => {
  await stopPM100SetupServer();
  if (process.platform !== "darwin") app.quit();
});
process.on("uncaughtException", (err) => {
  console.error("MAIN CRASH:", err);
});
