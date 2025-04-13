import express from 'express'
import { featuredBook, featuredBooks, journalNewsletter, resources, resourcesView } from '../controller/onlineCatalogController.js'

const router = express.Router()

router.get('/featured-books', featuredBooks)
router.get('/journal-newsletters', journalNewsletter)
router.get('/featured-book', featuredBook)
router.get('/resources/view', resourcesView)
router.get('/resources', resources)

export default router

