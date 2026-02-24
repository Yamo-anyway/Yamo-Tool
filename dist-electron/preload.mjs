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
    discovery: pm100discoveryApi,
    setup: pm100setupApi,
    tool: {
      tcp: pm100ToolTcpApi,
      udp: pm100ToolUdpApi
      // {
      //   scanStart: (opts: {
      //     port: number;
      //     intervalMs: number;
      //     count: number;
      //   }) => ipcRenderer.invoke("pm100:udp:scanStart", opts),
      //   scanStop: () => ipcRenderer.invoke("pm100:udp:scanStop"),
      //   onDiscovered: (cb: (row: any) => void) => {
      //     const handler = (_evt: any, row: any) => cb(row);
      //     ipcRenderer.on("pm100:udp:discovered", handler);
      //     return () =>
      //       ipcRenderer.removeListener("pm100:udp:discovered", handler);
      //   },
      //   onStopped: (cb: (p: { reason: string; found: number }) => void) => {
      //     const handler = (_evt: any, p: any) => cb(p);
      //     ipcRenderer.on("pm100:udp:stopped", handler);
      //     return () => ipcRenderer.removeListener("pm100:udp:stopped", handler);
      //   },
      //   sendUdp: (p: SendUdpPayload) =>
      //     ipcRenderer.invoke("pm100:udp:sendUdp", p),
      //   onLog: (cb: (line: string) => void) => {
      //     const handler = (_evt: any, line: any) => cb(String(line ?? ""));
      //     ipcRenderer.on("pm100:udp:log", handler);
      //     return () => ipcRenderer.removeListener("pm100:udp:log", handler);
      //   },
      // },
    }
  }
});
