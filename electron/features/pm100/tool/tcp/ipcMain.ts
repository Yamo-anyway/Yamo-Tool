// electron/features/pm100/tool/tcp/ipcMain.ts
import { BrowserWindow, ipcMain } from "electron";
import { createPM100ToolTcpServer, type TcpToolEvents } from "./net";
import os from "os";

type GetWin = () => BrowserWindow | null;

function getLocalIPv4s() {
  const nets = os.networkInterfaces();
  const ips: string[] = [];
  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || (a as any).family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      ips.push((a as any).address);
    }
  }
  return ips;
}

export function registerPM100ToolTcpMainIPC(getWin: GetWin) {
  if ((globalThis as any).__pm100_tool_tcp_ipc_registered) return;
  (globalThis as any).__pm100_tool_tcp_ipc_registered = true;

  const events: TcpToolEvents = {
    log: (line) => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.send("pm100:tool:tcp:log", line);
    },
    status: (s) => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.send("pm100:tool:tcp:status", s);
    },
    client: (p) => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.send("pm100:tool:tcp:client", p);
    },
    raw: (p) => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.send("pm100:tool:tcp:raw", p);
    },

    device: (row) => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.send("pm100:tool:tcp:device", row);
    },
  };

  const tcp = createPM100ToolTcpServer(events);

  ipcMain.handle("pm100:tool:tcp:getLocalIPv4s", async () => {
    try {
      return getLocalIPv4s();
    } catch {
      return [];
    }
  });

  ipcMain.handle("pm100:tool:tcp:getStatus", async () => {
    return tcp.getStatus();
  });

  ipcMain.handle("pm100:tool:tcp:startServer", async (_evt, args) => {
    const port = Number(args?.port);
    const host = String(args?.host ?? "0.0.0.0");

    // ✅ 요구사항: 이미 동작 중이면 stop 후 start (재시작)
    if (tcp.isRunning()) {
      await tcp.stopServer();
    }
    return await tcp.startServer(port, host);
  });

  ipcMain.handle("pm100:tool:tcp:stopServer", async () => {
    return await tcp.stopServer();
  });
}
