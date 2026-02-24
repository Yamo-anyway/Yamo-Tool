// electron/features/pm100/tool/tcp/net.ts
import net, { Server, Socket } from "net";

export type TcpToolStatus = { running: boolean; port?: number; host?: string };

export type TcpToolEvents = {
  log: (line: string) => void;
  status: (s: TcpToolStatus) => void;
  client: (p: { type: "connect" | "close"; remote: string }) => void;
  raw: (p: { remote: string; length: number; hex: string }) => void; // ✅ TCP RX raw hex

  device: (row: any) => void; // ✅ 추가: 파싱된 TCP 장치 row
};

function toHexSpaced(buf: Buffer, maxBytes = 512) {
  const b = buf.length > maxBytes ? buf.slice(0, maxBytes) : buf;
  const hex = b.toString("hex").toUpperCase();
  const spaced = hex.match(/.{1,2}/g)?.join(" ") ?? "";
  return buf.length > maxBytes
    ? spaced + ` ... (+${buf.length - maxBytes} bytes)`
    : spaced;
}

const HDR = Buffer.from([0x43, 0x47, 0x44, 0x49, 0x7f]); // "CGDI" + 0x7F
const FRAME_LEN = 36;

function xorChecksum(buf: Buffer): number {
  let x = 0;
  for (const b of buf) x ^= b;
  return x & 0xff;
}

function formatIpBytes(b: Buffer, off: number) {
  return `${b[off]}.${b[off + 1]}.${b[off + 2]}.${b[off + 3]}`;
}

function ipToKey(ip: string) {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  const u =
    (((parts[0] << 24) >>> 0) |
      (parts[1] << 16) |
      (parts[2] << 8) |
      parts[3]) >>>
    0;
  return (u % 900000) + 100000;
}

function parseTcpFrame(frame: Buffer) {
  if (frame.length !== FRAME_LEN) return null;

  // ✅ header 확인
  if (!frame.subarray(0, 5).equals(HDR)) return null;

  // ✅ checksum 확인: 마지막 1바이트 = XOR(앞 35바이트)
  const received = frame[FRAME_LEN - 1];
  const calc = xorChecksum(frame.subarray(0, FRAME_LEN - 1));
  if (received !== calc) return null;

  const deviceIpStr = formatIpBytes(frame, 5);
  const subnetStr = formatIpBytes(frame, 9);
  const gatewayStr = formatIpBytes(frame, 13);
  const serverIpStr = formatIpBytes(frame, 17);

  const serverPort = frame.readUInt16BE(21);

  const s1Mode = frame[23];
  const s2Mode = frame[24];
  const s3Mode = frame[25];

  const s1Enable = frame[26];
  const s2Enable = frame[27];
  const s3Enable = frame[28];

  const s1DelayTime = frame[29];
  const s2DelayTime = frame[30];
  const s3DelayTime = frame[31];

  const s1Status = frame[32];
  const s2Status = frame[33];
  const s3Status = frame[34];

  console.log("frame", frame); // debug
  // ✅ DeviceRow 형태로 맞춰서 반환
  return {
    key: ipToKey(deviceIpStr),
    type: "TCP",
    isDetail: false,
    isEdit: false,

    // TCP에서는 MAC이 없으니 식별용 문자열로 채움
    // macStr: `TCP:${deviceIpStr}`,
    macStr: ``,

    deviceIpStr,
    subnetStr,
    gatewayStr,
    serverIpStr,
    serverPort,

    s1Mode,
    s2Mode,
    s3Mode,

    s1DelayTime,
    s2DelayTime,
    s3DelayTime,

    s1Status,
    s2Status,
    s3Status,

    raw: {
      proto: "CGDI",
      resp: 0x7f,
      enable: [s1Enable, s2Enable, s3Enable],
      checksum: received,
      calcChecksum: calc,
      rawBytes: new Uint8Array(frame),
    },
  };
}

export function createPM100ToolTcpServer(events: TcpToolEvents) {
  let server: Server | null = null;
  let running = false;
  let boundPort: number | undefined;
  let boundHost: string | undefined;

  function emitStatus() {
    events.status({ running, port: boundPort, host: boundHost });
  }

  async function startServer(port: number, host: string) {
    // running이면 재시작은 ipcMain에서 처리하므로 여기선 그냥 start만
    if (running) return true;

    return await new Promise<boolean>((resolve) => {
      try {
        server = net.createServer((socket: Socket) => {
          const remote = `${socket.remoteAddress}:${socket.remotePort}`;

          events.client({ type: "connect", remote });
          events.log(`TCP client connected: ${remote}`);

          socket.on("data", (chunk: Buffer) => {
            const hex = toHexSpaced(chunk);
            events.raw({ remote, length: chunk.length, hex });
            events.log(`TCP RX ${remote} (${chunk.length} bytes)\n${hex}`);
          });

          socket.on("close", () => {
            events.client({ type: "close", remote });
            events.log(`TCP client closed: ${remote}`);
          });

          socket.on("error", (e) => {
            events.log(
              `TCP socket error ${remote}: ${String((e as any)?.message ?? e)}`,
            );
          });

          let rxBuf = Buffer.alloc(0);

          socket.on("data", (chunk: Buffer) => {
            // 1) raw 로그는 일단 그대로 (원하면 유지)
            const hex = toHexSpaced(chunk);
            events.raw({ remote, length: chunk.length, hex });
            events.log(`TCP RX ${remote} (${chunk.length} bytes)\n${hex}`);

            // 2) 누적 버퍼에 붙이기
            rxBuf = Buffer.concat([rxBuf, chunk]);

            // 3) 헤더 찾아서 프레임 단위로 파싱
            while (rxBuf.length >= 5) {
              const idx = rxBuf.indexOf(HDR);
              if (idx < 0) {
                // 헤더가 없으면 너무 커지기 전에 일부 버림
                if (rxBuf.length > 4096)
                  rxBuf = rxBuf.subarray(rxBuf.length - 4);
                break;
              }

              // 헤더 앞 쓰레기 버림
              if (idx > 0) rxBuf = rxBuf.subarray(idx);

              // 프레임 길이 부족하면 다음 data 기다림
              if (rxBuf.length < FRAME_LEN) break;

              const frame = rxBuf.subarray(0, FRAME_LEN);
              rxBuf = rxBuf.subarray(FRAME_LEN);

              const row = parseTcpFrame(frame);
              if (!row) {
                // checksum 틀리거나 구조가 다르면 계속 탐색
                continue;
              }

              // ✅ 여기서 "장치 IP가 목록에 없으면 추가, 있으면 업데이트"는
              // renderer에서 setDevices로 처리하는게 제일 깔끔함.
              events.device(row);
            }
          });
        });

        server.on("error", (e) => {
          events.log(`TCP server error: ${String((e as any)?.message ?? e)}`);
          try {
            server?.close();
          } catch {}
          server = null;
          running = false;
          boundPort = undefined;
          boundHost = undefined;
          emitStatus();
          resolve(false);
        });

        server.listen(port, host, () => {
          running = true;
          boundPort = port;
          boundHost = host;
          events.log(`TCP server listening: ${host}:${port}`);
          emitStatus();
          resolve(true);
        });
      } catch (e: any) {
        events.log(`TCP start failed: ${String(e?.message ?? e)}`);
        resolve(false);
      }
    });
  }

  async function stopServer() {
    const s = server;
    if (!s) {
      running = false;
      boundPort = undefined;
      boundHost = undefined;
      emitStatus();
      return true;
    }

    server = null;

    return await new Promise<boolean>((resolve) => {
      try {
        s.close((err?: any) => {
          if (err) {
            events.log(`TCP stop error: ${String(err?.message ?? err)}`);
            resolve(false);
            return;
          }
          running = false;
          boundPort = undefined;
          boundHost = undefined;
          events.log(`TCP server stopped`);
          emitStatus();
          resolve(true);
        });
      } catch (e: any) {
        events.log(`TCP stop failed: ${String(e?.message ?? e)}`);
        resolve(false);
      }
    });
  }

  function getStatus(): TcpToolStatus {
    return { running, port: boundPort, host: boundHost };
  }

  return { startServer, stopServer, getStatus, isRunning: () => running };
}
