/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      pm100: {
        scanStart: () => Promise<boolean>;
        scanStop: () => Promise<boolean>;
        onLog: (cb: (line: string) => void) => () => void;
        onUdp: (cb: (p: any) => void) => () => void;
        getLocalIPv4s: () => Promise<string[]>; // ✅ 추가
        resetDevice: (ip: string, mac: string) => Promise<boolean>;
      };
      pm100setup: {
        startServer: (port: number, host: string) => Promise<boolean>;
        stopServer: () => Promise<boolean>;
        getStatus: () => Promise<{ running: boolean; port?: number }>;
        onLog: (cb: (line: string) => void) => () => void;
        onStatus: (
          cb: (s: { running: boolean; port?: number }) => void,
        ) => () => void;
      };
    };
  }
}
export {};
