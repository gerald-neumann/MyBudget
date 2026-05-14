const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const versionPath = path.join(repoRoot, 'VERSION');
const version = fs.readFileSync(versionPath, 'utf8').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('VERSION must be semver major.minor.patch (e.g. 1.0.0).');
  process.exit(1);
}

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

console.log(`Synced app version to ${version} (UI build UTC ${buildTs})`);
