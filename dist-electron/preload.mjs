"use strict";
const electron = require("electron");
const PM100_CHANNELS = {
  discovery: {
    scanStart: "pm100:discovery:scanStart",
    scanStop: "pm100:discovery:scanStop",
    getLocalIPv4s: "pm100:discovery:getLocalIPv4s",
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
    }
  }
};
const pm100discoveryApi = {
  scanStart: () => electron.ipcRenderer.invoke(PM100_CHANNELS.discovery.scanStart),
  scanStop: () => electron.ipcRenderer.invoke(PM100_CHANNELS.discovery.scanStop),
  onLog: (cb) => {
    const handler = (_, line) => cb(line);
    electron.ipcRenderer.on(PM100_CHANNELS.discovery.log, handler);
    return () => electron.ipcRenderer.removeListener(PM100_CHANNELS.discovery.log, handler);
  },
  onUdp: (cb) => {
    const handler = (_, payload) => cb(payload);
    electron.ipcRenderer.on(PM100_CHANNELS.discovery.udp, handler);
    return () => electron.ipcRenderer.removeListener(PM100_CHANNELS.discovery.udp, handler);
  },
  getLocalIPv4s: () => electron.ipcRenderer.invoke(PM100_CHANNELS.discovery.getLocalIPv4s),
  resetDevice: (ip, mac) => electron.ipcRenderer.invoke(PM100_CHANNELS.discovery.reset, ip, mac)
};
const pm100setupApi = {
  startServer: (port, host) => electron.ipcRenderer.invoke(PM100_CHANNELS.setup.start, port, host),
  stopServer: () => electron.ipcRenderer.invoke(PM100_CHANNELS.setup.stop),
  getStatus: () => electron.ipcRenderer.invoke(PM100_CHANNELS.setup.status),
  onLog: (cb) => {
    const handler = (_, line) => cb(line);
    electron.ipcRenderer.on(PM100_CHANNELS.setup.log, handler);
    return () => electron.ipcRenderer.removeListener(PM100_CHANNELS.setup.log, handler);
  },
  onStatus: (cb) => {
    const handler = (_, s) => cb(s);
    electron.ipcRenderer.on(PM100_CHANNELS.setup.status, handler);
    return () => electron.ipcRenderer.removeListener(PM100_CHANNELS.setup.status, handler);
  },
  getLocalIPv4s: () => electron.ipcRenderer.invoke(PM100_CHANNELS.setup.getLocalIPv4s),
  onDevice: (cb) => {
    const handler = (_, f) => cb(f);
    electron.ipcRenderer.on("pm100setup:device", handler);
    return () => electron.ipcRenderer.removeListener("pm100setup:device", handler);
  },
  getConnectedIps: () => electron.ipcRenderer.invoke(PM100_CHANNELS.setup.getConnectedIps)
};
const pm100toolUdpApi = {
  scanStart: () => electron.ipcRenderer.invoke(PM100_CHANNELS.tool.udp.scanStart),
  scanStop: () => electron.ipcRenderer.invoke(PM100_CHANNELS.tool.udp.scanStop),
  onLog: (cb) => {
    const handler = (_, line) => cb(line);
    electron.ipcRenderer.on(PM100_CHANNELS.tool.udp.log, handler);
    return () => electron.ipcRenderer.removeListener(PM100_CHANNELS.tool.udp.log, handler);
  },
  onUdp: (cb) => {
    const handler = (_, payload) => cb(payload);
    electron.ipcRenderer.on(PM100_CHANNELS.tool.udp.udp, handler);
    return () => electron.ipcRenderer.removeListener(PM100_CHANNELS.tool.udp.udp, handler);
  },
  resetDevice: (ip, mac) => electron.ipcRenderer.invoke(
    PM100_CHANNELS.tool.udp.reset,
    ip,
    mac
  ),
  updateConfig: (payload) => electron.ipcRenderer.invoke(
    PM100_CHANNELS.tool.udp.updateConfig,
    payload
  )
};
electron.contextBridge.exposeInMainWorld("api", {
  pm100: {
    discovery: pm100discoveryApi,
    setup: pm100setupApi,
    tool: {
      udp: pm100toolUdpApi
    }
  }
});
