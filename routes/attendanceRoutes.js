import express from 'express'
import { attendance } from '../controller/attendanceController.js'

const router = express.Router()

router.post('/', attendance)

export default router