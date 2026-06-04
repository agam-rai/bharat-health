const express = require('express');
const router = express.Router();
const User = require('../../models/User');

// GET /api/profile — Get user profile (first user for single-user mode)
router.get('/', async (req, res) => {
  try {
    const user = await User.findOne().sort({ createdAt: 1 });
    if (!user) {
      return res.status(404).json({ error: 'No profile found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/profile/:id — Get specific user profile
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile — Create new profile
router.post('/', async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/profile/:id — Update profile
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/profile — Update first user profile
router.put('/', async (req, res) => {
  try {
    const user = await User.findOne().sort({ createdAt: 1 });
    if (!user) return res.status(404).json({ error: 'No profile found' });
    Object.assign(user, req.body);
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
