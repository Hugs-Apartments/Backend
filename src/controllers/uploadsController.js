import { config } from '../config.js'
import { asyncHandler, httpError } from '../middleware/errorHandler.js'
import { uploadImageBuffer } from '../lib/cloudinary.js'
import { logger } from '../lib/logger.js'

// POST /api/uploads/image — admin. Accepts a single multipart file field
// named "image", uploads it to Cloudinary, and returns the hosted URL.
export const uploadImage = asyncHandler(async (req, res) => {
  if (!config.cloudinary.enabled) {
    throw httpError(503, 'Image uploads are not configured.')
  }
  if (!req.file) {
    throw httpError(400, 'No image file provided.')
  }
  if (!req.file.mimetype?.startsWith('image/')) {
    throw httpError(400, 'Only image files are allowed.')
  }

  const { url, publicId } = await uploadImageBuffer(req.file.buffer)
  logger.info('upload.image', { publicId, by: req.admin?.sub })
  res.status(201).json({ url, publicId })
})
