/// <reference types="vite/client" />

type PM100SetupStatus = { running: boolean; port?: number };

declare global {
  interface Window {
    api: {
      pm100: {
        tool: {
          tcp: {
            startServer: (port: number, host: string) => Promise<boolean>;
            stopServer: () => Promise<boolean>;
            getStatus: () => Promise<{
              running: boolean;
              port?: number;
              host?: string;
            }>;
            getLocalIPv4s: () => Promise<string[]>;
            onLog: (cb: (line: string) => void) => () => void;
            onStatus: (
              cb: (s: {
                running: boolean;
                port?: number;
                host?: string;
              }) => void,
            ) => () => void;
            onRaw: (
              cb: (p: { remote: string; length: number; hex: string }) => void,
            ) => () => void;

            send: (p: {
              deviceIpStr: string;
              cmd: number;
              data?: number[];
            }) => Promise<boolean>;

            onDevice: (cb: (row: DeviceRow) => void) => () => void;
          };
          udp: {
            onDiscovered: (cb: (row: DeviceRow) => void) => Unsubscribe;
            onStopped: (cb: (reason: string) => void) => Unsubscribe;

            scanStart: (opts?: UdpScanStartOptions) => Promise<boolean>;
            scanStop: () => Promise<boolean>;

            onLog: (cb: (line: string) => void) => Unsubscribe;

            sendUdp: (p: {
              macStr: string;
              deviceIp?: string;
              cmd: number;
              data?: number[];
            }) => Promise<boolean>;
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
