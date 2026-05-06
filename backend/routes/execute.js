const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { requireAuth } = require('../middleware/auth');
const ActivityEvent = require('../models/ActivityEvent');

const DOCKER_TIMEOUT_MS = Number(process.env.EXEC_TIMEOUT_MS || 6000);
const DOCKER_MEMORY = process.env.EXEC_MEMORY || '256m';
const DOCKER_CPUS = process.env.EXEC_CPUS || '0.5';

function getDockerBin() {
  // Some environments (like IDE-integrated shells) don't have Docker on PATH.
  // Probe common macOS locations first, then fall back to `docker` on PATH.
  const candidates = [
    process.env.DOCKER_BIN,
    '/Applications/Docker.app/Contents/Resources/bin/docker',
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
    'docker',
  ].filter(Boolean);
  return candidates;
}

function getExtraPathEntries(dockerBin) {
  const extras = [];
  // Docker Desktop credential helpers live next to the docker CLI here.
  // Ensure they're on PATH for `docker` subprocesses.
  if (typeof dockerBin === 'string' && dockerBin.includes('/Applications/Docker.app/Contents/Resources/bin/')) {
    extras.push('/Applications/Docker.app/Contents/Resources/bin');
  }
  return extras;
}

function runDocker(args, { stdin = '' } = {}) {
  return new Promise((resolve, reject) => {
    const bins = getDockerBin();
    let idx = 0;

    const tryNext = () => {
      const bin = bins[idx++];
      if (!bin) {
        const e = new Error('Docker CLI not found. Set DOCKER_BIN or install Docker Desktop.');
        e.code = 'DOCKER_NOT_FOUND';
        return reject(e);
      }

      const extraPath = getExtraPathEntries(bin);
      const envPath = [extraPath.join(':'), process.env.PATH || ''].filter(Boolean).join(':');

      const child = execFile(
        bin,
        args,
        {
          timeout: DOCKER_TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024,
          env: {
            ...process.env,
            PATH: envPath,
          },
        },
        (err, stdout, stderr) => {
          if (err) {
            // If the binary isn't found on PATH, try next candidate.
            if (err.code === 'ENOENT') return tryNext();

            const e = new Error(stderr || err.message || 'Docker execution failed');
            e.code = err.code;
            e.stdout = stdout;
            e.stderr = stderr;
            e.dockerBin = bin;
            return reject(e);
          }
          resolve({ stdout, stderr, dockerBin: bin });
        }
      );
      if (stdin) child.stdin?.write(stdin);
      child.stdin?.end();
    };

    tryNext();
  });
}

function dockerBaseArgs(tmpDir) {
  return [
    'run',
    '--rm',
    '--network',
    'none',
    '--pids-limit',
    '128',
    '--memory',
    DOCKER_MEMORY,
    '--cpus',
    DOCKER_CPUS,
    '-v',
    `${tmpDir}:/work:ro`,
    '-w',
    '/work',
  ];
}

const RUNNERS = {
  javascript: async ({ code }) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'livecode-'));
    try {
      await fs.writeFile(path.join(tmpDir, 'main.js'), code, 'utf8');
      const { stdout, stderr } = await runDocker([
        ...dockerBaseArgs(tmpDir),
        'node:20-alpine',
        'node',
        'main.js',
      ]);
      return { stdout, stderr };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  },
  python: async ({ code }) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'livecode-'));
    try {
      await fs.writeFile(path.join(tmpDir, 'main.py'), code, 'utf8');
      const { stdout, stderr } = await runDocker([
        ...dockerBaseArgs(tmpDir),
        'python:3.12-alpine',
        'python',
        'main.py',
      ]);
      return { stdout, stderr };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  },
  go: async ({ code }) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'livecode-'));
    try {
      await fs.writeFile(path.join(tmpDir, 'main.go'), code, 'utf8');
      // Need a writable container FS for build output; copy file into container instead of mounting ro.
      const { stdout, stderr } = await runDocker([
        'run',
        '--rm',
        '--network',
        'none',
        '--pids-limit',
        '128',
        '--memory',
        DOCKER_MEMORY,
        '--cpus',
        DOCKER_CPUS,
        '-v',
        `${tmpDir}:/src:ro`,
        '-w',
        '/work',
        'golang:1.22-alpine',
        'sh',
        '-lc',
        'cp /src/main.go /work/main.go && go run /work/main.go',
      ]);
      return { stdout, stderr };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  },
  rust: async ({ code }) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'livecode-'));
    try {
      await fs.writeFile(path.join(tmpDir, 'main.rs'), code, 'utf8');
      const { stdout, stderr } = await runDocker([
        'run',
        '--rm',
        '--network',
        'none',
        '--pids-limit',
        '128',
        '--memory',
        DOCKER_MEMORY,
        '--cpus',
        DOCKER_CPUS,
        '-v',
        `${tmpDir}:/src:ro`,
        '-w',
        '/work',
        'rust:1.78-alpine',
        'sh',
        '-lc',
        'cp /src/main.rs /work/main.rs && rustc /work/main.rs -O -o /work/a && /work/a',
      ]);
      return { stdout, stderr };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  },
};

router.post('/', requireAuth, async (req, res) => {
  try {
    const { code, language, roomId } = req.body;

    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, error: 'Code is required.' });
    }
    if (!RUNNERS[language]) {
      return res
        .status(400)
        .json({ success: false, error: `Language ${language} execution not supported in Docker yet.` });
    }

    const result = await RUNNERS[language]({ code });
    ActivityEvent.create({
      roomId: typeof roomId === 'string' ? roomId : 'unknown',
      userId: req.user.sub,
      username: req.user.username,
      type: 'run',
      meta: { language, bytes: Buffer.byteLength(code, 'utf8') },
    }).catch(() => {});
    res.json({
      success: true,
      output: (result.stdout || '') + (result.stderr ? `\n${result.stderr}` : ''),
      stderr: result.stderr || '',
      stdout: result.stdout || '',
    });
  } catch (err) {
    console.error('Execution error:', err.message);
    const msg = (() => {
      if (err && err.code === 'DOCKER_NOT_FOUND') {
        return 'Docker CLI not found. Set DOCKER_BIN or ensure Docker Desktop is installed.';
      }
      if (String(err.message || '').toLowerCase().includes('docker')) {
        return 'Docker execution failed. Make sure Docker Desktop is running.';
      }
      return 'Failed to execute code. Please try again later.';
    })();
    res.status(500).json({ success: false, error: msg });
  }
});

module.exports = router;
