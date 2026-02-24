// electron/features/pm100/tool/tcp/ipcPreload.ts
import { ipcRenderer } from "electron";

export type TcpToolStatus = { running: boolean; port?: number; host?: string };

export const pm100ToolTcpApi = {
  getLocalIPv4s: () => ipcRenderer.invoke("pm100:tool:tcp:getLocalIPv4s"),
  getStatus: () => ipcRenderer.invoke("pm100:tool:tcp:getStatus"),
  startServer: (port: number, host: string) =>
    ipcRenderer.invoke("pm100:tool:tcp:startServer", { port, host }),
  stopServer: () => ipcRenderer.invoke("pm100:tool:tcp:stopServer"),

  onLog: (cb: (line: string) => void) => {
    const handler = (_evt: any, line: any) => cb(String(line ?? ""));
    ipcRenderer.on("pm100:tool:tcp:log", handler);
    return () => ipcRenderer.removeListener("pm100:tool:tcp:log", handler);
  },

  onStatus: (cb: (s: TcpToolStatus) => void) => {
    const handler = (_evt: any, s: any) => cb(s);
    ipcRenderer.on("pm100:tool:tcp:status", handler);
    return () => ipcRenderer.removeListener("pm100:tool:tcp:status", handler);
  },

  onRaw: (cb: (p: { remote: string; length: number; hex: string }) => void) => {
    const handler = (_evt: any, p: any) => cb(p);
    ipcRenderer.on("pm100:tool:tcp:raw", handler);
    return () => ipcRenderer.removeListener("pm100:tool:tcp:raw", handler);
  },

  onDevice: (cb: (row: any) => void) => {
    const handler = (_evt: any, row: any) => cb(row);
    ipcRenderer.on("pm100:tool:tcp:device", handler);
    return () => ipcRenderer.removeListener("pm100:tool:tcp:device", handler);
  },
};
