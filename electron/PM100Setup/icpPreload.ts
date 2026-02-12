import { ipcRenderer } from "electron";
import { PM100_SETUP_CHANNELS } from "./channels";

export const pm100setupApi = {
  startServer: (port: number, host: string) =>
    ipcRenderer.invoke(PM100_SETUP_CHANNELS.start, port, host),
  stopServer: () => ipcRenderer.invoke(PM100_SETUP_CHANNELS.stop),
  getStatus: () => ipcRenderer.invoke(PM100_SETUP_CHANNELS.status),

  onLog: (cb: (line: string) => void) => {
    const handler = (_: any, line: string) => cb(line);
    ipcRenderer.on(PM100_SETUP_CHANNELS.log, handler);
    return () => ipcRenderer.removeListener(PM100_SETUP_CHANNELS.log, handler);
  },

  onStatus: (cb: (s: any) => void) => {
    const handler = (_: any, s: any) => cb(s);
    ipcRenderer.on(PM100_SETUP_CHANNELS.status, handler);
    return () =>
      ipcRenderer.removeListener(PM100_SETUP_CHANNELS.status, handler);
  },
};
