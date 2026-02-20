// electron/features/pm100/tool/udp/ipcMain.ts
// ✅ PM100 Tool UDP IPC Main (최종본)
// - ipcMain.handle("pm100:udp:scanStart", opts)
// - ipcMain.handle("pm100:udp:scanStop")
// - events -> renderer:
//   pm100:udp:discovered (row)
//   pm100:udp:raw (payload)
//   pm100:udp:log (line)
//   pm100:udp:stopped (reason)

import { BrowserWindow, ipcMain } from "electron";
import {
  createPM100UdpScanner,
  type UdpScanEvents,
  type UdpScanStartOptions,
} from "./net";

type GetWin = () => BrowserWindow | null;

export function registerPM100ToolUdpMainIPC(getWin: GetWin) {
  // ✅ 중복 등록 방지(개발 중 핫리로드/재실행 대비)
  if ((globalThis as any).__pm100_tool_udp_ipc_registered) return;
  (globalThis as any).__pm100_tool_udp_ipc_registered = true;

  const events: UdpScanEvents = {
    log: (line) => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.send("pm100:udp:log", line);
    },
    raw: (payload) => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.send("pm100:udp:raw", payload);
    },
    discovered: (row) => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.send("pm100:udp:discovered", row);
    },
    stopped: (payload) => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.send("pm100:udp:stopped", payload);
    },
  };

  const scanner = createPM100UdpScanner(events);

  ipcMain.handle(
    "pm100:udp:scanStart",
    async (_evt, opts?: UdpScanStartOptions) => {
      try {
        await scanner.start(opts);
        return true;
      } catch (e: any) {
        events.log(`scanStart failed: ${String(e?.message || e)}`);
        // 실패 시 안전하게 stop 처리 (stopped reason은 socket error/send failed 등으로도 나갈 수 있음)
        try {
          scanner.stop("scanStart failed");
        } catch {}
        return false;
      }
    },
  );

  ipcMain.handle("pm100:udp:scanStop", async () => {
    try {
      scanner.stop("manual stop");
      return true;
    } catch (e: any) {
      events.log(`scanStop failed: ${String(e?.message || e)}`);
      return false;
    }
  });
}
