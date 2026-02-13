// electron/features/pm100/tool/log/ipcMain.ts
import { BrowserWindow, app } from "electron";
import { BrowserWindow as BW, ipcMain } from "electron";
import path from "path";
import { PM100_CHANNELS } from "../../../../ipc/channels";

type GetWin = () => BrowserWindow | null;

let logWin: BrowserWindow | null = null;

const MAX_LINES = 5000;
let lines: string[] = [];

// ===== log buffer =====
function pushLine(line: string) {
  lines.push(line);
  if (lines.length > MAX_LINES) lines = lines.slice(lines.length - MAX_LINES);
}

function broadcast(getMainWin: GetWin) {
  const payload = lines.join("\n");

  const main = getMainWin();
  if (main && !main.isDestroyed()) {
    main.webContents.send(PM100_CHANNELS.tool.log.updated, payload);
  }

  if (logWin && !logWin.isDestroyed()) {
    logWin.webContents.send(PM100_CHANNELS.tool.log.updated, payload);
  }
}
/**
 * AlwaysOnTop 정책 (최종)
 * - 우리 앱이 "비활성화"되면(alwaysOnTop 해제)
 * - 우리 앱이 "활성화"되면(alwaysOnTop 복구)  ※ show/moveTop/focus 절대 안 함
 * - 로그창 move/focus/show 시에는 복구
 * - 로그창이 focus 가진 상태에서 다른 앱으로 가면 blur로 해제
 */
function attachTopPolicy(win: BrowserWindow) {
  const setTop = (on: boolean) => {
    if (win.isDestroyed()) return;
    if (on) win.setAlwaysOnTop(true, "floating");
    else win.setAlwaysOnTop(false);
  };

  // 초기: 열릴 때는 최상위
  setTop(true);

  // 로그창 이동/표시/포커스 시 최상위 복구
  const onMove = () => setTop(true);
  const onWinFocus = () => setTop(true);
  const onWinShow = () => setTop(true);

  // 로그창이 포커스를 가진 상태에서 다른 앱으로 전환되면 blur로 해제
  const onWinBlur = () => setTop(false);

  win.on("move", onMove);
  win.on("focus", onWinFocus);
  win.on("show", onWinShow);
  win.on("blur", onWinBlur);

  /**
   * ✅ 핵심: "메인창을 클릭하고 다른 앱으로 전환" 같은 경우는
   * logWin.blur가 안 올 수 있음(로그창이 포커스 없으니까).
   *
   * 그래서 app 수준에서 "앱이 비활성화 되었는지"를 잡아서 끈다.
   */
  const onAnyWindowBlur = () => {
    // blur는 같은 앱 내 창 전환에서도 발생할 수 있으니,
    // 한 틱 뒤에 "우리 앱에 포커스된 창이 있는지" 확인
    setTimeout(() => {
      const focused = BrowserWindow.getFocusedWindow();
      if (!focused) {
        // ✅ 앱이 진짜로 다른 앱으로 넘어감
        setTop(false);
      }
    }, 0);
  };

  const onAnyWindowFocus = () => {
    // ✅ 앱이 다시 활성화되면 최상위 복구 (포커스/클릭을 빼앗지 않음)
    setTop(true);
  };

  app.on("browser-window-blur", onAnyWindowBlur);
  app.on("browser-window-focus", onAnyWindowFocus);

  win.once("closed", () => {
    app.removeListener("browser-window-blur", onAnyWindowBlur);
    app.removeListener("browser-window-focus", onAnyWindowFocus);
  });

  return { setTop };
}

// ===== IPC register =====
let mainFocusHooked = false;

export function registerPM100ToolLogMainIPC(
  getMainWin: GetWin,
  preloadPath: string,
) {
  if (!mainFocusHooked) {
    mainFocusHooked = true;

    const hookMainFocus = () => {
      const main = getMainWin();
      if (!main || main.isDestroyed()) return;

      // main focus될 때마다 logWin을 최상위로 복구(있을 때만)
      main.on("focus", () => {
        if (!logWin || logWin.isDestroyed()) return;

        // ✅ 메인창 클릭을 방해하지 않게 "올리기"는 하지 말고 정책만 복구
        logWin.setAlwaysOnTop(true, "floating");
      });

      // main.on("focus", () => {
      //   if (!logWin || logWin.isDestroyed()) return;

      //   logWin.setAlwaysOnTop(true, "floating");
      //   logWin.show();
      //   logWin.moveTop();
      // });
    };

    // win이 나중에 만들어질 수도 있으니 ready 이후에도 한 번 시도
    hookMainFocus();
    app.on("browser-window-created", hookMainFocus);
  }

  ipcMain.on(PM100_CHANNELS.tool.log.append, (_evt, line: string) => {
    if (typeof line !== "string") return;
    pushLine(line);
    broadcast(getMainWin);
  });

  ipcMain.handle(PM100_CHANNELS.tool.log.clear, () => {
    lines = [];
    broadcast(getMainWin);
    return true;
  });

  ipcMain.handle(PM100_CHANNELS.tool.log.getAll, () => lines.join("\n"));

  ipcMain.handle(PM100_CHANNELS.tool.log.openWindow, async () => {
    // 이미 열려있으면: 앞으로 + 포커스 + 최상위 복구
    if (logWin && !logWin.isDestroyed()) {
      logWin.setAlwaysOnTop(true, "floating");
      logWin.show();
      logWin.focus();
      logWin.moveTop();
      return true;
    }

    logWin = new BW({
      width: 500,
      height: 500,
      title: "PM100 Log",
      parent: undefined, // ✅ top 창은 parent 없이가 안정적
      show: false, // ✅ 로드 후 show
      webPreferences: {
        preload: preloadPath,
      },
    });

    // 정책 적용 + 초기 최상위
    const { setTop } = attachTopPolicy(logWin);

    // macOS: 작업공간 이동에도 보이게 (원하면 false로)
    logWin.setVisibleOnAllWorkspaces(true);
    logWin.setFullScreenable(false);

    // 라우팅
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
      await logWin.loadURL(`${devUrl}#/pm100-log`);
    } else {
      await logWin.loadFile(path.join(process.cwd(), "index.html"), {
        hash: "/pm100-log",
      });
    }

    if (!logWin.isDestroyed()) {
      logWin.show();
      logWin.focus();
      logWin.moveTop();
      setTop(true); // ✅ 로드 후 한 번 더 최상위 보정

      // 최초 내용 주입
      logWin.webContents.send(
        PM100_CHANNELS.tool.log.updated,
        lines.join("\n"),
      );
    }

    // closed 처리
    logWin.once("closed", () => {
      logWin = null;
    });

    return true;
  });
}
