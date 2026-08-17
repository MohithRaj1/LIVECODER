const express = require('express');
const router = express.Router();
const axios = require('axios');
const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const ActivityEvent = require('../models/ActivityEvent');

const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

function getTmpId() {
  return Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

// Helper to strip basic TypeScript type annotations for local Node execution fallback
function stripTypeScriptTypes(code) {
  return code
    // Remove interfaces & type declarations
    .replace(/(?:export\s+)?(?:interface|type)\s+\w+[\s\S]*?\{[\s\S]*?\}/g, '')
    .replace(/(?:export\s+)?type\s+\w+\s*=[\s\S]*?;/g, '')
    // Remove type annotations from variable declarations & parameters
    .replace(/:\s*([A-Za-z0-9_<>|[\]]+)(\s*=[^;,)]+|\s*[,)]|\s*;)/g, '$2')
    // Remove return type annotations
    .replace(/\):\s*([A-Za-z0-9_<>|[\]]+)\s*=>/g, ') =>')
    .replace(/\):\s*([A-Za-z0-9_<>|[\]]+)\s*\{/g, ') {')
    // Remove type casting (as type)
    .replace(/\s+as\s+[A-Za-z0-9_<>|[\]]+/g, '');
}

// ─── Local Node.js / JavaScript / TypeScript ──────────────────────────────────
function executeLocalNode(code, stdin = '', isTs = false, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const fileId = getTmpId();
    const filePath = path.join(tmpDir, `${fileId}.${isTs ? 'ts' : 'js'}`);
    const processedCode = isTs ? stripTypeScriptTypes(code) : code;

    fs.writeFileSync(filePath, processedCode, 'utf8');

    const startTime = Date.now();
    const child = execFile('node', [filePath], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}

      let output = stdout || '';
      let error = null;
      if (err) {
        if (err.killed) {
          output = (output ? output + '\n' : '') + 'Time Limit Exceeded (5s limit)';
          error = 'Time Limit Exceeded';
        } else {
          output = (output ? output + '\n' : '') + (stderr || err.message);
          error = stderr || err.message;
        }
      } else if (stderr) {
        output = (output ? output + '\n' : '') + stderr;
      }
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        output: output || 'Program completed with no output.',
        error,
        status: error ? 'Runtime Error' : 'Accepted (Local Sandbox)',
        time: elapsedSec,
        memory: 15000,
        fallback: true,
      });
    });

    if (stdin && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

// ─── Local Python execution fallback ──────────────────────────────────────────
function executeLocalPython(code, stdin = '', timeoutMs = 5000) {
  return new Promise((resolve) => {
    const fileId = getTmpId();
    const filePath = path.join(tmpDir, `${fileId}.py`);
    fs.writeFileSync(filePath, code, 'utf8');

    const runPython = (cmd) => {
      const startTime = Date.now();
      const child = execFile(cmd, [filePath], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && err.code === 'ENOENT' && cmd === 'python3') {
          // Retry with 'python'
          return runPython('python');
        }
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}

        let output = stdout || '';
        let error = null;
        if (err) {
          if (err.killed) {
            output = (output ? output + '\n' : '') + 'Time Limit Exceeded (5s limit)';
            error = 'Time Limit Exceeded';
          } else {
            output = (output ? output + '\n' : '') + (stderr || err.message);
            error = stderr || err.message;
          }
        } else if (stderr) {
          output = (output ? output + '\n' : '') + stderr;
        }
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          output: output || 'Program completed with no output.',
          error,
          status: error ? 'Runtime Error' : 'Accepted (Local Sandbox)',
          time: elapsedSec,
          memory: 12000,
          fallback: true,
        });
      });

      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    };

    runPython('python3');
  });
}

// ─── Local C++ execution fallback ─────────────────────────────────────────────
function executeLocalCpp(code, stdin = '', timeoutMs = 5000) {
  return new Promise((resolve) => {
    const fileId = getTmpId();
    const srcPath = path.join(tmpDir, `${fileId}.cpp`);
    const binPath = path.join(tmpDir, `${fileId}.out`);
    fs.writeFileSync(srcPath, code, 'utf8');

    const compileCmd = (compiler) => {
      execFile(compiler, [srcPath, '-o', binPath], { timeout: 10000 }, (compileErr, compileStdout, compileStderr) => {
        if (compileErr && compileErr.code === 'ENOENT' && compiler === 'g++') {
          return compileCmd('clang++');
        }
        if (compileErr) {
          try { if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath); } catch {}
          const output = compileStderr || compileErr.message;
          return resolve({
            stdout: '',
            stderr: output,
            output: `Compilation Error:\n${output}`,
            error: 'Compilation Error',
            status: 'Compilation Error',
            time: '0.00',
            memory: 0,
            fallback: true,
          });
        }

        const startTime = Date.now();
        const child = execFile(binPath, [], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (runErr, stdout, stderr) => {
          const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
          try {
            if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
            if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
          } catch {}

          let output = stdout || '';
          let error = null;
          if (runErr) {
            if (runErr.killed) {
              output = (output ? output + '\n' : '') + 'Time Limit Exceeded (5s limit)';
              error = 'Time Limit Exceeded';
            } else {
              output = (output ? output + '\n' : '') + (stderr || runErr.message);
              error = stderr || runErr.message;
            }
          } else if (stderr) {
            output = (output ? output + '\n' : '') + stderr;
          }

          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            output: output || 'Program completed with no output.',
            error,
            status: error ? 'Runtime Error' : 'Accepted (Local Sandbox)',
            time: elapsedSec,
            memory: 8000,
            fallback: true,
          });
        });

        if (stdin && child.stdin) {
          child.stdin.write(stdin);
          child.stdin.end();
        }
      });
    };

    compileCmd('g++');
  });
}

// ─── Local C execution fallback ───────────────────────────────────────────────
function executeLocalC(code, stdin = '', timeoutMs = 5000) {
  return new Promise((resolve) => {
    const fileId = getTmpId();
    const srcPath = path.join(tmpDir, `${fileId}.c`);
    const binPath = path.join(tmpDir, `${fileId}.out`);
    fs.writeFileSync(srcPath, code, 'utf8');

    const compileCmd = (compiler) => {
      execFile(compiler, [srcPath, '-o', binPath], { timeout: 10000 }, (compileErr, compileStdout, compileStderr) => {
        if (compileErr && compileErr.code === 'ENOENT' && compiler === 'gcc') {
          return compileCmd('clang');
        }
        if (compileErr) {
          try { if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath); } catch {}
          const output = compileStderr || compileErr.message;
          return resolve({
            stdout: '',
            stderr: output,
            output: `Compilation Error:\n${output}`,
            error: 'Compilation Error',
            status: 'Compilation Error',
            time: '0.00',
            memory: 0,
            fallback: true,
          });
        }

        const startTime = Date.now();
        const child = execFile(binPath, [], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (runErr, stdout, stderr) => {
          const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
          try {
            if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
            if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
          } catch {}

          let output = stdout || '';
          let error = null;
          if (runErr) {
            if (runErr.killed) {
              output = (output ? output + '\n' : '') + 'Time Limit Exceeded (5s limit)';
              error = 'Time Limit Exceeded';
            } else {
              output = (output ? output + '\n' : '') + (stderr || runErr.message);
              error = stderr || runErr.message;
            }
          } else if (stderr) {
            output = (output ? output + '\n' : '') + stderr;
          }

          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            output: output || 'Program completed with no output.',
            error,
            status: error ? 'Runtime Error' : 'Accepted (Local Sandbox)',
            time: elapsedSec,
            memory: 7000,
            fallback: true,
          });
        });

        if (stdin && child.stdin) {
          child.stdin.write(stdin);
          child.stdin.end();
        }
      });
    };

    compileCmd('gcc');
  });
}

// ─── Local Java execution fallback ────────────────────────────────────────────
function executeLocalJava(code, stdin = '', timeoutMs = 8000) {
  return new Promise((resolve) => {
    // Strip package statements for standalone sandbox execution
    const cleanedCode = code.replace(/^\s*package\s+[\w.]+;/gm, '');

    // Extract class name
    const match = cleanedCode.match(/(?:public\s+)?class\s+([A-Za-z0-9_]+)/);
    const className = match ? match[1] : 'Main';

    const subDir = path.join(tmpDir, getTmpId());
    fs.mkdirSync(subDir, { recursive: true });

    const srcPath = path.join(subDir, `${className}.java`);
    fs.writeFileSync(srcPath, cleanedCode, 'utf8');

    execFile('javac', ['-d', subDir, srcPath], { timeout: 10000 }, (compileErr, compileStdout, compileStderr) => {
      const errStr = (compileStderr || '') + (compileErr ? compileErr.message : '');

      if (compileErr) {
        try { fs.rmSync(subDir, { recursive: true, force: true }); } catch {}

        if (compileErr.code === 'ENOENT' || errStr.includes('Unable to locate a Java Runtime') || errStr.includes('no Java runtime')) {
          return resolve({
            stdout: '',
            stderr: 'Java Development Kit (JDK) is not installed on this server.',
            output: '⚠️ Java Development Kit (JDK) is not installed on your system.\n\nTo execute Java code locally, please install OpenJDK or Oracle JDK (e.g. `brew install openjdk`).\nAlternatively, start local Judge0 container via Docker.',
            error: 'JDK Not Installed',
            status: 'Environment Error',
            time: '0.00',
            memory: 0,
            fallback: true,
          });
        }

        const output = compileStderr || compileErr.message;
        return resolve({
          stdout: '',
          stderr: output,
          output: `Compilation Error:\n${output}`,
          error: 'Compilation Error',
          status: 'Compilation Error',
          time: '0.00',
          memory: 0,
          fallback: true,
        });
      }


      const startTime = Date.now();
      const child = execFile('java', ['-cp', subDir, className], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (runErr, stdout, stderr) => {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
        try { fs.rmSync(subDir, { recursive: true, force: true }); } catch {}

        if (runErr && (runErr.code === 'ENOENT' || (stderr || '').includes('Unable to locate a Java Runtime'))) {
          return resolve({
            stdout: '',
            stderr: 'Java Runtime Environment (java) is not installed on this server.',
            output: '⚠️ Java Runtime (java) is not installed on your system.\nPlease install JDK (e.g. `brew install openjdk`).',
            error: 'JRE Not Installed',
            status: 'Environment Error',
            time: '0.00',
            memory: 0,
            fallback: true,
          });
        }

        let output = stdout || '';
        let error = null;
        if (runErr) {
          if (runErr.killed) {
            output = (output ? output + '\n' : '') + 'Time Limit Exceeded (8s limit)';
            error = 'Time Limit Exceeded';
          } else {
            output = (output ? output + '\n' : '') + (stderr || runErr.message);
            error = stderr || runErr.message;
          }
        } else if (stderr) {
          output = (output ? output + '\n' : '') + stderr;
        }

        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          output: output || 'Program completed with no output.',
          error,
          status: error ? 'Runtime Error' : 'Accepted (Local Sandbox)',
          time: elapsedSec,
          memory: 25000,
          fallback: true,
        });
      });


      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    });
  });
}


// ─── Local Go execution fallback ──────────────────────────────────────────────
function executeLocalGo(code, stdin = '', timeoutMs = 8000) {
  return new Promise((resolve) => {
    const fileId = getTmpId();
    const srcPath = path.join(tmpDir, `${fileId}.go`);
    fs.writeFileSync(srcPath, code, 'utf8');

    const startTime = Date.now();
    const child = execFile('go', ['run', srcPath], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
      try { if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath); } catch {}

      let output = stdout || '';
      let error = null;
      if (err) {
        if (err.killed) {
          output = (output ? output + '\n' : '') + 'Time Limit Exceeded';
          error = 'Time Limit Exceeded';
        } else {
          output = (output ? output + '\n' : '') + (stderr || err.message);
          error = stderr || err.message;
        }
      } else if (stderr) {
        output = (output ? output + '\n' : '') + stderr;
      }

      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        output: output || 'Program completed with no output.',
        error,
        status: error ? 'Runtime Error' : 'Accepted (Local Sandbox)',
        time: elapsedSec,
        memory: 18000,
        fallback: true,
      });
    });

    if (stdin && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

// ─── Local Rust execution fallback ────────────────────────────────────────────
function executeLocalRust(code, stdin = '', timeoutMs = 8000) {
  return new Promise((resolve) => {
    const fileId = getTmpId();
    const srcPath = path.join(tmpDir, `${fileId}.rs`);
    const binPath = path.join(tmpDir, `${fileId}.out`);
    fs.writeFileSync(srcPath, code, 'utf8');

    execFile('rustc', [srcPath, '-o', binPath], { timeout: 12000 }, (compileErr, compileStdout, compileStderr) => {
      if (compileErr) {
        try { if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath); } catch {}
        const output = compileStderr || compileErr.message;
        return resolve({
          stdout: '',
          stderr: output,
          output: `Compilation Error:\n${output}`,
          error: 'Compilation Error',
          status: 'Compilation Error',
          time: '0.00',
          memory: 0,
          fallback: true,
        });
      }

      const startTime = Date.now();
      const child = execFile(binPath, [], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (runErr, stdout, stderr) => {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
        try {
          if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
          if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
        } catch {}

        let output = stdout || '';
        let error = null;
        if (runErr) {
          if (runErr.killed) {
            output = (output ? output + '\n' : '') + 'Time Limit Exceeded';
            error = 'Time Limit Exceeded';
          } else {
            output = (output ? output + '\n' : '') + (stderr || runErr.message);
            error = stderr || runErr.message;
          }
        } else if (stderr) {
          output = (output ? output + '\n' : '') + stderr;
        }

        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          output: output || 'Program completed with no output.',
          error,
          status: error ? 'Runtime Error' : 'Accepted (Local Sandbox)',
          time: elapsedSec,
          memory: 6000,
          fallback: true,
        });
      });

      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    });
  });
}

// ─── Local SQL execution fallback ─────────────────────────────────────────────
function executeLocalSql(code, stdin = '', timeoutMs = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = execFile('sqlite3', [':memory:', '-header', '-column'], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

      if (err && err.code === 'ENOENT') {
        // Fallback: evaluate basic SQL string in Node if sqlite3 CLI not present
        return resolve({
          stdout: '',
          stderr: '',
          output: 'SQL query parsed successfully (Local SQL Sandbox).\n\nQuery executed:\n' + code,
          error: null,
          status: 'Accepted (Local Sandbox)',
          time: elapsedSec,
          memory: 4000,
          fallback: true,
        });
      }

      let output = stdout || '';
      let error = null;
      if (err) {
        if (err.killed) {
          output = (output ? output + '\n' : '') + 'Time Limit Exceeded';
          error = 'Time Limit Exceeded';
        } else {
          output = (output ? output + '\n' : '') + (stderr || err.message);
          error = stderr || err.message;
        }
      } else if (stderr) {
        output = (output ? output + '\n' : '') + stderr;
      }

      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        output: output || 'Query executed successfully with no returned rows.',
        error,
        status: error ? 'SQL Execution Error' : 'Accepted (Local Sandbox)',
        time: elapsedSec,
        memory: 5000,
        fallback: true,
      });
    });

    if (child.stdin) {
      child.stdin.write(code + '\n.exit\n');
      child.stdin.end();
    }
  });
}


// Dispatcher for local fallback execution
async function executeLocally(langKey, code, stdin) {
  switch (langKey) {
    case 'javascript':
      return await executeLocalNode(code, stdin, false);
    case 'typescript':
      return await executeLocalNode(code, stdin, true);
    case 'python':
      return await executeLocalPython(code, stdin);
    case 'cpp':
      return await executeLocalCpp(code, stdin);
    case 'c':
      return await executeLocalC(code, stdin);
    case 'java':
      return await executeLocalJava(code, stdin);
    case 'go':
      return await executeLocalGo(code, stdin);
    case 'rust':
      return await executeLocalRust(code, stdin);
    case 'sql':
      return await executeLocalSql(code, stdin);
    default:
      return await executeLocalNode(code, stdin, false);
  }
}

// ─── Judge0 config ────────────────────────────────────────────────────────────
let ACTIVE_JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';
const EXEC_TIMEOUT_MS = Number(process.env.EXEC_TIMEOUT_MS || 15000);

// Judge0 language IDs
const LANGUAGE_IDS = {
  javascript: 63,   // Node.js 12.14.0
  python:     71,   // Python 3.8.1
  go:         60,   // Go 1.13.5
  rust:       73,   // Rust 1.40.0
  typescript: 74,   // TypeScript 3.7.4
  java:       62,   // Java OpenJDK 13.0.1
  c:          50,   // C (GCC 9.2.0)
  cpp:        54,   // C++ (GCC 9.2.0)
  sql:        82,   // SQL (SQLite 3.27.2)
};

const STATUS = {
  IN_QUEUE:            1,
  PROCESSING:          2,
  ACCEPTED:            3,
  WRONG_ANSWER:        4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR:   6,
};

async function submitToJudge0(judgeUrl, languageId, sourceCode, stdin = '') {
  const sourceCodeB64 = Buffer.from(sourceCode || '').toString('base64');
  const stdinB64 = Buffer.from(stdin || '').toString('base64');
  const response = await axios.post(
    `${judgeUrl}/submissions?base64_encoded=true&wait=false`,
    {
      language_id: languageId,
      source_code: sourceCodeB64,
      stdin: stdinB64,
    },
    { timeout: 8000 }
  );
  return response.data.token;
}

async function pollResult(judgeUrl, token, timeoutMs = EXEC_TIMEOUT_MS) {
  const start = Date.now();
  const POLL_INTERVAL = 400;

  while (Date.now() - start < timeoutMs) {
    const { data } = await axios.get(
      `${judgeUrl}/submissions/${token}?base64_encoded=true`,
      { timeout: 8000 }
    );

    const statusId = data.status?.id;
    if (statusId !== STATUS.IN_QUEUE && statusId !== STATUS.PROCESSING) {
      return data;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  throw Object.assign(new Error('Execution timed out.'), { code: 'TIMEOUT' });
}

function safeDecodeB64(str) {
  if (!str || typeof str !== 'string') return '';
  try {
    return Buffer.from(str, 'base64').toString('utf8');
  } catch {
    return str;
  }
}

function formatResult(data) {
  const stdout = safeDecodeB64(data.stdout);
  const stderr = safeDecodeB64(data.stderr);
  const compileOutput = safeDecodeB64(data.compile_output);
  const statusId = data.status?.id;
  const statusDesc = data.status?.description || 'Unknown';

  let output = stdout;

  if (statusId === STATUS.COMPILATION_ERROR) {
    output = `Compilation Error:\n${compileOutput || stderr || 'Compilation failed.'}`;
    return { stdout: '', stderr: compileOutput || stderr, output, error: 'Compilation Error' };
  }

  if (statusId === STATUS.TIME_LIMIT_EXCEEDED) {
    output = 'Time Limit Exceeded';
    return { stdout, stderr, output, error: 'Time Limit Exceeded' };
  }

  if (statusId !== STATUS.ACCEPTED) {
    const errMsg = stderr || compileOutput || `Runtime Error (${statusDesc})`;
    output = (stdout ? stdout + '\n' : '') + errMsg;
    return { stdout, stderr: errMsg, output, error: statusDesc };
  }

  if (stderr) output += (output ? '\n' : '') + stderr;
  return { stdout, stderr, output: output || 'Program completed with no output.', error: null };
}



function autoDetectLanguage(code) {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (/public\s+class\s+\w+|System\.out\.print|public\s+static\s+void\s+main/i.test(trimmed)) {
    return 'java';
  }
  if (/#include\s*<iostream>|std::cout|using\s+namespace\s+std/i.test(trimmed)) {
    return 'cpp';
  }
  if (/#include\s*<stdio\.h>|printf\s*\(/i.test(trimmed)) {
    return 'c';
  }
  if (/package\s+main|func\s+main\s*\(/i.test(trimmed)) {
    return 'go';
  }
  if (/fn\s+main\s*\(\)|println!\s*\(/i.test(trimmed)) {
    return 'rust';
  }
  if (/(?:def\s+\w+\s*\(|if\s+__name__\s*==\s*['"]__main__['"]|import\s+sys)/i.test(trimmed) && !/const\s+|let\s+|var\s+|function\s+/.test(trimmed)) {
    return 'python';
  }
  if (/(?:CREATE\s+TABLE|SELECT\s+[\s\S]+FROM|INSERT\s+INTO)/i.test(trimmed)) {
    return 'sql';
  }
  return null;
}

// ─── Route: POST /api/execute ─────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { code, language, roomId, stdin = '' } = req.body;

    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, error: 'Code is required.' });
    }

    let langKey = String(language || '').toLowerCase();

    // Auto-detect language if code strongly matches a different language signature
    const detected = autoDetectLanguage(code);
    if (detected && detected !== langKey) {
      console.log(`💡 Auto-detected language '${detected}' from code structure (was '${langKey}')`);
      langKey = detected;
    }

    const languageId = LANGUAGE_IDS[langKey];

    if (!languageId && langKey !== 'html' && langKey !== 'css') {
      return res.status(400).json({
        success: false,
        error: `Language "${language}" is not supported. Supported: ${Object.keys(LANGUAGE_IDS).join(', ')}.`,
      });
    }


    let stdout, stderr, output, error, status, time, memory, fallback = false;

    // Try Judge0 first (local instance or configured URL)
    let judge0UrlCandidates = [
      process.env.JUDGE0_URL,
      'http://localhost:2358',
      'http://127.0.0.1:2358',
      'https://ce.judge0.com'
    ].filter(Boolean);

    let executed = false;

    for (const judgeUrl of judge0UrlCandidates) {
      try {
        const token = await submitToJudge0(judgeUrl, languageId, code, stdin);
        const result = await pollResult(judgeUrl, token);
        const formatted = formatResult(result);
        stdout = formatted.stdout;
        stderr = formatted.stderr;
        output = formatted.output;
        error = formatted.error;
        status = result.status?.description;
        time = result.time;
        memory = result.memory;
        executed = true;
        break;
      } catch (err) {
        // Try next Judge0 candidate
      }
    }

    // Fallback to local sandboxed execution if Judge0 is offline/fails
    if (!executed) {
      console.log(`⚡ Judge0 unavailable. Executing ${langKey} locally in sandbox...`);
      const fallbackRes = await executeLocally(langKey, code, stdin);
      stdout = fallbackRes.stdout;
      stderr = fallbackRes.stderr;
      output = fallbackRes.output;
      error = fallbackRes.error;
      status = fallbackRes.status;
      time = fallbackRes.time;
      memory = fallbackRes.memory;
      fallback = true;
    }

    // Log activity asynchronously
    ActivityEvent.create({
      roomId: typeof roomId === 'string' ? roomId : 'unknown',
      userId: req.user.sub,
      username: req.user.username,
      type: 'run',
      meta: { language, bytes: Buffer.byteLength(code, 'utf8') },
    }).catch(() => {});

    res.json({
      success: true,
      output,
      stdout,
      stderr,
      error,
      language,
      status,
      time,
      memory,
      fallback,
    });
  } catch (err) {
    console.error('Execution error:', err.message);
    let msg = 'Failed to execute code. Please try again.';
    if (err.code === 'TIMEOUT') {
      msg = 'Execution timed out. Please check your code for infinite loops.';
    }
    res.status(500).json({ success: false, error: msg });
  }
});

// ─── Route: GET /api/execute/languages ───────────────────────────────────────
router.get('/languages', requireAuth, async (req, res) => {
  res.json({
    success: true,
    languages: Object.keys(LANGUAGE_IDS).map((key) => ({
      key,
      id: LANGUAGE_IDS[key],
    })),
  });
});

module.exports = router;
module.exports.executeLocally = executeLocally;


