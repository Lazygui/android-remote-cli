const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageJson = require('./package.json');
const EXE_NAME = 'Android-Remote.exe';
const ICON_PATH = 'app.ico';
const DIST_PATH = 'dist';
const EXE_PATH = path.join(DIST_PATH, EXE_NAME);

async function build() {
       console.log('------------------------------------------------');
       console.log('🚀 开始构建流程');
       console.log('------------------------------------------------');

       // 【关键修复点】在这里动态导入 resedit
       // 因为 resedit 是 ESM 模块，在 CommonJS 中必须这样导入
       const { NtExecutable, NtExecutableResource, Resource, Data } = await import('resedit');

       // 1. 准备目录
       if (!fs.existsSync(DIST_PATH)) fs.mkdirSync(DIST_PATH);

       // 2. 执行 pkg 打包
       console.log(`[1/3] 正在使用 pkg 打包到 ${EXE_PATH} ...`);
       try {
              execSync(`npx pkg . --targets node18-win-x64 --output ${EXE_PATH}`, { stdio: 'inherit' });
       } catch (error) {
              console.error('❌ pkg 打包失败');
              process.exit(1);
       }

       // 3. 注入资源
       console.log('[2/3] 正在解析并注入资源...');

       if (!fs.existsSync(EXE_PATH)) {
              console.error('❌ 未找到生成的 EXE 文件，终止。');
              process.exit(1);
       }

       const buffer = fs.readFileSync(EXE_PATH);
       const executable = NtExecutable.from(buffer);
       const res = NtExecutableResource.from(executable);

       // --- A. 注入图标 ---
       if (fs.existsSync(ICON_PATH)) {
              console.log('  -> 正在注入图标...');
              const iconData = fs.readFileSync(ICON_PATH);
              const iconFile = Data.IconFile.from(iconData);

              // 自动查找现有图标 ID 并替换
              const existingIconGroups = res.entries.filter(entry => entry.type === 14);
              let targetIconID = existingIconGroups.length > 0 ? existingIconGroups[0].id : 1;

              console.log(`  -> 目标图标 ID: ${targetIconID}`);

              const iconBuffers = iconFile.icons.map(item => item.data);
              Resource.IconGroupEntry.replaceIconsForResource(
                     res.entries,
                     targetIconID,
                     1033,
                     iconBuffers
              );
       } else {
              console.warn(`  -> ⚠️ 未找到 ${ICON_PATH}`);
       }

       // --- B. 注入版本信息 ---
       console.log('  -> 正在注入版本信息...');
       const viList = Resource.VersionInfo.fromEntries(res.entries);
       const vi = viList.length > 0 ? viList[0] : Resource.VersionInfo.create(1, 0, 0, 0, 1033, 1200);

       const versionParts = (packageJson.version || '1.0.0').split('.').map(Number);
       while (versionParts.length < 4) versionParts.push(0);

       vi.setFileVersion(versionParts[0], versionParts[1], versionParts[2], versionParts[3]);
       vi.setProductVersion(versionParts[0], versionParts[1], versionParts[2], versionParts[3]);

       vi.setStringValues(
              { lang: 1033, codepage: 1200 },
              {
                     FileDescription: 'Android 远程桌面连接工具',
                     ProductName: 'Android Remote CLI',
                     CompanyName: 'My Studio',
                     OriginalFilename: EXE_NAME,
                     LegalCopyright: `Copyright (C) ${new Date().getFullYear()}`,
                     FileVersion: packageJson.version,
                     ProductVersion: packageJson.version
              }
       );
       vi.outputToResourceEntries(res.entries);

       // 4. 保存文件
       console.log('[3/3] 正在生成最终文件...');
       res.outputResource(executable);

       const newBinary = executable.generate();
       // 将 ArrayBuffer 转回 Buffer
       fs.writeFileSync(EXE_PATH, Buffer.from(newBinary));

       console.log('------------------------------------------------');
       console.log(`✅ 构建成功！文件位于: ${EXE_PATH}`);
       console.log('------------------------------------------------');
}

build().catch(err => {
       console.error('❌ 构建错误:', err);
       process.exit(1);
});