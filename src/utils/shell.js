const { spawn } = require('child_process');

async function runCommand(command, args = [], options = {}) {
       return new Promise((resolve, reject) => {
              const proc = spawn(command, args, {
                     stdio: 'pipe',
                     shell: true,
                     ...options
              });

              let output = '';
              proc.stdout.on('data', d => output += d.toString());
              proc.stderr.on('data', d => output += d.toString());

              proc.on('close', (code) => {
                     const result = output.trim();
                     if (code === 0) {
                            resolve(result);
                     } else {
                            // 即使 code != 0，也将捕获到的所有文本作为错误信息抛出
                            reject(new Error(result || `Exit code ${code}`));
                     }
              });

              proc.on('error', (err) => {
                     reject(err);
              });
       });
}

module.exports = { runCommand };