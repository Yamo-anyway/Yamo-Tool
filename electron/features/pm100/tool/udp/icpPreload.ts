import { ipcRenderer } from "electron";
import { PM100_CHANNELS } from "../../../../ipc/channels";

export type PM100ToolUdpDevicePayload = {
  from: string;
  size: number;

  // 표시용
  mac: string;
  ip: string;
  serverIp: string;
  subnetMask: string;
  gateway: string;
  serverPort: number;
  version: string;

  // 설정용 bytes
  tagBytes: number[];
  macBytes: number[];
  cmd: number;
  versionBytes: number[];
  ipBytes: number[];
  serverIpBytes: number[];
  temp4Bytes: number[];
  subnetBytes: number[];
  gatewayBytes: number[];
  serverPortBytes: number[];
  temp2Bytes: number[];
  active: number;
  mode: number;
  auth: number;
  tamper: number;
  temp3Bytes: number[];

  rawBytes: Uint8Array;
};

export const pm100toolUdpApi = {
  scanStart: () =>
    ipcRenderer.invoke(PM100_CHANNELS.tool.udp.scanStart) as Promise<boolean>,

  scanStop: () =>
    ipcRenderer.invoke(PM100_CHANNELS.tool.udp.scanStop) as Promise<boolean>,

  onLog: (cb: (line: string) => void) => {
    const handler = (_: any, line: string) => cb(line);
    ipcRenderer.on(PM100_CHANNELS.tool.udp.log, handler);
    return () =>
      ipcRenderer.removeListener(PM100_CHANNELS.tool.udp.log, handler);
  },

  onUdp: (cb: (p: PM100ToolUdpDevicePayload) => void) => {
    const handler = (_: any, payload: PM100ToolUdpDevicePayload) => cb(payload);
    ipcRenderer.on(PM100_CHANNELS.tool.udp.udp, handler);
    return () =>
      ipcRenderer.removeListener(PM100_CHANNELS.tool.udp.udp, handler);
  },

  resetDevice: (ip: string, mac: string) =>
    ipcRenderer.invoke(
      PM100_CHANNELS.tool.udp.reset,
      ip,
      mac,
    ) as Promise<boolean>,

  updateConfig: (payload: {
    macStr: string;
    deviceIp: string;
    subnetMask: string;
    gateway: string;
    serverIp: string;
    serverPort: number;
  }) =>
    ipcRenderer.invoke(
      PM100_CHANNELS.tool.udp.updateConfig,
      payload,
    ) as Promise<boolean>,
};
