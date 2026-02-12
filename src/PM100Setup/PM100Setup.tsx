import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

type Row = {
  id: string;
  info: string;
  lastSeenAt: number;
};

export default function PM100Setup() {
  const [log, setLog] = useState("");
  const [rows] = useState<Row[]>([]);
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

  useEffect(() => {
    if (textAreaRef.current)
      textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight;
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
      await window.api.pm100setup.startServer(port, "192.168.1.100");
      appendLog(`Server start requested on 192.168.1.100:${port}`);
    } else {
      await window.api.pm100setup.stopServer();
      appendLog("Server stop requested");
    }
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [rows],
  );

  return (
    <div className="pmSetupRoot">
      {/* Top bar */}
      <div className="pmSetupTop">
        <button
          className="backBtn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => (window.location.hash = "#/")}
        >
          ← Back
        </button>

        <div
          className="pmSetupControls"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="portGroup">
            <div className="portLabel">Server Port</div>
            <input
              className="portInput"
              type="number"
              value={port}
              min={1}
              max={65535}
              disabled={isServerRunning}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </div>

          <button
            className={`pmBtn ${isServerRunning ? "danger" : "primary"}`}
            disabled={!isServerRunning && !canStart}
            onClick={onToggleServer}
          >
            {isServerRunning ? "Stop" : "Start"}
          </button>

          <div className={`pmSetupHint ${hasRequiredIp ? "ok" : "bad"}`}>
            {hasRequiredIp ? "IP OK (192.168.1.100)" : "Need IP: 192.168.1.100"}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="pmSetupBody">
        {/* List (top) */}
        <section className="pmSetupPanel">
          <div className="pmSetupPanelHeader">List</div>
          <div className="pmSetupPanelBox">
            <table className="pmSetupTable">
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
        </section>

        {/* Middle spacer */}
        <div className="pmSetupSpacer" />

        {/* Log (bottom) */}
        <section className="pmSetupPanel">
          <div className="pmSetupPanelHeader">Log</div>
          <textarea
            ref={textAreaRef}
            className="pmSetupLog"
            value={log}
            readOnly
            placeholder="Logs..."
          />
        </section>
      </div>
    </div>
  );
}
