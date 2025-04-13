import { db } from "../config/db.js";

// Function to log user actions
export const logAuditAction = (userId, actionType, tableName, recordId, oldValue = null, newValue = null) => {
    const query = `
        INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_value, new_value)
        VALUES (?, ?, ?, ?, ?, ?)`;

    const values = [userId, actionType, tableName, recordId, oldValue, newValue];

    db.query(query, values, (err, results) => {
        if (err) {
            console.error('Error logging audit action:', err);
        } else {
            console.log('Audit action logged successfully:', results);
        }
    });
};

export const getAudit = (req, res) => {
    const q = `SELECT * FROM audit_log ORDER BY audit_id DESC`;

    db.query(q, (err, results) => {
        if (err) {
            console.error('Database query error:', err.message);
            res.status(500).send({ error: 'Database error', details: err.message });
        } else {
            res.json(results.length > 0 ? results : []);
        }
    });
}