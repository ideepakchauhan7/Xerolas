const path = require('node:path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');

esbuild
  .build({
    entryPoints: {
      'electron/main': path.join(projectRoot, 'electron', 'main.ts'),
      'electron/preload': path.join(projectRoot, 'electron', 'preload.ts')
    },
    outdir: path.join(projectRoot, 'dist-electron'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
    legalComments: 'none',
    logLevel: 'info',
    tsconfig: path.join(projectRoot, 'tsconfig.main.json')
  })
  .catch(() => {
    process.exit(1);
  });
