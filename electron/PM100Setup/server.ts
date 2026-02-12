// electron/PM100Setup/server.ts

import net from "net";
import { tryParseFrames } from "./protocol";
import type { PM100SetupFrame } from "./protocol";

type SetupStatus = { running: boolean; port?: number; host?: string };

export class PM100SetupServer {
  private server: net.Server | null = null;
  private port: number | null = null;
  private host: string | null = null;
  private clients = new Set<net.Socket>();
  private stopping: Promise<void> | null = null;

  constructor(
    private onLog: (line: string) => void,
    private onStatus: (s: SetupStatus) => void,
    private onDeviceFrame: (f: PM100SetupFrame) => void,
  ) {}

  start(port: number, host: string) {
    if (this.server) {
      this.onLog(
        `Start ignored: already running on ${this.host ?? "?"}:${this.port ?? "?"}`,
      );
      return;
    }
    if (this.stopping) {
      this.onLog("Start ignored: server is stopping (wait close)");
      return;
    }

    this.onLog(`Server start requested: ${host}:${port}`);

    const server = net.createServer((sock) => {
      this.clients.add(sock);
      this.onLog(`Client connected: ${sock.remoteAddress}:${sock.remotePort}`);

      let carry: Buffer = Buffer.alloc(0);

      sock.on("data", (buf: Buffer) => {
        this.onLog(`RAW RX ${buf.length} bytes`);
        carry = Buffer.concat([carry, buf]) as Buffer;

        const { frames, rest } = tryParseFrames(carry);
        carry = rest as Buffer;

        for (const f of frames) this.onDeviceFrame(f);
      });

      sock.on("close", () => {
        this.clients.delete(sock);
        this.onLog(
          `Client disconnected: ${sock.remoteAddress}:${sock.remotePort}`,
        );
        this.onStatus({
          running: true,
          port: this.port ?? undefined,
          host: this.host ?? undefined,
        });
      });

      sock.on("error", (e) => this.onLog(`Client error: ${e.message}`));

      // ✅ OS 레벨 keepalive (도움은 되지만 즉시는 아님)
      sock.setKeepAlive(true, 5000);

      // ✅ 10초 동안 아무 데이터도 안 오면 timeout 이벤트 발생
      sock.setTimeout(3000);

      sock.on("timeout", () => {
        this.onLog(
          `Socket timeout -> ${sock.remoteAddress}:${sock.remotePort}`,
        );
        sock.destroy(); // ✅ 강제로 끊어서 close 유도
      });
    });

    server.on("error", (e: any) => {
      this.onLog(`Server error: ${e?.message ?? e}`);
      // 실패 정리
      try {
        server.close();
      } catch {}
      this.server = null;
      this.port = null;
      this.host = null;
      this.onStatus({ running: false });
    });

    // ✅ 연결 수신을 “모든 인터페이스”로 열어두는 게 안전
    server.listen(port, "0.0.0.0", () => {
      this.server = server;
      this.port = port;
      this.host = host;

      this.onLog(
        `Server listening on 0.0.0.0:${port} (requested host=${host})`,
      );
      this.onStatus({ running: true, port, host });
    });
  }

  // ✅ Stop을 완료까지 기다릴 수 있게
  async stopAsync(): Promise<void> {
    if (this.stopping) return this.stopping;

    if (!this.server) {
      this.onLog("Stop ignored: server not running");
      this.onStatus({ running: false });
      return;
    }

    this.onLog("Server stop requested");

    const s = this.server;

    // stopping 시작 표시
    this.stopping = new Promise<void>((resolve) => {
      // 1) 클라이언트 정상 종료(FIN) 먼저
      for (const sock of this.clients) {
        try {
          sock.end(); // ✅ 정상 종료 시도
          // 500ms 후에도 안 닫히면 강제 종료
          setTimeout(() => {
            try {
              sock.destroy();
            } catch {}
          }, 500);
        } catch {}
      }
      this.clients.clear();

      // 2) 서버 close 완료 대기
      try {
        s.close(() => {
          this.server = null;
          this.port = null;
          this.host = null;

          this.onLog("Server stopped");
          this.onStatus({ running: false });

          const done = this.stopping;
          this.stopping = null;
          resolve();
        });
      } catch {
        this.server = null;
        this.port = null;
        this.host = null;

        this.onLog("Server stopped");
        this.onStatus({ running: false });

        this.stopping = null;
        resolve();
      }
    });

    return this.stopping;
  }

  status(): SetupStatus {
    return {
      running: !!this.server,
      port: this.port ?? undefined,
      host: this.host ?? undefined,
    };
  }

  getConnectedIps(): string[] {
    const ips = new Set<string>();
    for (const s of this.clients) {
      const ra = s.remoteAddress ?? "";
      // IPv6-mapped IPv4 형태(::ffff:192.168.1.101) 정리
      const ip = ra.startsWith("::ffff:") ? ra.slice(7) : ra;
      if (ip) ips.add(ip);
    }
    return Array.from(ips);
  }
}
