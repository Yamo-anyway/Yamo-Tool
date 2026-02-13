import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { registerPM100DiscoveryMainIPC } from "./features/pm100/discovery/ipcMain";
import {
  registerPM100SetupMainIPC,
  stopPM100SetupServer,
} from "./features/pm100/setup/ipcMain";
import { registerPM100ToolUdpMainIPC } from "./features/pm100/tool/udp/ipcMain";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1140,
    height: 800,
    title: "Launcher",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  // ✅ 여기서는 best-effort로만 (앱 종료 흐름 제어는 window-all-closed에서)
  win.on("closed", () => {
    win = null;
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(process.cwd(), "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  registerPM100DiscoveryMainIPC(() => win);
  registerPM100SetupMainIPC(() => win);
  registerPM100ToolUdpMainIPC(() => win);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ✅ 종료는 여기서 한 번만 책임지고 정리
app.on("window-all-closed", async () => {
  await stopPM100SetupServer();
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (err) => {
  console.error("MAIN CRASH:", err);
});
