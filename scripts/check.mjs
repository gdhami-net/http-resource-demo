// One command, three claims. Starts the recording server, runs the Angular
// unit-test target against it, shuts the server down, and passes the runner's
// exit code straight through.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8931';

async function waitForServer(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

// A server left over from an earlier run would answer /health and quietly make
// the whole check meaningless, so refuse to start on top of one.
const alreadyThere = await fetch(`${BASE}/health`).then(
  (r) => r.ok,
  () => false,
);
if (alreadyThere) {
  console.error(`Something is already listening on ${BASE}. Stop it and run the check again.`);
  process.exit(1);
}

const server = spawn(process.execPath, [path.join(root, 'server', 'record-server.mjs')], {
  cwd: root,
  stdio: ['ignore', 'inherit', 'inherit'],
});

let exitCode = 1;
try {
  if (!(await waitForServer())) {
    throw new Error(`recording server did not come up on ${BASE}`);
  }

  const ng = spawn(process.execPath, [path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'test'], {
    cwd: root,
    stdio: 'inherit',
  });
  const [code] = await once(ng, 'exit');
  exitCode = code ?? 1;
} catch (error) {
  console.error(String(error));
  exitCode = 1;
} finally {
  server.kill();
}

process.exit(exitCode);
