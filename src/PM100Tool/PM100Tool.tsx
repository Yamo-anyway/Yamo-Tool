import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  Radio,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import styled from "@emotion/styled";

export type DeviceRow = {
  key: number;
  type: "UDP" | "TCP";
  isDetail: boolean;
  isEdit: boolean;
  macStr: string;
  deviceIpStr: string;
  serverIpStr: string;
  subnetStr: string;
  gatewayStr: string;
  serverPort: number;
  s1Mode: number;
  s1Enable: number;
  s1DelayTime: number;
  s1Status: number;
  s2Mode: number;
  s2Enable: number;
  s2DelayTime: number;
  s2Status: number;
  s3Mode: number;
  s3Enable: number;
  s3DelayTime: number;
  s3Status: number;
  raw: any;
};

export default function PM100Tool() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<DeviceRow>();

  const [log, setLog] = useState("");

  const logRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ UI 표시용 state
  const [isUdpScanning, setIsUdpScanning] = useState(false);

  // ✅ 즉시값/동시성 제어용 ref (이게 “두번 클릭 문제”를 잡아줌)
  const scanningRef = useRef(false);

  // (TCP는 여기선 생략)
  const [isTcpServer, setIsTcpServer] = useState<boolean>(false);

  const [isOpenEdit, setIsOpenEdit] = useState<boolean>(false);

  const [tcpServerPort, setTcpServerPort] = useState<number>(9002);

  useEffect(() => {
    setIsTcpServer(false);
  }, []);

  useEffect(() => {
    const offTcpLog = window.api.pm100.tool.tcp.onLog((line) => {
      setLog((p) =>
        p ? p + `\n[${nowTs()}] ${line}` : `[${nowTs()}] ${line}`,
      );
    });
    return () => offTcpLog?.();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const st = await window.api.pm100.tool.tcp.getStatus();
        setIsTcpServer(!!st?.running);
        if (st?.port && !Number.isNaN(st.port)) setTcpServerPort(st.port);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const offTcpDevice = window.api.pm100.tool.tcp.onDevice?.(
      (row: DeviceRow) => {
        setDevices((prev) => {
          // ✅ 조건: "장치 IP가 목록 중 TCP type에서 없으면 추가"
          const idx = prev.findIndex(
            (d) => d.type === "TCP" && d.deviceIpStr === row.deviceIpStr,
          );

          if (idx >= 0) {
            const next = [...prev];
            // ✅ 있으면 나머지 정보 업데이트
            next[idx] = { ...next[idx], ...row };
            return next;
          }
          return [...prev, row];
        });
      },
    );

    return () => {
      offTcpDevice?.();
    };
  }, []);

  // ✅ 로그 자동 스크롤
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // ✅ UDP 이벤트 구독: discovered/log/stopped
  useEffect(() => {
    const offDiscovered = window.api.pm100.tool.udp.onDiscovered((row) => {
      setDevices((prev) => {
        const idx = prev.findIndex((d) => d.macStr === row.macStr);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = row;
          return next;
        }
        return [...prev, row];
      });
    });

    const offLog = window.api.pm100.tool.udp.onLog?.((line) => {
      setLog((p) =>
        p ? p + `\n[${nowTs()}] ${line}` : `[${nowTs()}] ${line}`,
      );
    });

    // ✅ 여기 추가
    const offStopped = window.api.pm100.tool.udp.onStopped?.((p: any) => {
      if (p.reason === "restart") return;

      setLog(
        (prev) => prev + `\n[${nowTs()}] ✅ 검색 완료: ${p.found ?? 0}대 발견`,
      );

      setIsUdpScanning(false);

      console.log("devices=>", devices);
    });

    return () => {
      offDiscovered?.();
      offLog?.();
      offStopped?.(); // ✅ 이것도 꼭 포함
    };
  }, []);

  useEffect(() => {
    console.log("isUdpScanning #5", isUdpScanning);
  }, [isUdpScanning]);

  const onBack = async () => {
    try {
      // ✅ 나갈 때는 무조건 stop 시도
      await window.api.pm100.tool.udp.scanStop();
    } catch {}
    scanningRef.current = false;
    console.log("isUdpScanning #7", isUdpScanning);
    setIsUdpScanning(false);
    window.location.hash = "#/";
  };

  function nowTs(): string {
    const d = new Date();

    const pad = (n: number, len = 2) => String(n).padStart(len, "0");

    return (
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes()) +
      ":" +
      pad(d.getSeconds()) +
      "." +
      pad(d.getMilliseconds(), 3)
    );
  }

  const onUdpScanStop = async () => {
    try {
      if (isUdpScanning === false) {
        // ✅ UDP 검색 시작 누르면: TCP 동작중이면 종료 + 목록 초기화
        if (isTcpServer) {
          await window.api.pm100.tool.tcp.stopServer();
          setIsTcpServer(false);
        }

        setDevices([]); // ✅ 목록 초기화
        setIsUdpScanning(true);

        const ok = await window.api.pm100.tool.udp.scanStart({
          port: 1500,
          intervalMs: 2000,
          count: 5,
        });

        if (!ok) {
          scanningRef.current = false;
          setIsUdpScanning(false);
        }
        return;
      }

      // ✅ UDP 중단
      await window.api.pm100.tool.udp.scanStop();
      setIsUdpScanning(false);
    } catch (e: any) {
      alert(`UDP 오류: ${e?.message ?? e}`);
      setIsUdpScanning(false);
    }
  };

  async function getTcpBindHost(): Promise<string> {
    const ips = await window.api.pm100.tool.tcp.getLocalIPv4s();
    return ips?.[0] ?? "0.0.0.0";
  }

  const onTcpServerStartStop = async () => {
    try {
      if (isTcpServer) {
        // ✅ 서버 정지
        const okStop = await window.api.pm100.tool.tcp.stopServer();
        if (!okStop) return alert("TCP 서버 정지 실패");
        setIsTcpServer(false);
        return;
      }

      // ✅ TCP 서버 시작 누르면: UDP 검색 종료 + 목록 초기화
      if (isUdpScanning) {
        await window.api.pm100.tool.udp.scanStop();
        setIsUdpScanning(false);
      }

      setDevices([]); // ✅ 목록 초기화

      // ✅ 혹시 이미 running이면 안전 재시작
      const st = await window.api.pm100.tool.tcp.getStatus();
      if (st?.running) await window.api.pm100.tool.tcp.stopServer();

      const host = await getTcpBindHost();
      const ok = await window.api.pm100.tool.tcp.startServer(
        tcpServerPort,
        host,
      );
      if (!ok) return alert("TCP 서버 시작 실패");

      setIsTcpServer(true);
    } catch (e: any) {
      alert(`TCP 오류: ${e?.message ?? e}`);
    }
  };

  const selectDeviceRow = (row: DeviceRow) => {
    const newDevices = devices.map((el: DeviceRow) => {
      const newRow = { ...row };

      newRow.isEdit = false;

      if (el.key === newRow.key) {
        newRow.isDetail = !newRow.isDetail;

        setSelectedRow(newRow);
      } else {
        newRow.isDetail = false;
      }

      return newRow;
    });

    setDevices(newDevices);
  };

  const handleSetDeviceDialog = () => {
    setIsOpenEdit(false);
  };

  return (
    <StyledPage>
      <div>
        <div
          style={{
            display: "flex",
            marginBottom: "20px",
            alignItems: "center",
          }}
        >
          <div>
            <StyledButton onClick={onBack}>뒤로</StyledButton>
          </div>

          <div>
            <StyledButton onClick={() => setLog("")}>로그 삭제</StyledButton>
          </div>

          <div>
            {/* ⚠️ "목록 삭제" 버튼이 log.openWindow로 되어 있었는데 보통은 devices 초기화가 맞음 */}
            <StyledButton onClick={() => setDevices([])}>
              목록 삭제
            </StyledButton>
          </div>

          <div>
            <Box sx={{ marginLeft: "20px", marginRight: "10px" }}>UDP:</Box>
          </div>
          <div>
            <StyledButton onClick={onUdpScanStop}>
              {isUdpScanning ? "중단" : "검색"}
            </StyledButton>
          </div>

          <div>
            <Box sx={{ marginLeft: "20px", marginRight: "10px" }}>TCP:</Box>
          </div>

          <div>
            <Box sx={{ marginRight: "10px" }}>Server Port</Box>
          </div>
          <div>
            <StyledInputPort
              type="text"
              inputMode="numeric"
              value={tcpServerPort ?? 9002}
              onChange={(e) => {
                const onlyDigits = e.target.value.replace(/\D/g, "");

                if (!onlyDigits) {
                  setTcpServerPort(9002);
                  return;
                }

                const num = Number(onlyDigits);

                if (num >= 1 && num <= 65535) {
                  setTcpServerPort(num);
                }
              }}
              style={{ color: "white", width: "100px", marginRight: "10px" }}
              disabled={isTcpServer}
            />
          </div>

          <div>
            <StyledButton onClick={onTcpServerStartStop}>
              {isTcpServer ? "서버 정지" : "서버 시작"}
            </StyledButton>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginBottom: "20px",
            height: "430px",
            border: "1px solid #FFF",
          }}
        >
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <StyledTableHeadCell
                    rowSpan={2}
                    sx={{ width: 50, minWidth: 50, maxWidth: 50 }}
                  >
                    Type
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    rowSpan={2}
                    sx={{ width: 120, minWidth: 120, maxWidth: 120 }}
                  >
                    Mac
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    rowSpan={2}
                    sx={{ width: 100, minWidth: 100, maxWidth: 100 }}
                  >
                    Server IP
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    rowSpan={2}
                    sx={{ width: 50, minWidth: 50, maxWidth: 50 }}
                  >
                    Port
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    rowSpan={2}
                    sx={{ width: 100, minWidth: 100, maxWidth: 100 }}
                  >
                    Device IP
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    rowSpan={2}
                    sx={{ width: 100, minWidth: 100, maxWidth: 100 }}
                  >
                    Subnet Mask
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    rowSpan={2}
                    sx={{ width: 100, minWidth: 100, maxWidth: 100 }}
                  >
                    Gateway
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    colSpan={2}
                    sx={{ width: 140, minWidth: 140, maxWidth: 140 }}
                  >
                    S1
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    colSpan={2}
                    sx={{ width: 140, minWidth: 140, maxWidth: 140 }}
                  >
                    S2
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    colSpan={2}
                    sx={{ width: 140, minWidth: 140, maxWidth: 140 }}
                  >
                    S3
                  </StyledTableHeadCell>
                </TableRow>
                <TableRow>
                  <StyledTableHeadCell
                    sx={{ width: 70, minWidth: 70, maxWidth: 70 }}
                  >
                    NC/NO
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 70, minWidth: 70, maxWidth: 70 }}
                  >
                    DelayTime
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 70, minWidth: 70, maxWidth: 70 }}
                  >
                    NC/NO
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 70, minWidth: 70, maxWidth: 70 }}
                  >
                    DelayTime
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 70, minWidth: 70, maxWidth: 70 }}
                  >
                    NC/NO
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 70, minWidth: 70, maxWidth: 70 }}
                  >
                    DelayTime
                  </StyledTableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {devices?.map((row: any) => {
                  const isTcp = row.type === "TCP";

                  const sCellStyle = (status: number) => {
                    if (!isTcp) return {}; // ✅ UDP는 기존 스타일 유지
                    return status === 0
                      ? { backgroundColor: "#00c853", color: "#000" } // ✅ 초록 + 검정 글씨
                      : { backgroundColor: "#ff8a80", color: "#000" }; // ✅ 연한 빨강 + 검정 글씨
                  };

                  return (
                    <TableRow
                      key={`device list - ${row.key}`}
                      sx={{
                        transition:
                          "background-color 120ms ease, transform 120ms ease, box-shadow 120ms ease",
                        cursor: "pointer",
                        "&:hover": {
                          backgroundColor: "rgba(255,255,255,0.08)", // 은은한 하이라이트
                          boxShadow: "0 6px 18px rgba(0,0,0,0.35)", // 살짝 띄운 느낌
                          transform: "translateY(-1px)",
                        },
                        "&:active": {
                          transform: "translateY(0px)",
                          boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
                        },
                      }}
                      onClick={() => {
                        setIsOpenEdit(true);
                        selectDeviceRow(row);
                      }}
                    >
                      <StyledTableCell>{row.type}</StyledTableCell>
                      <StyledTableCell>{row.macStr}</StyledTableCell>
                      <StyledTableCell>{row.serverIpStr}</StyledTableCell>
                      <StyledTableCell>{row.serverPort}</StyledTableCell>
                      <StyledTableCell>{row.deviceIpStr}</StyledTableCell>
                      <StyledTableCell>{row.subnetStr}</StyledTableCell>
                      <StyledTableCell>{row.gatewayStr}</StyledTableCell>
                      <StyledTableCell
                        sx={sCellStyle(row.s1Status)}
                      >{`${row.s1Mode === 0 ? "NC" : "NO"}`}</StyledTableCell>
                      <StyledTableCell>{`${row.s1DelayTime}s`}</StyledTableCell>
                      <StyledTableCell
                        sx={sCellStyle(row.s2Status)}
                      >{`${row.s2Mode === 0 ? "NC" : "NO"}`}</StyledTableCell>
                      <StyledTableCell>{`${row.s2DelayTime}s`}</StyledTableCell>
                      <StyledTableCell
                        sx={sCellStyle(row.s3Status)}
                      >{`${row.s3Mode === 0 ? "NC" : "NO"}`}</StyledTableCell>
                      <StyledTableCell>{`${row.s3DelayTime}s`}</StyledTableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </div>

        <div style={{ display: "flex", height: "200px" }}>
          <div
            style={{ width: "100%", height: "100%", border: "1px solid #FFF" }}
          >
            <textarea
              ref={logRef}
              className="pmLogArea"
              value={log}
              readOnly
              placeholder="Logs..."
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </div>
      </div>
      {isOpenEdit && selectedRow && (
        <SetDeviceDialog
          device={selectedRow}
          open={isOpenEdit}
          onClose={handleSetDeviceDialog}
        />
      )}
    </StyledPage>
  );
}

type SetDeviceDialogProps = {
  device: DeviceRow;
  open: boolean;
  onClose: () => void;
};

const SetDeviceDialog = ({ device, open, onClose }: SetDeviceDialogProps) => {
  const [deviceIpStr, setDeviceIpStr] = useState<string>();

  const [editDevice, setEditDevice] = useState<DeviceRow | undefined>();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setDeviceIpStr(device.deviceIpStr);
    setEditDevice(device);
    setLocked(false);
  }, [device]);

  const handleCommandInit = async () => {
    if (!editDevice) return;

    try {
      if (editDevice.type === "TCP") {
        const ok = await window.api.pm100.tool.tcp.send({
          deviceIpStr: deviceIpStr ?? "",
          cmd: 0x3e,
          // data 생략하면 0 패딩 30바이트로 송신되게 net.ts에서 처리해도 되고,
          // 여기서 명시적으로 넣어도 됨:
          // data: new Array(30).fill(0),
        });
        if (!ok) return alert("TCP 초기화 전송 실패");
        alert("TCP 초기화 전송 완료");
        setLocked(true);
        return;
      }

      // UDP 장치면 기존 UDP 로직
      const ok = await window.api.pm100.tool.udp.sendUdp({
        macStr: editDevice.macStr,
        cmd: 0x0f,
      });
      if (!ok) return alert("UDP 초기화 전송 실패");
      alert("UDP 초기화 전송 완료");
      setLocked(true);
    } catch (e: any) {
      alert(`초기화 오류: ${e?.message ?? e}`);
    }
  };

  const handleCommandSetConfig = async () => {
    if (!editDevice) return;

    // 공통 검증 함수(이미 너 코드에 있음) 그대로 사용
    const deviceIp = parseIPv4ToBytes(editDevice.deviceIpStr);
    if (!deviceIp) return alert("Device IP 형식이 올바르지 않습니다.");

    const subnet = parseIPv4ToBytes(editDevice.subnetStr);
    if (!subnet) return alert("Subnet Mask 형식이 올바르지 않습니다.");

    const gateway = parseIPv4ToBytes(editDevice.gatewayStr);
    if (!gateway) return alert("Gateway 형식이 올바르지 않습니다.");

    const serverIp = parseIPv4ToBytes(editDevice.serverIpStr);
    if (!serverIp) return alert("Server IP 형식이 올바르지 않습니다.");

    const portBytes = u16beBytes(Number(editDevice.serverPort));
    if (!portBytes) return alert("Port 값이 올바르지 않습니다. (1~65535)");

    const s1Mode = editDevice.s1Mode === 1 ? 1 : 0;
    const s2Mode = editDevice.s2Mode === 1 ? 1 : 0;
    const s3Mode = editDevice.s3Mode === 1 ? 1 : 0;

    const s1Delay = u8Byte(Number(editDevice.s1DelayTime));
    const s2Delay = u8Byte(Number(editDevice.s2DelayTime));
    const s3Delay = u8Byte(Number(editDevice.s3DelayTime));
    if (s1Delay === null || s2Delay === null || s3Delay === null) {
      return alert("지연시간은 0~255까지만 가능합니다.");
    }

    const s1Enable = editDevice.s1Enable;
    const s2Enable = editDevice.s1Enable;
    const s3Enable = editDevice.s1Enable;

    const s1Status = 0;
    const s2Status = 0;
    const s3Status = 0;

    // ✅ 30바이트 구성
    const data30: number[] = [
      ...deviceIp, // 4
      ...subnet, // 4
      ...gateway, // 4
      ...serverIp, // 4
      ...portBytes, // 2
      s1Mode,
      s2Mode,
      s3Mode, // 3
      s1Enable,
      s2Enable,
      s3Enable, // 3
      s1Delay,
      s2Delay,
      s3Delay, // 3
      s1Status,
      s2Status,
      s3Status, // 3
    ];

    try {
      if (editDevice.type === "TCP") {
        const ok = await window.api.pm100.tool.tcp.send({
          deviceIpStr: deviceIpStr ?? "",
          cmd: 0x1e,
          data: data30,
        });
        1;
        if (!ok) return alert("TCP 업데이트 전송 실패");
        alert("TCP 업데이트 전송 완료");
        setLocked(true);
        return;
      }

      // UDP 장치면 기존 UDP 0x0E
      const ok = await window.api.pm100.tool.udp.sendUdp({
        macStr: editDevice.macStr,
        cmd: 0x0e,
        data: data30,
      });
      if (!ok) return alert("UDP 업데이트 전송 실패");
      alert("UDP 업데이트 전송 완료");
      setLocked(true);
    } catch (e: any) {
      alert(`업데이트 오류: ${e?.message ?? e}`);
    }
  };

  function parseIPv4ToBytes(ip: string): number[] | null {
    const s = String(ip ?? "").trim();
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return null;
    const parts = s.split(".").map((x) => Number(x));
    if (parts.length !== 4) return null;
    for (const n of parts) {
      if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    }
    return parts;
  }

  function u16beBytes(n: number): number[] | null {
    if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
    return [(n >> 8) & 0xff, n & 0xff];
  }

  function u8Byte(n: number): number | null {
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    return n & 0xff;
  }

  return (
    <Dialog
      onClose={() => {}}
      open={open}
      fullWidth
      slotProps={{
        paper: {
          sx: {
            width: 900,
            height: 290,
            maxWidth: "none",
            overflowX: "hidden",
          },
        },
      }}
    >
      <div style={{ padding: "10px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          <div>
            {editDevice?.type === "TCP" && "TCP"}
            {editDevice?.type === "UDP" &&
              `UDP(mac: ${editDevice.macStr})`}{" "}
            장치 설정
          </div>
          <div>
            <StyledDialogButton onClick={handleCommandInit} disabled={locked}>
              초기화
            </StyledDialogButton>
            <StyledDialogButton
              onClick={handleCommandSetConfig}
              disabled={locked}
            >
              업데이트
            </StyledDialogButton>
            <StyledDialogButton onClick={onClose}>닫기</StyledDialogButton>
          </div>
        </div>
        <div>
          <div style={{ padding: "10px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  marginRight: "20px",
                  width: "100px",
                }}
              >
                Server IP
              </div>
              <div style={{ marginRight: "20px" }}>
                <StyledInputIp
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0.0.0"
                  value={editDevice?.serverIpStr ?? ""}
                  onChange={(e) => {
                    // 1) 숫자/점만 허용
                    // 2) 연속 점/길이 과도 방지
                    let v = e.target.value.replace(/[^0-9.]/g, "");
                    v = v.replace(/\.{2,}/g, "."); // ".." -> "."
                    if (v.length > 15) v = v.slice(0, 15); // 255.255.255.255 최대 15자

                    setEditDevice((prev) =>
                      prev ? { ...prev, serverIpStr: v } : prev,
                    );
                  }}
                  onBlur={() => {
                    const ip = (editDevice?.serverIpStr ?? "").trim();

                    const isValid =
                      /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
                      ip.split(".").every((x) => {
                        const n = Number(x);
                        return (
                          x !== "" && n >= 0 && n <= 255 && String(n) === x
                        ); // "01" 같은 거 싫으면 이 조건 유지
                      });

                    if (!isValid) {
                      // 유효하지 않으면 빈 값으로(가장 단순하고 안전)
                      setEditDevice((prev) =>
                        prev ? { ...prev, serverIpStr: "" } : prev,
                      );
                    }
                  }}
                  disabled={locked}
                />
              </div>
              <div
                style={{
                  marginRight: "20px",
                  width: "100px",
                }}
              >
                Port
              </div>
              <div style={{ marginRight: "20px" }}>
                <StyledInputPort
                  type="text"
                  inputMode="numeric"
                  value={editDevice?.serverPort ?? ""}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\D/g, "");

                    if (!onlyDigits) {
                      setEditDevice((prev) =>
                        prev ? { ...prev, serverPort: 0 } : prev,
                      );
                      return;
                    }

                    const num = Number(onlyDigits);

                    if (num >= 1 && num <= 65535) {
                      setEditDevice((prev) =>
                        prev ? { ...prev, serverPort: num } : prev,
                      );
                    }
                  }}
                  disabled={locked}
                />
              </div>
            </div>
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    marginRight: "20px",
                    width: "100px",
                  }}
                >
                  Device IP
                </div>
                <div style={{ marginRight: "20px" }}>
                  <StyledInputIp
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0.0.0"
                    value={editDevice?.deviceIpStr ?? ""}
                    onChange={(e) => {
                      // 1) 숫자/점만 허용
                      // 2) 연속 점/길이 과도 방지
                      let v = e.target.value.replace(/[^0-9.]/g, "");
                      v = v.replace(/\.{2,}/g, "."); // ".." -> "."
                      if (v.length > 15) v = v.slice(0, 15); // 255.255.255.255 최대 15자

                      setEditDevice((prev) =>
                        prev ? { ...prev, deviceIpStr: v } : prev,
                      );
                    }}
                    onBlur={() => {
                      const ip = (editDevice?.deviceIpStr ?? "").trim();

                      const isValid =
                        /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
                        ip.split(".").every((x) => {
                          const n = Number(x);
                          return (
                            x !== "" && n >= 0 && n <= 255 && String(n) === x
                          ); // "01" 같은 거 싫으면 이 조건 유지
                        });

                      if (!isValid) {
                        // 유효하지 않으면 빈 값으로(가장 단순하고 안전)
                        setEditDevice((prev) =>
                          prev ? { ...prev, deviceIpStr: "" } : prev,
                        );
                      }
                    }}
                    disabled={locked}
                  />
                </div>
                <div
                  style={{
                    marginRight: "20px",
                    width: "100px",
                  }}
                >
                  Subnet Mask
                </div>
                <div style={{ marginRight: "20px" }}>
                  <StyledInputIp
                    type="text"
                    inputMode="decimal"
                    placeholder="255.255.255.0"
                    value={editDevice?.subnetStr ?? ""}
                    onChange={(e) => {
                      // 1) 숫자/점만 허용
                      // 2) 연속 점/길이 과도 방지
                      let v = e.target.value.replace(/[^0-9.]/g, "");
                      v = v.replace(/\.{2,}/g, "."); // ".." -> "."
                      if (v.length > 15) v = v.slice(0, 15); // 255.255.255.255 최대 15자

                      setEditDevice((prev) =>
                        prev ? { ...prev, subnetStr: v } : prev,
                      );
                    }}
                    onBlur={() => {
                      const ip = (editDevice?.subnetStr ?? "").trim();

                      const isValid =
                        /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
                        ip.split(".").every((x) => {
                          const n = Number(x);
                          return (
                            x !== "" && n >= 0 && n <= 255 && String(n) === x
                          ); // "01" 같은 거 싫으면 이 조건 유지
                        });

                      if (!isValid) {
                        // 유효하지 않으면 빈 값으로(가장 단순하고 안전)
                        setEditDevice((prev) =>
                          prev ? { ...prev, subnetStr: "" } : prev,
                        );
                      }
                    }}
                    disabled={locked}
                  />
                </div>
                <div
                  style={{
                    marginRight: "20px",
                    width: "100px",
                  }}
                >
                  Gateway
                </div>
                <div style={{ marginRight: "20px" }}>
                  <StyledInputIp
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0.0.0"
                    value={editDevice?.gatewayStr ?? ""}
                    onChange={(e) => {
                      // 1) 숫자/점만 허용
                      // 2) 연속 점/길이 과도 방지
                      let v = e.target.value.replace(/[^0-9.]/g, "");
                      v = v.replace(/\.{2,}/g, "."); // ".." -> "."
                      if (v.length > 15) v = v.slice(0, 15); // 255.255.255.255 최대 15자

                      setEditDevice((prev) =>
                        prev ? { ...prev, gatewayStr: v } : prev,
                      );
                    }}
                    onBlur={() => {
                      const ip = (editDevice?.gatewayStr ?? "").trim();

                      const isValid =
                        /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
                        ip.split(".").every((x) => {
                          const n = Number(x);
                          return (
                            x !== "" && n >= 0 && n <= 255 && String(n) === x
                          ); // "01" 같은 거 싫으면 이 조건 유지
                        });

                      if (!isValid) {
                        // 유효하지 않으면 빈 값으로(가장 단순하고 안전)
                        setEditDevice((prev) =>
                          prev ? { ...prev, gatewayStr: "" } : prev,
                        );
                      }
                    }}
                    disabled={locked}
                  />
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
              }}
            >
              <div style={{ marginRight: "20px" }}>Sensor #1</div>
              <div style={{ marginRight: "20px" }}>
                <Radio
                  checked={editDevice?.s1Mode === 0}
                  onClick={() => {
                    setEditDevice((prev) =>
                      prev ? { ...prev, s1Mode: 0 } : prev,
                    );
                  }}
                  disabled={locked}
                />
                Nc
              </div>
              <div style={{ marginRight: "20px" }}>
                <Radio
                  checked={editDevice?.s1Mode === 1}
                  onClick={() => {
                    setEditDevice((prev) =>
                      prev ? { ...prev, s1Mode: 1 } : prev,
                    );
                  }}
                  disabled={locked}
                />
                No
              </div>
              <div style={{ marginRight: "20px" }}>지연시간</div>
              <div style={{ marginRight: "5px" }}>
                <StyledInputDelayTime
                  value={editDevice?.s1DelayTime ?? 0}
                  onChange={(e) => {
                    const only = e.target.value.replace(/\D/g, "");
                    const n = only === "" ? 0 : Number(only);
                    if (n < 0 || n > 255) return;
                    setEditDevice((prev) =>
                      prev ? { ...prev, s1DelayTime: n } : prev,
                    );
                  }}
                  disabled={locked}
                />
              </div>
              <div style={{ marginRight: "20px" }}> s</div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
              }}
            >
              <div style={{ marginRight: "20px" }}> Sensor #2</div>
              <div style={{ marginRight: "20px" }}>
                <Radio
                  checked={editDevice?.s2Mode === 0}
                  onClick={() => {
                    setEditDevice((prev) =>
                      prev ? { ...prev, s2Mode: 0 } : prev,
                    );
                  }}
                  disabled={locked}
                />
                Nc
              </div>
              <div style={{ marginRight: "20px" }}>
                <Radio
                  checked={editDevice?.s2Mode === 1}
                  onClick={() => {
                    setEditDevice((prev) =>
                      prev ? { ...prev, s2Mode: 1 } : prev,
                    );
                  }}
                  disabled={locked}
                />
                No
              </div>
              <div style={{ marginRight: "20px" }}>지연시간</div>
              <div style={{ marginRight: "5px" }}>
                <StyledInputDelayTime
                  value={editDevice?.s2DelayTime ?? 0}
                  onChange={(e) => {
                    const only = e.target.value.replace(/\D/g, "");
                    const n = only === "" ? 0 : Number(only);
                    if (n < 0 || n > 255) return;
                    setEditDevice((prev) =>
                      prev ? { ...prev, s2DelayTime: n } : prev,
                    );
                  }}
                  disabled={locked}
                />
              </div>
              <div style={{ marginRight: "20px" }}> s</div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
              }}
            >
              <div style={{ marginRight: "20px" }}> Sensor #3</div>
              <div style={{ marginRight: "20px" }}>
                <Radio
                  checked={editDevice?.s3Mode === 0}
                  onClick={() => {
                    setEditDevice((prev) =>
                      prev ? { ...prev, s3Mode: 0 } : prev,
                    );
                  }}
                  disabled={locked}
                />
                Nc
              </div>
              <div style={{ marginRight: "20px" }}>
                <Radio
                  checked={editDevice?.s3Mode === 1}
                  onClick={() => {
                    setEditDevice((prev) =>
                      prev ? { ...prev, s3Mode: 1 } : prev,
                    );
                  }}
                  disabled={locked}
                />
                No
              </div>
              <div style={{ marginRight: "20px" }}>지연시간</div>
              <div style={{ marginRight: "5px" }}>
                <StyledInputDelayTime
                  value={editDevice?.s3DelayTime ?? 0}
                  onChange={(e) => {
                    const only = e.target.value.replace(/\D/g, "");
                    const n = only === "" ? 0 : Number(only);
                    if (n < 0 || n > 255) return;
                    setEditDevice((prev) =>
                      prev ? { ...prev, s3DelayTime: n } : prev,
                    );
                  }}
                  disabled={locked}
                />
              </div>
              <div style={{ marginRight: "20px" }}> s</div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

const StyledPage = styled(Box)`
  padding: 20px;
`;

const StyledTableHeadCell = styled(TableCell)`
  color: white;
  display: table-cell !important;
  text-align: center !important;
  vertical-align: middle !important;
  font-size: 12px !important;
  margin: 0 !important;
  padding: 0 !important;
  height: 20px !important;
  border: 1px solid rgba(145, 158, 171, 0.32) !important;
`;

const StyledTableCell = styled(TableCell)`
  color: white;
  display: table-cell !important;
  text-align: center !important;
  vertical-align: middle !important;
  font-size: 0.7rem !important;
  margin: 0 !important;
  padding: 0 !important;
  height: 20px !important;
  border: 1px solid rgba(145, 158, 171, 0.32) !important;
`;

const StyledInputIp = styled.input`
  color: black;
  background: transparent;
  text-align: center;
  font-size: 0.9rem;
  margin: 0;
  padding: 0 6px;
  height: 30px;
  width: 150px;
  line-height: 30px;
  border: 1px solid rgba(145, 158, 171, 0.32);
  box-sizing: border-box;
`;

const StyledInputPort = styled.input`
  color: black;
  background: transparent;

  text-align: center;
  font-size: 0.9rem;

  margin: 0;
  padding: 0 6px;

  height: 30px;
  width: 150px;

  line-height: 20px; /* 세로 가운데 핵심 */

  border: 1px solid rgba(145, 158, 171, 0.32);
  box-sizing: border-box;
`;

const StyledButton = styled(Button)`
  border: 1px solid #ffffff;
  text-transform: none;
  margin-right: 10px;

  height: 30px;
`;

const StyledDialogButton = styled(Button)`
  border: 1px solid #000000;
  color: #000000;
  text-transform: none;
  margin-right: 10px;

  height: 30px;

  &:hover {
    border: 1px solid red;
    color: blue;
    font-weight: bold;
    background-color: transparent; /* MUI 기본 hover 배경 제거 */
  }
`;

const StyledInputDelayTime = styled.input`
  color: black;
  background: transparent;

  text-align: center;
  font-size: 0.7rem;

  margin: 0;
  padding: 0 6px;

  height: 30px;
  width: 50px;

  line-height: 20px; /* 세로 가운데 핵심 */

  border: 1px solid rgba(145, 158, 171, 0.32);
  box-sizing: border-box;
`;
