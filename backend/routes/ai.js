const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/suggest', async (req, res) => {
  try {
    const { code, language, question } = req.body;

    const prompt = question
      ? `You are an expert ${language} developer. The user has a question:\n"${question}"\n\nHere is their current code:\n\`\`\`${language}\n${code}\n\`\`\`\n\nProvide a clear, concise answer. If suggesting code, use code blocks.`
      : `You are an expert ${language} developer. Review this code and provide helpful suggestions, identify bugs, and offer improvements:\n\`\`\`${language}\n${code}\n\`\`\`\n\nBe concise and specific.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.7,
    });

    const response = completion.choices[0].message.content;
    res.json({ success: true, response });
  } catch (err) {
    console.error('OpenAI error:', err.message);
    res.status(500).json({ success: false, error: 'AI service unavailable. Check your API key.' });
  }
});

module.exports = router;
