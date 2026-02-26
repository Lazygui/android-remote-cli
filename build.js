const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const packageJson = require('./package.json');

// 配置区域
const NODE_VERSION = '18.5.0'; // pkg 对应的 Node 版本
const PKG_FETCH_TAG = 'v3.4';  // pkg-fetch 的版本标签
const ARCH = 'win-x64';
const CACHE_DIR = path.join(__dirname, '.pkg-cache'); // 本地缓存目录
const ICON_PATH = path.join(__dirname, 'app.ico');

// 目标文件名
const BASE_BINARY_NAME = `node-v${NODE_VERSION}-${ARCH}`;
const FETCHED_BIN_PATH = path.join(CACHE_DIR, `v${PKG_FETCH_TAG}`, `fetched-v${NODE_VERSION}-${ARCH}`);
const BUILT_BIN_PATH = path.join(CACHE_DIR, `v${PKG_FETCH_TAG}`, `built-v${NODE_VERSION}-${ARCH}`);

// 下载函数
function download(url, dest) {
       return new Promise((resolve, reject) => {
              const file = fs.createWriteStream(dest);
              https.get(url, (response) => {
                     if (response.statusCode === 302 || response.statusCode === 301) {
                            download(response.headers.location, dest).then(resolve).catch(reject);
                     } else if (response.statusCode === 200) {
                            response.pipe(file);
                            file.on('finish', () => {
                                   file.close(resolve);
                            });
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
       console.log('------------------------------------------------');
       console.log('🚀 开始构建 (预编译引擎修改方案)');
       console.log('------------------------------------------------');

       // 1. 设置环境变量，强制 pkg 使用我们本地的缓存目录
       process.env.PKG_CACHE_PATH = CACHE_DIR;

       // 准备目录
       const versionDir = path.dirname(FETCHED_BIN_PATH);
       if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });

       // 2. 检查并下载 Base Binary
       if (!fs.existsSync(FETCHED_BIN_PATH)) {
              console.log(`[1/4] 正在下载 Node.js ${NODE_VERSION} 基础引擎...`);
              const url = `https://github.com/vercel/pkg-fetch/releases/download/${PKG_FETCH_TAG}/${BASE_BINARY_NAME}`;
              try {
                     await download(url, FETCHED_BIN_PATH);
                     console.log('  -> 下载完成');
              } catch (e) {
                     console.error('❌ 下载失败:', e);
                     process.exit(1);
              }
       } else {
              console.log(`[1/4] 使用已缓存的基础引擎`);
       }

       // 3. 修改 Base Binary (注入资源)
       console.log(`[2/4] 正在修改引擎资源 (Resedit v3)...`);

       // 动态导入 resedit v3
       const { NtExecutable, NtExecutableResource, Resource, Data } = await import('resedit');

       const data = fs.readFileSync(FETCHED_BIN_PATH);
       const exe = NtExecutable.from(data);
       const res = NtExecutableResource.from(exe);

       // --- A. 注入图标 ---
       if (fs.existsSync(ICON_PATH)) {
              const iconFile = Data.IconFile.from(fs.readFileSync(ICON_PATH));
              Resource.IconGroupEntry.replaceIconsForResource(
                     res.entries,
                     1, // 图标 ID
                     1033,
                     iconFile.icons.map(item => item.data)
              );
              console.log('  -> 图标注入完成');
       }

       // --- B. 注入版本信息 ---
       const viList = Resource.VersionInfo.fromEntries(res.entries);
       const vi = viList.length > 0 ? viList[0] : Resource.VersionInfo.createEmpty();

       const v = (packageJson.version || '1.0.0').split('.').map(Number);
       while (v.length < 4) v.push(0);

       // 移除原始文件名（重要，防止杀软误报）
       vi.removeStringValue({ lang: 1033, codepage: 1200 }, 'OriginalFilename');
       vi.removeStringValue({ lang: 1033, codepage: 1200 }, 'InternalName');

       vi.setFileVersion(v[0], v[1], v[2], v[3]);
       vi.setProductVersion(v[0], v[1], v[2], v[3]);

       vi.setStringValues(
              { lang: 1033, codepage: 1200 },
              {
                     FileDescription: packageJson.description || 'Android Remote CLI',
                     ProductName: 'Android Remote CLI',
                     CompanyName: packageJson.author || 'My Studio',
                     LegalCopyright: `Copyright (C) ${new Date().getFullYear()}`,
                     OriginalFilename: 'android-remote-cli.exe'
              }
       );

       vi.outputToResourceEntries(res.entries);
       res.outputResource(exe);

       // 4. 保存为 "built" 状态
       // pkg 的机制是：如果在 cache 里发现了 built-xxx 文件，它就会直接用，不再重新计算哈希
       console.log(`[3/4] 保存修改后的引擎到缓存...`);
       const newBinary = exe.generate();
       fs.writeFileSync(BUILT_BIN_PATH, Buffer.from(newBinary));

       // 5. 调用 pkg 进行打包
       console.log(`[4/4] 正式打包业务代码...`);
       const outputExe = path.join('dist', 'android-remote-cli.exe');

       // 确保输出目录存在
       if (!fs.existsSync('dist')) fs.mkdirSync('dist');

       try {
              // 注意：这里必须指定 --cache 目录或者依赖上面的 process.env.PKG_CACHE_PATH
              // 这里的 -t node18-win-x64 必须与上面下载的版本一致
              execSync(`npx pkg . -t node18-win-x64 --output ${outputExe}`, {
                     stdio: 'inherit',
                     env: { ...process.env, PKG_CACHE_PATH: CACHE_DIR }
              });
              console.log('------------------------------------------------');
              console.log(`✅ 构建成功！`);
              console.log(`文件路径: ${outputExe}`);
              console.log('------------------------------------------------');
       } catch (err) {
              console.error('❌ pkg 打包阶段失败');
              process.exit(1);
       }
}

build().catch(console.error);