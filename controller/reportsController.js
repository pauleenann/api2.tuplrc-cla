import { db } from "../config/db.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logAuditAction } from "./auditController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const fetchCategory = (req,res)=>{
    const q = `SELECT * from reportcategory`

    db.query(q,(err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        res.send(results)
    })
}

export const fetchDetails = (req,res)=>{
    const q = `SELECT * from reportdetail`

    db.query(q,(err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        res.send(results)
    })
}

export const fetchReports = (req,res)=>{
    const {id} = req.params;

    console.log(id)
    const q = `SELECT * from reports WHERE staff_id = ?`

    db.query(q,[id],(err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        res.send(results)
    })
}

export const fetchReport = (req,res)=>{
    const {id} = req.params;
    const q = `
        SELECT 
            rc.cat_name, 
            rd.detail_name,
            r.report_start_date,
            r.report_end_date,
            r.report_name,
            r.report_description,
            r.created_at,
            filepath
        FROM reports r
        JOIN reportcategory rc ON rc.cat_id = r.cat_id
        JOIN reportdetail rd ON rd.detail_id = r.detail_id
        WHERE report_id = ?`;

    db.query(q,[id],(err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        res.send(results)
    })
}

export const saveReport = (req, res)=>{
    const filePath = req.file ? `/public/reports/${req.file.filename}` : null;

        const {
          name,
          description,
          category_id,
          detail_id,
          startDate,
          endDate,
          staff_id ,
          staff_uname,
        } = req.body;
    
        // SQL query to insert report
        const q = `
          INSERT INTO reports (
            report_name, 
            report_description, 
            cat_id, 
            detail_id, 
            report_start_date, 
            report_end_date, 
            staff_id,
            filepath
          ) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            name,
            description,
            category_id,
            detail_id,
            startDate,
            endDate,
            staff_id,
            filePath
        ]
    
        db.query(q, values, (err, result) => {
            if (err) {
              return res.status(500).json({ message: 'Error adding report', error: err });
            }
            logAuditAction(
                staff_uname,
                'INSERT',
                'report',
                null,
                null,
                JSON.stringify("Added new report: " + name)
            );
            res.status(200).json({ message: 'Patron added successfully', result });
          });
        
}



export const generateReports = (req, res) => {
    const {cat_name, detail_name, report_start_date, report_end_date, college, course } = req.query
    console.log(cat_name)
    console.log(detail_name)
    console.log(college)
    console.log(course)

    switch (cat_name) {
        case 'attendance':
          generateAttendance(res, detail_name, report_start_date, report_end_date, college, course);
          break;
        case 'inventory':
          generateInventory(res, detail_name);
          break; 
        case 'circulation':
          generateCirculation(res, detail_name, report_start_date, report_end_date, college, course);
          break;
        case 'patron':
          generatePatron(res,detail_name,college,course);
          break;
        // Add cases for other report types as needed
      }
};

const generatePatron = (res, detail,college,course) => {
    let selectCount = detail == 'top borrowers' ? 'COUNT(cout.patron_id) AS checkout_count,' : '';
    let whereClause = '';
    // let whereClause = detail == 'top borrowers' ? '' : "WHERE cout.status = 'overdue'";
    let groupByClause = '';
    let fromJoin = `FROM patron p`

    switch(detail){
        case 'top borrowers':
            groupByClause+=`GROUP BY p.tup_id, p.patron_fname, p.patron_lname, p.patron_mobile, 
            p.patron_email, p.category, col.college_name, cou.course_name`;
            fromJoin = `FROM checkout cout
                        JOIN patron p ON p.patron_id = cout.patron_id`
            break
        case 'users with overdue':
            whereClause+="WHERE cout.status = 'overdue'";
            fromJoin = `FROM checkout cout
                        JOIN patron p ON p.patron_id = cout.patron_id`
            break
        case 'active patrons':
            whereClause+="WHERE p.status = 'active'";
            break
        case 'inactive patrons':
            whereClause+="WHERE p.status = 'inactive'";
            break
    }

    if (college !== 'all') {
        whereClause+=` AND col.college_id = ${college}`;
    }

    if (course !== 'all') {
        whereClause+=` AND cou.course = ${course}`;
    }


    let q = `
        SELECT 
            p.tup_id,
            p.patron_fname,
            p.patron_lname,
            p.patron_mobile,
            p.patron_email,
            p.category,
            col.college_name,
            cou.course_name,
            ${selectCount}
        ${fromJoin}
        JOIN college col ON p.college_id = col.college_id
        JOIN course cou ON p.course_id = cou.course_id
        ${whereClause}
        ${groupByClause};`;

    // Ensure query does not have trailing commas in SELECT
    q = q.replace(/,\s*FROM/, ' FROM');

    console.log(q)

    db.query(q, (err, results) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        res.send(results);
    });
};


const generateInventory = async (res, detail) => {
    let whereClause = ``;

    const filterConditions = {
        'books': 'resources.type_id = 1',
        'journals': 'resources.type_id = 2',
        'newsletters': 'resources.type_id = 3',
        'theses': 'resources.type_id = 4',
        'available resources': 'resources.avail_id = 1',
        'lost resources': 'resources.avail_id = 2',
        'damaged resources': 'resources.avail_id = 3',
        'archived': 'resources.resource_is_archived = 1',
        'unarchived': 'resources.resource_is_archived = 0',
    };

    if (filterConditions[detail]) {
        whereClause += `WHERE ${filterConditions[detail]} `;
    }

    let q = `
        SELECT 
            resources.resource_title AS 'resource title', 
            resourcetype.type_name AS 'resource type', 
            resources.original_resource_quantity - resources.resource_quantity AS borrowed,
            resources.original_resource_quantity AS quantity,
            department.dept_name AS department,
            COALESCE(topic.topic_name, 'n/a') AS topic,
            GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS authors
        FROM resources
        JOIN resourcetype ON resources.type_id = resourcetype.type_id 
        JOIN department ON department.dept_id = resources.dept_id
        LEFT JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id 
        LEFT JOIN author ON resourceauthors.author_id = author.author_id 
        LEFT JOIN book ON resources.resource_id = book.resource_id
        LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
        LEFT JOIN topic 
            ON book.topic_id = topic.topic_id OR journalnewsletter.topic_id = topic.topic_id
        ${whereClause}
        GROUP BY resources.resource_id
    `;


    console.log(q)
    db.query(q, (err, results) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).send({ error: 'Database query failed' });
        }
        res.send(results);
    });
};

// const generateCirculation = async (res, detail, startDate, endDate) => {
//     let whereClause = '';
//     let orderBy = '';
//     let q;

//     console.log(startDate)
//     // Handle date filtering for all relevant queries
//     let dateFilter = '';
//     if (startDate && endDate) {
//         dateFilter = `AND checkout.checkout_date BETWEEN '${startDate}' AND '${endDate}'`;
//     }

//     switch (detail) {
//         case 'books issued':
//             whereClause += 'WHERE checkout.status = "borrowed"';
//             if (startDate && endDate) whereClause += dateFilter;
//             break;
//         case 'books returned':
//             whereClause += 'WHERE checkout.status = "returned"';
//             if (startDate && endDate) whereClause += dateFilter;
//             break;
//         case 'overdue books':
//             whereClause += 'WHERE checkout.status = "overdue"';
//             if (startDate && endDate) whereClause += dateFilter;
//             break;
//         case 'most borrowed books':
//             orderBy += 'ORDER BY borrowed_times DESC'; 
//             break;
//         case 'daily circulation':
//         case 'monthly circulation':
//         case 'custom circulation':
//             whereClause += `WHERE checkout.checkout_date BETWEEN "${startDate}" AND "${endDate}"`;
//             break;
//         case 'least borrowed books':
//             orderBy = 'ORDER BY borrowed_times ASC';
//             break;
//         default:
//             return res.status(400).send({ error: 'Invalid report type' });
//     }

    
//     if (detail == 'most borrowed books' || detail == 'least borrowed books') {
//         console.log('most/least borrowed')
//         // Shared query structure for both most and least borrowed books
//         q = `SELECT 
//             r.resource_id,
//             r.resource_title, 
//             (SELECT CONCAT(a.author_fname, ' ', a.author_lname) 
//             FROM resourceauthors ra 
//             JOIN author a ON a.author_id = ra.author_id 
//             WHERE ra.resource_id = r.resource_id 
//             ORDER BY ra.author_id ASC 
//             LIMIT 1) AS authors,
//             r.resource_published_date,
//             COUNT(${detail === 'least borrowed books' ? 'DISTINCT cout.checkout_id' : 'r.resource_id'}) AS borrowed_times
//         FROM 
//             resources r
//         JOIN book b ON b.resource_id = r.resource_id
//         ${detail === 'least borrowed books' ? 'LEFT JOIN' : 'JOIN'} checkout cout ON cout.resource_id = r.resource_id
//         GROUP BY r.resource_title, r.resource_published_date, r.resource_id
//         ${orderBy}`;
//     } else {
//         q = `
//             SELECT
//                 resources.resource_title AS 'resource title',
//                 patron.patron_fname AS 'first name',
//                 patron.patron_lname AS 'last name',
//                 patron.category AS category,
//                 college.college_name AS college, 
//                 course.course_name AS course,
//                 checkout.checkout_date AS 'borrowed date',
//                 checkout.checkout_due AS 'due date'
//             FROM 
//                 checkout
//             JOIN patron ON patron.patron_id = checkout.patron_id
//             JOIN resources ON resources.resource_id = checkout.resource_id
//             JOIN college ON patron.college_id = college.college_id
//             JOIN course ON patron.course_id = course.course_id
//             ${whereClause}`;
//     }
    
//     console.log("whereClause:", whereClause);
//     console.log("Final Query:", q);

//     // Use promises for database query
//     try {
        
//         const results = await new Promise((resolve, reject) => {
//             db.query(q, (err, results) => {
//                 if (err) reject(err);
//                 else resolve(results);
//             });
//         });
        
//         return res.send(results);
//     } catch (err) {
//         console.error('Database query failed:', err);
//         return res.status(500).send({ error: 'Database query failed' });
//     }
// };

const generateCirculation = async (res, detail, startDate, endDate, college, course) => {
    let whereClause = [];
    let orderBy = '';
    let q;
    let params = [];

    if (startDate && endDate ) {
        whereClause.push(`checkout.checkout_date BETWEEN ? AND ?`);
        params.push(startDate, endDate);
    }

    switch (detail) {
        case 'books issued':
            whereClause.push('checkout.status = "borrowed"');
            break;
        case 'books returned':
            whereClause.push('checkout.status = "returned"');
            break;
        case 'overdue books':
            whereClause.push('checkout.status = "overdue"');
            break;
        case 'most borrowed books':
            orderBy = 'ORDER BY borrowed_times DESC';
            break;
        case 'least borrowed books':
            orderBy = 'ORDER BY borrowed_times ASC';
            break;
    }

    if (college !== 'all') {
        whereClause.push('college.college_id = ?');
        params.push(college);
    }

    if (course !== 'all') {
        whereClause.push('course.course_id = ?');
        params.push(course);
    }

    let whereString = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    if (detail === 'most borrowed books' || detail === 'least borrowed books') {
        q = `
            SELECT 
                r.resource_id,
                r.resource_title, 
                (SELECT CONCAT(a.author_fname, ' ', a.author_lname) 
                FROM resourceauthors ra 
                JOIN author a ON a.author_id = ra.author_id 
                WHERE ra.resource_id = r.resource_id 
                ORDER BY ra.author_id ASC 
                LIMIT 1) AS authors,
                r.resource_published_date,
                COUNT(DISTINCT cout.checkout_id) AS borrowed_times
            FROM 
                resources r
            JOIN book b ON b.resource_id = r.resource_id
            ${detail === 'least borrowed books' ? 'LEFT JOIN' : 'JOIN'} checkout cout ON cout.resource_id = r.resource_id
            GROUP BY r.resource_title, r.resource_published_date, r.resource_id
            ${orderBy}`;
    } else {
        q = `
            SELECT
                resources.resource_title AS 'resource title',
                patron.patron_fname AS 'first name',
                patron.patron_lname AS 'last name',
                patron.category AS category,
                college.college_name AS college, 
                course.course_name AS course,
                checkout.checkout_date AS 'borrowed date',
                checkout.checkout_due AS 'due date'
            FROM 
                checkout
            JOIN patron ON patron.patron_id = checkout.patron_id
            JOIN resources ON resources.resource_id = checkout.resource_id
            JOIN college ON patron.college_id = college.college_id
            JOIN course ON patron.course_id = course.course_id
            ${whereString}`;
    }

    console.log("Generated Query:", q);
    console.log("Query Parameters:", params);

    try {
        const results = await new Promise((resolve, reject) => {
            db.query(q, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        return res.send(results);
    } catch (err) {
        console.error('Database query failed:', err);
        return res.status(500).send({ error: 'Database query failed' });
    }
};


const generateAttendance = async (res, kind, startDate, endDate, college, course) => {
    let params = [startDate, endDate]
    let q = `
      SELECT 
          patron.tup_id as 'TUP ID',
          patron.patron_fname as 'first name',
          patron.patron_lname as 'last name',
          patron.patron_sex as sex,
          patron.patron_mobile as mobile,
          patron.patron_email as email,
          patron.category as category,
          college.college_name as college,
          course.course_name as course,
          attendance.att_log_in_time as 'time in',
          attendance.att_date as date
      FROM attendance
      JOIN patron ON patron.patron_id = attendance.patron_id
      JOIN college ON patron.college_id = college.college_id
      JOIN course ON patron.course_id = course.course_id
    `;
  
    if (kind == 'daily attendance' || kind == 'monthly attendance' || kind == 'custom attendance') {
      q += `WHERE (attendance.att_date BETWEEN ? AND ?)`;
    }

    if(college!='all'){
        q+= ` AND college.college_id = ?`
        params.push(college)
    }

    if(course!='all'){
        q+= ` AND course.course_id = ?`
        params.push(course)
    }

    console.log(q)

    console.log(params)

    db.query(q,params,(err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        res.send(results)
    })
    
};

export const fetchExcel = (req, res) => {
    const filePath = req.query.filePath; // e.g., "/uploads/reports/sample.xlsx"

    if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
    }

    const absolutePath = path.join(process.cwd(), filePath); // Get full server path

    res.sendFile(absolutePath, (err) => {
        if (err) {
            console.error('Error sending file:', err);
            res.status(500).json({ error: 'File not found or inaccessible' });
        }
    });
}

export const handleArchive = (req,res)=>{
    const {id, reportState, username} = req.body;

    const q = `
        UPDATE reports
        SET is_archived = ?
        WHERE report_id = ?`

    db.query(q,[reportState,id],(err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }
    
        res.send(results)
    })
}