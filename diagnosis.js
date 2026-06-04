const express = require('express');
const router = express.Router();
const Diagnosis = require('../../models/Diagnosis');
const User = require('../../models/User');

// GET /api/diagnosis — Get all diagnoses
router.get('/', async (req, res) => {
  try {
    const diagnoses = await Diagnosis.find()
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(diagnoses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/diagnosis/:id — Get specific diagnosis
router.get('/:id', async (req, res) => {
  try {
    const diagnosis = await Diagnosis.findById(req.params.id);
    if (!diagnosis) return res.status(404).json({ error: 'Diagnosis not found' });
    res.json(diagnosis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/diagnosis/check — Proxy call to Infermedica API & save result
router.post('/check', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    const appId = process.env.INFERMEDICA_APP_ID;
    const appKey = process.env.INFERMEDICA_APP_KEY;
    const baseUrl = process.env.INFERMEDICA_BASE_URL || 'https://api.infermedica.com/v3';

    // Step 1: Parse symptoms from text
    const parseResponse = await fetch(`${baseUrl}/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Id': appId,
        'App-Key': appKey
      },
      body: JSON.stringify({ text, age: { value: 28 } })
    });

    if (!parseResponse.ok) {
      const errData = await parseResponse.text();
      console.error('Infermedica parse error:', parseResponse.status, errData);
      // Return mock data for demo if API fails
      return res.json(getMockDiagnosis(text));
    }

    const parseData = await parseResponse.json();

    // Step 2: Get diagnosis from parsed symptoms
    const evidence = (parseData.mentions || []).map(m => ({
      id: m.id,
      choice_id: m.choice_id || 'present',
      source: 'initial'
    }));

    if (evidence.length === 0) {
      return res.json(getMockDiagnosis(text));
    }

    const diagResponse = await fetch(`${baseUrl}/diagnosis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Id': appId,
        'App-Key': appKey
      },
      body: JSON.stringify({
        sex: 'male',
        age: { value: 28 },
        evidence
      })
    });

    let diagData;
    if (diagResponse.ok) {
      diagData = await diagResponse.json();
    } else {
      return res.json(getMockDiagnosis(text));
    }

    // Save diagnosis to DB
    const user = await User.findOne().sort({ createdAt: 1 });
    const conditions = (diagData.conditions || []).map(c => ({
      name: c.common_name || c.name,
      probability: Math.round((c.probability || 0) * 100),
      urgency: getUrgencyLevel(c.probability),
      description: `Matched with ${Math.round((c.probability || 0) * 100)}% probability based on reported symptoms.`,
      action: getRecommendedAction(c.probability)
    }));

    const diagnosis = await Diagnosis.create({
      userId: user ? user._id : null,
      sessionId: sessionId || null,
      conditions,
      rawApiResponse: diagData,
      symptoms: [text]
    });

    res.json(diagnosis);
  } catch (err) {
    console.error('Diagnosis error:', err.message);
    res.json(getMockDiagnosis(req.body.text || 'unknown'));
  }
});

function getUrgencyLevel(probability) {
  if (probability >= 0.7) return 'high';
  if (probability >= 0.4) return 'moderate';
  return 'low';
}

function getRecommendedAction(probability) {
  if (probability >= 0.7) return 'See a doctor within 24 hours';
  if (probability >= 0.4) return 'Schedule a check-up this week';
  return 'Monitor symptoms and rest';
}

// Mock diagnosis data for demo/fallback
function getMockDiagnosis(symptomText) {
  const symptoms = symptomText.toLowerCase();
  let conditions = [];

  if (symptoms.includes('headache') || symptoms.includes('head')) {
    conditions = [
      { name: 'Tension Headache', probability: 78, urgency: 'low', description: 'A common type of headache causing mild to moderate pain, often described as a tight band around the head.', action: 'Rest, hydrate, and take OTC pain relief' },
      { name: 'Migraine', probability: 52, urgency: 'moderate', description: 'A neurological condition causing intense, throbbing headaches often accompanied by nausea and sensitivity to light.', action: 'Schedule a check-up this week' },
      { name: 'Sinusitis', probability: 31, urgency: 'low', description: 'Inflammation of the sinuses that can cause headache, facial pain, and nasal congestion.', action: 'Monitor symptoms and rest' }
    ];
  } else if (symptoms.includes('chest') || symptoms.includes('heart')) {
    conditions = [
      { name: 'Costochondritis', probability: 65, urgency: 'moderate', description: 'Inflammation of the cartilage connecting ribs to the breastbone, causing chest pain.', action: 'Schedule a check-up this week' },
      { name: 'Acid Reflux (GERD)', probability: 48, urgency: 'low', description: 'Stomach acid flowing back into the esophagus, causing heartburn and chest discomfort.', action: 'Monitor diet and symptoms' },
      { name: 'Anxiety-related Chest Pain', probability: 35, urgency: 'low', description: 'Chest tightness or pain triggered by stress and anxiety responses.', action: 'Practice relaxation techniques' }
    ];
  } else if (symptoms.includes('stomach') || symptoms.includes('nausea') || symptoms.includes('vomit')) {
    conditions = [
      { name: 'Gastritis', probability: 70, urgency: 'moderate', description: 'Inflammation of the stomach lining causing pain, nausea, and discomfort.', action: 'Schedule a check-up this week' },
      { name: 'Food Poisoning', probability: 55, urgency: 'moderate', description: 'Illness from consuming contaminated food, causing nausea, vomiting, and diarrhea.', action: 'Stay hydrated, rest' },
      { name: 'Irritable Bowel Syndrome', probability: 28, urgency: 'low', description: 'A chronic condition affecting the large intestine, causing cramps and bloating.', action: 'Monitor symptoms and rest' }
    ];
  } else {
    conditions = [
      { name: 'Common Cold', probability: 62, urgency: 'low', description: 'A viral infection of the upper respiratory tract causing congestion, sore throat, and mild body aches.', action: 'Rest, fluids, and OTC medication' },
      { name: 'Seasonal Allergies', probability: 45, urgency: 'low', description: 'An immune response to airborne allergens causing sneezing, runny nose, and itchy eyes.', action: 'Try antihistamines' },
      { name: 'Viral Infection', probability: 33, urgency: 'moderate', description: 'A general viral infection that may cause fatigue, body aches, and mild fever.', action: 'Schedule a check-up if symptoms persist' }
    ];
  }

  return {
    _id: 'demo-' + Date.now(),
    conditions,
    symptoms: [symptomText],
    isDemo: true,
    createdAt: new Date()
  };
}

module.exports = router;
