import { Router } from 'express'
import {
  listProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
} from '../controllers/propertiesController.js'
import {
  getAvailability,
  listBlocks,
  createBlock,
  deleteBlock,
} from '../controllers/blockedDatesController.js'
import { requireAdminAuth, attachAdminIfPresent } from '../middleware/requireAdminAuth.js'

const router = Router()

// Public reads. `list` uses optional auth so an admin with a token can pass
// ?all=true to include inactive listings; anonymous callers see active only.
router.get('/', attachAdminIfPresent, listProperties)
router.get('/:id', getProperty)
router.get('/:id/availability', getAvailability)

// Admin writes
router.post('/', requireAdminAuth, createProperty)
router.put('/:id', requireAdminAuth, updateProperty)
router.delete('/:id', requireAdminAuth, deleteProperty)

// Blocked-date management (admin)
router.get('/:id/blocks', requireAdminAuth, listBlocks)
router.post('/:id/blocks', requireAdminAuth, createBlock)
router.delete('/:id/blocks/:blockId', requireAdminAuth, deleteBlock)

export default router
