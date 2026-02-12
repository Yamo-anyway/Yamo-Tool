// src/PM100Setup/PM100Setup.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

type Row = {
  id: string;
  info: string;
  lastSeenAt: number;
};

export default function PM100Setup() {
  const [log, setLog] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [port, setPort] = useState<number>(9002);

  const [localIps, setLocalIps] = useState<string[]>([]);
  const [isServerRunning, setIsServerRunning] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const appendLog = (line: string) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    const ts = `${hh}:${mm}:${ss}.${ms}`;
    setLog((prev) => (prev ? `${prev}\n[${ts}] ${line}` : `[${ts}] ${line}`));
  };

  // ✅ 로컬 IP 수집 (기존 pm100 API 재사용)
  useEffect(() => {
    (async () => {
      try {
        const ips = await window.api.pm100.getLocalIPv4s();
        setLocalIps(ips);
        appendLog(`Local IPs: ${ips.join(", ")}`);
      } catch (e: any) {
        appendLog(`Local IP load error: ${e?.message ?? e}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 서버 로그/상태 구독
  useEffect(() => {
    const offLog = window.api.pm100setup.onLog((line: string) =>
      appendLog(line),
    );
    const offStatus = window.api.pm100setup.onStatus(
      (s: { running: boolean; port?: number }) => {
        setIsServerRunning(!!s.running);
        if (typeof s.port === "number") setPort(s.port);
      },
    );

    return () => {
      offLog?.();
      offStatus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 로그 자동 스크롤
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight;
    }
  }, [log]);

  const hasRequiredIp = useMemo(
    () => localIps.includes("192.168.1.100"),
    [localIps],
  );

  const canStart =
    !isServerRunning && hasRequiredIp && port >= 1 && port <= 65535;

  const onToggleServer = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isServerRunning) {
      if (!hasRequiredIp) {
        appendLog(
          "Start blocked: required IP 192.168.1.100 not found on this PC.",
        );
        return;
      }
      try {
        await window.api.pm100setup.startServer(port, "192.168.1.100");
        appendLog(`Server start requested on 192.168.1.100:${port}`);
      } catch (err: any) {
        appendLog(`Server start error: ${err?.message ?? err}`);
      }
    } else {
      try {
        await window.api.pm100setup.stopServer();
        appendLog("Server stop requested");
      } catch (err: any) {
        appendLog(`Server stop error: ${err?.message ?? err}`);
      }
    }
  };

  // (지금은 “리스트/로그 레이아웃만” 먼저. rows는 추후 채움)
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [rows],
  );

  return (
    <div className="setupRoot">
      <div className="topBar">
        <button
          className="backBtn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => (window.location.hash = "#/")}
        >
          ← Back
        </button>

        <div
          className="serverControls"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <label className="portLabel">Server Port</label>

          <input
            className="portInput"
            type="number"
            value={port}
            min={1}
            max={65535}
            disabled={isServerRunning}
            onChange={(e) => setPort(Number(e.target.value))}
          />

          <button
            className={`pmBtn ${isServerRunning ? "danger" : "primary"}`}
            disabled={!isServerRunning && !canStart}
            onClick={onToggleServer}
            title={
              hasRequiredIp
                ? isServerRunning
                  ? "Stop TCP server"
                  : "Start TCP server"
                : "Start blocked: IP 192.168.1.100 is not on this PC"
            }
          >
            {isServerRunning ? "Stop" : "Start"}
          </button>

          <div className="serverHint">
            {hasRequiredIp
              ? "Required IP OK (192.168.1.100)"
              : "IP mismatch: need 192.168.1.100"}
          </div>
        </div>
      </div>

      {/* ✅ 위: 리스트(작게) */}
      <div className="miniListWrap">
        <div className="miniTableTitle">List</div>
        <div className="miniTableBox">
          <table className="miniTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Info</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td className="emptyCell" colSpan={2}>
                    (empty)
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.info}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ✅ 중간: 비워둠 */}
      <div className="middleSpace" />

      {/* ✅ 아래: 로그(작게) */}
      <div className="miniLogWrap">
        <div className="miniLogTitle">Log</div>
        <textarea
          ref={textAreaRef}
          className="miniLogArea"
          value={log}
          readOnly
          placeholder="Logs..."
        />
      </div>
    </div>
  );
}
