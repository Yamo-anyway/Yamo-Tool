import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import { PM100_CHANNELS } from "../../../../ipc/channels";
import { PM100ToolUdpScanner } from "./net";

type GetWin = () => BrowserWindow | null;

let scanner: PM100ToolUdpScanner | null = null;

function send(getWin: GetWin, channel: string, payload: any) {
  const w = getWin();
  if (!w) return;
  w.webContents.send(channel, payload);
}

export function registerPM100ToolUdpMainIPC(getWin: GetWin) {
  const ensureScanner = () => {
    if (!scanner) {
      scanner = new PM100ToolUdpScanner(
        (line) => send(getWin, PM100_CHANNELS.tool.udp.log, line),
        (payload) => send(getWin, PM100_CHANNELS.tool.udp.udp, payload),
      );
    }
    return scanner;
  };

  ipcMain.handle(PM100_CHANNELS.tool.udp.scanStart, () => {
    ensureScanner().start();
    return true;
  });

  ipcMain.handle(PM100_CHANNELS.tool.udp.scanStop, () => {
    if (scanner) {
      scanner.stop();
      scanner = null; // ✅ 추천
    }
    return true;
  });

  ipcMain.handle(
    PM100_CHANNELS.tool.udp.reset,
    (_evt, ip: string, mac: string) => {
      try {
        ensureScanner().sendReset(ip, mac);
        return true;
      } catch {
        return false;
      }
    },
  );

  ipcMain.handle(PM100_CHANNELS.tool.udp.updateConfig, (_evt, p) => {
    try {
      // scanner에서 실제 UDP로 전송
      ensureScanner().sendUpdateConfig(p);
      return true;
    } catch {
      return false;
    }
  });
}
