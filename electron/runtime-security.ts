import { createHash } from 'node:crypto';
import fs from 'node:fs';
import inspector from 'node:inspector';
import path from 'node:path';

interface IntegrityFileRecord {
  path: string;
  sha256: string;
}

interface IntegrityManifest {
  files?: IntegrityFileRecord[];
}

type FileSystemLike = Pick<typeof fs, 'existsSync' | 'readFileSync'>;

let originalFsModule: FileSystemLike | null | undefined;

function requiresRawFilesystem(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.endsWith('.asar') || normalizedPath.includes('.asar/');
}

function getIntegrityFilesystem(filePath: string): FileSystemLike {
  if (!requiresRawFilesystem(filePath)) {
    return fs;
  }

  if (originalFsModule !== undefined) {
    return originalFsModule ?? fs;
  }

  try {
    originalFsModule = require('original-fs') as FileSystemLike;
  } catch {
    originalFsModule = null;
  }

  return originalFsModule ?? fs;
}

function sha256File(filePath: string): string {
  const fileSystem = getIntegrityFilesystem(filePath);
  const hash = createHash('sha256');
  hash.update(fileSystem.readFileSync(filePath));
  return hash.digest('hex');
}

function normalizeFingerprint(value: string): string {
  return value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
}

function getRuntimeSecurityOverride(): boolean {
  return process.env.CONTEXT_AI_ALLOW_DEBUG === '1';
}

function detectExecArgvFlags(): string[] {
  return process.execArgv.filter((value) =>
    /(inspect|debug|remote-debugging-port)/i.test(value)
  );
}

function detectProcessArgvFlags(): string[] {
  return process.argv.filter((value) =>
    /(inspect|debug|remote-debugging-port|remote-debugging-pipe)/i.test(value)
  );
}

function detectNodeOptionsFlags(): string[] {
  const nodeOptions = process.env.NODE_OPTIONS ?? '';
  return /(inspect|debug)/i.test(nodeOptions) ? [nodeOptions] : [];
}

function detectLinuxTracer(): string[] {
  if (process.platform !== 'linux') {
    return [];
  }

  try {
    const status = fs.readFileSync('/proc/self/status', 'utf8');
    const tracerLine = status
      .split('\n')
      .find((line) => line.startsWith('TracerPid:'));
    if (!tracerLine) {
      return [];
    }

    const tracerPid = Number(tracerLine.split(':')[1]?.trim() ?? '0');
    return tracerPid > 0 ? [`TracerPid=${tracerPid}`] : [];
  } catch {
    return [];
  }
}

function detectVirtualMachineHints(): string[] {
  if (process.platform !== 'linux') {
    return [];
  }

  const candidatePaths = [
    '/sys/class/dmi/id/product_name',
    '/sys/class/dmi/id/sys_vendor',
    '/sys/class/dmi/id/product_version'
  ];

  const vmIndicators = ['virtualbox', 'vmware', 'kvm', 'qemu', 'parallels', 'hyper-v', 'virtual machine'];
  const matches: string[] = [];

  candidatePaths.forEach((candidatePath) => {
    try {
      if (!fs.existsSync(candidatePath)) {
        return;
      }

      const value = fs.readFileSync(candidatePath, 'utf8').trim();
      const lowerValue = value.toLowerCase();
      if (vmIndicators.some((indicator) => lowerValue.includes(indicator))) {
        matches.push(`${path.basename(candidatePath)}=${value}`);
      }
    } catch {
      // Ignore unreadable hints.
    }
  });

  return matches;
}

export function assertRuntimeSecurity(): void {
  if (!process.env.NODE_ENV && !process.env.VITE_DEV_SERVER_URL) {
    // No-op, just keeping bundled production and development behavior explicit.
  }

  if (!process.env.ELECTRON_RUN_AS_NODE && getRuntimeSecurityOverride()) {
    return;
  }

  if (!process.defaultApp && !process.env.VITE_DEV_SERVER_URL) {
    const signals = [
      ...detectProcessArgvFlags(),
      ...detectExecArgvFlags(),
      ...detectNodeOptionsFlags(),
      ...detectLinuxTracer(),
      ...detectVirtualMachineHints()
    ];

    if (inspector.url()) {
      signals.push(`inspector=${inspector.url()}`);
    }

    if (signals.length) {
      throw new Error(
        `Runtime security check failed: ${signals.join(', ')}. Set CONTEXT_AI_ALLOW_DEBUG=1 only for trusted internal testing.`
      );
    }
  }
}

export function verifyPackagedIntegrity(resourcesPath: string): void {
  const manifestPath = path.join(resourcesPath, 'integrity.json');
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as IntegrityManifest;
  const files = Array.isArray(manifest.files) ? manifest.files : [];

  files.forEach((record) => {
    if (
      !record ||
      typeof record.path !== 'string' ||
      !record.path.trim() ||
      typeof record.sha256 !== 'string' ||
      !record.sha256.trim()
    ) {
      throw new Error('Integrity manifest is malformed.');
    }

    const absolutePath = path.join(resourcesPath, record.path);
    const fileSystem = getIntegrityFilesystem(absolutePath);
    if (!fileSystem.existsSync(absolutePath)) {
      throw new Error(`Integrity check failed. Missing resource: ${record.path}`);
    }

    const actualHash = normalizeFingerprint(sha256File(absolutePath));
    const expectedHash = normalizeFingerprint(record.sha256);
    if (actualHash !== expectedHash) {
      throw new Error(`Integrity check failed for ${record.path}.`);
    }
  });
}
