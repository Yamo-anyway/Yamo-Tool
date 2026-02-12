import { contextBridge } from "electron";
import { createPM100PreloadApi } from "./PM100Discovery/icpPreload";
import { pm100setupApi } from "./PM100Setup/icpPreload";

contextBridge.exposeInMainWorld("api", {
  pm100: createPM100PreloadApi(),
  pm100setup: pm100setupApi,
});
