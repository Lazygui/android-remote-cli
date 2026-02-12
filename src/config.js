const path = require('path');
const os = require('os');

const TOOLS_DIR = path.join(os.homedir(), '.android-remote-cli');

module.exports = {
       TOOLS_DIR: TOOLS_DIR,
       HISTORY_FILE: path.join(TOOLS_DIR, 'history.json'),
       METADATA_FILE: path.join(TOOLS_DIR, 'metadata.json'),

       TOOLS: {
              scrcpy: {
                     name: 'scrcpy',
                     filename: 'scrcpy.exe',
                     type: 'dynamic',
                     getUrl: (v) => `https://github.com/Genymobile/scrcpy/releases/download/${v}/scrcpy-win64-${v}.zip`,
                     getInnerPath: (v) => `scrcpy-win64-${v}/scrcpy.exe`,
                     getFolderName: (v) => `scrcpy-win64-${v}`
              }
       },

       SCRCPY_DEFAULT_ARGS: ['--max-size=1024', '--video-bit-rate=16M', '--audio-bit-rate=64K']
};