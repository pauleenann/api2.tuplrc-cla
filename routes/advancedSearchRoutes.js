import express from 'express';
import { getAdvancedSearch, getAdvancedSearchOnlineCatalog } from '../controller/advancedSearchController.js';

const router = express.Router()

router.get('/', getAdvancedSearch);
router.get('/online', getAdvancedSearchOnlineCatalog);

export default router