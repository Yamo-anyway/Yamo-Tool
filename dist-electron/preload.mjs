"use strict";
const electron = require("electron");
const pm100ToolTcpApi = {
  getLocalIPv4s: () => electron.ipcRenderer.invoke("pm100:tool:tcp:getLocalIPv4s"),
  getStatus: () => electron.ipcRenderer.invoke("pm100:tool:tcp:getStatus"),
  startServer: (port, host) => electron.ipcRenderer.invoke("pm100:tool:tcp:startServer", { port, host }),
  stopServer: () => electron.ipcRenderer.invoke("pm100:tool:tcp:stopServer"),
  onLog: (cb) => {
    const handler = (_evt, line) => cb(String(line ?? ""));
    electron.ipcRenderer.on("pm100:tool:tcp:log", handler);
    return () => electron.ipcRenderer.removeListener("pm100:tool:tcp:log", handler);
  },
  onStatus: (cb) => {
    const handler = (_evt, s) => cb(s);
    electron.ipcRenderer.on("pm100:tool:tcp:status", handler);
    return () => electron.ipcRenderer.removeListener("pm100:tool:tcp:status", handler);
  },
  onRaw: (cb) => {
    const handler = (_evt, p) => cb(p);
    electron.ipcRenderer.on("pm100:tool:tcp:raw", handler);
    return () => electron.ipcRenderer.removeListener("pm100:tool:tcp:raw", handler);
  },
  send: (p) => electron.ipcRenderer.invoke("pm100:tcp:send", p),
  onDevice: (cb) => {
    const handler = (_evt, row) => cb(row);
    electron.ipcRenderer.on("pm100:tool:tcp:device", handler);
    return () => electron.ipcRenderer.removeListener("pm100:tool:tcp:device", handler);
  }
};
const pm100ToolUdpApi = {
  scanStart: (opts) => electron.ipcRenderer.invoke("pm100:udp:scanStart", opts ?? {}),
  scanStop: () => electron.ipcRenderer.invoke("pm100:udp:scanStop"),
  onDiscovered: (cb) => {
    const handler = (_evt, row) => cb(row);
    electron.ipcRenderer.on("pm100:udp:discovered", handler);
    return () => electron.ipcRenderer.removeListener("pm100:udp:discovered", handler);
  },
  onStopped: (cb) => {
    const handler = (_evt, reason) => cb(String(reason ?? ""));
    electron.ipcRenderer.on("pm100:udp:stopped", handler);
    return () => electron.ipcRenderer.removeListener("pm100:udp:stopped", handler);
  },
  onLog: (cb) => {
    const handler = (_evt, line) => cb(line);
    electron.ipcRenderer.on("pm100:udp:log", handler);
    return () => electron.ipcRenderer.removeListener("pm100:udp:log", handler);
  },
  // raw udp packet/remote info
  onUdp: (cb) => {
    const handler = (_evt, p) => cb(p);
    electron.ipcRenderer.on("pm100:udp:raw", handler);
    return () => electron.ipcRenderer.removeListener("pm100:udp:raw", handler);
  },
  sendUdp: (p) => electron.ipcRenderer.invoke("pm100:udp:sendUdp", p)
};
electron.contextBridge.exposeInMainWorld("api", {
  pm100: {
    tool: {
      tcp: pm100ToolTcpApi,
      udp: pm100ToolUdpApi
    }
  }
});
