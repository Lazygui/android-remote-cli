const fs = require('fs-extra');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const ora = require('ora');
const log = require('./logger');

/**
 * 格式化字节大小 (e.g., 1048576 -> 1.00 MB)
 */
function formatBytes(bytes, decimals = 2) {
       if (bytes === 0) return '0 Bytes';
       const k = 1024;
       const dm = decimals < 0 ? 0 : decimals;
       const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
       const i = Math.floor(Math.log(bytes) / Math.log(k));
       return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 下载文件（进度显示）
 */
async function downloadFile(url, destPath) {
       const spinner = ora(log.chalk.blue(`准备下载: ${url}`)).start();

       try {
              const res = await fetch(url);

              if (!res.ok) {
                     throw new Error(`请求失败: ${res.status} ${res.statusText}`);
              }

              // 获取文件总大小 (可能为 null，如果服务器没返回)
              const totalSize = parseInt(res.headers.get('content-length'), 10);
              let downloadedSize = 0;

              // 创建写入流
              const fileStream = fs.createWriteStream(destPath);

              return new Promise((resolve, reject) => {
                     // 管道流向文件
                     res.body.pipe(fileStream);

                     // 监听数据传输进度
                     res.body.on('data', (chunk) => {
                            downloadedSize += chunk.length;

                            if (totalSize && !isNaN(totalSize)) {
                                   // 有总大小时：显示百分比
                                   const percent = ((downloadedSize / totalSize) * 100).toFixed(0);
                                   const formattedTotal = formatBytes(totalSize);
                                   const formattedCurrent = formatBytes(downloadedSize);

                                   // 为了防止刷新太快导致闪烁，可以加个判断或者直接赋值
                                   spinner.text = log.chalk.blue(`正在下载... ${percent}% (${formattedCurrent} / ${formattedTotal})`);
                            } else {
                                   // 没有总大小时：只显示已下载大小
                                   spinner.text = log.chalk.blue(`正在下载... ${formatBytes(downloadedSize)}`);
                            }
                     });

                     // 错误处理
                     res.body.on('error', (err) => {
                            spinner.fail(log.chalk.red('下载流中断。'));
                            fs.unlink(destPath).catch(() => { }); // 删除未完成的文件
                            reject(err);
                     });

                     // 下载完成
                     fileStream.on('finish', () => {
                            spinner.succeed(log.chalk.green(`下载完成 (${formatBytes(downloadedSize)})`));
                            resolve();
                     });

                     // 文件写入错误
                     fileStream.on('error', (err) => {
                            spinner.fail(log.chalk.red('写入文件失败。'));
                            fs.unlink(destPath).catch(() => { });
                            reject(err);
                     });
              });

       } catch (error) {
              spinner.fail(log.chalk.red(`下载初始化失败: ${error.message}`));
              throw error;
       }
}

/**
 * 解压文件
 */
async function extractZip(zipPath, destDir) {
       const spinner = ora(log.chalk.blue('正在解压文件...')).start();
       try {
              await fs.ensureDir(destDir);
              const zip = new AdmZip(zipPath);
              zip.extractAllTo(destDir, true);
              spinner.succeed(log.chalk.green('解压完成。'));
       } catch (error) {
              spinner.fail(log.chalk.red(`解压失败: ${error.message}`));
              throw error;
       }
}

module.exports = {
       downloadFile,
       extractZip
};