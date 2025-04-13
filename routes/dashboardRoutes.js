import express from 'express';
import { bookList, bookStatistics, issuedBooks, overdueBooks, popularChoices, totalBorrowed, totalOverdue, totalReturned, totalVisitors, visitorStatistics } from '../controller/dashboardController.js';

const router = express.Router();

router.get("/total-visitors",totalVisitors);
router.get("/total-borrowed", totalBorrowed);
router.get("/total-returned", totalReturned);
router.get("/total-overdue", totalOverdue);
router.get("/overdue-books", overdueBooks);
router.get("/book-statistics", bookStatistics);
router.get("/visitor-statistics", visitorStatistics);
router.get("/book-list", bookList);
router.get("/issued-books", issuedBooks);
router.get("/popular-choices", popularChoices);

export default router;