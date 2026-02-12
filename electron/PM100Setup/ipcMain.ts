// electron/PM100Setup/ipcMain.ts
import { ipcMain, BrowserWindow } from "electron";
import { PM100SetupServer } from "./server";
import { PM100_SETUP_CHANNELS } from "./channels";

let server: PM100SetupServer | null = null;

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
        );
      }

      server.start(port, host);
      return true;
    },
  );

  ipcMain.handle(PM100_SETUP_CHANNELS.stop, () => {
    if (server) server.stop();
    return true;
  });

  ipcMain.handle(PM100_SETUP_CHANNELS.status, () => {
    return server ? server.status() : { running: false };
  });
}
