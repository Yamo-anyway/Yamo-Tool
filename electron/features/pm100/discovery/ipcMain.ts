import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { PM100_CHANNELS } from "../../../ipc/channels";
import { PM100Scanner } from "./net";

type GetWin = () => BrowserWindow | null;

let scanner: PM100Scanner | null = null;

function send(getWin: GetWin, channel: string, payload: any) {
  const w = getWin();
  if (!w) return;
  w.webContents.send(channel, payload);
}

export function registerPM100DiscoveryMainIPC(getWin: GetWin) {
  const ensureScanner = () => {
    if (!scanner) {
      scanner = new PM100Scanner(
        // ✅ 새 채널로 송신 + (선택) legacy도 같이 송신
        (line) => {
          send(getWin, PM100_CHANNELS.discovery.log, line);
          send(getWin, PM100_CHANNELS.legacy.discoveryLog, line);
        },
        (payload) => {
          send(getWin, PM100_CHANNELS.discovery.udp, payload);
          send(getWin, PM100_CHANNELS.legacy.discoveryUdp, payload);
        },
      );
    }
    return scanner;
  };

  // ✅ 핸들러 등록: 새 채널 + legacy 채널 둘 다 받기
  const scanStartHandler = () => {
    ensureScanner().start();
    return true;
  };

  const scanStopHandler = () => {
    if (scanner) scanner.stop();
    return true;
  };

  const resetHandler = (_evt: any, ip: string, mac: string) => {
    try {
      ensureScanner().sendReset(ip, mac);
      return true;
    } catch {
      return false;
    }
  };

  ipcMain.handle(PM100_CHANNELS.discovery.scanStart, scanStartHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.discoveryScanStart, scanStartHandler);

  ipcMain.handle(PM100_CHANNELS.discovery.scanStop, scanStopHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.discoveryScanStop, scanStopHandler);

  ipcMain.handle(PM100_CHANNELS.discovery.reset, resetHandler);
  ipcMain.handle(PM100_CHANNELS.legacy.discoveryReset, resetHandler);
}
