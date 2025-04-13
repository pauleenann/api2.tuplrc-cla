import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchCategory, fetchDetails, fetchExcel, fetchReport, fetchReports, generateReports, handleArchive, saveReport } from '../controller/reportsController.js';

// Define __dirname manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadsDir = path.join(__dirname, '../public/reports');

      // Create directory if it doesn't exist
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      // Keep the original filename which includes the timestamp
      cb(null, file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
      // Accept only Excel files
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        cb(null, true);
      } else {
        cb(new Error('Only Excel files are allowed'), false);
      }
    }
});
  

router.get('/categories', fetchCategory)
router.get('/details', fetchDetails)
router.post('/', upload.single('report_file'),saveReport)
router.get('/generate-report', generateReports);
router.get('/fetch-excel', fetchExcel);
router.get('/view/:id', fetchReport);
router.get('/:id', fetchReports);
router.put('/archive', handleArchive)

export default router;