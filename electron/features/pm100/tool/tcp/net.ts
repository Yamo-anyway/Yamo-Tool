// electron/features/pm100/tool/tcp/net.ts
import net, { Server, Socket } from "net";

export type TcpToolStatus = { running: boolean; port?: number; host?: string };

export type TcpToolEvents = {
  log: (line: string) => void;
  status: (s: TcpToolStatus) => void;
  client: (p: { type: "connect" | "close"; remote: string }) => void;
  raw: (p: { remote: string; length: number; hex: string }) => void;
  device: (row: any) => void;
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
  if (!frame.subarray(0, 5).equals(HDR)) return null;

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

  return {
    key: ipToKey(deviceIpStr),
    type: "TCP",
    isDetail: false,
    isEdit: false,
    macStr: "",

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

  // ✅ 핵심: 현재 연결된 소켓을 추적해서 stop 때 전부 끊는다
  const sockets = new Set<Socket>();

  function emitStatus() {
    events.status({ running, port: boundPort, host: boundHost });
  }

  async function startServer(port: number, host: string) {
    if (running) return true;

    return await new Promise<boolean>((resolve) => {
      try {
        server = net.createServer((socket: Socket) => {
          sockets.add(socket);

          const remote = `${socket.remoteAddress}:${socket.remotePort}`;
          events.client({ type: "connect", remote });
          events.log(`TCP client connected: ${remote}`);

          socket.on("close", () => {
            sockets.delete(socket);
            events.client({ type: "close", remote });
            events.log(`TCP client closed: ${remote}`);
          });

          socket.on("error", (e) => {
            sockets.delete(socket);
            events.log(
              `TCP socket error ${remote}: ${String((e as any)?.message ?? e)}`,
            );
          });

          let rxBuf = Buffer.alloc(0);

          // ✅ data 리스너는 하나만!
          socket.on("data", (chunk: Buffer) => {
            // 1) raw 로그
            const hex = toHexSpaced(chunk);
            events.raw({ remote, length: chunk.length, hex });
            events.log(`TCP RX ${remote} (${chunk.length} bytes)\n${hex}`);

            // 2) 누적 + 프레임 파싱
            rxBuf = Buffer.concat([rxBuf, chunk]);

            while (rxBuf.length >= 5) {
              const idx = rxBuf.indexOf(HDR);
              if (idx < 0) {
                // 헤더가 없으면 너무 커지기 전에 일부만 유지
                if (rxBuf.length > 4096)
                  rxBuf = rxBuf.subarray(rxBuf.length - 4);
                break;
              }

              if (idx > 0) rxBuf = rxBuf.subarray(idx);
              if (rxBuf.length < FRAME_LEN) break;

              const frame = rxBuf.subarray(0, FRAME_LEN);
              rxBuf = rxBuf.subarray(FRAME_LEN);

              const row = parseTcpFrame(frame);
              if (row) events.device(row);
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
    // ✅ 1) 기존 연결을 먼저 전부 끊는다 (그래야 stop 후에도 RX 안 옴)
    for (const sock of sockets) {
      try {
        sock.destroy();
      } catch {}
    }
    sockets.clear();

    // ✅ 2) 서버 accept 중단
    const s = server;
    server = null;

    if (!s) {
      running = false;
      boundPort = undefined;
      boundHost = undefined;
      emitStatus();
      return true;
    }

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
