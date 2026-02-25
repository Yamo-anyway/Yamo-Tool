import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { registerPM100ToolUdpMainIPC } from "./features/pm100/tool/udp/ipcMain";
import { registerPM100ToolTcpMainIPC } from "./features/pm100/tool/tcp/ipcMain";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1140,
    height: 800,
    title: "Launcher",
    acceptFirstMouse: true,
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

  registerPM100ToolUdpMainIPC(() => win);
  registerPM100ToolTcpMainIPC(() => win);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

process.on("uncaughtException", (err) => {
  console.error("MAIN CRASH:", err);
});
