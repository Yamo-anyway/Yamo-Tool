// electron/ipc/channels.ts

/** PM100 IPC Channels (namespaced to avoid collisions) */
export const PM100_CHANNELS = {
  discovery: {
    scanStart: "pm100:discovery:scanStart",
    scanStop: "pm100:discovery:scanStop",
    getLocalIPv4s: "pm100:discovery:getLocalIPv4s",
    log: "pm100:discovery:log",
    udp: "pm100:discovery:udp",
    reset: "pm100:discovery:reset",
  },

  setup: {
    start: "pm100:setup:start",
    stop: "pm100:setup:stop",
    status: "pm100:setup:status",
    log: "pm100:setup:log",
    getLocalIPv4s: "pm100:setup:getLocalIPv4s",
    device: "pm100:setup:device",
    getConnectedIps: "pm100:setup:getConnectedIps",
  },

  tool: {
    udp: {
      scanStart: "pm100tool:udp:scanStart",
      scanStop: "pm100tool:udp:scanStop",
      log: "pm100tool:udp:log",
      udp: "pm100tool:udp:udp",
      reset: "pm100tool:udp:reset",
      updateConfig: "pm100tool:udp:updateConfig",
    },

    log: {
      openWindow: "pm100tool:log:openWindow",
      append: "pm100tool:log:append",
      clear: "pm100tool:log:clear",
      getAll: "pm100tool:log:getAll",
      updated: "pm100tool:log:updated",
    },
  },

  /**
   * Backward-compatible aliases (temporary).
   * Remove after you migrate renderer + ipcMain handlers.
   */
  legacy: {
    // discovery
    discoveryScanStart: "pm100discovery:scanStart",
    discoveryScanStop: "pm100discovery:scanStop",
    discoveryGetLocalIPv4s: "pm100discovery:getLocalIPv4s",
    discoveryLog: "pm100discovery:log",
    discoveryUdp: "pm100discovery:udp",
    discoveryReset: "pm100discovery:reset",

    // setup
    setupStart: "pm100setup:start",
    setupStop: "pm100setup:stop",
    setupStatus: "pm100setup:status",
    setupLog: "pm100setup:log",
    setupGetLocalIPv4s: "pm100setup:getLocalIPv4s",
    setupDevice: "pm100setup:device",
    setupGetConnectedIps: "pm100setup:getConnectedIps",
  },
} as const;

export type PM100Channels = typeof PM100_CHANNELS;
