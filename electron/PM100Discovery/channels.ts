export const PM100_CHANNELS = {
  scanStart: "pm100:scanStart",
  scanStop: "pm100:scanStop",
  getLocalIPv4s: "pm100:getLocalIPv4s", // ✅ 추가
  log: "pm100:log",
  udp: "pm100:udp",
  reset: "pm100:reset",
} as const;
