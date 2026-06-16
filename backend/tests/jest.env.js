// Runs before every test file (see jest.config.js `setupFiles`).
//
// Prefer a locally-installed `mongod` binary so mongodb-memory-server does NOT
// need to download one at test time (that download is slow/blocked in some
// environments and causes every beforeAll hook to time out). If no system binary
// is found, we leave the env untouched and mongodb-memory-server downloads as
// usual — so this stays portable across dev machines and CI.

const { execSync } = require('child_process');
const fs = require('fs');

if (!process.env.MONGOMS_SYSTEM_BINARY) {
  const candidates = [];

  // First, whatever is on PATH.
  try {
    const onPath = execSync('command -v mongod', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (onPath) candidates.push(onPath);
  } catch (_) {
    // mongod not on PATH — fall through to well-known locations.
  }

  // Common install locations (Linux + macOS/Homebrew).
  candidates.push('/usr/bin/mongod', '/usr/local/bin/mongod', '/opt/homebrew/bin/mongod');

  const found = candidates.find((p) => p && fs.existsSync(p));
  if (found) {
    process.env.MONGOMS_SYSTEM_BINARY = found;
  }
}
