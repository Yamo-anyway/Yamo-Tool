import { contextBridge } from "electron";
import { pm100ToolTcpApi } from "./features/pm100/tool/tcp/ipcPreload";
import { pm100ToolUdpApi } from "./features/pm100/tool/udp/ipcPreload";

contextBridge.exposeInMainWorld("api", {
  pm100: {
    tool: {
      tcp: pm100ToolTcpApi,
      udp: pm100ToolUdpApi,
    },
  },
});
