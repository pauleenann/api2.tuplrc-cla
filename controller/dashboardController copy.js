import { db } from "../config/db.js";

export const totalVisitors = (req, res) => {
    const query = `SELECT COUNT(*) AS total_attendance FROM attendance WHERE DATE(att_date) = curdate()`;
  
    db.query(query, (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
      }
  
      const total_attendance = result[0]?.total_attendance || 0;
      res.json({ total_attendance });
    });
  };

export const totalBorrowed = (req, res) => {
    const query = `SELECT COUNT(*) AS total_borrowed FROM checkout WHERE DATE(checkout_date) = curdate() AND status = 'borrowed'`;
    

    db.query(query, (err, result) => {
        if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
        }

        const total_borrowed = result[0]?.total_borrowed || 0;
        res.json({ total_borrowed });
    });
};

export const totalReturned = (req, res) => {
    const query = `SELECT COUNT(*) AS total_returned FROM checkin WHERE DATE(checkin_date) = curdate()`;

    db.query(query, (err, result) => {
        if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
        }

        const total_returned = result[0]?.total_returned || 0;
        res.json({ total_returned });
    });
};

export const totalOverdue = (req, res) => {
    const query = `SELECT COUNT(*) AS total_overdue FROM overdue`;

    db.query(query, (err, result) => {
        if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
        }

        const total_overdue = result[0]?.total_overdue || 0;
        res.json({ total_overdue });
    });
};

export const overdueBooks = (req, res) => {
    const query = `
       SELECT 
            p.tup_id,
            p.patron_id,
            CONCAT(p.patron_fname, ' ', p.patron_lname) as pname,
            co.resource_id,
            r.resource_title,
            o.overdue_days
        FROM overdue o
        JOIN checkout co ON o.checkout_id = co.checkout_id
        JOIN patron p ON p.patron_id = co.patron_id
        JOIn resources r ON r.resource_id = co.resource_id 
        LIMIT 5;
    `;
    
    db.query(query, (error, results) => {
        if (error) return res.status(500).json({ error });
    
        res.json(results);
    });
};

export const bookStatistics = (req,res)=>{
    const q = `
    WITH week_days AS (
    SELECT 2 AS day_num, 'Monday' AS day_name
    UNION ALL SELECT 3, 'Tuesday'
    UNION ALL SELECT 4, 'Wednesday'
    UNION ALL SELECT 5, 'Thursday'
    UNION ALL SELECT 6, 'Friday'
    UNION ALL SELECT 7, 'Saturday'
    UNION ALL SELECT 1, 'Sunday'  -- Added Sunday for completeness
)
SELECT 
    wd.day_name AS day_of_week,
    COALESCE(COUNT(c.resource_id), 0) AS total_books_borrowed
FROM 
    week_days wd
LEFT JOIN 
    checkout c 
    ON DAYOFWEEK(c.checkout_date) = wd.day_num
    AND c.status = 'Borrowed'  -- ✅ Filter only "Borrowed" records
    AND c.checkout_date >= DATE_ADD(CURDATE(), INTERVAL - WEEKDAY(CURDATE()) DAY)
    AND c.checkout_date < DATE_ADD(CURDATE(), INTERVAL - WEEKDAY(CURDATE()) + 6 DAY)
GROUP BY 
    wd.day_num, wd.day_name
ORDER BY 
    wd.day_num;
`

    db.query(q, (err,result)=>{
        if (err) return res.status(500).send({ error: 'Database query failed' });

        res.send(result)
    })
}

export const visitorStatistics = (req,res)=>{
    const q = `
   WITH week_days AS (
        SELECT 2 AS day_num, 'Monday' AS day_name
        UNION ALL SELECT 3, 'Tuesday'
        UNION ALL SELECT 4, 'Wednesday'
        UNION ALL SELECT 5, 'Thursday'
        UNION ALL SELECT 6, 'Friday'
        UNION ALL SELECT 7, 'Saturday'
    )
    SELECT 
        wd.day_name AS day_of_week,
        COALESCE(COUNT(a.att_date), 0) AS total_attendance
    FROM 
        week_days wd
    LEFT JOIN 
        attendance a ON DAYOFWEEK(a.att_date) = wd.day_num
        AND a.att_date >= DATE_ADD(CURDATE(), INTERVAL - WEEKDAY(CURDATE()) DAY)
        AND a.att_date < DATE_ADD(CURDATE(), INTERVAL - WEEKDAY(CURDATE()) + 6 DAY)
    GROUP BY 
        wd.day_num, wd.day_name
    ORDER BY 
        wd.day_num;`

    db.query(q, (err,result)=>{
        if (err) return res.status(500).send({ error: 'Database query failed' });

        res.send(result)
    })
};

export const bookList = (req, res) => {
    const q = `SELECT 
    r.resource_id, 
    r.resource_title,  
    GROUP_CONCAT(CONCAT(a.author_fname, ' ', a.author_lname)
    ORDER BY a.author_lname SEPARATOR ', ') AS authors,
    r.resource_quantity
    FROM 
        resources AS r
    JOIN 
        resourceauthors AS ra ON r.resource_id = ra.resource_id
    JOIN 
        author AS a ON ra.author_id = a.author_id
    GROUP BY 
        r.resource_id, r.resource_title, r.resource_quantity
    ORDER BY 
        r.resource_id ASC LIMIT 5;
`;

    db.query(q, (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).send({ error: 'Database error', details: err.message });
        } else if (results.length > 0) {
            res.json(results);
        } else {
            res.json({ message: 'No patrons with checkouts found' });
        }
    });
};

export const issuedBooks = (req, res) => {
    const query = `
       SELECT
            p.tup_id,
            r.resource_title,
            DATE_FORMAT(cout.checkout_due, '%Y-%m-%d') AS duedate
        FROM 
            checkout cout
        JOIN patron p ON cout.patron_id = p.patron_id
        JOIN resources r ON cout.resource_id = r.resource_id
        WHERE cout.status = 'borrowed' OR cout.status = 'overdue'
        LIMIT 5;
    `;
    
    db.query(query, (error, results) => {
        if (error) return res.status(500).json({ error });
    
        res.json(results);
    });
};

export const popularChoices = (req, res) => {
    const query = `
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
            b.filepath,
            COUNT(r.resource_id) AS borrowed_times
        FROM 
            resources r
        JOIN book b ON b.resource_id = r.resource_id
        JOIN checkout cout ON cout.resource_id = r.resource_id
        WHERE r.resource_id = cout.resource_id
        GROUP BY r.resource_title, r.resource_published_date, b.filepath, r.resource_id
        ORDER BY borrowed_times DESC
        LIMIT 5;`;
    
    db.query(query, (error, results) => {
        if (error) return res.status(500).json({ error });
    
        res.json(results);
    });
};