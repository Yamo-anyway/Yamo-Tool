import { ipcRenderer } from "electron";
import { PM100_CHANNELS } from "./channels";

export function createPM100PreloadApi() {
  return {
    scanStart: () =>
      ipcRenderer.invoke(PM100_CHANNELS.scanStart) as Promise<boolean>,

    scanStop: () =>
      ipcRenderer.invoke(PM100_CHANNELS.scanStop) as Promise<boolean>,

    onLog: (cb: (line: string) => void) => {
      const handler = (_: any, line: string) => cb(line);
      ipcRenderer.on(PM100_CHANNELS.log, handler);
      return () => ipcRenderer.removeListener(PM100_CHANNELS.log, handler);
    },

    onUdp: (cb: (p: any) => void) => {
      const handler = (_: any, payload: any) => cb(payload);
      ipcRenderer.on(PM100_CHANNELS.udp, handler);
      return () => ipcRenderer.removeListener(PM100_CHANNELS.udp, handler);
    },

    getLocalIPv4s: () =>
      ipcRenderer.invoke(PM100_CHANNELS.getLocalIPv4s) as Promise<string[]>,

    resetDevice: (ip: string, mac: string) =>
      ipcRenderer.invoke(PM100_CHANNELS.reset, ip, mac),
  };
}
