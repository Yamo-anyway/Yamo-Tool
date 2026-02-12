import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

type DeviceRow = {
  mac: string;
  serverIp: string;
  serverPort: number;
  ip: string;
  subnetMask: string;
  gateway: string;
  version: string;
  lastSeenAt: number;
};

export default function PM100Discovery() {
  const [isScanning, setIsScanning] = useState(false);
  const [log, setLog] = useState("");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedMac, setSelectedMac] = useState<string | null>(null);

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ countdown (UI)
  const [countdown, setCountdown] = useState<number>(0);

  // ✅ 최신 상태를 타이머/콜백에서 안전하게 쓰기 위한 ref들
  const isScanningRef = useRef(false);
  const devicesRef = useRef<DeviceRow[]>([]);
  const countdownTimerRef = useRef<number | null>(null);

  const appendLog = (line: string) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    const ts = `${hh}:${mm}:${ss}.${ms}`;
    setLog((prev) => (prev ? `${prev}\n[${ts}] ${line}` : `[${ts}] ${line}`));
  };

  // ✅ devices state가 바뀔 때마다 ref도 최신으로
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  // ✅ 로그 자동 스크롤
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight;
    }
  }, [log]);

  // ✅ 테이블 업서트
  const upsertDevice = (row: Omit<DeviceRow, "lastSeenAt">) => {
    setDevices((prev) => {
      const now = Date.now();
      const idx = prev.findIndex(
        (d) => d.mac.toLowerCase() === row.mac.toLowerCase(),
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...row, lastSeenAt: now };
        return copy;
      }
      return [...prev, { ...row, lastSeenAt: now }];
    });
  };

  // ✅ 카운트다운 타이머 정리
  const stopCountdownTimer = () => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  // ✅ 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopCountdownTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ IPC 이벤트 구독 (onUdp에서 upsertDevice)
  useEffect(() => {
    const offLog = window.api.pm100.onLog((line: string) => appendLog(line));
    const offUdp = window.api.pm100.onUdp((p: any) => {
      if (p.mac) {
        upsertDevice({
          mac: p.mac,
          ip: p.ip,
          serverIp: p.serverIp,
          subnetMask: p.subnetMask,
          gateway: p.gateway,
          serverPort: p.serverPort,
          version: p.version,
        });
        appendLog(`Device: ${p.mac} ${p.ip}`);
      } else {
        appendLog(`RX raw ${p.from} (${p.size} bytes)`);
      }
    });

    return () => {
      offLog?.();
      offUdp?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 스캔 종료(자동/수동 공용)

  const stopScan = async (reason: "auto" | "manual") => {
    if (!isScanningRef.current) return;

    // ✅ 먼저 내려서 stop이 중복 호출되는 것 방지
    isScanningRef.current = false;

    try {
      await window.api.pm100.scanStop(); // ✅ stop은 stop!
    } catch (err: any) {
      appendLog(`Stop error: ${err?.message ?? err}`);
    }

    stopCountdownTimer();

    setIsScanning(false);
    setCountdown(0);

    if (reason === "auto") {
      appendLog(`검색 완료 (${devicesRef.current.length} devices)`);
    } else {
      appendLog("Scan stopped");
    }
  };

  // ✅ Scan: 5초 카운트다운 시작, 0되면 자동 stop
  const onScan = async () => {
    if (isScanningRef.current) return;

    // ✅ Scan 시작할 때 목록 초기화
    setDevices([]);
    setSelectedMac(null);

    stopCountdownTimer();

    isScanningRef.current = true;
    setIsScanning(true);
    setCountdown(10);
    appendLog("Scan started");

    try {
      await window.api.pm100.scanStart();
    } catch (err: any) {
      appendLog(`Scan error: ${err?.message ?? err}`);
      isScanningRef.current = false;
      setIsScanning(false);
      setCountdown(0);
      return;
    }

    // 1초마다 감소, 0 되면 자동 Stop
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          // ✅ interval 내부에서 바로 자동 stop 호출
          stopScan("auto");
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const onStop = async () => {
    await stopScan("manual");
  };

  const onClearLog = () => setLog("");

  const onClearList = () => {
    setDevices([]);
    setSelectedMac(null);
  };

  const onResetDevice = async () => {
    if (!selectedMac) return;

    const device = devices.find(
      (d) => d.mac.toLowerCase() === selectedMac.toLowerCase(),
    );
    if (!device) {
      appendLog(`Reset failed: device not found`);
      return;
    }

    const ok = await window.api.pm100.resetDevice(device.ip, device.mac);

    if (ok) appendLog(`Reset requested -> ${device.ip} (${device.mac})`);
    else appendLog(`Reset failed -> ${device.ip} (${device.mac})`);
  };

  const sorted = useMemo(
    () => [...devices].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [devices],
  );

  // ✅ 화면 다른 곳 클릭하면 선택 해제
  const onRootMouseDown = () => {
    if (selectedMac) setSelectedMac(null);
  };

  // ✅ 테이블 영역 클릭은 선택 해제 트리거 막기
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="discovery" onMouseDown={onRootMouseDown}>
      <div className="topBar">
        <button
          className="backBtn"
          onClick={() => (window.location.hash = "#/")}
        >
          ← Back
        </button>
      </div>

      <div className="pmToolbar">
        <button
          className="pmBtn primary"
          onClick={onScan}
          disabled={isScanning}
        >
          Scan
        </button>
        <button className="pmBtn" onClick={onStop} disabled={!isScanning}>
          Stop
        </button>
        <button className="pmBtn ghost" onClick={onClearLog}>
          Clear Log
        </button>
        <button
          className="pmBtn ghost"
          onClick={onClearList}
          disabled={devices.length === 0}
        >
          Clear List
        </button>

        <button
          className="pmBtn ghost"
          onMouseDown={(e) => e.stopPropagation()} // ✅ 중요
          style={{ marginLeft: 10 }}
          onClick={onResetDevice}
          disabled={!selectedMac}
          title={
            selectedMac
              ? `선택된 장비 초기화: ${selectedMac}`
              : "목록에서 장비를 선택하세요"
          }
        >
          Device 초기화
        </button>

        <div className="pmStatus">
          <span className={isScanning ? "dot on" : "dot"} />
          {isScanning ? `Scanning (${countdown}s)` : "Idle"}
          <span className="pmCount">({devices.length})</span>
        </div>
      </div>

      <div className="listWrapper">
        <div className="tableWrap" onMouseDown={stop}>
          <table className="deviceTable">
            <thead>
              <tr>
                <th>MAC</th>
                <th>Server IP</th>
                <th>Server Port</th>
                <th>IP</th>
                <th>Subnet Mask</th>
                <th>Gateway</th>
                <th>Version</th>
              </tr>
            </thead>

            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td className="emptyCell" colSpan={7}>
                    No devices
                  </td>
                </tr>
              ) : (
                sorted.map((d) => {
                  const isSelected =
                    selectedMac?.toLowerCase() === d.mac.toLowerCase();
                  return (
                    <tr
                      key={d.mac}
                      className={isSelected ? "rowSelected" : ""}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedMac(d.mac);
                      }}
                    >
                      <td className="mono">{d.mac}</td>
                      <td className="mono">{d.serverIp}</td>
                      <td className="mono">{d.serverPort}</td>
                      <td className="mono">{d.ip}</td>
                      <td className="mono">{d.subnetMask}</td>
                      <td className="mono">{d.gateway}</td>
                      <td className="mono">{d.version}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="logWrapper">
        <textarea
          ref={textAreaRef}
          className="logArea"
          value={log}
          readOnly
          placeholder="Logs..."
        />
      </div>
    </div>
  );
}
