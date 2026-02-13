import { ipcRenderer } from "electron";
import { PM100_CHANNELS } from "../../../ipc/channels";

export const pm100setupApi = {
  startServer: (port: number, host: string) =>
    ipcRenderer.invoke(PM100_CHANNELS.setup.start, port, host),
  stopServer: () => ipcRenderer.invoke(PM100_CHANNELS.setup.stop),
  getStatus: () => ipcRenderer.invoke(PM100_CHANNELS.setup.status),

  onLog: (cb: (line: string) => void) => {
    const handler = (_: any, line: string) => cb(line);
    ipcRenderer.on(PM100_CHANNELS.setup.log, handler);
    return () => ipcRenderer.removeListener(PM100_CHANNELS.setup.log, handler);
  },

  onStatus: (cb: (s: any) => void) => {
    const handler = (_: any, s: any) => cb(s);
    ipcRenderer.on(PM100_CHANNELS.setup.status, handler);
    return () =>
      ipcRenderer.removeListener(PM100_CHANNELS.setup.status, handler);
  },

  getLocalIPv4s: () => ipcRenderer.invoke(PM100_CHANNELS.setup.getLocalIPv4s),

  onDevice: (cb: (f: any) => void) => {
    const handler = (_: any, f: any) => cb(f);
    ipcRenderer.on("pm100setup:device", handler);
    return () => ipcRenderer.removeListener("pm100setup:device", handler);
  },

  getConnectedIps: () =>
    ipcRenderer.invoke(PM100_CHANNELS.setup.getConnectedIps),
};
