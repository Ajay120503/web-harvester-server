const cloudinary = require('../config/cloudinary');

/**
 * Upload a base64 image to Cloudinary
 * @param {string} base64Data - Base64 encoded image string (with or without data URI prefix)
 * @param {object} options - Cloudinary upload options
 * @returns {Promise<object>} - Cloudinary upload result with public_id, secure_url, etc.
 */
async function uploadBase64Image(base64Data, options = {}) {
  if (!base64Data) return null;

  // Ensure the data has the data URI prefix for Cloudinary
  let uploadData = base64Data;
  if (!base64Data.startsWith('data:')) {
    uploadData = `data:image/jpeg;base64,${base64Data}`;
  }

  const defaultOptions = {
    folder: 'web-harvester/captures',
    resource_type: 'image',
    quality: 'auto',
    fetch_format: 'auto'
  };

  const mergedOptions = { ...defaultOptions, ...options };

  try {
    const result = await cloudinary.uploader.upload(uploadData, mergedOptions);
    return {
      publicId: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      createdAt: result.created_at
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error.message);
    throw new Error(`Failed to upload image to Cloudinary: ${error.message}`);
  }
}

/**
 * Delete an image from Cloudinary by public ID
 * @param {string} publicId - Cloudinary public ID of the image
 * @returns {Promise<boolean>}
 */
async function deleteImage(publicId) {
  if (!publicId) {
    console.warn('⚠️ deleteImage called with no publicId');
    return { success: false, reason: 'No public ID provided' };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`🗑️ Cloudinary destroy result for ${publicId}:`, result.result);
    
    if (result.result === 'ok') {
      return { success: true, result: result.result };
    } else {
      // 'not found' means the image doesn't exist on Cloudinary
      console.warn(`⚠️ Cloudinary destroy returned "${result.result}" for public ID: ${publicId}`);
      return { success: false, reason: `Cloudinary returned: ${result.result}` };
    }
  } catch (error) {
    console.error('❌ Cloudinary delete error:', error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Extract Cloudinary public ID from a full URL
 * @param {string} url - Full Cloudinary URL
 * @returns {string|null}
 */
function extractPublicIdFromUrl(url) {
  if (!url || !url.includes('cloudinary.com')) return null;

  try {
    // URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234/folder/public_id.format
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1];
    // Remove format extension
    const publicIdWithFolder = lastPart.replace(/\.[^.]+$/, '');
    return `web-harvester/captures/${publicIdWithFolder}`;
  } catch {
    return null;
  }
}

/**
 * Upload a base64 audio clip to Cloudinary
 * @param {string} base64Data - Base64 encoded audio (with or without data URI prefix)
 * @param {object} options - Cloudinary upload options
 * @returns {Promise<object>} - Cloudinary upload result
 */
async function uploadBase64Audio(base64Data, options = {}) {
  if (!base64Data) return null;

  // Ensure the data has a data URI prefix
  let uploadData = base64Data;
  if (!base64Data.startsWith('data:')) {
    uploadData = `data:audio/webm;base64,${base64Data}`;
  }

  // Determine format from mime type
  let format = 'webm';
  if (uploadData.includes('audio/mp3') || uploadData.includes('audio/mpeg')) format = 'mp3';
  else if (uploadData.includes('audio/ogg')) format = 'ogg';
  else if (uploadData.includes('audio/wav') || uploadData.includes('audio/wave')) format = 'wav';

  const defaultOptions = {
    folder: 'web-harvester/audio',
    resource_type: 'video', // Cloudinary uses 'video' resource type for audio
    format
  };

  const mergedOptions = { ...defaultOptions, ...options };

  try {
    const result = await cloudinary.uploader.upload(uploadData, mergedOptions);
    return {
      publicId: result.public_id,
      url: result.secure_url,
      format: result.format,
      bytes: result.bytes,
      duration: result.duration,
      createdAt: result.created_at
    };
  } catch (error) {
    console.error('Cloudinary audio upload error:', error.message);
    throw new Error(`Failed to upload audio to Cloudinary: ${error.message}`);
  }
}

module.exports = {
  uploadBase64Image,
  uploadBase64Audio,
  deleteImage,
  extractPublicIdFromUrl
};
