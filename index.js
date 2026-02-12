#!/usr/bin/env node

const inquirer = require('inquirer');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const log = require('./src/utils/logger');
const { getToolPath, showManualInstruction } = require('./src/services/setup');
const { parseIpPort, connectDevice, pairDevice, disconnectDevice, killAdbServer } = require('./src/services/adb');
const { startScrcpy } = require('./src/services/scrcpy');
const { getHistory, saveIp, deleteHistoryItems } = require('./src/services/history');

async function main() {
       console.log(log.chalk.bold.cyan('\n===== Scrcpy 远程显示 CLI 工具 (Pro) =====\n'));

       // 0. 系统检查
       if (os.platform() !== 'win32') {
              log.error('此工具仅支持 Windows。');
              process.exit(1);
       }

       // 1. 环境准备
       const scrcpyResult = await getToolPath('scrcpy');
       if (!scrcpyResult.success) {
              showManualInstruction([scrcpyResult]);
              process.exit(1);
       }
       const scrcpyPath = scrcpyResult.path;

       // 自动定位 adb.exe
       let adbPath = path.isAbsolute(scrcpyPath)
              ? path.join(path.dirname(scrcpyPath), 'adb.exe')
              : 'adb.exe';

       if (path.isAbsolute(adbPath) && !(await fs.pathExists(adbPath))) {
              log.error(`找不到 Scrcpy 目录下的 ADB: ${adbPath}`);
              process.exit(1);
       }

       /**
        * 统一退出逻辑
        */
       const exitApp = async () => {
              console.log('\n');
              log.info('正在清理资源并关闭 ADB...');
              try { await killAdbServer(adbPath); } catch (e) { }
              log.info('谢谢使用，再见！');
              process.exit(0);
       };

       process.removeAllListeners('SIGINT');
       process.on('SIGINT', async () => {
              log.chalk.yellow('\n检测到中断信号...');
              await exitApp();
       });

       // --- 主循环 ---
       while (true) {
              const history = await getHistory();
              const choices = [...history];
              if (history.length > 0) {
                     choices.push(new inquirer.Separator());
                     choices.push({ name: log.chalk.red('❌ 批量删除历史记录...'), value: 'DELETE_MENU' });
              }
              choices.push({ name: log.chalk.green('➕ 添加新设备...'), value: 'NEW' });
              choices.push({ name: '🚪 退出程序', value: 'EXIT' });

              const { action } = await inquirer.prompt([{
                     type: 'list',
                     name: 'action',
                     message: '请选择要连接的设备:',
                     choices: choices
              }]);

              if (action === 'EXIT') { await exitApp(); return; }

              // 逻辑：批量删除
              if (action === 'DELETE_MENU') {
                     const { selectedIps } = await inquirer.prompt([{
                            type: 'checkbox',
                            name: 'selectedIps',
                            message: '请选择要删除的记录 (空格键勾选):',
                            choices: history
                     }]);
                     if (selectedIps.length > 0) {
                            await deleteHistoryItems(selectedIps);
                            log.success(`已成功删除 ${selectedIps.length} 条记录。`);
                     }
                     continue;
              }

              // 逻辑：确定目标 IP
              let targetIp = (action === 'NEW') ? '' : action;
              if (action === 'NEW') {
                     const { newIp } = await inquirer.prompt([{
                            type: 'input',
                            name: 'newIp',
                            message: '请输入设备 [IP:端口] (例如 192.168.1.5:37899):',
                            validate: input => {
                                   try {
                                          parseIpPort(input);
                                          return true;
                                   } catch (e) { return e.message; }
                            }
                     }]);
                     targetIp = newIp;
              }

              const connInfo = parseIpPort(targetIp);
              const connectionString = `${connInfo.ip}:${connInfo.port}`;

              // --- 执行连接与配对流程 ---
              let isConnected = false;
              try {
                     await connectDevice(adbPath, connectionString);
                     isConnected = true;
              } catch (error) {
                     // 匹配正则系统返回的错误码
                     switch (error.code) {
                            case 'AUTH_FAILED':
                                   console.log(log.chalk.yellow('\n[提示] 该设备尚未配对 (Android 11+)。'));
                                   console.log(log.chalk.gray('请在手机上点击: 无线调试 -> 使用配对码配对设备'));

                                   const pairParams = await inquirer.prompt([
                                          {
                                                 type: 'input',
                                                 name: 'pairPort',
                                                 message: '请输入显示的【配对端口】:',
                                                 validate: v => /^\d+$/.test(v) || '必须是数字'
                                          },
                                          {
                                                 type: 'input',
                                                 name: 'pairCode',
                                                 message: '请输入 6 位【配对码】:',
                                                 validate: v => /^\d+$/.test(v) || '必须是数字'
                                          }
                                   ]);

                                   try {
                                          await pairDevice(adbPath, connInfo.ip, pairParams.pairPort, pairParams.pairCode);
                                          log.info('配对成功，正在尝试最终连接...');
                                          await connectDevice(adbPath, connectionString);
                                          isConnected = true;
                                   } catch (e) {
                                          log.error(`配对连接失败: ${e.message}`);
                                   }
                                   break;

                            case 'NETWORK_REFUSED':
                                   log.error(`\n❌ 连接被拒绝 (Connection Refused)`);
                                   console.log(log.chalk.cyan('建议检查：'));
                                   console.log(' 1. 手机是否开启了“无线调试”开关？');
                                   console.log(' 2. IP 地址是否变化？(无线调试端口每次开启都会变)');
                                   console.log(' 3. 手机和电脑是否在同一 Wi-Fi 网络？');
                                   break;

                            case 'ADB_SERVER_ERROR':
                                   log.error(`\n❌ ADB 协议故障 (Protocol Fault)`);
                                   log.info('正在尝试重启 ADB 服务并重连...');
                                   try {
                                          await killAdbServer(adbPath);
                                          await connectDevice(adbPath, connectionString);
                                          isConnected = true;
                                   } catch (e) {
                                          log.error('重启服务后依然无法连接，请尝试插拔 USB 重新开启无线调试。');
                                   }
                                   break;

                            case 'DEVICE_OFFLINE':
                                   log.error('设备当前离线，请在手机上重新开关无线调试。');
                                   break;

                            default:
                                   log.error(`连接失败: ${error.message}`);
                     }
              }

              // --- 启动投屏 ---
              if (isConnected) {
                     await saveIp(targetIp); // 只有连上了才保存/更新历史顺序
                     try {
                            log.info('正在启动投屏窗口...');
                            const code = await startScrcpy(scrcpyPath, adbPath, connectionString, connInfo.ip, connInfo.port);
                            if (code === 0) {
                                   log.info(log.chalk.yellow('\n投屏窗口已正常关闭。'));
                            }
                     } catch (scrcpyError) {
                            log.error(`投屏运行时出错: ${scrcpyError.message}`);
                     }
              }

              console.log(log.chalk.gray('\n正在返回主菜单...\n'));
       }
}

main().catch(async (err) => {
       log.error('程序发生不可预期的致命错误: ' + err.message);
       process.exit(1);
});