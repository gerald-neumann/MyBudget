#!/usr/bin/env node
const result = require('child_process').spawnSync(
  process.execPath,
  [require.resolve('./stamp-build-info.cjs'), '--bump'],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
