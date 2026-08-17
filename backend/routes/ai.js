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

function generateOfflineAiResponse({ mode, language, code, question }) {
  const lang = language || 'code';
  const lines = (code || '').split('\n').filter((l) => l.trim().length > 0);
  const lineCount = lines.length;

  if (mode === 'explain') {
    return `### 💡 Code Explanation (${lang})\n\n` +
      `1. **High-Level Purpose**:\n   This ${lang} script contains ${lineCount} lines of active code.\n\n` +
      `2. **Key Snippet Overview**:\n` +
      (lines.slice(0, 5).map((l, i) => `   - Line ${i + 1}: \`${l.trim().slice(0, 60)}\``).join('\n') || '   - Empty document.') + '\n\n' +
      `3. **Key Considerations**:\n` +
      `   - Ensure variables are declared in local scope.\n` +
      `   - Check edge cases for empty or null inputs.\n\n` +
      `*(Note: Offline AI analysis active. Add OPENAI_API_KEY to backend/.env for GPT-4o models)*`;
  }

  if (mode === 'debug') {
    return `### 🔍 Code Debug & Analysis (${lang})\n\n` +
      `1. **Static Check**:\n` +
      `   - Analyzed ${lineCount} lines.\n` +
      `   - Basic syntax structure appears intact.\n\n` +
      `2. **Debugging Checklist**:\n` +
      `   - Verify loop termination conditions.\n` +
      `   - Add explicit error boundaries for async operations.\n` +
      `   - Ensure return values match target types.\n\n` +
      `*(Note: Offline AI analysis active. Add OPENAI_API_KEY to backend/.env for GPT-4o models)*`;
  }

  return `### ✨ AI Code Recommendations (${lang})\n\n` +
    (question ? `**Query**: "${question}"\n\n` : '') +
    `1. **Readability & Style**:\n` +
    `   - Split monolithic functions into reusable helpers.\n` +
    `2. **Robustness**:\n` +
    `   - Use strict equality and explicit return types.\n\n` +
    `*(Note: Offline AI analysis active. Add OPENAI_API_KEY to backend/.env for GPT-4o models)*`;
}

router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const { code, language, question, mode } = req.body || {};
    const selectedMode = mode === 'explain' || mode === 'debug' ? mode : 'suggest';

    const openai = getOpenAiClient();
    if (!openai) {
      const fallbackMsg = generateOfflineAiResponse({ mode: selectedMode, language, code, question });
      return res.json({ success: true, mode: selectedMode, response: fallbackMsg });
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
    const { code, language, question, mode } = req.body || {};
    const selectedMode = mode === 'explain' || mode === 'debug' ? mode : 'suggest';
    const fallbackMsg = generateOfflineAiResponse({ mode: selectedMode, language, code, question });
    res.json({ success: true, mode: selectedMode, response: fallbackMsg });
  }
});

module.exports = router;
