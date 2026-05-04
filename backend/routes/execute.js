const express = require('express');
const router = express.Router();
const axios = require('axios');

// Using the Piston API (free, no key required for basic usage)
// https://github.com/engineer-man/piston
const PISTON_API = 'https://emkc.org/api/v2/piston/execute';

const LANGUAGE_MAP = {
  javascript: { language: 'js', version: '18.15.0' },
  typescript: { language: 'ts', version: '5.0.3' },
  python: { language: 'python', version: '3.10.0' },
  java: { language: 'java', version: '15.0.2' },
  cpp: { language: 'cpp', version: '10.2.0' },
  go: { language: 'go', version: '1.16.2' },
  rust: { language: 'rust', version: '1.68.2' },
};

router.post('/', async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!LANGUAGE_MAP[language]) {
      return res.status(400).json({ success: false, error: `Language ${language} execution not supported yet.` });
    }

    const { language: lang, version } = LANGUAGE_MAP[language];

    const response = await axios.post(PISTON_API, {
      language: lang,
      version: version,
      files: [{ content: code }],
    });

    const result = response.data;
    res.json({
      success: true,
      output: result.run.output || 'No output',
      stderr: result.run.stderr,
      stdout: result.run.stdout,
    });
  } catch (err) {
    console.error('Execution error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to execute code. Please try again later.' });
  }
});

module.exports = router;
