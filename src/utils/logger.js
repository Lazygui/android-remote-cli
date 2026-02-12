// src/utils/logger.js
const chalk = require('chalk');

const log = {
       info: (msg) => console.log(chalk.blue(`[INFO] ${msg}`)),
       success: (msg) => console.log(chalk.green(`[SUCCESS] ${msg}`)),
       warn: (msg) => console.log(chalk.yellow(`[WARN] ${msg}`)),
       error: (msg) => console.error(chalk.red(`[ERROR] ${msg}`)),
       debug: (msg) => process.env.DEBUG && console.log(chalk.gray(`[DEBUG] ${msg}`)),
       // 导出 chalk 以便其他模块使用样式
       chalk: chalk
};

module.exports = log;