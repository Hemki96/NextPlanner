import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("nextPlanner2Desktop", {
  platform: process.platform,
  desktop: true
});
