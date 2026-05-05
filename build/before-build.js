const fs = require('node:fs');
const path = require('node:path');

function loadDeveloperConfig() {
  const projectRoot = path.resolve(__dirname, '..');
  const localConfigPath = path.join(projectRoot, 'config', 'app-config.local.json');

  try {
    if (!fs.existsSync(localConfigPath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
  } catch {
    return {};
  }
}

exports.default = async function beforeBuild() {
  const projectRoot = path.resolve(__dirname, '..');
  const outputPath = path.join(projectRoot, 'build', 'app-config.json');
  const localConfig = loadDeveloperConfig();
  const backendBaseUrl =
    process.env.CONTEXT_AI_BACKEND_URL ||
    process.env.CONTEXT_AI_GATEWAY_URL ||
    localConfig.backendBaseUrl ||
    '';
  const bundledConfig = {
    updateGithubOwner:
      process.env.CONTEXT_AI_UPDATE_GITHUB_OWNER || localConfig.updateGithubOwner || 'ideepakchauhan7',
    updateGithubRepo:
      process.env.CONTEXT_AI_UPDATE_GITHUB_REPO || localConfig.updateGithubRepo || 'Xerolas-downloads',
    defaultQuickActionId:
      process.env.CONTEXT_AI_DEFAULT_QUICK_ACTION_ID ||
      localConfig.defaultQuickActionId ||
      'describe',
    defaultPromptTemplate:
      process.env.CONTEXT_AI_DEFAULT_PROMPT ||
      localConfig.defaultPromptTemplate ||
      'Answer the most useful question about this selected content. Focus on the main subject, solve or explain the visible content when possible, ignore browser or app chrome unless it matters, and keep the answer concise, grounded, and practical. Use plain text only.'
  };

  if (backendBaseUrl) {
    bundledConfig.backendBaseUrl = backendBaseUrl;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(bundledConfig, null, 2)}\n`, 'utf8');
};
