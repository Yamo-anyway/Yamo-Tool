import net from "net";
import os from "os";

export type SetupStatus = { running: boolean; port?: number };

function hasIp(ip: string) {
  const nets = os.networkInterfaces();
  for (const ifname of Object.keys(nets)) {
    for (const a of nets[ifname] || []) {
      const isV4 = a.family === "IPv4" || (a as any).family === 4;
      if (!isV4) continue;
      if (a.internal) continue;
      if (a.address === ip) return true;
    }
  }
  return false;
}

export class PM100SetupServer {
  private server: net.Server | null = null;
  private port: number | null = null;
  private host: string | null = null;

  constructor(
    private onLog: (line: string) => void,
    private onStatus: (s: SetupStatus) => void,
  ) {}

  start(port: number, host: string) {
    if (this.server) return;

    if (!hasIp(host)) {
      this.onLog(`Start blocked in main: IP ${host} not found on this PC`);
      this.onStatus({ running: false });
      return;
    }

    const server = net.createServer((sock) => {
      this.onLog(`Client connected: ${sock.remoteAddress}:${sock.remotePort}`);
      sock.on("data", (buf) => {
        this.onLog(
          `RX ${buf.length} bytes from ${sock.remoteAddress}:${sock.remotePort}`,
        );
      });
      sock.on("close", () => {
        this.onLog(
          `Client disconnected: ${sock.remoteAddress}:${sock.remotePort}`,
        );
      });
      sock.on("error", (e) => {
        this.onLog(`Client error: ${e.message}`);
      });
    });

    server.on("error", (e: any) => {
      this.onLog(`Server error: ${e.message ?? e}`);
      this.stop();
    });

    server.listen(port, host, () => {
      this.server = server;
      this.port = port;
      this.host = host;
      this.onLog(`Server started: ${host}:${port}`);
      this.onStatus({ running: true, port });
    });
  }

  stop() {
    if (!this.server) return;

    const s = this.server;
    this.server = null;

    try {
      s.close(() => {
        this.onLog("Server stopped");
        this.onStatus({ running: false });
      });
    } catch {
      this.onLog("Server stopped");
      this.onStatus({ running: false });
    }
  }

  status(): SetupStatus {
    return { running: !!this.server, port: this.port ?? undefined };
  }
}
