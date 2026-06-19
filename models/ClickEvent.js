const mongoose = require('mongoose');

const ClickEventSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VictimSession', required: true, index: true },
  sessionIdStr: { type: String },
  x: { type: Number },
  y: { type: Number },
  targetElement: {
    tag: { type: String },
    id: { type: String },
    className: { type: String },
    text: { type: String },
    href: { type: String },
    src: { type: String },
    selector: { type: String },
    innerText: { type: String }
  },
  timestamp: { type: Date, default: Date.now },
  pageUrl: { type: String },
  pageTitle: { type: String },
  scrollX: { type: Number },
  scrollY: { type: Number }
}, { timestamps: true });

ClickEventSchema.index({ sessionId: 1, timestamp: 1 });

module.exports = mongoose.model('ClickEvent', ClickEventSchema);