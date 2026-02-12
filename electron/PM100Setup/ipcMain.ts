// electron/PM100Setup/ipcMain.ts
import os from "os";
import { ipcMain, BrowserWindow } from "electron";
import { PM100SetupServer } from "./server";
import { PM100_SETUP_CHANNELS } from "./channels";

let server: PM100SetupServer | null = null;

function getLocalIPv4s(): string[] {
  const nets = os.networkInterfaces();
  const ips = new Set<string>();
  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || (a as any).family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      ips.add(a.address);
    }
  }
  return Array.from(ips);
}

function getWC(getWin: () => BrowserWindow | null) {
  const w = getWin();
  if (!w) throw new Error("Window not ready");
  return w.webContents;
}

export function registerPM100SetupMainIPC(getWin: () => BrowserWindow | null) {
  ipcMain.handle(
    PM100_SETUP_CHANNELS.start,
    (_evt, port: number, host: string) => {
      const wc = getWC(getWin);

      if (!server) {
        server = new PM100SetupServer(
          (line) => wc.send(PM100_SETUP_CHANNELS.log, line),
          (s) => wc.send(PM100_SETUP_CHANNELS.status, s),
          (f) => wc.send(PM100_SETUP_CHANNELS.device, f),
        );
      }

      server.start(port, host);
      return true;
    },
  );

  ipcMain.handle(PM100_SETUP_CHANNELS.stop, async () => {
    if (server) {
      if (server) await server.stopAsync(); // ✅ close 완료까지 기다림
    }

    const wc = getWC(getWin);
    wc.send(PM100_SETUP_CHANNELS.status, { running: false });

    return true;
  });

  ipcMain.handle(PM100_SETUP_CHANNELS.status, () => {
    return server ? server.status() : { running: false };
  });

  ipcMain.handle(PM100_SETUP_CHANNELS.getLocalIPv4s, () => {
    return getLocalIPv4s();
  });

  ipcMain.handle(PM100_SETUP_CHANNELS.getConnectedIps, () => {
    return server ? server.getConnectedIps() : [];
  });
}

export function stopPM100SetupServer() {
  if (server) {
    server.stopAsync();
    server = null;
  }
}
