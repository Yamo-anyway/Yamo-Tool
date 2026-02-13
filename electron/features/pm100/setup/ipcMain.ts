// electron/PM100Setup/ipcMain.ts
import os from "os";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { PM100SetupServer } from "./server";
import { PM100_CHANNELS } from "../../../ipc/channels";

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
  const ensureServer = () => {
    const wc = getWC(getWin);

    if (!server) {
      server = new PM100SetupServer(
        // log
        (line) => {
          wc.send(PM100_CHANNELS.setup.log, line);
          wc.send(PM100_CHANNELS.legacy.setupLog, line);
        },
        // status
        (s) => {
          wc.send(PM100_CHANNELS.setup.status, s);
          wc.send(PM100_CHANNELS.legacy.setupStatus, s);
        },
        // device
        (f) => {
          wc.send(PM100_CHANNELS.setup.device, f);
          wc.send(PM100_CHANNELS.legacy.setupDevice, f);
        },
      );
    }

    return { wc, server };
  };

  // ✅ start (새 + legacy 둘 다)
  const startHandler = (_evt: any, port: number, host: string) => {
    const { server } = ensureServer();
    server.start(port, host);
    return true;
  };

  ipcMain.handle(PM100_CHANNELS.setup.start, startHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.setupStart, startHandler);

  // ✅ stop (새 + legacy 둘 다)
  const stopHandler = async () => {
    if (server) {
      await server.stopAsync(); // ✅ close 완료까지 기다림
      server = null;
    }

    // stop 이후 UI에 확실히 반영
    const wc = getWC(getWin);
    const stopped = { running: false };
    wc.send(PM100_CHANNELS.setup.status, stopped);
    wc.send(PM100_CHANNELS.legacy.setupStatus, stopped);

    return true;
  };

  ipcMain.handle(PM100_CHANNELS.setup.stop, stopHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.setupStop, stopHandler);

  // ✅ status
  const statusHandler = () => {
    return server ? server.status() : { running: false };
  };
  ipcMain.handle(PM100_CHANNELS.setup.status, statusHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.setupStatus, statusHandler);

  // ✅ getLocalIPv4s
  const ipsHandler = () => getLocalIPv4s();
  ipcMain.handle(PM100_CHANNELS.setup.getLocalIPv4s, ipsHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.setupGetLocalIPv4s, ipsHandler);

  // ✅ getConnectedIps
  const connectedIpsHandler = () => (server ? server.getConnectedIps() : []);
  ipcMain.handle(PM100_CHANNELS.setup.getConnectedIps, connectedIpsHandler);
  ipcMain.handle(
    PM100_CHANNELS.legacy.setupGetConnectedIps,
    connectedIpsHandler,
  );
}

/**
 * 앱 종료/윈도우 종료 시 안전 종료용.
 * (중요) async를 fire-and-forget 하지 말고, 반환값을 Promise로 둬서 await 가능하게.
 */
export async function stopPM100SetupServer(): Promise<void> {
  if (server) {
    await server.stopAsync();
    server = null;
  }
}
