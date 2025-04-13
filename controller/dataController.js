import { db } from "../config/db.js";

export const college = (req,res)=>{
    const q = 'SELECT * FROM college ORDER BY college_name ASC'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
};

export const course = (req,res)=>{
    const q = 'SELECT * FROM course ORDER BY course_name ASC'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
};

export const departments = (req,res)=>{
    const q = 'SELECT * FROM department ORDER BY dept_name ASC'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
};

export const topic = (req,res)=>{
    const q = 'SELECT * FROM topic ORDER BY topic_name ASC'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
};

export const publishers = (req,res)=>{
    const q = 'SELECT * FROM publisher ORDER BY pub_name ASC'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
};

export const authors = (req,res)=>{
    const q = 'SELECT * FROM author ORDER BY author_fname ASC'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
};

export const advisers = (req,res)=>{
    const q = 'SELECT * FROM adviser ORDER BY adviser_fname ASC'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
};


export const type = (req,res)=>{
    const q = 'SELECT * FROM resourcetype'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
};

export const status = (req,res)=>{
    const q = 'SELECT * FROM availability'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
};

export const roles = (req,res)=>{
    const q = 'SELECT * FROM roles'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
};

export const getTopicsByDepartment = (req,res)=>{
    const {dept_id} = req.params
    const q = `SELECT * FROM topic WHERE dept_id = ${dept_id}`

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
};

export const addDept = (req, res) => {
    const { dept_id, dept_name, dept_shelf_no } = req.body;

    if (!dept_name || !dept_shelf_no) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    if (dept_id) {
        // Update existing department
        const updateQuery = `UPDATE department SET dept_name = ?, dept_shelf_no = ? WHERE dept_id = ?`;
        db.query(updateQuery, [dept_name, dept_shelf_no, dept_id], (err, results) => {
            if (err) {
                console.error("Error updating department:", err);
                return res.status(500).json({ success: false, message: "Database error", error: err });
            }
            return res.status(200).json({ success: true, message: "Department updated successfully!" });
        });
    } else {
        // Insert new department
        const insertQuery = `INSERT INTO department (dept_name, dept_shelf_no) VALUES (?, ?)`;
        db.query(insertQuery, [dept_name, dept_shelf_no], (err, results) => {
            if (err) {
                console.error("Error inserting department:", err);
                return res.status(500).json({ success: false, message: "Database error", error: err });
            }
            return res.status(201).json({ 
                success: true, 
                message: "Department added successfully!", 
                insertedId: results.insertId 
            });
        });
    }
};

/* export const addTopic = (req, res) => {
    const { topic_name, topic_row_no, dept_id } = req.body;

    if (!topic_name || !topic_row_no || !dept_id) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const q = `INSERT INTO topic (topic_name, topic_row_no, dept_id) VALUES (?, ?, ?)`;

    db.query(q, [topic_name, topic_row_no, dept_id], (err, results) => {
        if (err) {
            console.error("Error inserting topic:", err);
            return res.status(500).json({ success: false, message: "Database error", error: err });
        }

        return res.status(201).json({ 
            success: true, 
            message: "Topic added successfully!", 
            insertedId: results.insertId 
        });
    });
};
 */

export const addTopic = (req, res) => {
    const { topic_id, topic_name, topic_row_no, dept_id } = req.body;

    if (!topic_name || !topic_row_no || !dept_id) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    if (topic_id) {
        // Update existing topic
        const updateQuery = `UPDATE topic SET topic_name = ?, topic_row_no = ?, dept_id = ? WHERE topic_id = ?`;
        db.query(updateQuery, [topic_name, topic_row_no, dept_id, topic_id], (err, results) => {
            if (err) {
                console.error("Error updating topic:", err);
                return res.status(500).json({ success: false, message: "Database error", error: err });
            }
            
            return res.status(200).json({ 
                success: true, 
                message: "Topic updated successfully!", 
                affectedRows: results.affectedRows 
            });
        });
    } else {
        // Insert new topic
        const insertQuery = `INSERT INTO topic (topic_name, topic_row_no, dept_id) VALUES (?, ?, ?)`;
        db.query(insertQuery, [topic_name, topic_row_no, dept_id], (err, results) => {
            if (err) {
                console.error("Error inserting topic:", err);
                return res.status(500).json({ success: false, message: "Database error", error: err });
            }

            return res.status(201).json({ 
                success: true, 
                message: "Topic added successfully!", 
                insertedId: results.insertId 
            });
        });
    }
};
