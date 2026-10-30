'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tick', {
  login: (email, password) => ipcRenderer.invoke('login', { email, password }),
  projects: () => ipcRenderer.invoke('projects'),
  start: (project) => ipcRenderer.invoke('start', { project }),
  stop: () => ipcRenderer.invoke('stop'),
  logout: () => ipcRenderer.invoke('logout'),
  getState: () => ipcRenderer.invoke('getState'),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
  onState: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on('state', h);
    return () => ipcRenderer.removeListener('state', h);
  }
});
