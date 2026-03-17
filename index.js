const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execSync, spawn } = require('child_process');
const inquirer = require('inquirer');
const AdmZip = require('adm-zip');
const axios = require('axios');

// 配置常量
const APP_DIR = path.join(os.homedir(), '.android-remote-cli');
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const SCRCPY_VERSION = 'v3.3.4';
const SCRCPY_FILENAME = `scrcpy-win64-${SCRCPY_VERSION}`;
const DOWNLOAD_URL = `https://github.com/Genymobile/scrcpy/releases/download/${SCRCPY_VERSION}/${SCRCPY_FILENAME}.zip`;

let ADB_PATH = 'adb';
let SCRCPY_PATH = 'scrcpy';

// --- 退出清理逻辑 ---
async function cleanupAndExit() {
       console.log('\n正在停止 ADB 服务并退出...');
       try {
              execSync(`"${ADB_PATH}" kill-server`, { stdio: 'ignore' });
       } catch (e) { }
       process.exit(0);
}

process.on('SIGINT', async () => await cleanupAndExit());

(async () => {
       try {
              console.log("正在初始化 Android Remote CLI...");
              await ensureAppDir();

              const hasEnv = await checkCommandExists('scrcpy');
              if (hasEnv) {
                     console.log('✔ 检测到 scrcpy 环境变量。');
              } else {
                     const localScrcpyPath = path.join(APP_DIR, SCRCPY_FILENAME);
                     if (fs.existsSync(localScrcpyPath) && fs.existsSync(path.join(localScrcpyPath, 'scrcpy.exe'))) {
                            console.log(`✔ 检测到本地 scrcpy 目录: ${SCRCPY_VERSION}`);
                            SCRCPY_PATH = path.join(localScrcpyPath, 'scrcpy.exe');
                            ADB_PATH = path.join(localScrcpyPath, 'adb.exe');
                     } else {
                            console.log('× 未检测到 scrcpy，准备下载...');
                            await downloadAndExtract(localScrcpyPath);
                            SCRCPY_PATH = path.join(localScrcpyPath, 'scrcpy.exe');
                            ADB_PATH = path.join(localScrcpyPath, 'adb.exe');
                     }
              }

              while (true) {
                     await mainMenu();
              }

       } catch (error) {
              console.error('\n发生严重错误:', error.message);
              process.stdin.setRawMode(true);
              process.stdin.resume();
              process.stdin.on('data', async () => await cleanupAndExit());
       }
})();

// --- 工具函数 ---
async function ensureAppDir() {
       if (!fs.existsSync(APP_DIR)) fs.mkdirSync(APP_DIR);
}

function checkCommandExists(command) {
       return new Promise(resolve => exec(`where ${command}`, (err) => resolve(!err)));
}

function loadConfig() {
       if (fs.existsSync(CONFIG_FILE)) {
              try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch (e) { return {}; }
       }
       return { ipList: [], savePort: false };
}

function saveConfig(config) {
       fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function runExec(command) {
       return new Promise((resolve) => {
              exec(command, (error, stdout, stderr) => resolve(stdout + stderr));
       });
}

async function downloadAndExtract(targetDir) {
       const zipPath = path.join(APP_DIR, 'scrcpy.zip');
       try {
              console.log(`正在下载: ${DOWNLOAD_URL}`);
              const { data, headers } = await axios({ url: DOWNLOAD_URL, method: 'GET', responseType: 'stream' });
              const totalLength = headers['content-length'];
              const writer = fs.createWriteStream(zipPath);
              let downloaded = 0;
              data.on('data', (chunk) => {
                     downloaded += chunk.length;
                     process.stdout.write(`\r下载进度: ${((downloaded / totalLength) * 100).toFixed(2)}%`);
              });
              data.pipe(writer);
              await new Promise((resolve, reject) => {
                     writer.on('finish', resolve);
                     writer.on('error', reject);
              });
              console.log('\n解压中...');
              const zip = new AdmZip(zipPath);
              zip.extractAllTo(APP_DIR, true);
              fs.unlinkSync(zipPath);
              console.log('✔ 准备就绪。');
       } catch (err) {
              console.error('\n下载失败。');
              process.exit(1);
       }
}

// --- 菜单逻辑 ---
async function mainMenu() {
       const config = loadConfig();
       const choices = [];

       (config.ipList || []).forEach((item) => {
              const displayName = config.savePort ? `${item.ip}:${item.port}` : item.ip;
              choices.push({ name: `连接设备: ${displayName}`, value: { action: 'CONNECT', data: item } });
       });

       choices.push(new inquirer.Separator());
       choices.push({ name: '➕ 手动输入新 IP', value: { action: 'MANUAL' } });

       if (config.ipList && config.ipList.length > 0) {
              choices.push({ name: '❌ 删除记录 (多选)', value: { action: 'DELETE' } });
       }

       choices.push({ name: '🚪 退出软件', value: { action: 'EXIT' } });

       const answer = await inquirer.prompt([{
              type: 'list',
              name: 'main',
              message: '请选择操作:',
              choices: choices,
              pageSize: 20,
              loop: false
       }]);

       switch (answer.main.action) {
              case 'EXIT': await cleanupAndExit(); break;
              case 'DELETE': await deleteIpLogic(); break;
              case 'MANUAL': await startConnection(null); break;
              case 'CONNECT': await startConnection(answer.main.data); break;
       }
}

async function deleteIpLogic() {
       const config = loadConfig();
       const answer = await inquirer.prompt([{
              type: 'checkbox',
              name: 'toDelete',
              message: '请选择要删除的记录 (空格勾选):',
              choices: config.ipList.map(item => ({ name: `${item.ip}:${item.port}`, value: item }))
       }]);

       if (answer.toDelete.length > 0) {
              config.ipList = config.ipList.filter(item =>
                     !answer.toDelete.some(del => del.ip === item.ip && del.port === item.port)
              );
              saveConfig(config);
              console.log('✔ 已删除。');
       }
}

// --- 连接核心逻辑 ---
async function startConnection(selectedItem) {
       let config = loadConfig();
       let currentIp = selectedItem ? selectedItem.ip : '';
       let currentPort = selectedItem ? selectedItem.port : '5555';

       let needsIpInput = !selectedItem;
       let needsPortInput = !selectedItem || config.savePort === false;

       while (true) {
              if (needsIpInput) {
                     const input = await inquirer.prompt([
                            { type: 'input', name: 'ip', message: '请输入设备 IP 地址:', default: currentIp, validate: i => i ? true : '必填' }
                     ]);
                     currentIp = input.ip;
              }

              if (needsPortInput) {
                     const input = await inquirer.prompt([
                            { type: 'input', name: 'port', message: `请输入端口:`, default: currentPort }
                     ]);
                     currentPort = input.port;
              }

              console.log(`\n正在重启 ADB 服务...`);
              await runExec(`"${ADB_PATH}" kill-server`);
              await runExec(`"${ADB_PATH}" start-server`);

              const target = `${currentIp}:${currentPort}`;
              console.log(`正在尝试连接 ${target} ...`);

              const connectResult = await runExec(`"${ADB_PATH}" connect ${target}`);

              // 1. 连接成功
              if (connectResult.includes(`connected to`)) {
                     console.log(`✔ 已连接。`);

                     // 只有成功才保存/更新列表
                     const configObj = loadConfig();
                     const newList = (configObj.ipList || []).filter(i => i.ip !== currentIp);
                     newList.unshift({ ip: currentIp, port: currentPort });
                     configObj.ipList = newList;
                     saveConfig(configObj);

                     await runScrcpy(target);
                     return;
              }

              // 2. 10061 端口错误
              if (connectResult.includes('10061')) {
                     console.error(`\n❌ 提示: 端口 [${currentPort}] 错误 (目标计算机积极拒绝)`);
                     console.log(`请检查手机上的无线调试端口是否已更改。`);
                     needsIpInput = false;
                     needsPortInput = true;
                     continue;
              }

              // 3. 10060 IP/端口无效
              if (connectResult.includes('10060')) {
                     console.error(`\n❌ 提示: 连接超时 (10060)，IP 地址 [${currentIp}] 或端口可能无效。`);

                     // 确保无效 IP 不在列表中
                     const configObj = loadConfig();
                     configObj.ipList = (configObj.ipList || []).filter(i => i.ip !== currentIp);
                     saveConfig(configObj);

                     needsIpInput = true;
                     needsPortInput = true;
                     continue;
              }

              // 4. 需要配对
              if (connectResult.includes(`failed to connect`)) {
                     console.log('连接失败，尝试进行无线配对...');
                     const pairInput = await inquirer.prompt([
                            { type: 'input', name: 'port', message: '请输入配对端口 (Pairing Port):' },
                            { type: 'input', name: 'code', message: '请输入配对码 (Pairing Code):' }
                     ]);

                     console.log(`正在执行配对...`);
                     let pairResult = await runExec(`"${ADB_PATH}" pair ${currentIp}:${pairInput.port} ${pairInput.code}`);

                     if (pairResult.includes('Successfully paired')) {
                            console.log('✔ 配对成功，重新连接...');
                            needsIpInput = false;
                            needsPortInput = false;
                            continue;
                     } else {
                            console.log(pairResult.trim());
                            console.error('× 配对失败，返回主菜单。');
                            return;
                     }
              }

              // 其他未知错误，打印出来以便调试
              console.error('× 发生错误:');
              console.log(connectResult.trim());
              return;
       }
}

function runScrcpy(target) {
       return new Promise((resolve) => {
              // 去掉 shell: true 并使用数组形式传递参数，避免 DeprecationWarning
              const child = spawn(SCRCPY_PATH, ['-s', target], {
                     stdio: 'inherit',
                     windowsHide: false
              });

              child.on('close', resolve);
              child.on('error', (err) => {
                     console.error('无法启动 scrcpy:', err.message);
                     resolve();
              });
       });
}