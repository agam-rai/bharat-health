const mongoose = require('../mockMongoose');

const settingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  darkMode: { type: Boolean, default: false },
  notifications: { type: Boolean, default: true },
  biometricLogin: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
