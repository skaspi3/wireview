import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const wireviewDir = path.resolve(scriptDir, '..');
const publicVersionPath = path.join(wireviewDir, 'public', 'VERSION');
const repoVersionPath = path.resolve(wireviewDir, '..', 'VERSION');

const readBuildNumber = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
};

const currentPublic = readBuildNumber(publicVersionPath);
const currentRepo = readBuildNumber(repoVersionPath);
const current = Math.max(currentPublic ?? 0, currentRepo ?? 0);
const next = current + 1;
const nextText = `${next}\n`;

fs.mkdirSync(path.dirname(publicVersionPath), { recursive: true });
fs.writeFileSync(publicVersionPath, nextText, 'utf8');

if (fs.existsSync(repoVersionPath)) {
  fs.writeFileSync(repoVersionPath, nextText, 'utf8');
}

console.log(`[build-version] ${current} -> ${next}`);
