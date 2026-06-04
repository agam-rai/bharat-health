const express = require('express');
const router = express.Router();

// POST /api/translate — Translate text using Sarvam AI API
router.post('/', async (req, res) => {
  try {
    const { input, source_language_code, target_language_code } = req.body;

    if (!input || !target_language_code) {
      return res.status(400).json({ error: 'input and target_language_code are required' });
    }

    const apiKey = process.env.SARVAM_API_KEY;

    // If no API key or placeholder, use passthrough (no translation)
    if (!apiKey || apiKey === 'your_sarvam_api_key_here') {
      console.log('⚠️ Sarvam API key not configured — returning input as-is');
      return res.json({
        translated_text: input,
        source_language_code: source_language_code || 'en-IN',
        fallback: true
      });
    }

    const response = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey
      },
      body: JSON.stringify({
        input,
        source_language_code: source_language_code || 'auto',
        target_language_code,
        model: 'mayura:v1'
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Sarvam API error:', response.status, errBody);
      // Fallback: return original text
      return res.json({
        translated_text: input,
        source_language_code: source_language_code || 'en-IN',
        fallback: true,
        error: `Sarvam API returned ${response.status}`
      });
    }

    const data = await response.json();
    res.json({
      translated_text: data.translated_text,
      source_language_code: data.source_language_code || source_language_code,
      fallback: false
    });

  } catch (err) {
    console.error('Translation error:', err.message);
    // Graceful fallback — never break the app
    res.json({
      translated_text: req.body.input || '',
      source_language_code: req.body.source_language_code || 'en-IN',
      fallback: true,
      error: err.message
    });
  }
});

module.exports = router;
