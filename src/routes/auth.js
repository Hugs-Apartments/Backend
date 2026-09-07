import { Router } from 'express'
import {
  adminLogin,
  adminMe,
  createAdmin,
  listAdmins,
  deleteAdmin,
} from '../controllers/authController.js'
import { requireAdminAuth, requireSuperAdmin } from '../middleware/requireAdminAuth.js'
import { authLimiter } from '../middleware/rateLimiter.js'

const router = Router()

router.post('/admin/login', authLimiter, adminLogin)
router.get('/admin/me', requireAdminAuth, adminMe)

// Admin account management (superadmin only).
router.get('/admin', requireAdminAuth, requireSuperAdmin, listAdmins)
router.post('/admin', requireAdminAuth, requireSuperAdmin, createAdmin)
router.delete('/admin/:id', requireAdminAuth, requireSuperAdmin, deleteAdmin)

export default router
