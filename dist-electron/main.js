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
const PM100_PORT$1 = 1500;
const SEARCH_MASK = "255.255.255.0";
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
function formatMac$1(buf, offset) {
  return [...buf.slice(offset, offset + 6)].map((b) => b.toString(16).padStart(2, "0")).join(":").toUpperCase();
}
function formatIp$1(buf, offset) {
  return [...buf.slice(offset, offset + 4)].join(".");
}
function parsePM100Response$1(msg) {
  if (msg.length < 46) return null;
  const tag = msg.slice(0, 6).toString("ascii");
  if (tag !== "CG_RES") return null;
  const mac = formatMac$1(msg, 6);
  const version = `${msg[13]}.${msg[14]}`;
  const ip2 = formatIp$1(msg, 15);
  const serverIp = formatIp$1(msg, 19);
  const subnetMask = formatIp$1(msg, 27);
  const gateway = formatIp$1(msg, 31);
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
      const parsed = parsePM100Response$1(msg);
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
    socket.bind(PM100_PORT$1, () => {
      const packet = buildDiscoveryPacket$1();
      socket.setBroadcast(true);
      socket.setRecvBufferSize(1024 * 1024);
      const targets = getBroadcastTargets$1(SEARCH_MASK);
      this.onLog(
        `Scan start: port=${PM100_PORT$1}, mask=${SEARCH_MASK}, targets=${targets.join(", ")}`
      );
      this.onLog(
        `Send ${packet.length} bytes: ${packet.toString("hex").match(/.{1,2}/g)?.join(" ")}`
      );
      const sendOnce = () => {
        const packet2 = buildDiscoveryPacket$1();
        for (const host of targets) {
          socket.send(packet2, PM100_PORT$1, host, (err) => {
            if (err)
              this.onLog(`Send fail -> ${host}:${PM100_PORT$1} : ${err.message}`);
            else this.onLog(`Sent -> ${host}:${PM100_PORT$1}`);
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
    const packet = buildResetPacket(mac);
    const bcast = broadcastByMask$1(deviceIp, SEARCH_MASK);
    this.onLog(
      `Reset TX (broadcast) -> ${bcast}:${PM100_PORT$1} (${packet.length} bytes)`
    );
    socket.send(packet, PM100_PORT$1, bcast, (err) => {
      if (err)
        this.onLog(
          `Reset send fail -> ${bcast}:${PM100_PORT$1} : ${err.message}`
        );
      else this.onLog(`Reset sent -> ${bcast}:${PM100_PORT$1}`);
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
    s.bind(PM100_PORT$1, "0.0.0.0", () => {
      s.setBroadcast(true);
      this.onLog(`CMD socket ready on 0.0.0.0:${PM100_PORT$1}`);
    });
    this.cmdSocket = s;
    return s;
  }
}
function buildResetPacket(macStr) {
  const mac = Buffer.from(macStr.split(":").map((h) => parseInt(h, 16)));
  const cmd = Buffer.from("Camguard_Initialize", "ascii");
  return Buffer.concat([mac, cmd]);
}
let scanner = null;
function send(getWin, channel, payload) {
  const w = getWin();
  if (!w) return;
  w.webContents.send(channel, payload);
}
function registerPM100DiscoveryMainIPC(getWin) {
  const ensureScanner = () => {
    if (!scanner) {
      scanner = new PM100Scanner(
        // ✅ 새 채널로 송신 + (선택) legacy도 같이 송신
        (line) => {
          send(getWin, PM100_CHANNELS.discovery.log, line);
          send(getWin, PM100_CHANNELS.legacy.discoveryLog, line);
        },
        (payload) => {
          send(getWin, PM100_CHANNELS.discovery.udp, payload);
          send(getWin, PM100_CHANNELS.legacy.discoveryUdp, payload);
        }
      );
    }
    return scanner;
  };
  const scanStartHandler = () => {
    ensureScanner().start();
    return true;
  };
  const scanStopHandler = () => {
    if (scanner) scanner.stop();
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
const PM100_PORT = 1500;
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
    // "CG_CMD"
    0,
    0,
    0,
    0,
    0,
    0
    // MAC 6 bytes (0)
  ]);
  const cs = xorChecksum(body);
  return Buffer.concat([body, Buffer.from([cs])]);
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
function getBroadcastTargets() {
  const nets = os.networkInterfaces();
  const targets = /* @__PURE__ */ new Set();
  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || a.family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      const mask = a.netmask;
      if (!mask) continue;
      targets.add(broadcastByMask(a.address, mask));
    }
  }
  if (targets.size === 0) targets.add("255.255.255.255");
  return Array.from(targets);
}
function formatMac(msg, offset) {
  return Array.from(msg.slice(offset, offset + 6)).map((b) => b.toString(16).padStart(2, "0")).join(":").toUpperCase();
}
function formatIp(msg, offset) {
  return `${msg[offset]}.${msg[offset + 1]}.${msg[offset + 2]}.${msg[offset + 3]}`;
}
function parsePM100Response(msg) {
  if (msg.length < 41) return null;
  const tag = msg.slice(0, 6).toString("ascii");
  if (tag !== "CG_RES") return null;
  let o = 6;
  const mac = formatMac(msg, o);
  o += 6;
  const blockOffset = o;
  const blockLen = 27;
  const cmd = msg[o];
  o += 1;
  const verMajor = msg[o];
  const verMinor = msg[o + 1];
  const version = `${verMajor}.${verMinor}`;
  o += 2;
  const ip2 = formatIp(msg, o);
  o += 4;
  const subnetMask = formatIp(msg, o);
  o += 4;
  const gateway = formatIp(msg, o);
  o += 4;
  const serverIp = formatIp(msg, o);
  o += 4;
  const serverPort = msg.readUInt16BE(o);
  o += 2;
  const s1Mode = msg[o];
  const s2Mode = msg[o + 1];
  const s3Mode = msg[o + 2];
  o += 3;
  const s1DelayTime = msg[o];
  const s2DelayTime = msg[o + 1];
  const s3DelayTime = msg[o + 2];
  o += 3;
  const receivedXorBlock = msg[o];
  const receivedXorAll = msg[o + 1];
  const block = msg.slice(blockOffset, blockOffset + blockLen);
  const calcXorBlock = xorChecksum(block);
  const calcXorAll = xorChecksum(msg.slice(0, msg.length - 1));
  if (receivedXorBlock !== calcXorBlock) return null;
  if (receivedXorAll !== calcXorAll) return null;
  return {
    mac,
    cmd,
    version,
    ip: ip2,
    subnetMask,
    gateway,
    serverIp,
    serverPort,
    s1Mode,
    s2Mode,
    s3Mode,
    s1DelayTime,
    s2DelayTime,
    s3DelayTime,
    receivedXorBlock,
    receivedXorAll,
    calcXorBlock,
    calcXorAll
  };
}
function keyFromMac(mac) {
  return mac.replace(/[^0-9A-F]/gi, "").slice(-6).split("").reduce((acc, ch) => acc * 16 + parseInt(ch, 16) >>> 0, 0) % 9e5 + 1e5;
}
function toDeviceRow(info, rawBytes) {
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
      xorAll: info.receivedXorAll
    }
  };
}
function createPM100UdpScanner(events) {
  let socket = null;
  let timer = null;
  let running = false;
  const deviceMap = /* @__PURE__ */ new Map();
  const defaults = {
    port: PM100_PORT,
    intervalMs: 2e3,
    count: 5
  };
  function cleanup(reason) {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (socket) {
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
      }
      socket = null;
    }
    if (reason) events.log(`UDP 검색 멈춤: ${reason}`);
    if (reason !== "restart") {
      events.stopped({ reason: reason ?? "", found: deviceMap.size });
    }
    deviceMap.clear();
  }
  async function start(opts) {
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
          size: rinfo.size
        },
        bytes: Array.from(msg)
      });
      const info = parsePM100Response(msg);
      if (!info) return;
      const row = toDeviceRow(info, new Uint8Array(msg));
      const prev = deviceMap.get(row.macStr);
      deviceMap.set(row.macStr, row);
      if (!prev || prev.deviceIpStr !== row.deviceIpStr || prev.subnetStr !== row.subnetStr || prev.gatewayStr !== row.gatewayStr || prev.serverIpStr !== row.serverIpStr || prev.serverPort !== row.serverPort || prev.s1Mode !== row.s1Mode || prev.s2Mode !== row.s2Mode || prev.s3Mode !== row.s3Mode || prev.s1DelayTime !== row.s1DelayTime || prev.s2DelayTime !== row.s2DelayTime || prev.s3DelayTime !== row.s3DelayTime) {
        events.discovered(row);
      }
    });
    await new Promise((resolve, reject) => {
      try {
        socket.bind(bindPort, () => {
          try {
            socket.setBroadcast(true);
            socket.setRecvBufferSize(1024 * 1024);
          } catch {
          }
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
    const targets = getBroadcastTargets();
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
  function stop(reason) {
    if (!running) return;
    cleanup(reason ?? "manual stop");
  }
  return { start, stop, isRunning: () => running };
}
function registerPM100ToolUdpMainIPC(getWin) {
  if (globalThis.__pm100_tool_udp_ipc_registered) return;
  globalThis.__pm100_tool_udp_ipc_registered = true;
  const events = {
    log: (line) => {
      const win2 = getWin();
      if (!win2 || win2.isDestroyed()) return;
      win2.webContents.send("pm100:udp:log", line);
    },
    raw: (payload) => {
      const win2 = getWin();
      if (!win2 || win2.isDestroyed()) return;
      win2.webContents.send("pm100:udp:raw", payload);
    },
    discovered: (row) => {
      const win2 = getWin();
      if (!win2 || win2.isDestroyed()) return;
      win2.webContents.send("pm100:udp:discovered", row);
    },
    stopped: (payload) => {
      const win2 = getWin();
      if (!win2 || win2.isDestroyed()) return;
      win2.webContents.send("pm100:udp:stopped", payload);
    }
  };
  const scanner2 = createPM100UdpScanner(events);
  ipcMain.handle(
    "pm100:udp:scanStart",
    async (_evt, opts) => {
      try {
        await scanner2.start(opts);
        return true;
      } catch (e) {
        events.log(`scanStart failed: ${String(e?.message || e)}`);
        try {
          scanner2.stop("scanStart failed");
        } catch {
        }
        return false;
      }
    }
  );
  ipcMain.handle("pm100:udp:scanStop", async () => {
    try {
      scanner2.stop("manual stop");
      return true;
    } catch (e) {
      events.log(`scanStop failed: ${String(e?.message || e)}`);
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
      acceptFirstMouse: true,
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
    acceptFirstMouse: true,
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
