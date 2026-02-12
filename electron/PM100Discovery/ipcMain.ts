import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { PM100_CHANNELS } from "./channels";
import { PM100Scanner } from "./net";

type GetWin = () => BrowserWindow | null;

let scanner: PM100Scanner | null = null;

function send(getWin: GetWin, channel: string, payload: any) {
  const w = getWin();
  if (!w) return;
  w.webContents.send(channel, payload);
}

export function registerPM100DiscoveryMainIPC(getWin: GetWin) {
  // 스캐너 생성(필요시만)
  const ensureScanner = () => {
    if (!scanner) {
      scanner = new PM100Scanner(
        (line) => send(getWin, PM100_CHANNELS.log, line),
        (payload) => send(getWin, PM100_CHANNELS.udp, payload),
      );
    }
    return scanner;
  };

  ipcMain.handle(PM100_CHANNELS.scanStart, () => {
    ensureScanner().start();
    return true;
  });

  ipcMain.handle(PM100_CHANNELS.scanStop, () => {
    if (scanner) scanner.stop();
    return true;
  });

  ipcMain.handle(PM100_CHANNELS.reset, (_evt, ip: string, mac: string) => {
    try {
      ensureScanner().sendReset(ip, mac);
      return true;
    } catch (e: any) {
      return false;
    }
  });
}
