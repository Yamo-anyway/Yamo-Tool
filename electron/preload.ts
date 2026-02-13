import { contextBridge } from "electron";
import { pm100discoveryApi } from "./features/pm100/discovery/icpPreload";
import { pm100setupApi } from "./features/pm100/setup/icpPreload";
import { pm100toolUdpApi } from "./features/pm100/tool/udp/icpPreload";
import { pm100toolLogApi } from "./features/pm100/tool/log/icpPreload";

contextBridge.exposeInMainWorld("api", {
  pm100: {
    discovery: pm100discoveryApi,
    setup: pm100setupApi,
    tool: {
      udp: pm100toolUdpApi,
      log: pm100toolLogApi,
    },
  },
});
