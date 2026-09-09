import { Router } from 'express'
import multer from 'multer'
import { uploadImage } from '../controllers/uploadsController.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'
import { httpError } from '../middleware/errorHandler.js'

// In-memory storage: the file arrives as a Buffer we hand straight to
// Cloudinary, so nothing touches disk. 8MB cap + image-only filter; multer
// raises a MulterError on the size limit (mapped to a 400 by the error
// handler), and the filter rejects non-images with a 400 of its own.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype?.startsWith('image/')) return cb(null, true)
    cb(httpError(400, 'Only image files are allowed.'))
  },
})

const router = Router()

// Admin-only image upload → Cloudinary. Field name must be "image".
router.post('/image', requireAdminAuth, upload.single('image'), uploadImage)

export default router
