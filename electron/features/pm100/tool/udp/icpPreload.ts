import { contextBridge, ipcRenderer } from "electron";

type Unsubscribe = () => void;

export type UdpScanStartOptions = {
  port?: number; // send port (default 1500)
  intervalMs?: number; // default 2000
  count?: number; // default 5
};

export function registerPM100ToolUdpPreload() {
  const udpApi = {
    scanStart: (opts?: UdpScanStartOptions) =>
      ipcRenderer.invoke("pm100:udp:scanStart", opts ?? {}) as Promise<boolean>,

    scanStop: () =>
      ipcRenderer.invoke("pm100:udp:scanStop") as Promise<boolean>,

    onDiscovered: (cb: (row: any) => void): Unsubscribe => {
      const handler = (_evt: any, row: any) => cb(row);
      ipcRenderer.on("pm100:udp:discovered", handler);
      return () => ipcRenderer.removeListener("pm100:udp:discovered", handler);
    },

    onStopped: (cb: (reason: string) => void): Unsubscribe => {
      const handler = (_evt: any, reason: any) => cb(String(reason ?? ""));
      ipcRenderer.on("pm100:udp:stopped", handler);
      return () => ipcRenderer.removeListener("pm100:udp:stopped", handler);
    },

    onLog: (cb: (line: string) => void): Unsubscribe => {
      const handler = (_evt: any, line: string) => cb(line);
      ipcRenderer.on("pm100:udp:log", handler);
      return () => ipcRenderer.removeListener("pm100:udp:log", handler);
    },

    // raw udp packet/remote info
    onUdp: (cb: (p: any) => void): Unsubscribe => {
      const handler = (_evt: any, p: any) => cb(p);
      ipcRenderer.on("pm100:udp:raw", handler);
      return () => ipcRenderer.removeListener("pm100:udp:raw", handler);
    },
  };

  // 기존 window.api 구조에 맞춰 expose
  contextBridge.exposeInMainWorld("api", {
    pm100: {
      tool: {
        udp: udpApi,
      },
    },
  });
}
