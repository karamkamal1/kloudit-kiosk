const { contextBridge } = require('electron');

const CONFIG = {
  // REPLACE THESE VALUES LATER
  JELLYFIN_URL: 'http://192.168.1.120:8096', 
  JELLYFIN_API_KEY: '91b6e54eab8a4d2d8baefc13a592ba83',
  ANDROID_TV_ID: '143edfe5238a339431c512364fa747fd723492d0',

  JELLYSEER_URL: 'http://192.168.1.120:5055',
  JELLYSEER_API_KEY: 'MTc2NTY4MTIzMjA1NTQ0ZWQxYjkxLWZkOTYtNDU1My1hMjk3LTAwNGIxNjA0MGVhYQ=='
};

contextBridge.exposeInMainWorld('env', CONFIG);
