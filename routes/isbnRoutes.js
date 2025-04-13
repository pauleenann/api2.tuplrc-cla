import express from 'express'
import { fetchIsbn } from '../controller/isbnController.js'

const router = express.Router()

router.get('/:isbn', fetchIsbn)

export default router