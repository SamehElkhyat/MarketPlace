import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

/**
 * Short-lived SIGNED parameters for direct browser → Cloudinary uploads. Image bytes never pass through
 * this API and the API secret never reaches the browser.
 */
export function signImageUpload() {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  if (!cloudName || !apiKey || !apiSecret) throw ApiError.badRequest('Cloudinary is not configured');

  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'products';
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, apiSecret);
  return { cloudName, apiKey, timestamp, folder, signature };
}
