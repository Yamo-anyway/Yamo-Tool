import React, { useEffect, useRef, useState } from "react";
import "./styles.css";
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
  s1DelayTime: number;
  s1Status: number;
  s2Mode: number;
  s2DelayTime: number;
  s2Status: number;
  s3Mode: number;
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
            height: "430px",
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
                  <StyledTableHeadCell
                    sx={{ width: 80, minWidth: 80, maxWidth: 80 }}
                  />
                  <StyledTableHeadCell
                    sx={{ width: 80, minWidth: 80, maxWidth: 80 }}
                  />

                  <StyledTableHeadCell sx={{ width: "auto" }} />
                  {/* <StyledTableHeaerCell sx={{ maxWidth: "100%" }} /> */}
                </TableRow>
              </TableHead>

              <TableBody>
                {devices?.map((row: any) => {
                  return (
                    <TableRow key={`device list - ${row.key}`}>
                      <StyledTableCell>{row.type}</StyledTableCell>
                      <StyledTableCell>{row.macStr}</StyledTableCell>
                      <StyledTableCell>{row.serverIpStr}</StyledTableCell>
                      <StyledTableCell>{row.serverPort}</StyledTableCell>
                      <StyledTableCell>{row.deviceIpStr}</StyledTableCell>
                      <StyledTableCell>{row.subnetStr}</StyledTableCell>
                      <StyledTableCell>{row.gatewayStr}</StyledTableCell>
                      <StyledTableCell>
                        {`${row.s1Mode === 0 ? "NC" : "NO"} (${row.s1DelayTime}s)`}
                      </StyledTableCell>
                      <StyledTableCell>
                        {`${row.s2Mode === 0 ? "NC" : "NO"} (${row.s2DelayTime}s)`}
                      </StyledTableCell>
                      <StyledTableCell>
                        {`${row.s3Mode === 0 ? "NC" : "NO"} (${row.s3DelayTime}s)`}
                      </StyledTableCell>
                      <StyledTableCell
                        onClick={() => {
                          setIsOpenEdit(true);
                          selectDeviceRow(row);
                        }}
                      >
                        수정
                      </StyledTableCell>
                      <StyledTableCell />
                      <StyledTableCell />
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
              style={{ height: "100%" }}
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
  const [editDevice, setEditDevice] = useState<DeviceRow | undefined>();

  useEffect(() => {
    setEditDevice(device);
    console.log(device);
  }, [device]);

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
            <StyledDialogButton onClick={onClose}>초기화</StyledDialogButton>
            <StyledDialogButton onClick={onClose}>업데이트</StyledDialogButton>
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
                />
                No
              </div>
              <div style={{ marginRight: "20px" }}>지연시간</div>
              <div style={{ marginRight: "5px" }}>
                <StyledInputDelayTime value={editDevice?.s1DelayTime} />
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
                />
                No
              </div>
              <div style={{ marginRight: "20px" }}>지연시간</div>
              <div style={{ marginRight: "5px" }}>
                <StyledInputDelayTime value={editDevice?.s2DelayTime} />
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
                />
                No
              </div>
              <div style={{ marginRight: "20px" }}>지연시간</div>
              <div style={{ marginRight: "5px" }}>
                <StyledInputDelayTime value={editDevice?.s3DelayTime} />
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
