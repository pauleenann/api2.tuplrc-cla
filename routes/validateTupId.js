import express from 'express';
import { dbPromise } from "../config/db.js";

const router = express.Router();

router.post('', async (req, res) => {
    console.log('Received TUP ID for validation:', req.body.tup_id);
    const { tup_id } = req.body;

    if (!tup_id) {
        return res.status(400).json({ message: 'TUP ID is required.' });
    }

    try {
        const query = 'SELECT * FROM patron WHERE tup_id = ?';
        const [rows] = await dbPromise.execute(query, [tup_id]);
        res.status(200).json({ exists: rows.length > 0 });
    } catch (err) {
        console.error('Error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router; // Use ES module default export
