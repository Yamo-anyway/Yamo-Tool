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

const CGDI = Buffer.from([0x43, 0x47, 0x44, 0x49]); // "CGDI"
const HDR = Buffer.from([0x43, 0x47, 0x44, 0x49, 0x7f]); // "CGDI" + 0x7F
const FRAME_LEN = 36;

function xorChecksum(buf: Buffer): number {
  let x = 0;
  for (const b of buf) x ^= b;
  return x & 0xff;
}

// ✅ 초기화 포함 CGDI 명령 패킷 생성
// - init: "CGDI" + 0x3E + checksum  => 6 bytes
// - update: "CGDI" + 0x1E + data + checksum
function buildCgdiPacket(cmd: number, data?: number[]): Buffer {
  const head = Buffer.concat([CGDI, Buffer.from([cmd & 0xff])]); // 5 bytes
  const body = data && data.length ? Buffer.from(data) : Buffer.alloc(0);
  const withoutCs = Buffer.concat([head, body]);
  const cs = xorChecksum(withoutCs);
  return Buffer.concat([withoutCs, Buffer.from([cs])]);
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

    s1Enable,
    s2Enable,
    s3Enable,

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

function normalizeRemoteIp(addr: string | undefined | null) {
  const s = String(addr ?? "").trim();
  // node가 IPv4를 ::ffff:192.168.0.10 형태로 줄 때 제거
  if (s.startsWith("::ffff:")) return s.slice(7);
  return s;
}

export function createPM100ToolTcpServer(events: TcpToolEvents) {
  let server: Server | null = null;
  let running = false;
  let boundPort: number | undefined;
  let boundHost: string | undefined;

  const sockets = new Set<Socket>();

  // ✅ deviceIpStr -> socket 매핑 (TCP 명령 보낼 타겟)
  const socketByDeviceIp = new Map<string, Socket>();

  function emitStatus() {
    events.status({ running, port: boundPort, host: boundHost });
  }

  async function startServer(port: number, host: string) {
    if (running) return true;

    return await new Promise<boolean>((resolve) => {
      try {
        server = net.createServer((socket: Socket) => {
          sockets.add(socket);

          const remoteIp = normalizeRemoteIp(socket.remoteAddress);
          const remote = `${remoteIp}:${socket.remotePort}`;

          events.client({ type: "connect", remote });
          events.log(`TCP client connected: ${remote}`);

          socket.on("close", () => {
            sockets.delete(socket);
            // 매핑 제거
            for (const [ip, s] of socketByDeviceIp.entries()) {
              if (s === socket) socketByDeviceIp.delete(ip);
            }
            events.client({ type: "close", remote });
            events.log(`TCP client closed: ${remote}`);
          });

          socket.on("error", (e) => {
            sockets.delete(socket);
            for (const [ip, s] of socketByDeviceIp.entries()) {
              if (s === socket) socketByDeviceIp.delete(ip);
            }
            events.log(
              `TCP socket error ${remote}: ${String((e as any)?.message ?? e)}`,
            );
          });

          let rxBuf = Buffer.alloc(0);

          socket.on("data", (chunk: Buffer) => {
            const hex = toHexSpaced(chunk);
            events.raw({ remote, length: chunk.length, hex });
            events.log(`TCP RX ${remote} (${chunk.length} bytes)\n${hex}`);

            rxBuf = Buffer.concat([rxBuf, chunk]);

            while (rxBuf.length >= 5) {
              const idx = rxBuf.indexOf(HDR);
              if (idx < 0) {
                if (rxBuf.length > 4096)
                  rxBuf = rxBuf.subarray(rxBuf.length - 4);
                break;
              }

              if (idx > 0) rxBuf = rxBuf.subarray(idx);
              if (rxBuf.length < FRAME_LEN) break;

              const frame = rxBuf.subarray(0, FRAME_LEN);
              rxBuf = rxBuf.subarray(FRAME_LEN);

              const row = parseTcpFrame(frame);
              if (!row) continue;

              // ✅ 장치 IP 기준으로 socket 매핑 저장
              socketByDeviceIp.set(row.deviceIpStr, socket);

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
    for (const sock of sockets) {
      try {
        sock.destroy();
      } catch {}
    }
    sockets.clear();
    socketByDeviceIp.clear();

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

  // ✅ TCP로 명령 전송
  async function sendToDevice(
    deviceIpStr: string,
    cmd: number,
    data?: number[],
  ) {
    const ip = String(deviceIpStr ?? "").trim();
    if (!ip) return false;

    const sock = socketByDeviceIp.get(ip);
    if (!sock || sock.destroyed) {
      events.log(`TCP send failed: no active socket for device ${ip}`);
      return false;
    }

    const packet = buildCgdiPacket(cmd, data);

    return await new Promise<boolean>((resolve) => {
      try {
        sock.write(packet, (err) => {
          if (err) {
            events.log(
              `TCP send error ${ip}: ${String((err as any)?.message ?? err)}`,
            );
            resolve(false);
            return;
          }
          events.log(
            `TCP TX ${ip} (${packet.length} bytes)\n${toHexSpaced(packet)}`,
          );
          resolve(true);
        });
      } catch (e: any) {
        events.log(`TCP send exception ${ip}: ${String(e?.message ?? e)}`);
        resolve(false);
      }
    });
  }

  return {
    startServer,
    stopServer,
    getStatus,
    sendToDevice,
    isRunning: () => running,
  };
}
