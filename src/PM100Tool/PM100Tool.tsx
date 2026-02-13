import React, { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";

type UdpRow = {
  // 표시용(문자열)
  macStr: string;
  deviceIpStr: string;
  serverIpStr: string;
  subnetStr: string;
  gatewayStr: string;
  serverPort: number;

  // 원본(설정용) - 구조체 기반 저장
  raw: {
    tag: number[]; // 6
    mac: number[]; // 6
    cmd: number; // 1
    version: number[]; // 2
    ip: number[]; // 4
    server_ip: number[]; // 4
    subnet: number[]; // 4
    gateway: number[]; // 4
    server_port: number[]; // 2
    active: number;
    mode: number;
    auth: number;
    tamper: number;

    // 있으면 저장(없으면 빈 배열)
    temp4?: number[]; // 4
    temp2?: number[]; // 2
    temp3?: number[]; // 3

    // 안전빵: 원본 패킷 저장
    rawBytes?: Uint8Array;
  };

  lastSeenAt: number;
};

type UdpEdit = {
  deviceIpStr: string;
  subnetStr: string;
  gatewayStr: string;
  serverIpStr: string;
  serverPort: string; // input 편의상 string
};

const ipv4ToStr = (b: number[]) => (b?.length === 4 ? b.join(".") : "");
const macToStr = (b: number[]) =>
  b?.length === 6
    ? b.map((x) => x.toString(16).padStart(2, "0")).join(":")
    : "";

const u16be = (b: number[]) => {
  if (!b || b.length < 2) return 0;
  return (b[0] << 8) | b[1];
};

const toBytes = (v: any): number[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => Number(x) & 0xff);
  if (v instanceof Uint8Array) return Array.from(v);
  if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v));
  return [];
};

const toUint8 = (v: any): Uint8Array | undefined => {
  if (!v) return undefined;
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return new Uint8Array(v.map((x) => Number(x) & 0xff));
  return undefined;
};

const parseIPv4 = (
  s: string,
): { ok: true; bytes: number[] } | { ok: false; reason: string } => {
  const t = (s ?? "").trim();
  const parts = t.split(".");
  if (parts.length !== 4)
    return { ok: false, reason: "IPv4 형식이 아닙니다. 예) 192.168.1.10" };

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return { ok: false, reason: "IPv4는 0~255 범위여야 합니다." };
  }
  return { ok: true, bytes: nums };
};

const isAllowedSubnetMask = (s: string) => {
  const t = (s ?? "").trim();
  return t === "255.0.0.0" || t === "255.255.0.0" || t === "255.255.255.0";
};

const parsePort = (
  s: string,
):
  | { ok: true; value: number; bytes: number[] }
  | { ok: false; reason: string } => {
  const n = Number((s ?? "").trim());
  if (!Number.isFinite(n) || !Number.isInteger(n))
    return { ok: false, reason: "Port는 정수여야 합니다." };
  if (n < 1 || n > 65535)
    return { ok: false, reason: "Port는 1~65535 범위여야 합니다." };
  // big-endian
  return { ok: true, value: n, bytes: [(n >> 8) & 0xff, n & 0xff] };
};

export default function PM100Tool() {
  // ===== (숨김) 로그 버퍼 =====
  const [log, setLog] = useState("");
  const appendLog = (scope: "UDP" | "TCP" | "SYS", line: string) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    const ts = `${hh}:${mm}:${ss}.${ms}`;
    setLog((prev) =>
      prev
        ? `${prev}\n[${ts}] [${scope}] ${line}`
        : `[${ts}] [${scope}] ${line}`,
    );
  };

  // ===== UDP: scan + list =====
  const [udpIsScanning, setUdpIsScanning] = useState(false);
  const udpIsScanningRef = useRef(false);

  const [udpDevices, setUdpDevices] = useState<UdpRow[]>([]);
  const [udpSelectedMac, setUdpSelectedMac] = useState<string | null>(null);

  const udpSelected = useMemo(() => {
    if (!udpSelectedMac) return null;
    return (
      udpDevices.find(
        (d) => d.macStr.toLowerCase() === udpSelectedMac.toLowerCase(),
      ) ?? null
    );
  }, [udpSelectedMac, udpDevices]);

  // ✅ 3단 편집 값(수정용)
  const [udpEdit, setUdpEdit] = useState<UdpEdit | null>(null);

  // ✅ 선택이 바뀌면 edit 초기화
  useEffect(() => {
    if (!udpSelected) {
      setUdpEdit(null);
      return;
    }
    setUdpEdit({
      deviceIpStr: udpSelected.deviceIpStr,
      subnetStr: udpSelected.subnetStr,
      gatewayStr: udpSelected.gatewayStr,
      serverIpStr: udpSelected.serverIpStr,
      serverPort: String(udpSelected.serverPort),
    });
  }, [udpSelected?.macStr]);

  const setUdpField = (k: keyof UdpEdit, v: string) => {
    setUdpEdit((prev) => (prev ? { ...prev, [k]: v } : prev));
  };

  const udpDirty = useMemo(() => {
    if (!udpSelected || !udpEdit) return false;
    return (
      udpEdit.deviceIpStr !== udpSelected.deviceIpStr ||
      udpEdit.subnetStr !== udpSelected.subnetStr ||
      udpEdit.gatewayStr !== udpSelected.gatewayStr ||
      udpEdit.serverIpStr !== udpSelected.serverIpStr ||
      Number(udpEdit.serverPort) !== udpSelected.serverPort
    );
  }, [udpSelected, udpEdit]);

  const upsertUdp = (row: Omit<UdpRow, "lastSeenAt">) => {
    setUdpDevices((prev) => {
      const now = Date.now();
      const idx = prev.findIndex(
        (d) => d.macStr.toLowerCase() === row.macStr.toLowerCase(),
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...row, lastSeenAt: now };
        return copy;
      }
      return [...prev, { ...row, lastSeenAt: now }];
    });
  };

  const onUdpScan = async () => {
    if (udpIsScanningRef.current) return;

    setUdpDevices([]);
    setUdpSelectedMac(null);

    udpIsScanningRef.current = true;
    setUdpIsScanning(true);

    try {
      await window.api.pm100.tool.udp.scanStart();
      appendLog("UDP", "Scan started");
    } catch (e: any) {
      appendLog("UDP", `Scan start error: ${e?.message ?? e}`);
      udpIsScanningRef.current = false;
      setUdpIsScanning(false);
    }
  };

  const onUdpStop = async () => {
    if (!udpIsScanningRef.current) return;

    udpIsScanningRef.current = false;
    setUdpIsScanning(false);

    try {
      await window.api.pm100.tool.udp.scanStop();
      appendLog("UDP", "Scan stopped");
    } catch (e: any) {
      appendLog("UDP", `Scan stop error: ${e?.message ?? e}`);
    }
  };

  const onUdpClearList = () => {
    setUdpDevices([]);
    setUdpSelectedMac(null);
    appendLog("UDP", "List cleared");
  };

  const onUdpUpdate = async () => {
    if (!udpSelected || !udpEdit) return;

    // 1) IP들 검증
    const devIp = parseIPv4(udpEdit.deviceIpStr);
    if (!devIp.ok) return alert(`Device IP 오류: ${devIp.reason}`);

    const gw = parseIPv4(udpEdit.gatewayStr);
    if (!gw.ok) return alert(`Gateway 오류: ${gw.reason}`);

    const srvIp = parseIPv4(udpEdit.serverIpStr);
    if (!srvIp.ok) return alert(`Server IP 오류: ${srvIp.reason}`);

    // 2) SubnetMask 검증(허용 목록)
    if (!isAllowedSubnetMask(udpEdit.subnetStr)) {
      return alert(
        "Subnet Mask 오류: 255.0.0.0 / 255.255.0.0 / 255.255.255.0 중 하나여야 합니다.",
      );
    }
    const subnet = parseIPv4(udpEdit.subnetStr);
    if (!subnet.ok) return alert(`Subnet Mask 오류: ${subnet.reason}`);

    // 3) Port 검증
    const port = parsePort(udpEdit.serverPort);
    if (!port.ok) return alert(`Server Port 오류: ${port.reason}`);

    // ✅ 여기까지 오면 정상 값
    appendLog(
      "UDP",
      `Update validated: mac=${udpSelected.macStr} dev=${udpEdit.deviceIpStr} subnet=${udpEdit.subnetStr} gw=${udpEdit.gatewayStr} server=${udpEdit.serverIpStr}:${port.value}`,
    );

    // ✅ 다음: 실제 IPC 전송(아래 3~5단계 적용 후)
    const ok = await window.api.pm100.tool.udp.updateConfig({
      macStr: udpSelected.macStr,
      deviceIp: udpEdit.deviceIpStr,
      subnetMask: udpEdit.subnetStr,
      gateway: udpEdit.gatewayStr,
      serverIp: udpEdit.serverIpStr,
      serverPort: port.value,
    });

    appendLog("UDP", ok ? "Update sent ✅" : "Update failed ❌");
  };

  // ===== UDP 이벤트 구독: onUdp / onLog (딱 1번만) =====
  useEffect(() => {
    const offLog = window.api.pm100.tool.udp.onLog((line: string) => {
      appendLog("UDP", line);
    });

    const offUdp = window.api.pm100.tool.udp.onUdp((p: any) => {
      if (!p) return;

      const tag = toBytes(p.tagBytes);
      const mac = toBytes(p.macBytes);
      const ip = toBytes(p.ipBytes);
      const server_ip = toBytes(p.serverIpBytes);
      const subnet = toBytes(p.subnetBytes);
      const gateway = toBytes(p.gatewayBytes);
      const server_port = toBytes(p.serverPortBytes);

      if (mac.length !== 6) return;

      const macStr = macToStr(mac);
      const deviceIpStr = ipv4ToStr(ip);
      const serverIpStr = ipv4ToStr(server_ip);
      const subnetStr = ipv4ToStr(subnet);
      const gatewayStr = ipv4ToStr(gateway);
      const serverPort = u16be(server_port);

      upsertUdp({
        macStr,
        deviceIpStr,
        serverIpStr,
        subnetStr,
        gatewayStr,
        serverPort,
        raw: {
          tag,
          mac,
          cmd: Number(p.cmd ?? 0) & 0xff,
          version: toBytes(p.versionBytes),
          ip,
          server_ip,
          subnet,
          gateway,
          server_port,
          active: Number(p.active ?? 0) & 0xff,
          mode: Number(p.mode ?? 0) & 0xff,
          auth: Number(p.auth ?? 0) & 0xff,
          tamper: Number(p.tamper ?? 0) & 0xff,
          temp4: toBytes(p.temp4Bytes),
          temp2: toBytes(p.temp2Bytes),
          temp3: toBytes(p.temp3Bytes),
          rawBytes: toUint8(p.rawBytes),
        },
      });
    });

    return () => {
      offLog?.();
      offUdp?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 페이지 나갈 때 UDP scan 정리
  useEffect(() => {
    return () => {
      window.api.pm100.tool.udp.scanStop().catch(() => {});
    };
  }, []);

  const udpSorted = useMemo(
    () => [...udpDevices].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [udpDevices],
  );

  const onBack = async () => {
    try {
      await window.api.pm100.tool.udp.scanStop();
    } catch {}
    window.location.hash = "#/";
  };

  return (
    <div className="pmToolRoot">
      {/* 1단: Top */}
      <div className="pmToolTop">
        <button className="pmBtnSmall pmBackBtn" onClick={onBack}>
          ← Back
        </button>

        <button className="pmBtnSmall pmClearBtn" onClick={() => setLog("")}>
          Clear Log
        </button>
      </div>

      {/* 2단: UDP / TCP */}
      <div className="pmToolStage pmStage2">
        {/* UDP */}
        <section className="pmPane">
          <div className="pmPaneHeader">
            <div className="pmPaneTitle">UDP</div>
          </div>

          <div className="pmUdpPane">
            {/* 1단: 버튼 */}
            <div className="pmUdpControls">
              <button
                className="pmBtnXs primary"
                onClick={onUdpScan}
                disabled={udpIsScanning}
              >
                Scan
              </button>

              <button
                className="pmBtnXs stop"
                onClick={onUdpStop}
                disabled={!udpIsScanning}
              >
                Stop
              </button>

              <button className="pmBtnXs" onClick={onUdpClearList}>
                ClearList
              </button>

              <div className="pmUdpStatusText">
                {udpIsScanning ? "Scanning..." : "Idle"} ({udpDevices.length})
              </div>
            </div>

            {/* 2단: 리스트 */}
            <div className="pmUdpList">
              <table className="pmTable">
                <colgroup>
                  <col className="colMac" />
                  <col className="colServerIp" />
                  <col className="colPort" />
                  <col className="colDevice" />
                </colgroup>

                <thead>
                  <tr>
                    <th rowSpan={2}>Mac</th>
                    <th colSpan={2} className="colServer">
                      Server
                    </th>
                    <th rowSpan={2}>Device IP</th>
                  </tr>
                  <tr>
                    <th>IP</th>
                    <th>Port</th>
                  </tr>
                </thead>

                <tbody>
                  {udpSorted.length === 0 ? (
                    <tr>
                      <td className="emptyCell" colSpan={4}>
                        (empty)
                      </td>
                    </tr>
                  ) : (
                    udpSorted.map((d) => {
                      const selected =
                        udpSelectedMac?.toLowerCase() ===
                        d.macStr.toLowerCase();

                      return (
                        <tr
                          key={d.macStr}
                          className={selected ? "rowSelected" : ""}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setUdpSelectedMac(d.macStr);
                          }}
                        >
                          <td className="mono">{d.macStr}</td>
                          <td className="mono">{d.serverIpStr}</td>
                          <td className="mono">{d.serverPort}</td>
                          <td className="mono">{d.deviceIpStr}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* TCP (아직 자리만) */}
        <section className="pmPane">
          <div className="pmPaneHeader">
            <div className="pmPaneTitle">TCP</div>
          </div>

          <div className="pmPaneBody">
            <div className="pmPlaceholder">TCP controls + list</div>
          </div>
        </section>
      </div>

      {/* 3단: Selected Device / Settings (UDP 먼저) */}
      <div className="pmToolStage pmStage3">
        <div className="pmPane pmPaneFill">
          {/* 1단: 헤더 */}
          <div className="pmStage3Header">
            <div className="pmStage3Title">
              Selected Device:: UDP
              {udpSelected ? (
                <span className="pmStage3Sub mono">
                  (mac: {udpSelected.macStr})
                </span>
              ) : null}
            </div>

            <button
              className="pmBtnXs primary"
              disabled={!udpSelected || !udpEdit || !udpDirty}
              onClick={onUdpUpdate}
              title={
                udpSelected
                  ? udpDirty
                    ? "Update selected UDP device"
                    : "No changes"
                  : "Select a UDP device first"
              }
            >
              업데이트 하기
            </button>
          </div>

          {/* 2단: 내용 */}
          <div className="pmStage3Body">
            {!udpSelected || !udpEdit ? (
              <div className="pmStage3Empty">(UDP 장치를 선택하세요)</div>
            ) : (
              <div className="pmFormGrid3">
                {/* 1번째 줄: Device IP / Subnet Mask / Gateway */}
                <div className="pmField">
                  <div className="pmLabel2">Device IP</div>
                  <input
                    className="pmInput2 mono"
                    value={udpEdit.deviceIpStr}
                    onChange={(e) => setUdpField("deviceIpStr", e.target.value)}
                  />
                </div>

                <div className="pmField">
                  <div className="pmLabel2">Subnet Mask</div>
                  <input
                    className="pmInput2 mono"
                    value={udpEdit.subnetStr}
                    onChange={(e) => setUdpField("subnetStr", e.target.value)}
                  />
                </div>

                <div className="pmField">
                  <div className="pmLabel2">Gateway</div>
                  <input
                    className="pmInput2 mono"
                    value={udpEdit.gatewayStr}
                    onChange={(e) => setUdpField("gatewayStr", e.target.value)}
                  />
                </div>

                {/* 2번째 줄: Server IP / Server Port / (빈칸) */}
                <div className="pmField">
                  <div className="pmLabel2">Server IP</div>
                  <input
                    className="pmInput2 mono"
                    value={udpEdit.serverIpStr}
                    onChange={(e) => setUdpField("serverIpStr", e.target.value)}
                  />
                </div>

                <div className="pmField">
                  <div className="pmLabel2">Server Port</div>
                  <input
                    className="pmInput2 mono"
                    value={udpEdit.serverPort}
                    onChange={(e) => setUdpField("serverPort", e.target.value)}
                  />
                </div>

                <div />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
