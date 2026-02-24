import { contextBridge, ipcRenderer } from "electron";

type Unsubscribe = () => void;

export type UdpScanStartOptions = {
  port?: number; // send port (default 1500)
  intervalMs?: number; // default 2000
  count?: number; // default 5
};

type SendUdpPayload = {
  macStr: string; // "AA:BB:CC:DD:EE:FF"
  deviceIp?: string; // 지금은 브로드캐스트면 안 써도 됨(옵션)
  cmd: number; // 초기화=0x0F, 업데이트=0x0E ...
  data?: number[]; // 초기화는 없음 -> 생략 or []
};

export const pm100ToolUdpApi = {
  scanStart: (opts?: UdpScanStartOptions) =>
    ipcRenderer.invoke("pm100:udp:scanStart", opts ?? {}) as Promise<boolean>,

  scanStop: () => ipcRenderer.invoke("pm100:udp:scanStop") as Promise<boolean>,

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

  sendUdp: (p: SendUdpPayload) => ipcRenderer.invoke("pm100:udp:sendUdp", p),
};
