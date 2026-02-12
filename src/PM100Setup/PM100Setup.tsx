import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

type DeviceRow = {
  ip: string;
  time: string; // HH:MM:SS
  s1: number;
  s2: number;
  s3: number;

  // 나중에 쓸 값들
  subnet: string;
  gateway: string;
  serverIp: string;
  serverPort: number;
  sensorNcNo: [number, number, number];
  sensorEnable: [number, number, number];
  sensorCheckTime: [number, number, number];
  sensorStatus: [number, number, number];
  lastSeenAt: number;
};

export default function PM100Setup() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [log, setLog] = useState("");
  const [port, setPort] = useState<number>(9002);

  const [localIps, setLocalIps] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

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
    if (!running) return;

    const t = window.setInterval(async () => {
      try {
        const ips = await window.api.pm100setup.getConnectedIps();
        const set = new Set(ips);

        setDevices((prev) => prev.filter((d) => set.has(d.ip)));
      } catch {
        // 연결 목록 조회 실패 시엔 유지(또는 전부 제거 선택)
      }
    }, 1000);

    return () => window.clearInterval(t);
  }, [running]);

  // ✅ 로그 구독 (1회)
  useEffect(() => {
    const off = window.api.pm100setup.onLog((line: string) => appendLog(line));
    return () => off?.();
  }, []);

  // ✅ 상태 구독 (1회) + STATUS EVENT도 앱 로그로 확인
  useEffect(() => {
    const off = window.api.pm100setup.onStatus((s) => {
      setRunning(!!s.running);

      if (!s.running) {
        setDevices([]); // ✅ 서버 실제 종료 시 초기화
      }
    });

    return () => off?.();
  }, []);
  // ✅ 장치 프레임 수신 → devices upsert
  useEffect(() => {
    const off = window.api.pm100setup.onDevice((f: any) => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const time = `${hh}:${mm}:${ss}`;

      const row: DeviceRow = {
        ip: f.deviceIp,
        time,
        s1: f.sensorStatus?.[0] ?? 0,
        s2: f.sensorStatus?.[1] ?? 0,
        s3: f.sensorStatus?.[2] ?? 0,

        subnet: f.subnet,
        gateway: f.gateway,
        serverIp: f.serverIp,
        serverPort: f.serverPort,
        sensorNcNo: f.sensorNcNo,
        sensorEnable: f.sensorEnable,
        sensorCheckTime: f.sensorCheckTime,
        sensorStatus: f.sensorStatus,
        lastSeenAt: Date.now(),
      };

      setDevices((prev) => {
        const idx = prev.findIndex((d) => d.ip === row.ip);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], ...row };
          return copy;
        }
        return [...prev, row];
      });
    });

    return () => off?.();
  }, []);

  // ✅ 내 IP 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const ips = await window.api.pm100setup.getLocalIPv4s();
        setLocalIps(ips);
        appendLog(`Local IPs: ${ips.join(", ")}`);
      } catch (e: any) {
        appendLog(`Local IP load error: ${e?.message ?? e}`);
      }
    })();
  }, []);

  // ✅ 로그 자동 스크롤
  useEffect(() => {
    if (textAreaRef.current)
      textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight;
  }, [log]);

  // ✅ 화면 나갈 때 서버 종료
  useEffect(() => {
    return () => {
      window.api.pm100setup.stopServer().catch(() => {});
    };
  }, []);

  const hasRequiredIp = useMemo(
    () => localIps.includes("192.168.1.100"),
    [localIps],
  );

  const onToggleServer = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!running) {
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
      setDevices([]); // ✅ 리스트 초기화
      appendLog("Server stop requested");
    }
  };

  const onBack = async () => {
    try {
      await window.api.pm100setup.stopServer();
    } catch {}
    window.location.hash = "#/";
  };

  // ✅ 최신 수신순 정렬
  const sortedDevices = useMemo(
    () => [...devices].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [devices],
  );

  return (
    <div className="pmSetupRoot">
      <div className="pmSetupTop">
        <button
          className="backBtn"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onBack}
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
              disabled={running}
              onChange={(e) => setPort(Number(e.target.value))}
            />
          </div>

          <button
            className={`pmBtn ${running ? "danger" : "primary"}`}
            disabled={!running && !hasRequiredIp}
            onClick={onToggleServer}
            title={
              hasRequiredIp
                ? running
                  ? "Stop TCP server"
                  : "Start TCP server"
                : "Start blocked: IP 192.168.1.100 is not on this PC"
            }
          >
            {running ? "Stop" : "Start"}
          </button>

          <div className={`pmSetupHint ${hasRequiredIp ? "ok" : "bad"}`}>
            {hasRequiredIp ? "IP OK (192.168.1.100)" : "Need IP: 192.168.1.100"}
          </div>
        </div>
      </div>

      <div className="pmSetupBody">
        {/* ✅ List */}
        <section className="pmSetupPanel">
          <div className="pmSetupPanelHeader">Devices</div>
          <div className="pmSetupPanelBox">
            <table className="pmSetupTable">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>Time</th>
                  <th>S1</th>
                  <th>S2</th>
                  <th>S3</th>
                </tr>
              </thead>
              <tbody>
                {sortedDevices.length === 0 ? (
                  <tr>
                    <td className="emptyCell" colSpan={5}>
                      (empty)
                    </td>
                  </tr>
                ) : (
                  sortedDevices.map((d) => (
                    <tr key={d.ip}>
                      <td className="mono">{d.ip}</td>
                      <td className="mono">{d.time}</td>
                      <td className="mono">{d.s1}</td>
                      <td className="mono">{d.s2}</td>
                      <td className="mono">{d.s3}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="pmSetupSpacer" />

        {/* Log */}
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
