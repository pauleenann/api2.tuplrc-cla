import express from 'express';
import { archive, barcodeData, catalog } from '../controller/catalogController.js';

const router = express.Router();

router.get("/", catalog)
router.get("/generate-barcode", barcodeData)
router.post("/", archive)


export default router;