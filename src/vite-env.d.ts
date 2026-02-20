/// <reference types="vite/client" />

type PM100SetupStatus = { running: boolean; port?: number };

declare global {
  interface Window {
    api: {
      pm100: {
        discovery: {
          scanStart: () => Promise<boolean>;
          scanStop: () => Promise<boolean>;
          onLog: (cb: (line: string) => void) => () => void;
          onUdp: (cb: (p: unknown) => void) => () => void;
          getLocalIPv4s: () => Promise<string[]>;
          resetDevice: (ip: string, mac: string) => Promise<boolean>;
        };
        setup: {
          startServer: (port: number, host: string) => Promise<boolean>;
          stopServer: () => Promise<boolean>;
          getStatus: () => Promise<PM100SetupStatus>;
          onLog: (cb: (line: string) => void) => () => void;
          onStatus: (cb: (s: PM100SetupStatus) => void) => () => void;
          getLocalIPv4s: () => Promise<string[]>;
          onDevice: (cb: (f: unknown) => void) => () => void;
          getConnectedIps: () => Promise<string[]>;
        };
        tool: {
          udp: {
            onDiscovered: (cb: (row: DeviceRow) => void) => Unsubscribe;
            onStopped: (cb: (reason: string) => void) => Unsubscribe;

            scanStart: (opts?: UdpScanStartOptions) => Promise<boolean>;
            scanStop: () => Promise<boolean>;

            onLog: (cb: (line: string) => void) => Unsubscribe;
          };
          log: {
            openWindow: () => Promise<boolean>;
            append: (line: string) => void;
            clear: () => Promise<boolean>;
            getAll: () => Promise<string>;
            onUpdated: (cb: (allText: string) => void) => () => void;
          };
        };
      };
    };
  }
}
export {};
