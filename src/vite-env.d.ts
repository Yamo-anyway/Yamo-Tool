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
            scanStart: () => Promise<boolean>;
            scanStop: () => Promise<boolean>;
            onLog: (cb: (line: string) => void) => () => void;
            onUdp: (cb: (p: any) => void) => () => void;
            resetDevice: (ip: string, mac: string) => Promise<boolean>;

            updateConfig: (payload: {
              macStr: string;
              deviceIp: string;
              subnetMask: string;
              gateway: string;
              serverIp: string;
              serverPort: number;
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
