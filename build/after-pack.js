const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveResourcesPath(context) {
  if (context.electronPlatformName === 'darwin') {
    const appBundleName = `${context.packager.appInfo.productFilename}.app`;
    return path.join(context.appOutDir, appBundleName, 'Contents', 'Resources');
  }

  return path.join(context.appOutDir, 'resources');
}

function walkFiles(rootPath, currentPath = rootPath) {
  if (!fs.existsSync(currentPath)) {
    return [];
  }

  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(rootPath, absolutePath);
    }

    return [absolutePath];
  });
}

exports.default = async function afterPack(context) {
  const resourcesPath = resolveResourcesPath(context);
  const candidates = [
    path.join(resourcesPath, 'app.asar'),
    path.join(resourcesPath, 'app-config.json'),
    ...walkFiles(path.join(resourcesPath, 'app.asar.unpacked'))
  ]
    .filter((absolutePath) => fs.existsSync(absolutePath))
    .map((absolutePath) => ({
      absolutePath,
      path: path.relative(resourcesPath, absolutePath).replace(/\\/g, '/')
    }));

  const manifest = {
    files: candidates.map((entry) => ({
      path: entry.path,
      sha256: sha256File(entry.absolutePath)
    }))
  };

  fs.writeFileSync(
    path.join(resourcesPath, 'integrity.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
};
