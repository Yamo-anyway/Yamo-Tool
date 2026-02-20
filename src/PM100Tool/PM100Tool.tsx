import React, { useEffect, useRef, useState } from "react";
import "./styles.css";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import styled from "@emotion/styled";
import { StyledPage } from "../components/StyledLayout";
import { StyledButton } from "../components/StyledButton";

export type DeviceRow = {
  type: "UDP" | "TCP";
  macStr: string;
  deviceIpStr: string;
  serverIpStr: string;
  subnetStr: string;
  gatewayStr: string;
  serverPort: number;
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
  const [isTcpServer, setIsTcpServer] = useState(false);

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
      setLog((p) => (p ? p + "\n" + line : line));
    });

    // ✅ 여기 추가
    const offStopped = window.api.pm100.tool.udp.onStopped?.((p: any) => {
      if (p.reason === "restart") return;

      setLog((prev) => prev + `\n✅ 검색 완료: ${p.found}대 발견`);
      setIsUdpScanning(false);

      console.log("devices=>", devices);
    });

    return () => {
      offDiscovered?.();
      offLog?.();
      offStopped?.(); // ✅ 이것도 꼭 포함
    };
  }, []);

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

  useEffect(() => {
    console.log("isUdpScanning #5", isUdpScanning);
  }, [isUdpScanning]);

  // ✅ 최종: “검색/중단” 토글 (즉시 UI 반영 + 실패 시 원복 + 연타 방지)
  const onUdpScanStop = async () => {
    if (isUdpScanning === false) {
      console.log("isUdpScanning #1", isUdpScanning);
      setIsUdpScanning(true);
      setDevices([]);

      const ok = await window.api.pm100.tool.udp.scanStart({
        port: 1500,
        intervalMs: 2000,
        count: 5,
      });

      console.log("isUdpScanning #2", isUdpScanning);
      if (!ok) {
        // 실패면 원복
        (console.log("isUdpScanning #3"), isUdpScanning);
        scanningRef.current = false;
        setIsUdpScanning(false);
      }
    } else {
      await window.api.pm100.tool.udp.scanStop();
      console.log("isUdpScanning #4", isUdpScanning);
      setIsUdpScanning(false);
    }
  };

  const onTcpServerStartStop = async () => {
    setIsTcpServer((v) => !v);
    try {
      // TODO
    } catch {}
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
            <StyledButton
              onClick={() => window.api.pm100.tool.log.openWindow()}
            >
              포트 값
            </StyledButton>
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
            height: "300px",
            border: "1px solid #FFF",
          }}
        >
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <StyledTableHeadCell
                    sx={{ width: 50, minWidth: 50, maxWidth: 50 }}
                  >
                    Type
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 120, minWidth: 120, maxWidth: 120 }}
                  >
                    Mac
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 100, minWidth: 100, maxWidth: 100 }}
                  >
                    Server IP
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 50, minWidth: 50, maxWidth: 50 }}
                  >
                    Port
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 100, minWidth: 100, maxWidth: 100 }}
                  >
                    Device IP
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 100, minWidth: 100, maxWidth: 100 }}
                  >
                    Subnet Mask
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 100, minWidth: 100, maxWidth: 100 }}
                  >
                    Gateway
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 80, minWidth: 80, maxWidth: 80 }}
                  >
                    S1
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 80, minWidth: 80, maxWidth: 80 }}
                  >
                    S2
                  </StyledTableHeadCell>
                  <StyledTableHeadCell
                    sx={{ width: 80, minWidth: 80, maxWidth: 80 }}
                  >
                    S3
                  </StyledTableHeadCell>
                  <StyledTableHeadCell sx={{ width: "auto" }} />
                  {/* <StyledTableHeaerCell sx={{ maxWidth: "100%" }} /> */}
                </TableRow>
              </TableHead>

              <TableBody>
                {devices?.map((row: any, index: number) => {
                  console.log("row => ", row);
                  return (
                    <TableRow key={`device list - ${index}`}>
                      <StyledTableCell>{row.type}</StyledTableCell>
                      <StyledTableCell>{row.macStr}</StyledTableCell>
                      <StyledTableCell>{row.serverIpStr}</StyledTableCell>
                      <StyledTableCell>{row.serverPort}</StyledTableCell>
                      <StyledTableCell>{row.deviceIpStr}</StyledTableCell>
                      <StyledTableCell>{row.subnetStr}</StyledTableCell>
                      <StyledTableCell>{row.gatewayStr}</StyledTableCell>
                      <StyledTableCell />
                      <StyledTableCell />
                      <StyledTableCell />
                      <StyledTableCell />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </div>

        <div style={{ display: "flex", height: "330px" }}>
          <div
            style={{ width: "50%", height: "100%", border: "1px solid #FFF" }}
          >
            <textarea
              ref={logRef}
              className="pmLogArea"
              value={log}
              readOnly
              placeholder="Logs..."
              style={{ height: "100%" }}
            />
          </div>
          <div
            style={{ width: "50%", height: "100%", border: "1px solid #FFF" }}
          >
            설정
          </div>
        </div>
      </div>
    </StyledPage>
  );
}

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

// const StyledTableCell = styled(TableCell)`
//   color: white;
//   display: table-cell !important;
//   text-align: center !important;
//   vertical-align: middle !important;
//   font-size: 0.7rem !important;
//   margin: 0 !important;
//   padding: 0 !important;
//   height: 20px !important;
//   width: 200px !important;
//   border: 1px solid rgba(145, 158, 171, 0.32) !important;
// `;
