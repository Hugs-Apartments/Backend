// Server-side Cloudinary client for listing images.
//
// The API secret lives only here (backend). The Admin never talks to Cloudinary
// directly — it POSTs the file to /api/uploads/image, and this module pushes it
// to Cloudinary and returns the hosted secure URL, which is what gets stored on
// the property. Configured from env via config.cloudinary.

import { v2 as cloudinary } from 'cloudinary'
import { config } from '../config.js'

if (config.cloudinary.enabled) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  })
}

// Uploads an in-memory image buffer to Cloudinary and resolves the hosted URL.
// Uses upload_stream because multer gives us the file as a Buffer (memory
// storage), not a path on disk.
export function uploadImageBuffer(buffer, folder = 'hugs/properties') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error)
        resolve({ url: result.secure_url, publicId: result.public_id })
      },
    )
    stream.end(buffer)
  })
}

export { cloudinary }
