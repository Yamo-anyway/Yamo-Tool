import { ipcRenderer } from "electron";
import { PM100_CHANNELS } from "../../../ipc/channels";

export const pm100discoveryApi = {
  scanStart: () =>
    ipcRenderer.invoke(PM100_CHANNELS.discovery.scanStart) as Promise<boolean>,

  scanStop: () =>
    ipcRenderer.invoke(PM100_CHANNELS.discovery.scanStop) as Promise<boolean>,

  onLog: (cb: (line: string) => void) => {
    const handler = (_: any, line: string) => cb(line);
    ipcRenderer.on(PM100_CHANNELS.discovery.log, handler);
    return () =>
      ipcRenderer.removeListener(PM100_CHANNELS.discovery.log, handler);
  },

  onUdp: (cb: (p: any) => void) => {
    const handler = (_: any, payload: any) => cb(payload);
    ipcRenderer.on(PM100_CHANNELS.discovery.udp, handler);
    return () =>
      ipcRenderer.removeListener(PM100_CHANNELS.discovery.udp, handler);
  },

  getLocalIPv4s: () =>
    ipcRenderer.invoke(PM100_CHANNELS.discovery.getLocalIPv4s) as Promise<
      string[]
    >,

  resetDevice: (ip: string, mac: string) =>
    ipcRenderer.invoke(PM100_CHANNELS.discovery.reset, ip, mac),
};
