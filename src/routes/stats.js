import { Router } from 'express'
import { getOverview, getRevenueSeries } from '../controllers/statsController.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'

const router = Router()

router.get('/overview', requireAdminAuth, getOverview)
router.get('/revenue', requireAdminAuth, getRevenueSeries)

export default router
