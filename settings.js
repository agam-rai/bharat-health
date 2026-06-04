const express = require('express');
const router = express.Router();
const Settings = require('../../models/Settings');
const User = require('../../models/User');

// GET /api/settings — Get settings for first user
router.get('/', async (req, res) => {
  try {
    const user = await User.findOne().sort({ createdAt: 1 });
    if (!user) return res.status(404).json({ error: 'No user found' });

    let settings = await Settings.findOne({ userId: user._id });
    if (!settings) {
      settings = await Settings.create({ userId: user._id });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings — Update settings
router.put('/', async (req, res) => {
  try {
    const user = await User.findOne().sort({ createdAt: 1 });
    if (!user) return res.status(404).json({ error: 'No user found' });

    const settings = await Settings.findOneAndUpdate(
      { userId: user._id },
      req.body,
      { new: true, upsert: true, runValidators: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
