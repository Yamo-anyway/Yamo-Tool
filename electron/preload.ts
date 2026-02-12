import { contextBridge } from "electron";
import { createPM100PreloadApi } from "./PM100Discovery/icpPreload";

contextBridge.exposeInMainWorld("api", {
  pm100: createPM100PreloadApi(),
});
