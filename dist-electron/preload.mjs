"use strict";
const electron = require("electron");
const PM100_CHANNELS = {
  scanStart: "pm100:scanStart",
  scanStop: "pm100:scanStop",
  getLocalIPv4s: "pm100:getLocalIPv4s",
  // ✅ 추가
  log: "pm100:log",
  udp: "pm100:udp",
  reset: "pm100:reset"
};
function createPM100PreloadApi() {
  return {
    scanStart: () => electron.ipcRenderer.invoke(PM100_CHANNELS.scanStart),
    scanStop: () => electron.ipcRenderer.invoke(PM100_CHANNELS.scanStop),
    onLog: (cb) => {
      const handler = (_, line) => cb(line);
      electron.ipcRenderer.on(PM100_CHANNELS.log, handler);
      return () => electron.ipcRenderer.removeListener(PM100_CHANNELS.log, handler);
    },
    onUdp: (cb) => {
      const handler = (_, payload) => cb(payload);
      electron.ipcRenderer.on(PM100_CHANNELS.udp, handler);
      return () => electron.ipcRenderer.removeListener(PM100_CHANNELS.udp, handler);
    },
    getLocalIPv4s: () => electron.ipcRenderer.invoke(PM100_CHANNELS.getLocalIPv4s),
    resetDevice: (ip, mac) => electron.ipcRenderer.invoke(PM100_CHANNELS.reset, ip, mac)
  };
}
const PM100_SETUP_CHANNELS = {
  start: "pm100setup:start",
  stop: "pm100setup:stop",
  status: "pm100setup:status",
  log: "pm100setup:log",
  getLocalIPv4s: "pm100setup:getLocalIPv4s",
  getConnectedIps: "pm100setup:getConnectedIps"
};
const pm100setupApi = {
  startServer: (port, host) => electron.ipcRenderer.invoke(PM100_SETUP_CHANNELS.start, port, host),
  stopServer: () => electron.ipcRenderer.invoke(PM100_SETUP_CHANNELS.stop),
  getStatus: () => electron.ipcRenderer.invoke(PM100_SETUP_CHANNELS.status),
  onLog: (cb) => {
    const handler = (_, line) => cb(line);
    electron.ipcRenderer.on(PM100_SETUP_CHANNELS.log, handler);
    return () => electron.ipcRenderer.removeListener(PM100_SETUP_CHANNELS.log, handler);
  },
  onStatus: (cb) => {
    const handler = (_, s) => cb(s);
    electron.ipcRenderer.on(PM100_SETUP_CHANNELS.status, handler);
    return () => electron.ipcRenderer.removeListener(PM100_SETUP_CHANNELS.status, handler);
  },
  getLocalIPv4s: () => electron.ipcRenderer.invoke(PM100_SETUP_CHANNELS.getLocalIPv4s),
  onDevice: (cb) => {
    const handler = (_, f) => cb(f);
    electron.ipcRenderer.on("pm100setup:device", handler);
    return () => electron.ipcRenderer.removeListener("pm100setup:device", handler);
  },
  getConnectedIps: () => electron.ipcRenderer.invoke(PM100_SETUP_CHANNELS.getConnectedIps)
};
electron.contextBridge.exposeInMainWorld("api", {
  pm100: createPM100PreloadApi(),
  pm100setup: pm100setupApi
});
