import { contextBridge, ipcRenderer } from "electron";
import { pm100discoveryApi } from "./features/pm100/discovery/icpPreload";
import { pm100setupApi } from "./features/pm100/setup/icpPreload";
import { pm100ToolTcpApi } from "./features/pm100/tool/tcp/ipcPreload";
import { pm100ToolUdpApi } from "./features/pm100/tool/udp/ipcPreload";

type SendUdpPayload = {
  macStr: string; // "AA:BB:CC:DD:EE:FF"
  deviceIp?: string; // 지금은 브로드캐스트면 안 써도 됨(옵션)
  cmd: number; // 초기화=0x0F, 업데이트=0x0E ...
  data?: number[]; // 초기화는 없음 -> 생략 or []
};

contextBridge.exposeInMainWorld("api", {
  pm100: {
    discovery: pm100discoveryApi,
    setup: pm100setupApi,
    tool: {
      tcp: pm100ToolTcpApi,
      udp: pm100ToolUdpApi,
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
    },
  },
});
