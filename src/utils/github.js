// src/utils/github.js
const fetch = require('node-fetch');
const log = require('./logger');

// 备用版本，防止 GitHub API 彻底无法访问时程序崩溃
const FALLBACK_VERSION = 'v3.3.4';

async function getLatestScrcpyVersion() {
       const apiUrl = 'https://api.github.com/repos/Genymobile/scrcpy/releases/latest';

       try {
              log.info('正在检查 Scrcpy 最新版本...');

              // 设置超时，避免在网络不佳时无限等待
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 5000); // 5秒超时

              const res = await fetch(apiUrl, { signal: controller.signal });
              clearTimeout(timeout);

              if (res.ok) {
                     const data = await res.json();
                     const tagName = data.tag_name;
                     return tagName;
              } else {
                     throw new Error(`GitHub API returned ${res.status}`);
              }
       } catch (error) {
              log.warn(`获取最新版本失败 (${error.message})，将使用默认版本: ${FALLBACK_VERSION}`);
              return FALLBACK_VERSION;
       }
}

module.exports = {
       getLatestScrcpyVersion
};