/**
 * 预加载:contextBridge 暴露最小安全 API。
 * 预留 opal.* —— 后续在此桥接本地 @opal/runtime(propose/diff/commit + 事件流),
 * 让桌面壳脱离浏览器 CORS 直接跑端到端实链路(IPC → 主进程 runtime)。
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('opal', {
  version: '0.0.1',
  platform: process.platform,
});
