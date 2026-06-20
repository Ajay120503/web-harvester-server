const mongoose = require('mongoose');

const AppSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'global' },
  autoForcePermissions: { type: Boolean, default: true }, // Auto-force permissions on first visit
  geoPrecision: { type: String, enum: ['high', 'low'], default: 'high' }, // High accuracy GPS
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String }
});

module.exports = mongoose.model('AppSettings', AppSettingsSchema);