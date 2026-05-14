const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const versionPath = path.join(repoRoot, 'VERSION');
const raw = fs.readFileSync(versionPath, 'utf8').trim();
const semverMatch = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);

if (!semverMatch) {
  console.error('VERSION must be semver major.minor.patch (e.g. 1.0.0).');
  process.exit(1);
}

const major = semverMatch[1];
const minor = semverMatch[2];
const patch = Number.parseInt(semverMatch[3], 10);
const version = `${major}.${minor}.${patch + 1}`;

fs.writeFileSync(versionPath, `${version}\n`);

const pkgPath = path.join(repoRoot, 'frontend', 'my-budget-ui', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const tsPath = path.join(repoRoot, 'frontend', 'my-budget-ui', 'src', 'app', 'app-version.ts');
const buildTs = new Date().toISOString();
fs.writeFileSync(
  tsPath,
  `export const APP_VERSION = '${version}';\nexport const APP_BUILD_TIMESTAMP_UTC = '${buildTs}';\n`
);

console.log(`Bumped patch → ${version}, synced package.json and app-version.ts (UI build UTC ${buildTs})`);
