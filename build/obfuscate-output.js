const fs = require('node:fs');
const path = require('node:path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const projectRoot = path.resolve(__dirname, '..');
const candidateDirectories = [
  path.join(projectRoot, 'dist-electron'),
  path.join(projectRoot, 'dist', 'assets')
];

function collectJavaScriptFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      return collectJavaScriptFiles(absolutePath);
    }

    return absolutePath.endsWith('.js') ? [absolutePath] : [];
  });
}

function isRendererAsset(filePath) {
  return filePath.includes(`${path.sep}dist${path.sep}assets${path.sep}`);
}

function getObfuscationOptions(filePath) {
  const rendererAsset = isRendererAsset(filePath);

  return {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.35,
    deadCodeInjection: false,
    debugProtection: false,
    identifierNamesGenerator: 'hexadecimal',
    ignoreImports: true,
    renameGlobals: false,
    selfDefending: true,
    splitStrings: true,
    splitStringsChunkLength: 6,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 1,
    target: rendererAsset ? 'browser-no-eval' : 'node',
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  };
}

const files = candidateDirectories.flatMap((directoryPath) => collectJavaScriptFiles(directoryPath));

files.forEach((filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(source, getObfuscationOptions(filePath));
  fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8');
});
