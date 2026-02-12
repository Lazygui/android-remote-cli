const ERROR_RULES = require('../../config/errorRules');

/**
 * 将配置中的占位符字符串转换为正则对象
 */
function convertToRegExp(pattern) {
       if (pattern instanceof RegExp) return pattern;

       // 预定义占位符对应的正则片段
       const ipRegex = '\\d{1,3}(?:\\.\\d{1,3}){3}';
       const portRegex = '\\d+';

       // 替换占位符并转义基础特殊字符
       let escaped = pattern
              .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 先转义正则保留字
              .replace(/ip\\:port/g, `${ipRegex}:${portRegex}`) // 替换 ip:port
              .replace(/ip/g, ipRegex)
              .replace(/port/g, portRegex);

       return new RegExp(escaped, 'i'); // 不区分大小写
}

/**
 * 根据错误信息获取错误码
 * @param {string} message ADB 返回的原始文本
 * @returns {string} 匹配到的 code，未匹配到返回 'UNKNOWN_ERROR'
 */
function getErrorCode(message) {
       if (!message) return 'UNKNOWN_ERROR';

       for (const rule of ERROR_RULES) {
              const regex = convertToRegExp(rule.regular);
              if (regex.test(message)) {
                     return rule.code;
              }
       }

       return 'UNKNOWN_ERROR';
}

module.exports = { getErrorCode };