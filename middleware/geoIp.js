const geoip = require('geoip-lite');

const geoLookup = (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.connection?.remoteAddress || 
             req.ip || 
             '127.0.0.1';
  
  const cleanIp = ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' 
    ? '8.8.8.8' 
    : ip.replace('::ffff:', '');

  const geo = geoip.lookup(cleanIp);
  
  req.clientIp = cleanIp;
  req.geoInfo = geo ? {
    city: geo.city,
    region: geo.region,
    country: geo.country,
    lat: geo.ll?.[0] || null,
    lon: geo.ll?.[1] || null,
    postalCode: geo.postalCode || '',
    timezone: geo.timezone || ''
  } : {};

  next();
};

module.exports = geoLookup;