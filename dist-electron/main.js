import { ipcMain, app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import dgram from "dgram";
import net from "net";
const PM100_PORT$1 = 1500;
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
    // "CG_CMD"
    0,
    0,
    0,
    0,
    0,
    0
    // MAC 6 bytes (0)
  ]);
  const cs = xorChecksum$1(body);
  return Buffer.concat([body, Buffer.from([cs])]);
}
function ipToU32$1(ip) {
  const [a, b, c, d] = ip.split(".").map((x) => parseInt(x, 10));
  return (a << 24 >>> 0 | b << 16 | c << 8 | d) >>> 0;
}
function u32ToIp$1(u) {
  const a = u >>> 24 & 255;
  const b = u >>> 16 & 255;
  const c = u >>> 8 & 255;
  const d = u & 255;
  return `${a}.${b}.${c}.${d}`;
}
function broadcastByMask$1(ip, mask) {
  const ipU = ipToU32$1(ip);
  const maskU = ipToU32$1(mask);
  const bcast = (ipU | ~maskU >>> 0) >>> 0;
  return u32ToIp$1(bcast);
}
function getBroadcastTargets$1() {
  const nets = os.networkInterfaces();
  const targets = /* @__PURE__ */ new Set();
  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || a.family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      const mask = a.netmask;
      if (!mask) continue;
      targets.add(broadcastByMask$1(a.address, mask));
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
  if (msg.length < 47) return null;
  const tag = msg.slice(0, 6).toString("ascii");
  if (tag !== "CG_RES") return null;
  let o = 6;
  const mac = formatMac(msg, o);
  o += 6;
  const blockOffset = o;
  let blockLen = 0;
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
  const serverPort = msg.readUInt16BE(o);
  o += 2;
  blockLen += 2;
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
  const s1DelayTime = msg[o];
  const s2DelayTime = msg[o + 1];
  const s3DelayTime = msg[o + 2];
  o += 3;
  blockLen += 3;
  o += 3;
  blockLen += 3;
  o += 1;
  blockLen += 1;
  const receivedXorBlock = msg[o];
  const receivedXorAll = msg[o + 1];
  const block = msg.slice(blockOffset, blockOffset + blockLen);
  const calcXorBlock = xorChecksum$1(block);
  const calcXorAll = xorChecksum$1(msg.slice(0, msg.length - 1));
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
    port: PM100_PORT$1,
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
    const targets = getBroadcastTargets$1();
    const sendOnce = () => {
      if (!socket || !running) return;
      const packet = buildDiscoveryPacket();
      for (const host of targets) {
        socket.send(packet, PM100_PORT$1, host, (err) => {
          if (err) {
            events.log(`Send fail -> ${host}:${PM100_PORT$1} : ${err.message}`);
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
const PM100_PORT = 1500;
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
function macStrToBytes(macStr) {
  if (!macStr || typeof macStr !== "string") throw new Error("macStr missing");
  const hex = macStr.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 12) throw new Error(`Invalid MAC: ${macStr}`);
  const out = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) & 255;
  }
  return out;
}
function buildCgCmdPacket(p) {
  const tag = Buffer.from("CG_CMD", "ascii");
  const mac = macStrToBytes(p.macStr);
  const cmd = Buffer.from([Number(p.cmd) & 255]);
  const data = Buffer.from(p.data ?? []);
  return Buffer.concat([tag, mac, cmd, data]);
}
async function sendBroadcast(packet, port = PM100_PORT) {
  const targets = getBroadcastTargets();
  return await new Promise((resolve) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const finish = (ok) => {
      try {
        sock.removeAllListeners();
        sock.close();
      } catch {
      }
      resolve(ok);
    };
    sock.on("error", () => finish(false));
    sock.bind(0, () => {
      try {
        sock.setBroadcast(true);
      } catch {
      }
      let pending = targets.length;
      let anyOk = false;
      console.log("packet", packet);
      for (const host of targets) {
        sock.send(packet, port, host, (err) => {
          if (!err) anyOk = true;
          pending -= 1;
          if (pending <= 0) finish(anyOk);
        });
      }
    });
  });
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
  const scanner = createPM100UdpScanner(events);
  ipcMain.handle(
    "pm100:udp:scanStart",
    async (_evt, opts) => {
      try {
        await scanner.start(opts);
        return true;
      } catch (e) {
        events.log(`scanStart failed: ${String(e?.message || e)}`);
        try {
          scanner.stop("scanStart failed");
        } catch {
        }
        return false;
      }
    }
  );
  ipcMain.handle("pm100:udp:scanStop", async () => {
    try {
      scanner.stop("manual stop");
      return true;
    } catch (e) {
      events.log(`scanStop failed: ${String(e?.message || e)}`);
      return false;
    }
  });
  ipcMain.handle("pm100:udp:sendUdp", async (_evt, args) => {
    try {
      const packet = buildCgCmdPacket({
        macStr: args?.macStr,
        cmd: args?.cmd,
        data: args?.data
      });
      const ok = await sendBroadcast(packet, PM100_PORT);
      return ok;
    } catch (e) {
      console.error("pm100:udp:sendUdp error:", e, "args=", args);
      return false;
    }
  });
}
function toHexSpaced(buf, maxBytes = 512) {
  const b = buf.length > maxBytes ? buf.slice(0, maxBytes) : buf;
  const hex = b.toString("hex").toUpperCase();
  const spaced = hex.match(/.{1,2}/g)?.join(" ") ?? "";
  return buf.length > maxBytes ? spaced + ` ... (+${buf.length - maxBytes} bytes)` : spaced;
}
const CGDI = Buffer.from([67, 71, 68, 73]);
const HDR = Buffer.from([67, 71, 68, 73, 127]);
const FRAME_LEN = 36;
function xorChecksum(buf) {
  let x = 0;
  for (const b of buf) x ^= b;
  return x & 255;
}
function buildCgdiPacket(cmd, data) {
  const head = Buffer.concat([CGDI, Buffer.from([cmd & 255])]);
  const body = data && data.length ? Buffer.from(data) : Buffer.alloc(0);
  const withoutCs = Buffer.concat([head, body]);
  const cs = xorChecksum(withoutCs);
  return Buffer.concat([withoutCs, Buffer.from([cs])]);
}
function formatIpBytes(b, off) {
  return `${b[off]}.${b[off + 1]}.${b[off + 2]}.${b[off + 3]}`;
}
function ipToKey(ip) {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  const u = (parts[0] << 24 >>> 0 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
  return u % 9e5 + 1e5;
}
function parseTcpFrame(frame) {
  if (frame.length !== FRAME_LEN) return null;
  if (!frame.subarray(0, 5).equals(HDR)) return null;
  const received = frame[FRAME_LEN - 1];
  const calc = xorChecksum(frame.subarray(0, FRAME_LEN - 1));
  if (received !== calc) return null;
  const deviceIpStr = formatIpBytes(frame, 5);
  const subnetStr = formatIpBytes(frame, 9);
  const gatewayStr = formatIpBytes(frame, 13);
  const serverIpStr = formatIpBytes(frame, 17);
  const serverPort = frame.readUInt16BE(21);
  const s1Mode = frame[23];
  const s2Mode = frame[24];
  const s3Mode = frame[25];
  const s1Enable = frame[26];
  const s2Enable = frame[27];
  const s3Enable = frame[28];
  const s1DelayTime = frame[29];
  const s2DelayTime = frame[30];
  const s3DelayTime = frame[31];
  const s1Status = frame[32];
  const s2Status = frame[33];
  const s3Status = frame[34];
  return {
    key: ipToKey(deviceIpStr),
    type: "TCP",
    isDetail: false,
    isEdit: false,
    macStr: "",
    deviceIpStr,
    subnetStr,
    gatewayStr,
    serverIpStr,
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
    s1Status,
    s2Status,
    s3Status,
    raw: {
      proto: "CGDI",
      resp: 127,
      enable: [s1Enable, s2Enable, s3Enable],
      checksum: received,
      calcChecksum: calc,
      rawBytes: new Uint8Array(frame)
    }
  };
}
function normalizeRemoteIp(addr) {
  const s = String(addr ?? "").trim();
  if (s.startsWith("::ffff:")) return s.slice(7);
  return s;
}
function createPM100ToolTcpServer(events) {
  let server = null;
  let running = false;
  let boundPort;
  let boundHost;
  const sockets = /* @__PURE__ */ new Set();
  const socketByDeviceIp = /* @__PURE__ */ new Map();
  function emitStatus() {
    events.status({ running, port: boundPort, host: boundHost });
  }
  async function startServer(port, host) {
    if (running) return true;
    return await new Promise((resolve) => {
      try {
        server = net.createServer((socket) => {
          sockets.add(socket);
          const remoteIp = normalizeRemoteIp(socket.remoteAddress);
          const remote = `${remoteIp}:${socket.remotePort}`;
          events.client({ type: "connect", remote });
          events.log(`TCP client connected: ${remote}`);
          socket.on("close", () => {
            sockets.delete(socket);
            for (const [ip, s] of socketByDeviceIp.entries()) {
              if (s === socket) socketByDeviceIp.delete(ip);
            }
            events.client({ type: "close", remote });
            events.log(`TCP client closed: ${remote}`);
          });
          socket.on("error", (e) => {
            sockets.delete(socket);
            for (const [ip, s] of socketByDeviceIp.entries()) {
              if (s === socket) socketByDeviceIp.delete(ip);
            }
            events.log(
              `TCP socket error ${remote}: ${String(e?.message ?? e)}`
            );
          });
          let rxBuf = Buffer.alloc(0);
          socket.on("data", (chunk) => {
            const hex = toHexSpaced(chunk);
            events.raw({ remote, length: chunk.length, hex });
            events.log(`TCP RX ${remote} (${chunk.length} bytes)
${hex}`);
            rxBuf = Buffer.concat([rxBuf, chunk]);
            while (rxBuf.length >= 5) {
              const idx = rxBuf.indexOf(HDR);
              if (idx < 0) {
                if (rxBuf.length > 4096)
                  rxBuf = rxBuf.subarray(rxBuf.length - 4);
                break;
              }
              if (idx > 0) rxBuf = rxBuf.subarray(idx);
              if (rxBuf.length < FRAME_LEN) break;
              const frame = rxBuf.subarray(0, FRAME_LEN);
              rxBuf = rxBuf.subarray(FRAME_LEN);
              const row = parseTcpFrame(frame);
              if (!row) continue;
              socketByDeviceIp.set(row.deviceIpStr, socket);
              events.device(row);
            }
          });
        });
        server.on("error", (e) => {
          events.log(`TCP server error: ${String(e?.message ?? e)}`);
          try {
            server?.close();
          } catch {
          }
          server = null;
          running = false;
          boundPort = void 0;
          boundHost = void 0;
          emitStatus();
          resolve(false);
        });
        server.listen(port, host, () => {
          running = true;
          boundPort = port;
          boundHost = host;
          events.log(`TCP server listening: ${host}:${port}`);
          emitStatus();
          resolve(true);
        });
      } catch (e) {
        events.log(`TCP start failed: ${String(e?.message ?? e)}`);
        resolve(false);
      }
    });
  }
  async function stopServer() {
    for (const sock of sockets) {
      try {
        sock.destroy();
      } catch {
      }
    }
    sockets.clear();
    socketByDeviceIp.clear();
    const s = server;
    server = null;
    if (!s) {
      running = false;
      boundPort = void 0;
      boundHost = void 0;
      emitStatus();
      return true;
    }
    return await new Promise((resolve) => {
      try {
        s.close((err) => {
          if (err) {
            events.log(`TCP stop error: ${String(err?.message ?? err)}`);
            resolve(false);
            return;
          }
          running = false;
          boundPort = void 0;
          boundHost = void 0;
          events.log(`TCP server stopped`);
          emitStatus();
          resolve(true);
        });
      } catch (e) {
        events.log(`TCP stop failed: ${String(e?.message ?? e)}`);
        resolve(false);
      }
    });
  }
  function getStatus() {
    return { running, port: boundPort, host: boundHost };
  }
  async function sendToDevice(deviceIpStr, cmd, data) {
    const ip = String(deviceIpStr ?? "").trim();
    if (!ip) return false;
    const sock = socketByDeviceIp.get(ip);
    if (!sock || sock.destroyed) {
      events.log(`TCP send failed: no active socket for device ${ip}`);
      return false;
    }
    const packet = buildCgdiPacket(cmd, data);
    return await new Promise((resolve) => {
      try {
        sock.write(packet, (err) => {
          if (err) {
            events.log(
              `TCP send error ${ip}: ${String(err?.message ?? err)}`
            );
            resolve(false);
            return;
          }
          events.log(
            `TCP TX ${ip} (${packet.length} bytes)
${toHexSpaced(packet)}`
          );
          resolve(true);
        });
      } catch (e) {
        events.log(`TCP send exception ${ip}: ${String(e?.message ?? e)}`);
        resolve(false);
      }
    });
  }
  return {
    startServer,
    stopServer,
    getStatus,
    sendToDevice,
    isRunning: () => running
  };
}
function getLocalIPv4s() {
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
  return ips;
}
function registerPM100ToolTcpMainIPC(getWin) {
  if (globalThis.__pm100_tool_tcp_ipc_registered) return;
  globalThis.__pm100_tool_tcp_ipc_registered = true;
  const events = {
    log: (line) => {
      const win2 = getWin();
      if (!win2 || win2.isDestroyed()) return;
      win2.webContents.send("pm100:tool:tcp:log", line);
    },
    status: (s) => {
      const win2 = getWin();
      if (!win2 || win2.isDestroyed()) return;
      win2.webContents.send("pm100:tool:tcp:status", s);
    },
    client: (p) => {
      const win2 = getWin();
      if (!win2 || win2.isDestroyed()) return;
      win2.webContents.send("pm100:tool:tcp:client", p);
    },
    raw: (p) => {
      const win2 = getWin();
      if (!win2 || win2.isDestroyed()) return;
      win2.webContents.send("pm100:tool:tcp:raw", p);
    },
    device: (row) => {
      const win2 = getWin();
      if (!win2 || win2.isDestroyed()) return;
      win2.webContents.send("pm100:tool:tcp:device", row);
    }
  };
  const tcp = createPM100ToolTcpServer(events);
  ipcMain.handle("pm100:tool:tcp:getLocalIPv4s", async () => {
    try {
      return getLocalIPv4s();
    } catch {
      return [];
    }
  });
  ipcMain.handle(
    "pm100:tcp:send",
    async (_evt, args) => {
      try {
        const ip = String(args?.deviceIpStr ?? "").trim();
        const cmd = Number(args?.cmd) & 255;
        const data = Array.isArray(args?.data) ? args.data : void 0;
        const ok = await tcp.sendToDevice(ip, cmd, data);
        return !!ok;
      } catch (e) {
        events.log(`tcp:send failed: ${String(e?.message ?? e)}`);
        return false;
      }
    }
  );
  ipcMain.handle("pm100:tool:tcp:getStatus", async () => {
    return tcp.getStatus();
  });
  ipcMain.handle("pm100:tool:tcp:startServer", async (_evt, args) => {
    const port = Number(args?.port);
    const host = String(args?.host ?? "0.0.0.0");
    if (tcp.isRunning()) {
      await tcp.stopServer();
    }
    return await tcp.startServer(port, host);
  });
  ipcMain.handle("pm100:tool:tcp:stopServer", async () => {
    return await tcp.stopServer();
  });
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
let win = null;
function createWindow() {
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
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(process.cwd(), "index.html"));
}
app.whenReady().then(() => {
  createWindow();
  registerPM100ToolUdpMainIPC(() => win);
  registerPM100ToolTcpMainIPC(() => win);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
process.on("uncaughtException", (err) => {
  console.error("MAIN CRASH:", err);
});
