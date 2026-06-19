const UAParser = require('ua-parser-js');

const deviceDetect = (req, res, next) => {
  const ua = req.headers['user-agent'] || '';
  const parser = new UAParser(ua);
  const result = parser.getResult();

  req.deviceInfo = {
    userAgent: ua,
    browser: result.browser.name || 'Unknown',
    browserVersion: result.browser.version || 'Unknown',
    os: result.os.name || 'Unknown',
    osVersion: result.os.version || 'Unknown',
    deviceType: result.device.type || 'desktop',
    deviceVendor: result.device.vendor || '',
    deviceModel: result.device.model || '',
    cpu: result.cpu.architecture || ''
  };

  next();
};

module.exports = deviceDetect;