const mongoose = require('../mockMongoose');

const conditionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  probability: { type: Number, default: 0 },
  urgency: { type: String, default: 'low' },
  description: { type: String, default: '' },
  action: { type: String, default: '' }
}, { _id: false });

const diagnosisSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatSession', default: null },
  conditions: [conditionSchema],
  rawApiResponse: { type: mongoose.Schema.Types.Mixed, default: {} },
  symptoms: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Diagnosis', diagnosisSchema);
