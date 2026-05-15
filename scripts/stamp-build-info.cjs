const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const versionPath = path.join(repoRoot, 'VERSION');
const stampPath = path.join(repoRoot, 'BUILD_TIMESTAMP_UTC');
const pkgPath = path.join(repoRoot, 'frontend', 'my-budget-ui', 'package.json');
const tsPath = path.join(repoRoot, 'frontend', 'my-budget-ui', 'src', 'app', 'app-version.ts');

const args = process.argv.slice(2);
const bump = args.includes('--bump');
const tsFlag = args.indexOf('--timestamp');
const timestampFromArg =
  tsFlag >= 0 && args[tsFlag + 1] ? args[tsFlag + 1] : process.env.BUILD_TIMESTAMP_UTC?.trim();

function readVersion() {
  const raw = fs.readFileSync(versionPath, 'utf8').trim();
  const semverMatch = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!semverMatch) {
    console.error('VERSION must be semver major.minor.patch (e.g. 1.0.0).');
    process.exit(1);
  }
  return { raw, semverMatch };
}

function bumpPatch(semverMatch) {
  const major = semverMatch[1];
  const minor = semverMatch[2];
  const patch = Number.parseInt(semverMatch[3], 10);
  return `${major}.${minor}.${patch + 1}`;
}

function resolveTimestamp() {
  const ts = timestampFromArg || new Date().toISOString();
  if (Number.isNaN(Date.parse(ts))) {
    console.error(`Invalid build timestamp: ${ts}`);
    process.exit(1);
  }
  return new Date(ts).toISOString();
}

const { raw, semverMatch } = readVersion();
let version = raw;
if (bump) {
  version = bumpPatch(semverMatch);
  fs.writeFileSync(versionPath, `${version}\n`);
}

const buildTimestampUtc = resolveTimestamp();

fs.writeFileSync(stampPath, `${buildTimestampUtc}\n`);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

fs.writeFileSync(
  tsPath,
  `export const APP_VERSION = '${version}';\nexport const APP_BUILD_TIMESTAMP_UTC = '${buildTimestampUtc}';\n`
);

const bumpNote = bump ? ` (bumped patch → ${version})` : '';
console.log(
  `Stamped build info: version ${version}, UTC ${buildTimestampUtc}${bumpNote}`
);
