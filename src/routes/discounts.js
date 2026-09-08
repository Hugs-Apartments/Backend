import { Router } from 'express'
import {
  validateDiscount,
  listDiscounts,
  createDiscount,
  updateDiscount,
  deleteDiscount,
} from '../controllers/discountsController.js'
import { requireAdminAuth } from '../middleware/requireAdminAuth.js'

const router = Router()

// Public: a guest checks a promo code against their subtotal before paying.
router.post('/validate', validateDiscount)

// Admin: manage the codes.
router.get('/', requireAdminAuth, listDiscounts)
router.post('/', requireAdminAuth, createDiscount)
router.patch('/:id', requireAdminAuth, updateDiscount)
router.delete('/:id', requireAdminAuth, deleteDiscount)

export default router
