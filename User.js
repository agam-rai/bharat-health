const mongoose = require('../mockMongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, default: 'User' },
  email: { type: String, default: '' },
  avatar: { type: String, default: '' },
  age: { type: Number, default: 0 },
  bloodType: { type: String, default: '' },
  weight: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  allergies: [{ type: String }],
  conditions: [{ type: String }],
  emergencyContact: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    relation: { type: String, default: '' }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
