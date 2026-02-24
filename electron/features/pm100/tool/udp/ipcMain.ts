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
import dgram from "dgram";
import os from "os";

type GetWin = () => BrowserWindow | null;

const PM100_PORT = 1500;

// ---- util ----
function ipToU32(ip: string) {
  const [a, b, c, d] = ip.split(".").map((x) => parseInt(x, 10));
  return (((a << 24) >>> 0) | (b << 16) | (c << 8) | d) >>> 0;
}
function u32ToIp(u: number) {
  const a = (u >>> 24) & 255;
  const b = (u >>> 16) & 255;
  const c = (u >>> 8) & 255;
  const d = u & 255;
  return `${a}.${b}.${c}.${d}`;
}
function broadcastByMask(ip: string, mask: string) {
  const ipU = ipToU32(ip);
  const maskU = ipToU32(mask);
  const bcast = (ipU | (~maskU >>> 0)) >>> 0;
  return u32ToIp(bcast);
}
function getBroadcastTargets() {
  const nets = os.networkInterfaces();
  const targets = new Set<string>();

  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || (a as any).family === 4;
      if (!isV4) continue;
      if (a.internal) continue;

      const mask = (a as any).netmask;
      if (!mask) continue;

      targets.add(broadcastByMask((a as any).address, mask));
    }
  }

  if (targets.size === 0) targets.add("255.255.255.255");
  return Array.from(targets);
}

function macStrToBytes(macStr: string): Buffer {
  if (!macStr || typeof macStr !== "string") throw new Error("macStr missing");
  const hex = macStr.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 12) throw new Error(`Invalid MAC: ${macStr}`);

  const out = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) & 0xff;
  }
  return out;
}

function buildCgCmdPacket(p: {
  macStr: string;
  cmd: number;
  data?: number[];
}): Buffer {
  const tag = Buffer.from("CG_CMD", "ascii"); // 6
  const mac = macStrToBytes(p.macStr); // 6
  const cmd = Buffer.from([Number(p.cmd) & 0xff]); // 1
  const data = Buffer.from(p.data ?? []); // n
  return Buffer.concat([tag, mac, cmd, data]);
}

// ---- sender ----
async function sendBroadcast(packet: Buffer, port = PM100_PORT) {
  const targets = getBroadcastTargets();

  return await new Promise<boolean>((resolve) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });

    const finish = (ok: boolean) => {
      try {
        sock.removeAllListeners();
        sock.close();
      } catch {}
      resolve(ok);
    };

    sock.on("error", () => finish(false));

    sock.bind(0, () => {
      try {
        sock.setBroadcast(true);
      } catch {}

      let pending = targets.length;
      let anyOk = false;

      console.log("packet", packet); // debug
      for (const host of targets) {
        sock.send(packet, port, host, (err) => {
          if (!err) anyOk = true;
          pending -= 1;
          if (pending <= 0) finish(anyOk);
        });
      }
    });
  });
}

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

  ipcMain.handle("pm100:udp:sendUdp", async (_evt, args) => {
    try {
      const packet = buildCgCmdPacket({
        macStr: args?.macStr,
        cmd: args?.cmd,
        data: args?.data,
      });

      // 기본: 검색처럼 브로드캐스트
      const ok = await sendBroadcast(packet, PM100_PORT);
      return ok;
    } catch (e) {
      console.error("pm100:udp:sendUdp error:", e, "args=", args);
      return false;
    }
  });
}
