import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { registerPM100DiscoveryMainIPC } from "./PM100Discovery/ipcMain";
import { registerPM100SetupMainIPC } from "./PM100Setup/ipcMain";
import { stopPM100SetupServer } from "./PM100Setup/ipcMain";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    title: "Launcher",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  win.on("close", () => {
    stopPM100SetupServer(); // ✅ 창 닫기 전에 서버 종료
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(process.cwd(), "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  // ✅ PM100 IPC 등록(관련 로직은 electron/PM100Discovery에만 존재)
  registerPM100DiscoveryMainIPC(() => win);
  registerPM100SetupMainIPC(() => win);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopPM100SetupServer();
});

process.on("uncaughtException", (err) => {
  console.error("MAIN CRASH:", err);
});
