import express from 'express';
import { addPatron, borrowers, checkIn, checkOut, importPatron, patron, patronCirculation, patronLog, patronSort, updatePatron, viewPatron, viewPatronToUpdate, } from '../controller/patronController.js';

const router = express.Router();

router.get("/sort", patronSort);
router.get("/borrowers", borrowers);
router.post("/", addPatron);
router.get("/", patron);
router.get("/checkin", checkIn);
router.get("/checkout", checkOut)
router.post("/import", importPatron)
router.get('/log/:id', patronLog)
router.get('/circulation/:id', patronCirculation)
router.put("/update/:id", updatePatron);
router.get("/:id", viewPatron);
router.get("/update/:id",viewPatronToUpdate);


export default router;
