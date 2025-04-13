import { db } from "../config/db.js";


export const featuredBooks = (req, res) => {
    const q = `
    SELECT 
        resources.resource_quantity,
        resources.resource_title, 
        resources.resource_id, 
        book.filepath, 
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS authors
    FROM resourceauthors
    JOIN resources ON resourceauthors.resource_id = resources.resource_id
    JOIN author ON resourceauthors.author_id = author.author_id
    JOIN book ON book.resource_id = resources.resource_id
    WHERE resources.type_id = '1' AND resources.resource_is_archived = 0
    GROUP BY resources.resource_id, resources.resource_title, book.filepath
    ORDER BY RAND()
    LIMIT 10
    `;

    db.query(q, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        console.log(results)
        return res.json(results); // Send the response as JSON
    });
}

export const mostBorrowed = (req,res)=>{
    let q = `
    SELECT 
            r.resource_quantity,
            r.resource_id,
            r.resource_title, 
            (SELECT CONCAT(a.author_fname, ' ', a.author_lname) 
            FROM resourceauthors ra 
            JOIN author a ON a.author_id = ra.author_id 
            WHERE ra.resource_id = r.resource_id 
            ORDER BY ra.author_id ASC 
            LIMIT 1) AS authors,
            r.resource_published_date,
            r.type_id,
            COUNT(r.resource_id) AS borrowed_times,
            b.filepath
        FROM 
            resources r
        JOIN book b ON b.resource_id = r.resource_id
        JOIN checkout cout ON cout.resource_id = r.resource_id
        WHERE r.resource_is_archived = 0
        GROUP BY r.resource_title, r.resource_published_date, r.resource_id
        ORDER BY borrowed_times DESC
        LIMIT 8`

        db.query(q, (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send({ error: 'Database query failed' });
            }
    
            console.log(results)
            return res.json(results); // Send the response as JSON
        });
}

export const featuredDepartment = (req,res)=>{
    const q = `
    SELECT 
        resources.resource_quantity,
        resources.resource_title, 
        resources.resource_id, 
        book.filepath, 
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS authors
    FROM resourceauthors
    JOIN resources ON resourceauthors.resource_id = resources.resource_id
    JOIN author ON resourceauthors.author_id = author.author_id
    JOIN book ON book.resource_id = resources.resource_id
    WHERE resources.dept_id = '4' AND resources.resource_is_archived = 0
    GROUP BY resources.resource_id, resources.resource_title, book.filepath
    ORDER BY RAND()
    LIMIT 10
    `;

    db.query(q, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        console.log(results)
        return res.json(results); // Send the response as JSON
    });
}

export const getSearch = (req, res) => {
    const { search } = req.query;

    // Ensure dept, type, and topic are always arrays and split if comma-separated
    const dept = req.query.dept ? req.query.dept.split(",") : [];
    const type = req.query.type ? req.query.type.split(",") : [];
    const topic = req.query.topic ? req.query.topic.split(",") : [];

    console.log("Search Query:", search);
    console.log("Type Array:", type);
    console.log("Department Array:", dept);
    console.log("Topic Array:", topic);

    // Format search param with wildcards
    const searchParam = search ? `%${search}%` : '%';

    let whereClauses = [`(resources.resource_title LIKE ? OR author.author_fname LIKE ? OR author.author_lname LIKE ?) AND resources.resource_is_archived = 0`];
    let params = [searchParam, searchParam, searchParam];

    if (type.length > 0) {
        whereClauses.push(`resources.type_id IN (${type.map(() => '?').join(', ')})`);
        params.push(...type);
    }

    if (dept.length > 0) {
        whereClauses.push(`resources.dept_id IN (${dept.map(() => '?').join(', ')})`);
        params.push(...dept);
    }

    // Only apply topic filter to book and journalnewsletter tables
    if (topic.length > 0) {
        whereClauses.push(`(book.topic_id IN (${topic.map(() => '?').join(', ')}) OR journalnewsletter.topic_id IN (${topic.map(() => '?').join(', ')}))`);
        params.push(...topic, ...topic);  // Push the topic filter twice: once for book and once for journalnewsletter
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const q = `
        SELECT 
            resources.resource_quantity,
            resources.resource_title,
            resources.resource_id, 
            resources.type_id,
            resources.resource_published_date,
            CASE
                WHEN resources.type_id = '1' THEN book.filepath
                WHEN resources.type_id IN ('2', '3') THEN journalnewsletter.filepath
                ELSE NULL
            END AS filepath,
            (SELECT CONCAT(author.author_fname, ' ', author.author_lname) 
            FROM resourceauthors 
            JOIN author ON resourceauthors.author_id = author.author_id
            WHERE resourceauthors.resource_id = resources.resource_id
            ORDER BY author.author_id ASC
            LIMIT 1) AS authors 
        FROM resources
        LEFT JOIN book ON book.resource_id = resources.resource_id
        LEFT JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
        LEFT JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
        LEFT JOIN author ON resourceauthors.author_id = author.author_id
        ${whereClause}
        GROUP BY resources.resource_id, resources.resource_title, resources.type_id
    `;
    
    console.log(q)
    console.log(whereClause)
    console.log(params)

    db.query(q, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database query failed' });
        }

        console.log(results);
        return res.json(results); // Send the response as JSON
    });
};

export const resourcesView = (req, res) => {
    const {id} = req.params;
    console.log('view id: ', id);

    const q = `
       SELECT 
        resources.resource_title,
        resources.resource_quantity,
        resources.original_resource_quantity,
        resources.resource_published_date,
        resources.resource_id,
        resources.resource_is_circulation,
        resources.type_id,
        department.dept_name,
        department.dept_shelf_no,
        CASE
            WHEN resources.type_id IN ('1', '2', '3') THEN topic.topic_name
            ELSE NULL
        END AS topic_name,
        CASE
            WHEN resources.type_id = '1' THEN book.filepath
            WHEN resources.type_id IN ('2', '3') THEN journalnewsletter.filepath
            ELSE NULL
        END AS filepath,
        topic.topic_row_no,
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS authors
    FROM resources
    LEFT JOIN book ON resources.resource_id = book.resource_id
    LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
    JOIN department ON resources.dept_id = department.dept_id
    LEFT JOIN topic 
        ON book.topic_id = topic.topic_id 
        OR journalnewsletter.topic_id = topic.topic_id
    LEFT JOIN resourceauthors ON resources.resource_id = resourceauthors.resource_id
    LEFT JOIN author ON resourceauthors.author_id = author.author_id
    WHERE resources.resource_id = ? AND resources.resource_is_archived = 0
    GROUP BY 
        resources.resource_id,
        department.dept_name,
        department.dept_shelf_no,
        topic.topic_name,
        topic.topic_row_no`;

    db.query(q, [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        if (results.length > 0) {
            console.log(results);
            // You can also fetch related books here if needed
            const relatedBooksQuery = `
                SELECT 
                    resources.resource_quantity,
                    resources.resource_title,
                    resources.resource_id, 
                    resources.type_id,
                    CASE
                        WHEN resources.type_id = '1' THEN book.filepath
                        WHEN resources.type_id IN ('2', '3') THEN journalnewsletter.filepath
                        ELSE NULL
                    END AS filepath,
                    GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS authors
                FROM resources
                LEFT JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
                LEFT JOIN author ON resourceauthors.author_id = author.author_id
                LEFT JOIN book ON book.resource_id = resources.resource_id
                LEFT JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
                WHERE resources.type_id = ? AND resources.resource_id != ? AND resources.resource_is_archived = 0
                GROUP BY resources.resource_id, resources.resource_title, resources.resource_description, resources.type_id
                ORDER BY RAND()
                LIMIT 5`;

            db.query(relatedBooksQuery, [results[0].type_id,results[0].resource_id], (err, relatedResults) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send({ error: 'Database query failed' });
                }

                // Send both results back to the client
                res.send({ results, relatedBooks: relatedResults });
            });
        } else {
            res.status(404).send({ error: 'Resource not found' });
        }
    });
}