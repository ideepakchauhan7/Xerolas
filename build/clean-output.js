const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectories = ['dist', 'dist-electron'];

for (const directory of outputDirectories) {
  fs.rmSync(path.join(projectRoot, directory), { recursive: true, force: true });
}
