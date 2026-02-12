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
electron.contextBridge.exposeInMainWorld("api", {
  pm100: createPM100PreloadApi()
});
