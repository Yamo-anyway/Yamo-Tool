import { ipcRenderer } from "electron";
import { PM100_CHANNELS } from "../../../../ipc/channels";

export const pm100toolLogApi = {
  openWindow: () =>
    ipcRenderer.invoke(PM100_CHANNELS.tool.log.openWindow) as Promise<boolean>,

  append: (line: string) => {
    ipcRenderer.send(PM100_CHANNELS.tool.log.append, line);
  },

  clear: () =>
    ipcRenderer.invoke(PM100_CHANNELS.tool.log.clear) as Promise<boolean>,

  getAll: () =>
    ipcRenderer.invoke(PM100_CHANNELS.tool.log.getAll) as Promise<string>,

  onUpdated: (cb: (allText: string) => void) => {
    const handler = (_: any, allText: string) => cb(allText);
    ipcRenderer.on(PM100_CHANNELS.tool.log.updated, handler);
    return () =>
      ipcRenderer.removeListener(PM100_CHANNELS.tool.log.updated, handler);
  },
};
