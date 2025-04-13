import express from "express";
import { checkIn, checkinSearch, checkOut, checkoutRecord, checkoutSearch } from "../controller/circulationController.js";

const router = express.Router();

router.get('/checkout/search', checkoutSearch);
router.get('/checkin/search', checkinSearch);
router.get('/checkout-record', checkoutRecord)
router.post('/checkin', checkIn);
router.post('/checkout',checkOut);  

export default router;
