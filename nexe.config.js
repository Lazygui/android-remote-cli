// nexe.config.js
module.exports = {
       // 入口文件
       input: 'index.js',

       // 输出文件名
       output: 'android-remote-cli.exe',
       target: 'win-x64-8.16.0',

       // 传递给 Node.js 运行时的命令行标志
       flags: [
              '--expose-gc', // 示例：启用垃圾回收日志
              '--max-old-space-size=4096' // 示例：设置 V8 堆大小
       ],
};