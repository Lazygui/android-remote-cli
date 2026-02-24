const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { NtExecutable, NtExecutableResource, Resource, Data } = require('resedit');


const packageJson = require('./package.json');
const EXE_NAME = 'android-remote-cli.exe';
const ICON_PATH = 'app.ico';
const DIST_PATH = 'dist';
const EXE_PATH = path.join(DIST_PATH, EXE_NAME);

async function build() {
       console.log('------------------------------------------------');
       console.log('🚀 开始构建流程');
       console.log('------------------------------------------------');

       if (!fs.existsSync(DIST_PATH)) fs.mkdirSync(DIST_PATH);

       console.log(`[1/3] 正在使用 pkg 打包...`);
       try {
              execSync(`npx pkg . --targets node18-win-x64 --output ${EXE_PATH}`, { stdio: 'inherit' });
       } catch (error) {
              process.exit(1);
       }

       console.log('[2/3] 正在解析并注入资源...');

       const buffer = fs.readFileSync(EXE_PATH);
       const executable = NtExecutable.from(buffer);
       const res = NtExecutableResource.from(executable);

       // --- A. 智能注入图标 (修复图标不显示的问题) ---
       if (fs.existsSync(ICON_PATH)) {
              console.log('  -> 正在读取新图标...');
              const iconData = fs.readFileSync(ICON_PATH);
              const iconFile = Data.IconFile.from(iconData);

              // 1. 查找现有的图标 ID
              // RT_GROUP_ICON 的类型 ID 是 14
              const existingIconGroups = res.entries.filter(entry => entry.type === 14);

              let targetIconID = 1; // 默认标准 Windows 图标 ID

              if (existingIconGroups.length > 0) {
                     // 如果找到了现有图标，就替换它 (通常是 ID 1)
                     targetIconID = existingIconGroups[0].id;
                     console.log(`  -> 发现现有图标 ID: ${targetIconID}，将执行替换。`);
              } else {
                     console.log(`  -> 未发现现有图标，将使用默认 ID: ${targetIconID} 进行添加。`);
              }

              const iconBuffers = iconFile.icons.map(item => item.data);

              Resource.IconGroupEntry.replaceIconsForResource(
                     res.entries,
                     targetIconID, // 使用自动检测到的 ID
                     1033,
                     iconBuffers
              );
              console.log('  -> 图标注入完成。');
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
       fs.writeFileSync(EXE_PATH, Buffer.from(newBinary));

       console.log('------------------------------------------------');
       console.log(`✅ 构建成功！\n⚠️ 注意: 如果图标没变，请将文件重命名或移动到其他文件夹以清除 Windows 缓存。`);
       console.log('------------------------------------------------');
}

build().catch(console.error);