const express = require('express');
const router = express.Router();
const ChatSession = require('../../models/ChatSession');
const User = require('../../models/User');

// GET /api/chat — Get all chat sessions
router.get('/', async (req, res) => {
  try {
    const sessions = await ChatSession.find()
      .sort({ updatedAt: -1 })
      .limit(20)
      .populate('diagnosisId');
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/:id — Get specific session
router.get('/:id', async (req, res) => {
  try {
    const session = await ChatSession.findById(req.params.id).populate('diagnosisId');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat — Create new chat session
router.post('/', async (req, res) => {
  try {
    const user = await User.findOne().sort({ createdAt: 1 });
    if (!user) return res.status(400).json({ error: 'No user profile found. Create a profile first.' });

    const session = await ChatSession.create({
      userId: user._id,
      messages: [{
        role: 'assistant',
        content: "Hello! I'm your health assistant. How are you feeling today? Please describe your symptoms and I'll help you understand what might be going on.",
        timestamp: new Date()
      }]
    });
    res.status(201).json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Helper functions for urgency and recommendation
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

// Helper to run simulated conversational checkup if API key is invalid or offline
async function runMockChatbot(session, content, newEvidence) {
  const Diagnosis = require('../../models/Diagnosis');
  
  // Initialize mock state if needed
  if (!session.evidence || session.evidence.length === 0) {
    session.evidence = [];
  }

  const symptoms = content.toLowerCase();
  
  if (session.evidence.length === 0) {
    // Phase 1: Check initial query
    if (symptoms.includes('headache') || symptoms.includes('head')) {
      session.evidence.push({ id: 'mock_headache', choice_id: 'present' });
      session.nextQuestion = {
        type: 'single',
        text: 'Are you experiencing sensitivity to light or noise (photophobia/phonophobia)?',
        items: [
          {
            id: 'mock_photophobia',
            name: 'Sensitivity to light or noise',
            choices: [
              { id: 'present', label: 'Yes' },
              { id: 'absent', label: 'No' },
              { id: 'unknown', label: 'Don\'t know' }
            ]
          }
        ]
      };
      session.messages.push({ role: 'assistant', content: session.nextQuestion.text, timestamp: new Date() });
    } else if (symptoms.includes('chest') || symptoms.includes('heart')) {
      session.evidence.push({ id: 'mock_chest_pain', choice_id: 'present' });
      session.nextQuestion = {
        type: 'single',
        text: 'Does the pain increase when you press on your chest or take a deep breath?',
        items: [
          {
            id: 'mock_chest_press',
            name: 'Pain increases with pressing or deep breathing',
            choices: [
              { id: 'present', label: 'Yes' },
              { id: 'absent', label: 'No' },
              { id: 'unknown', label: 'Don\'t know' }
            ]
          }
        ]
      };
      session.messages.push({ role: 'assistant', content: session.nextQuestion.text, timestamp: new Date() });
    } else if (symptoms.includes('stomach') || symptoms.includes('nausea') || symptoms.includes('vomit')) {
      session.evidence.push({ id: 'mock_stomach_pain', choice_id: 'present' });
      session.nextQuestion = {
        type: 'single',
        text: 'Have you had a fever or chills along with your stomach discomfort?',
        items: [
          {
            id: 'mock_fever',
            name: 'Fever or chills',
            choices: [
              { id: 'present', label: 'Yes' },
              { id: 'absent', label: 'No' },
              { id: 'unknown', label: 'Don\'t know' }
            ]
          }
        ]
      };
      session.messages.push({ role: 'assistant', content: session.nextQuestion.text, timestamp: new Date() });
    } else {
      session.evidence.push({ id: 'mock_general', choice_id: 'present' });
      session.nextQuestion = {
        type: 'single',
        text: 'Do you currently have a fever?',
        items: [
          {
            id: 'mock_fever',
            name: 'Fever',
            choices: [
              { id: 'present', label: 'Yes' },
              { id: 'absent', label: 'No' },
              { id: 'unknown', label: 'Don\'t know' }
            ]
          }
        ]
      };
      session.messages.push({ role: 'assistant', content: session.nextQuestion.text, timestamp: new Date() });
    }
    await session.save();
    return session;
  }

  // Phase 2: Handle response to question
  if (newEvidence && newEvidence.length > 0) {
    session.evidence.push(...newEvidence);
  }

  // Determine final conditions based on choices
  let conditions = [];
  const primaryEvidence = session.evidence[0]?.id;
  const secondaryChoice = session.evidence.find(e => e.id !== primaryEvidence)?.choice_id;

  if (primaryEvidence === 'mock_headache') {
    if (secondaryChoice === 'present') {
      conditions = [
        { name: 'Migraine', probability: 82, urgency: 'moderate', description: 'A neurological condition causing intense, throbbing headaches often accompanied by nausea and sensitivity to light.', action: 'Schedule a check-up this week' },
        { name: 'Tension Headache', probability: 45, urgency: 'low', description: 'A common type of headache causing mild to moderate pain.', action: 'Rest and hydrate' }
      ];
    } else {
      conditions = [
        { name: 'Tension Headache', probability: 85, urgency: 'low', description: 'A common type of headache causing mild to moderate pain, often described as a tight band around the head.', action: 'Rest, hydrate, and take OTC pain relief' },
        { name: 'Sinusitis', probability: 40, urgency: 'low', description: 'Inflammation of the sinuses causing headache and congestion.', action: 'Monitor symptoms and rest' }
      ];
    }
  } else if (primaryEvidence === 'mock_chest_pain') {
    if (secondaryChoice === 'present') {
      conditions = [
        { name: 'Costochondritis', probability: 75, urgency: 'moderate', description: 'Inflammation of the cartilage connecting ribs to the breastbone, causing chest pain.', action: 'Schedule a check-up this week' },
        { name: 'Anxiety-related Chest Pain', probability: 35, urgency: 'low', description: 'Chest tightness triggered by stress responses.', action: 'Practice relaxation techniques' }
      ];
    } else {
      conditions = [
        { name: 'Acid Reflux (GERD)', probability: 70, urgency: 'low', description: 'Stomach acid flowing back into the esophagus, causing heartburn and chest discomfort.', action: 'Monitor diet and symptoms' },
        { name: 'Costochondritis', probability: 30, urgency: 'moderate', description: 'Inflammation of the chest wall cartilage.', action: 'Monitor symptoms and rest' }
      ];
    }
  } else if (primaryEvidence === 'mock_stomach_pain') {
    if (secondaryChoice === 'present') {
      conditions = [
        { name: 'Food Poisoning', probability: 80, urgency: 'moderate', description: 'Illness from consuming contaminated food, causing nausea, vomiting, and fever.', action: 'Stay hydrated, rest' },
        { name: 'Gastritis', probability: 50, urgency: 'moderate', description: 'Inflammation of the stomach lining.', action: 'Schedule a check-up this week' }
      ];
    } else {
      conditions = [
        { name: 'Gastritis', probability: 75, urgency: 'moderate', description: 'Inflammation of the stomach lining causing pain, nausea, and discomfort.', action: 'Schedule a check-up this week' },
        { name: 'Irritable Bowel Syndrome', probability: 40, urgency: 'low', description: 'A chronic condition affecting the large intestine.', action: 'Monitor symptoms and rest' }
      ];
    }
  } else {
    if (secondaryChoice === 'present') {
      conditions = [
        { name: 'Viral Infection', probability: 70, urgency: 'moderate', description: 'A general viral infection that may cause fatigue, body aches, and fever.', action: 'Schedule a check-up if symptoms persist' },
        { name: 'Common Cold', probability: 40, urgency: 'low', description: 'A viral respiratory tract infection.', action: 'Rest and fluids' }
      ];
    } else {
      conditions = [
        { name: 'Common Cold', probability: 78, urgency: 'low', description: 'A viral infection of the upper respiratory tract causing congestion and sore throat.', action: 'Rest, fluids, and OTC medication' },
        { name: 'Seasonal Allergies', probability: 55, urgency: 'low', description: 'An immune response to airborne allergens.', action: 'Try antihistamines' }
      ];
    }
  }

  // Create Diagnosis Report
  const diagnosis = await Diagnosis.create({
    userId: session.userId,
    sessionId: session._id,
    conditions,
    rawApiResponse: { conditions, isMock: true },
    symptoms: session.messages.filter(m => m.role === 'user').map(m => m.content)
  });

  session.status = 'completed';
  session.diagnosisId = diagnosis._id;
  session.nextQuestion = null;

  const assistantText = `I have analyzed your symptoms. Based on my analysis, the primary possibility is **${conditions[0].name}** with a match rate of **${conditions[0].probability}%**. You can view the full diagnosis report now.`;
  session.messages.push({ role: 'assistant', content: assistantText, timestamp: new Date() });
  await session.save();

  return session;
}

// POST /api/chat/:id/message — Add message to session and query diagnostic interview
router.post('/:id/message', async (req, res) => {
  try {
    const { role, content, newEvidence } = req.body;
    if (!role || !content) {
      return res.status(400).json({ error: 'role and content are required' });
    }

    const session = await ChatSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Append the user's message
    session.messages.push({ role, content, timestamp: new Date() });

    const appId = process.env.INFERMEDICA_APP_ID;
    const appKey = process.env.INFERMEDICA_APP_KEY;
    const baseUrl = process.env.INFERMEDICA_BASE_URL || 'https://api.infermedica.com/v3';

    // If API credentials are not set up or are placeholders, use mock fallback
    if (!appId || !appKey || appId === 'your_app_id' || appKey === 'your_app_key') {
      const updatedSession = await runMockChatbot(session, content, newEvidence);
      return res.json(updatedSession);
    }

    try {
      const User = require('../../models/User');
      const Diagnosis = require('../../models/Diagnosis');
      const user = await User.findById(session.userId);
      const userAge = user ? user.age || 28 : 28;

      if (!session.evidence || session.evidence.length === 0) {
        // Step 1: First user message — Parse symptoms from content
        const parseResponse = await fetch(`${baseUrl}/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'App-Id': appId,
            'App-Key': appKey
          },
          body: JSON.stringify({ text: content, age: { value: userAge } })
        });

        if (!parseResponse.ok) {
          throw new Error(`Parse failed: ${parseResponse.statusText}`);
        }

        const parseData = await parseResponse.json();
        const initialEvidence = (parseData.mentions || []).map(m => ({
          id: m.id,
          choice_id: m.choice_id || 'present',
          source: 'initial'
        }));

        if (initialEvidence.length === 0) {
          // If no symptoms parsed, ask for clarification
          session.messages.push({
            role: 'assistant',
            content: "I couldn't identify specific symptoms from your message. Could you please describe what you are feeling in more detail? (e.g., 'I have a throbbing headache and light sensitivity')",
            timestamp: new Date()
          });
          await session.save();
          return res.json(session);
        }

        session.evidence = initialEvidence;
      } else {
        // Step 2: Next turns — Append answers to questions
        if (newEvidence && newEvidence.length > 0) {
          session.evidence.push(...newEvidence);
        }
      }

      // Step 3: Run diagnosis query with accumulated evidence
      const diagResponse = await fetch(`${baseUrl}/diagnosis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Id': appId,
          'App-Key': appKey
        },
        body: JSON.stringify({
          sex: 'male',
          age: { value: userAge },
          evidence: session.evidence
        })
      });

      if (!diagResponse.ok) {
        throw new Error(`Diagnosis query failed: ${diagResponse.statusText}`);
      }

      const diagData = await diagResponse.json();

      if (diagData.should_stop === true || !diagData.question) {
        // Completed diagnosis
        const conditions = (diagData.conditions || []).map(c => ({
          name: c.common_name || c.name,
          probability: Math.round((c.probability || 0) * 100),
          urgency: getUrgencyLevel(c.probability),
          description: `Matched with ${Math.round((c.probability || 0) * 100)}% probability based on reported symptoms.`,
          action: getRecommendedAction(c.probability)
        }));

        const diagnosis = await Diagnosis.create({
          userId: session.userId,
          sessionId: session._id,
          conditions,
          rawApiResponse: diagData,
          symptoms: session.messages.filter(m => m.role === 'user').map(m => m.content)
        });

        session.status = 'completed';
        session.diagnosisId = diagnosis._id;
        session.nextQuestion = null;

        const primaryCondName = conditions[0]?.name || 'Unknown Condition';
        const primaryCondProb = conditions[0]?.probability || 0;
        const assistantText = `I have completed the analysis. Based on my analysis, the primary possibility is **${primaryCondName}** with a match rate of **${primaryCondProb}%**. You can view the full diagnosis report.`;
        
        session.messages.push({ role: 'assistant', content: assistantText, timestamp: new Date() });
        await session.save();
        res.json(session);
      } else {
        // Store next question and ask user
        session.nextQuestion = diagData.question;
        session.messages.push({
          role: 'assistant',
          content: diagData.question.text,
          timestamp: new Date()
        });
        await session.save();
        res.json(session);
      }
    } catch (apiErr) {
      console.warn('Infermedica API error, falling back to mock flow:', apiErr.message);
      const updatedSession = await runMockChatbot(session, content, newEvidence);
      res.json(updatedSession);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/chat/:id/complete — Mark session as completed
router.put('/:id/complete', async (req, res) => {
  try {
    const session = await ChatSession.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', diagnosisId: req.body.diagnosisId || null },
      { new: true }
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/chat/:id — Delete a session
router.delete('/:id', async (req, res) => {
  try {
    const session = await ChatSession.findByIdAndDelete(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ message: 'Session deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
