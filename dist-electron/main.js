import { ipcMain, app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import dgram from "dgram";
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
function ipToU32(ip) {
  const [a, b, c, d] = ip.split(".").map((x) => parseInt(x, 10));
  return (a << 24 >>> 0 | b << 16 | c << 8 | d) >>> 0;
}
function u32ToIp(u) {
  const a = u >>> 24 & 255;
  const b = u >>> 16 & 255;
  const c = u >>> 8 & 255;
  const d = u & 255;
  return `${a}.${b}.${c}.${d}`;
}
function broadcastByMask(ip, mask) {
  const ipU = ipToU32(ip);
  const maskU = ipToU32(mask);
  const bcast = (ipU | ~maskU >>> 0) >>> 0;
  return u32ToIp(bcast);
}
function pickLocalIPv4Fallback() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || a.family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      ips.push(a.address);
    }
  }
  if (ips.length === 0) return null;
  return ips.find((ip) => ip.startsWith("192.168.1.")) || // ⭐️ 추가
  ips.find((ip) => ip.startsWith("192.168.")) || ips.find((ip) => ip.startsWith("10.")) || ips.find((ip) => ip.startsWith("172.16.")) || ips[0];
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
  const ip = formatIp(msg, 15);
  const serverIp = formatIp(msg, 19);
  const subnetMask = formatIp(msg, 27);
  const gateway = formatIp(msg, 31);
  const serverPort = msg.readUInt16BE(35);
  return { mac, ip, serverIp, subnetMask, gateway, serverPort, version };
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
      this.onLog(`Bind OK: ${localIp}`);
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
  ipcMain.handle(PM100_CHANNELS.reset, (_evt, ip, mac) => {
    try {
      ensureScanner().sendReset(ip, mac);
      return true;
    } catch (e) {
      return false;
    }
  });
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
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(process.cwd(), "index.html"));
}
app.whenReady().then(() => {
  createWindow();
  registerPM100DiscoveryMainIPC(() => win);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
