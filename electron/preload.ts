import { contextBridge, ipcRenderer } from "electron";
import { pm100discoveryApi } from "./features/pm100/discovery/icpPreload";
import { pm100setupApi } from "./features/pm100/setup/icpPreload";

contextBridge.exposeInMainWorld("api", {
  pm100: {
    discovery: pm100discoveryApi,
    setup: pm100setupApi,
    tool: {
      udp: {
        scanStart: (opts: {
          port: number;
          intervalMs: number;
          count: number;
        }) => ipcRenderer.invoke("pm100:udp:scanStart", opts),

        scanStop: () => ipcRenderer.invoke("pm100:udp:scanStop"),

        onDiscovered: (cb: (row: any) => void) => {
          const handler = (_evt: any, row: any) => cb(row);
          ipcRenderer.on("pm100:udp:discovered", handler);
          return () =>
            ipcRenderer.removeListener("pm100:udp:discovered", handler);
        },

        // ✅ 수정: (_evt, reason) 형태로 받기
        // onStopped: (cb: (reason: string) => void) => {
        //   const handler = (_evt: any, reason: any) => cb(String(reason ?? ""));
        //   ipcRenderer.on("pm100:udp:stopped", handler);
        //   return () => ipcRenderer.removeListener("pm100:udp:stopped", handler);
        // },

        onStopped: (cb: (p: { reason: string; found: number }) => void) => {
          const handler = (_evt: any, p: any) => cb(p);
          ipcRenderer.on("pm100:udp:stopped", handler);
          return () => ipcRenderer.removeListener("pm100:udp:stopped", handler);
        },

        onLog: (cb: (line: string) => void) => {
          const handler = (_evt: any, line: any) => cb(String(line ?? ""));
          ipcRenderer.on("pm100:udp:log", handler);
          return () => ipcRenderer.removeListener("pm100:udp:log", handler);
        },
      },
    },
  },
});
