const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const { requireAuth } = require('../middleware/auth');

function getOpenAiClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'your_openai_api_key_here') return null;
  return new OpenAI({ apiKey: key });
}

function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function buildPrompt({ mode, language, code, question }) {
  const lang = language || 'plaintext';
  const snippet = typeof code === 'string' ? code : '';

  if (mode === 'explain') {
    return [
      `Explain this ${lang} code clearly for a developer.`,
      `- First: what it does (high level)`,
      `- Then: key parts and why they matter`,
      `- Finally: any risks/edge cases`,
      ``,
      `\`\`\`${lang}`,
      snippet,
      `\`\`\``,
    ].join('\n');
  }

  if (mode === 'debug') {
    return [
      `You are an expert ${lang} debugger.`,
      `Find likely bugs, runtime errors, and edge cases in this code.`,
      `Return:`,
      `1) A short list of issues (bullets)`,
      `2) A minimal patch or corrected snippet (code block) if applicable`,
      `3) A quick test plan (bullets)`,
      ``,
      `\`\`\`${lang}`,
      snippet,
      `\`\`\``,
    ].join('\n');
  }

  // default: suggest
  const q = typeof question === 'string' ? question.trim() : '';
  if (q) {
    return [
      `You are an expert ${lang} developer. Answer the user's question:`,
      `"${q}"`,
      ``,
      `Current code:`,
      `\`\`\`${lang}`,
      snippet,
      `\`\`\``,
      ``,
      `Be concise. If you propose code, use code blocks.`,
    ].join('\n');
  }

  return [
    `You are an expert ${lang} developer.`,
    `Review this code and provide specific improvements and best practices.`,
    `Prioritize correctness and simplicity.`,
    ``,
    `\`\`\`${lang}`,
    snippet,
    `\`\`\``,
  ].join('\n');
}

router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const { code, language, question, mode } = req.body || {};
    const selectedMode = mode === 'explain' || mode === 'debug' ? mode : 'suggest';

    const openai = getOpenAiClient();
    if (!openai) {
      return res.status(500).json({ success: false, error: 'AI is not configured. Set OPENAI_API_KEY in backend/.env' });
    }

    const prompt = buildPrompt({ mode: selectedMode, language, code, question });

    const completion = await openai.chat.completions.create({
      model: getModel(),
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.7,
    });

    const response = completion.choices[0].message.content;
    res.json({ success: true, mode: selectedMode, response });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.status(500).json({ success: false, error: 'AI service unavailable. Check your API key.' });
  }
});

module.exports = router;
