const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const packageJson = require('./package.json');

// --- 配置区域 ---
const NODE_VERSION = '18.5.0';
const PKG_FETCH_TAG = 'v3.4';
const ARCH = 'win-x64';
const ROOT_PATH = __dirname;
const CACHE_DIR = path.join(ROOT_PATH, '.pkg-cache');
const ICON_PATH = path.join(ROOT_PATH, 'app.ico');
const EXE_NAME = 'android-remote-cli.exe';

const FETCHED_FILENAME = `fetched-v${NODE_VERSION}-${ARCH}`;
const FETCHED_BIN_PATH = path.join(CACHE_DIR, `v${PKG_FETCH_TAG}`, FETCHED_FILENAME);

function download(url, dest) {
       return new Promise((resolve, reject) => {
              const file = fs.createWriteStream(dest);
              https.get(url, (response) => {
                     if (response.statusCode === 302 || response.statusCode === 301) {
                            download(response.headers.location, dest).then(resolve).catch(reject);
                     } else if (response.statusCode === 200) {
                            response.pipe(file);
                            file.on('finish', () => file.close(resolve));
                     } else {
                            reject(`Server responded with ${response.statusCode}`);
                     }
              }).on('error', (err) => {
                     fs.unlink(dest, () => { });
                     reject(err.message);
              });
       });
}

async function build() {
       console.log('🚀 开始构建流程');

       // 1. 检查图标
       if (!fs.existsSync(ICON_PATH)) {
              console.error(`❌ 错误: 找不到图标文件 ${ICON_PATH}。请检查是否已提交到 Git。`);
              process.exit(1);
       } else {
              console.log(`✅ 找到图标文件: ${ICON_PATH}`);
       }

       // 2. 准备缓存目录
       const versionDir = path.dirname(FETCHED_BIN_PATH);
       if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });

       // 3. 下载/获取基础引擎
       if (!fs.existsSync(FETCHED_BIN_PATH)) {
              console.log(`[1/3] 正在下载基础引擎...`);
              const url = `https://github.com/vercel/pkg-fetch/releases/download/${PKG_FETCH_TAG}/node-v${NODE_VERSION}-${ARCH}`;
              await download(url, FETCHED_BIN_PATH);
       } else {
              console.log(`[1/3] 使用缓存的引擎`);
       }

       // 4. 修改引擎资源
       console.log(`[2/3] 正在注入图标和版本信息...`);
       const { NtExecutable, NtExecutableResource, Resource, Data } = await import('resedit');

       const data = fs.readFileSync(FETCHED_BIN_PATH);
       const exe = NtExecutable.from(data);
       const res = NtExecutableResource.from(exe);

       // 图标注入
       const iconFile = Data.IconFile.from(fs.readFileSync(ICON_PATH));
       Resource.IconGroupEntry.replaceIconsForResource(
              res.entries, 1, 1033, iconFile.icons.map(item => item.data)
       );

       // 版本注入
       const viList = Resource.VersionInfo.fromEntries(res.entries);
       const vi = viList.length > 0 ? viList[0] : Resource.VersionInfo.createEmpty();
       const v = (packageJson.version || '1.0.0').split('.').map(Number);
       while (v.length < 4) v.push(0);

       vi.setFileVersion(v[0], v[1], v[2], v[3]);
       vi.setProductVersion(v[0], v[1], v[2], v[3]);
       vi.setStringValues({ lang: 1033, codepage: 1200 }, {
              FileDescription: 'Android 远程桌面连接工具',
              ProductName: 'Android Remote CLI',
              CompanyName: 'My Studio',
              LegalCopyright: `Copyright (C) ${new Date().getFullYear()}`,
              OriginalFilename: EXE_NAME
       });
       vi.outputToResourceEntries(res.entries);
       res.outputResource(exe);

       // ⚠️ 关键：直接覆盖 fetched 文件，确保 pkg 强制使用它
       fs.writeFileSync(FETCHED_BIN_PATH, Buffer.from(exe.generate()));
       console.log(`  -> 引擎修改完成并保存至: ${FETCHED_BIN_PATH}`);

       // 5. 打包代码
       console.log(`[3/3] 正式打包业务代码...`);
       if (!fs.existsSync('dist')) fs.mkdirSync('dist');
       const outputExe = path.join('dist', EXE_NAME);

       try {
              // 在 Windows Actions 环境中，直接通过 npx 运行并显式传入环境变量
              execSync(`npx pkg . -t node18-win-x64 --output "${outputExe}"`, {
                     stdio: 'inherit',
                     env: { ...process.env, PKG_CACHE_PATH: CACHE_DIR }
              });
              console.log(`✅ 构建成功: ${outputExe}`);
       } catch (err) {
              console.error('❌ 打包失败');
              process.exit(1);
       }
}

build().catch(console.error);