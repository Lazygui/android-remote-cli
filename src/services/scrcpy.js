const { spawn } = require('child_process');
const log = require('../utils/logger');
const { SCRCPY_DEFAULT_ARGS } = require('../config');
const { disconnectDevice } = require('./adb');

async function startScrcpy(scrcpyPath, adbPath, connectionString, deviceIp, devicePort) {
       return new Promise((resolve) => {
              log.info(log.chalk.cyan(`\n正在启动 Scrcpy...`));

              const args = [...SCRCPY_DEFAULT_ARGS, '-s', connectionString];

              // 如果 adbPath 是本地绝对路径，我们需要告诉 Scrcpy 在哪里找 adb
              // Scrcpy 使用 "ADB" 环境变量来定位 adb
              const env = {
                     ...process.env,
                     ADB: adbPath
              };

              log.debug(`CMD: ${scrcpyPath} ${args.join(' ')}`);

              // 使用 spawn 启动，inherit 使得 scrcpy 的输出直接显示在当前终端
              const proc = spawn(scrcpyPath, args, {
                     stdio: 'inherit',
                     shell: true, // 兼容路径空格
                     env: env     // 注入环境变量
              });

              proc.on('error', (err) => {
                     log.error(`启动 Scrcpy 失败: ${err.message}`);
                     resolve(1);
              });

              proc.on('close', async (code) => {
                     log.info(`Scrcpy 已退出 (Code ${code})`);
                     // Scrcpy 关闭后自动断开 ADB 连接
                     await disconnectDevice(adbPath, deviceIp, devicePort);
                     resolve(code);
              });
       });
}

module.exports = { startScrcpy };