'use strict';

const { execFileSync } = require('child_process');

const port = Number(process.env.PORT || 3001);

function run(command, args) {
  execFileSync(command, args, { stdio: 'ignore' });
}

function getListeningPids() {
  if (process.platform !== 'win32') {
    return [];
  }

  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$ErrorActionPreference='SilentlyContinue'; Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -ExpandProperty OwningProcess -Unique`
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    );

    const pids = new Set();
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const pid = Number(trimmed);
      if (Number.isInteger(pid) && pid > 0) {
        pids.add(pid);
      }
    }

    return [...pids];
  } catch (err) {
    return [];
  }
}

function waitForPortFree(timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (getListeningPids().length === 0) {
      return true;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }

  return getListeningPids().length === 0;
}

if (process.platform === 'win32') {
  const pids = getListeningPids();

  for (const pid of pids) {
    try {
      run('taskkill', ['/PID', String(pid), '/T', '/F']);
    } catch (err) {
      process.stderr.write(`Warning: failed to stop PID ${pid} on port ${port}.\n`);
    }
  }

  if (!waitForPortFree(5000)) {
    process.stderr.write(`Warning: port ${port} is still busy after cleanup.\n`);
  }
}
