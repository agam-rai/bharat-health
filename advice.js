const express = require('express');
const router = express.Router();

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[Gemini] API error:', response.status, errText.substring(0, 300));
    throw new Error(`Gemini API returned ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No text in Gemini response');
  return text;
}

// POST /api/advice — AI health advice after symptom diagnosis
router.post('/', async (req, res) => {
  try {
    const { conditions, symptoms, language } = req.body;
    if (!conditions || conditions.length === 0) {
      return res.status(400).json({ error: 'conditions array is required' });
    }

    const top = conditions.slice(0, 3).map(c =>
      `${c.name} (${c.probability}%, urgency: ${c.urgency})`
    ).join('; ');

    const symptomsList = symptoms ? symptoms.slice(0, 8).join(', ') : 'not specified';

    const langNote = language && language !== 'en-IN'
      ? ` Respond in language code "${language}" (e.g. hi-IN = Hindi, ta-IN = Tamil).`
      : '';

    const prompt = `You are a caring Indian doctor. Patient symptoms: ${symptomsList}. Top AI-matched conditions: ${top}.

Return ONLY this JSON (no markdown):
{
  "primaryCondition": "most likely condition name",
  "severity": "mild",
  "immediateActions": ["action 1", "action 2", "action 3"],
  "medicines": [
    {"name": "Paracetamol (Crocin 500mg)", "dosage": "1 tablet", "frequency": "3x daily", "duration": "3 days", "note": "after food"}
  ],
  "homeRemedies": ["remedy 1", "remedy 2", "remedy 3"],
  "dietAdvice": ["tip 1", "tip 2", "tip 3"],
  "lifestyle": ["change 1", "change 2"],
  "whenToSeeDoctor": "specific warning signs",
  "estimatedRecovery": "5-7 days with rest",
  "disclaimer": "This is AI-generated advice. Always consult a qualified doctor."
}

Rules: Only OTC medicines. Include Indian brand names. Keep each item under 120 characters. severity = mild/moderate/severe.${langNote}`;

    const raw = await callGemini(prompt);

    let advice;
    try {
      let clean = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      advice = JSON.parse(clean);
    } catch (e) {
      console.error('[Advice] Parse error, returning raw text');
      advice = { rawAdvice: raw, parseError: true };
    }

    res.json(advice);
  } catch (err) {
    console.error('[Advice] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/advice/report — AI-powered medical report simplification
router.post('/report', async (req, res) => {
  try {
    const { reportText, language } = req.body;
    if (!reportText) {
      return res.status(400).json({ error: 'reportText is required' });
    }

    // Truncate very long reports
    const truncated = reportText.substring(0, 3000);

    const langNote = language && language !== 'en-IN'
      ? ` Respond in language code "${language}".`
      : '';

    const prompt = `You are a friendly Indian doctor explaining a lab report to a patient with no medical background. Explain every value in very simple language (like talking to a 15-year-old).

Lab report:
---
${truncated}
---

Return ONLY this JSON (no markdown):
{
  "summary": "2-3 sentence plain-English overview of overall health status",
  "overallStatus": "normal",
  "findings": [
    {
      "parameter": "Hemoglobin",
      "value": "10.2",
      "unit": "g/dL",
      "normalRange": "13.5-17.5 g/dL",
      "status": "low",
      "explanation": "Your blood's oxygen-carrier is lower than normal — like a car with less fuel.",
      "advice": "Eat more iron-rich foods like spinach and lentils."
    }
  ],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "followUp": "When to retest or see a doctor",
  "disclaimer": "This is AI-generated analysis. Always consult your doctor for proper interpretation."
}

Rules: overallStatus = normal/attention/concern. findings.status = normal/low/high/critical. Keep explanations simple and relatable. Max 5 findings.${langNote}`;

    const raw = await callGemini(prompt);

    let analysis;
    try {
      let clean = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      analysis = JSON.parse(clean);
    } catch (e) {
      console.error('[Report] Parse error, returning raw text');
      analysis = { rawAnalysis: raw, parseError: true };
    }

    res.json(analysis);
  } catch (err) {
    console.error('[Report] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
