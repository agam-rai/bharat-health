const mongoose = require('../mockMongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const chatSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messages: [messageSchema],
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  diagnosisId: { type: mongoose.Schema.Types.ObjectId, ref: 'Diagnosis', default: null },
  evidence: { type: Array, default: [] },
  nextQuestion: { type: Object, default: null }
}, { timestamps: true });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
