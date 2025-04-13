import express from 'express'
import { getAudit } from '../controller/auditController.js'

const router = express.Router()

router.get('/', getAudit)

export default router