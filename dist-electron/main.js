import { ipcMain, app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import dgram from "dgram";
import net from "net";
const PM100_CHANNELS = {
  scanStart: "pm100:scanStart",
  scanStop: "pm100:scanStop",
  // ✅ 추가
  log: "pm100:log",
  udp: "pm100:udp",
  reset: "pm100:reset"
};
const PM100_PORT = 1500;
const SEARCH_MASK = "255.255.255.0";
function xorChecksum$1(buf) {
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
  const cs = xorChecksum$1(body);
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
      const packet = buildDiscoveryPacket();
      socket.setBroadcast(true);
      socket.setRecvBufferSize(1024 * 1024);
      const targets = getBroadcastTargets(SEARCH_MASK);
      this.onLog(
        `Scan start: port=${PM100_PORT}, mask=${SEARCH_MASK}, targets=${targets.join(", ")}`
      );
      this.onLog(
        `Send ${packet.length} bytes: ${packet.toString("hex").match(/.{1,2}/g)?.join(" ")}`
      );
      const sendOnce = () => {
        const packet2 = buildDiscoveryPacket();
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
    const packet = buildResetPacket(mac);
    const bcast = broadcastByMask(deviceIp, SEARCH_MASK);
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
        (line) => send(getWin, PM100_CHANNELS.log, line),
        (payload) => send(getWin, PM100_CHANNELS.udp, payload)
      );
    }
    return scanner;
  };
  ipcMain.handle(PM100_CHANNELS.scanStart, () => {
    ensureScanner().start();
    return true;
  });
  ipcMain.handle(PM100_CHANNELS.scanStop, () => {
    if (scanner) scanner.stop();
    return true;
  });
  ipcMain.handle(PM100_CHANNELS.reset, (_evt, ip2, mac) => {
    try {
      ensureScanner().sendReset(ip2, mac);
      return true;
    } catch (e) {
      return false;
    }
  });
}
const FRAME_LEN = 36;
function ip(buf, off) {
  return `${buf[off]}.${buf[off + 1]}.${buf[off + 2]}.${buf[off + 3]}`;
}
function u16be(buf, off) {
  return buf[off] << 8 | buf[off + 1];
}
function xorChecksum(buf) {
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
    const actual = xorChecksum(frameBuf);
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
const PM100_SETUP_CHANNELS = {
  start: "pm100setup:start",
  stop: "pm100setup:stop",
  status: "pm100setup:status",
  log: "pm100setup:log",
  getLocalIPv4s: "pm100setup:getLocalIPv4s",
  device: "pm100setup:device",
  getConnectedIps: "pm100setup:getConnectedIps"
};
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
  ipcMain.handle(
    PM100_SETUP_CHANNELS.start,
    (_evt, port, host) => {
      const wc = getWC(getWin);
      if (!server) {
        server = new PM100SetupServer(
          (line) => wc.send(PM100_SETUP_CHANNELS.log, line),
          (s) => wc.send(PM100_SETUP_CHANNELS.status, s),
          (f) => wc.send(PM100_SETUP_CHANNELS.device, f)
        );
      }
      server.start(port, host);
      return true;
    }
  );
  ipcMain.handle(PM100_SETUP_CHANNELS.stop, async () => {
    if (server) {
      if (server) await server.stopAsync();
    }
    const wc = getWC(getWin);
    wc.send(PM100_SETUP_CHANNELS.status, { running: false });
    return true;
  });
  ipcMain.handle(PM100_SETUP_CHANNELS.status, () => {
    return server ? server.status() : { running: false };
  });
  ipcMain.handle(PM100_SETUP_CHANNELS.getLocalIPv4s, () => {
    return getLocalIPv4s();
  });
  ipcMain.handle(PM100_SETUP_CHANNELS.getConnectedIps, () => {
    return server ? server.getConnectedIps() : [];
  });
}
function stopPM100SetupServer() {
  if (server) {
    server.stopAsync();
    server = null;
  }
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    title: "Launcher",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  win.on("close", () => {
    stopPM100SetupServer();
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(process.cwd(), "index.html"));
}
app.whenReady().then(() => {
  createWindow();
  registerPM100DiscoveryMainIPC(() => win);
  registerPM100SetupMainIPC(() => win);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  stopPM100SetupServer();
});
process.on("uncaughtException", (err) => {
  console.error("MAIN CRASH:", err);
});
