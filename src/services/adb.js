const ora = require('ora');
const log = require('../utils/logger');
const { runCommand } = require('../utils/shell');
const { getErrorCode } = require('../utils/errorMatcher');
const { saveGuid } = require('./history');

/**
 * 解析并强制校验 IP:Port 格式
 */
function parseIpPort(input) {
       if (!input) throw new Error('输入不能为空。');

       const parts = input.split(':');
       // 强制要求必须包含端口
       if (parts.length !== 2 || !parts[1]) {
              throw new Error('格式错误：必须包含端口号 (例如 192.168.1.5:37899)');
       }

       const ip = parts[0];
       const port = parseInt(parts[1], 10);

       if (isNaN(port)) throw new Error(`无效端口: ${parts[1]}`);

       // 简单的 IP 校验 regex
       if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
              throw new Error(`无效 IP 格式: ${ip}`);
       }

       return { ip, port };
}

/**
 * 连接设备
 * 如果遇到认证问题，抛出带 code='AUTH_FAILED' 的错误
 */
async function connectDevice(adbPath, connectionString) {
       let output = '';
       try {
              // 获取所有输出本体
              output = await runCommand(`"${adbPath}"`, ['connect', connectionString]);
       } catch (error) {
              output = error.message;
       }

       // 1. 先判断是否成功
       if (output.toLowerCase().includes('connected')) {
              return { success: true };
       }

       // 2. 如果不成功，通过正则系统提取 Code
       const errorCode = getErrorCode(output);

       // 抛出一个带 code 的错误
       const err = new Error(output);
       err.code = errorCode;
       throw err;
}
/**
 * 执行无线配对
 * adb pair ip:port code
 */
async function pairDevice(adbPath, ip, port, code) {
       const pairString = `${ip}:${port}`;
       let spinner = ora(log.chalk.blue(`正在尝试配对: ${pairString}...`)).start();

       try {
              await runCommand(`"${adbPath}"`, ['kill-server']);

              const res = await runCommand(`"${adbPath}"`, ['pair', pairString, code]);
              const out = res.toLowerCase()
              if (out.includes('successfully paired')) {
                     const guidMatch = out.match(/\[guid=([^\]]+)\]/);
                     const guid = guidMatch ? guidMatch[1] : 'unknown';
                     console.log("🚀 ~ pairDevice ~ guid:", guid)
                     if (guid !== 'unknown') {

                     } else {
                            await saveGuid(guid);
                     }

              }

       } catch (error) {
              console.log("🚀 ~ pairDevice ~ error:", error)
              const info = error.message.toLowerCase();

              // 如果捕获到协议故障，尝试重启 server 后重试一次
              if (info.includes('protocol fault')) {
                     spinner.text = log.chalk.yellow('检测到 ADB 协议冲突，正在重置服务...');
                     try {
                            await runCommand(`"${adbPath}"`, ['kill-server']);
                            await runCommand(`"${adbPath}"`, ['start-server']);
                            spinner.text = log.chalk.blue('服务已重置，正在重新尝试配对...');

                            // 二次尝试
                            const res2 = await runCommand(`"${adbPath}"`, ['pair', pairString, code]);
                            if (res2.stdout.toLowerCase().includes('successfully paired')) {
                                   spinner.succeed(log.chalk.green('配对成功！'));
                                   return true;
                            }
                     } catch (e) { /* 失败则进入下面的报错 */ }
              }

              spinner.fail(log.chalk.red('配对失败'));
              throw error;
       }
}

async function disconnectDevice(adbPath, ip, port) {
       if (!adbPath) return;
       try {
              // 某些情况下 disconnect 需要完整 ip:port
              await runCommand(`"${adbPath}"`, ['disconnect', `${ip}:${port}`]);
              // 也可以尝试 disconnect all 防止残留
              // await runCommand(`"${adbPath}"`, ['disconnect']); 
              log.success('已断开连接。');
       } catch (e) { /* ignore */ }
}

async function killAdbServer(adbPath) {
       try {
              await runCommand(`"${adbPath}"`, ['kill-server']);
              return true;
       } catch (error) {
              return false;
       }
}

module.exports = {
       parseIpPort,
       connectDevice,
       pairDevice,
       disconnectDevice,
       killAdbServer
};