const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const log = require('../utils/logger');
const { downloadFile, extractZip } = require('../utils/downloader');
const { getLatestScrcpyVersion } = require('../utils/github');
const { TOOLS_DIR, TOOLS } = require('../config');
const { getMetadata, saveMetadata } = require('./history');

/**
 * 获取 Scrcpy 路径（包含静默版本检查）
 */

async function getScrcpyPath() {
       const config = TOOLS.scrcpy;
       const metadata = await getMetadata();
       const localVersion = metadata.scrcpy_version;

       const getLocalExePath = (v) => path.join(TOOLS_DIR, config.getInnerPath(v));
       const currentExePath = localVersion ? getLocalExePath(localVersion) : null;

       // --- 1. 获取最新版本号 (完全静默) ---
       let latestVersion;
       try {
              // 这里调用的函数内部不能有 log.info
              latestVersion = await getLatestScrcpyVersion();
       } catch (e) {
              // 网络失败时，静默使用本地版
              if (localVersion && await fs.pathExists(currentExePath)) {
                     return { success: true, path: currentExePath };
              }
              throw new Error('无法连接 GitHub 且本地无可用版本，请检查网络。');
       }

       // --- 2. 检查本地是否存在 ---
       const isLocalExist = localVersion && await fs.pathExists(currentExePath);

       // 情况 A: 本地没有，或者文件丢失 -> 此时才打印 "正在下载..."
       if (!isLocalExist) {
              log.info(`未发现本地 Scrcpy，准备下载最新版 ${latestVersion}...`);
              return await downloadAndInstall(latestVersion);
       }

       // 情况 B: 版本一致 -> [完全静默] 直接返回，不打印任何东西
       if (localVersion === latestVersion) {
              return { success: true, path: currentExePath };
       }

       // 情况 C: 版本不一致 -> 此时才显示检测结果并询问
       console.log(log.chalk.yellow(`\n[更新提示] 发现 Scrcpy 新版本: ${localVersion} -> ${latestVersion}`));
       const { shouldUpdate } = await inquirer.prompt([{
              type: 'confirm',
              name: 'shouldUpdate',
              message: '是否立即下载更新并删除旧版本?',
              default: true
       }]);

       if (shouldUpdate) {
              const oldFolderPath = path.join(TOOLS_DIR, config.getFolderName(localVersion));
              log.info(`正在清理旧版本: ${localVersion}...`);
              await fs.remove(oldFolderPath).catch(() => { });
              return await downloadAndInstall(latestVersion);
       }

       // 用户选了不更新，也静默返回
       return { success: true, path: currentExePath };
}

/**
 * 执行下载、解压、保存版本号的任务
 */
async function downloadAndInstall(version) {
       const config = TOOLS.scrcpy;
       const downloadUrl = config.getUrl(version);
       const localExePath = path.join(TOOLS_DIR, config.getInnerPath(version));

       await fs.ensureDir(TOOLS_DIR);
       const tempZip = path.join(TOOLS_DIR, `scrcpy_${version}_temp.zip`);

       try {
              log.info(`正在下载 Scrcpy ${version}...`);
              await downloadFile(downloadUrl, tempZip);

              log.info('正在解压并安装...');
              await extractZip(tempZip, TOOLS_DIR);

              await fs.remove(tempZip);

              // 写入版本号到 metadata.json
              await saveMetadata({ scrcpy_version: version });

              log.success(`Scrcpy ${version} 已准备就绪！`);
              return { success: true, path: localExePath };
       } catch (error) {
              log.error(`操作失败: ${error.message}`);
              return {
                     success: false,
                     name: 'Scrcpy',
                     error: error.message,
                     downloadUrl
              };
       }
}

module.exports = {
       getToolPath: async (key) => {
              if (key === 'scrcpy') return await getScrcpyPath();
       }
};