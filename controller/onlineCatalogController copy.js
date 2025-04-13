import { db } from "../config/db.js";


export const featuredBooks = (req, res) => {
    const q = `
    SELECT 
        resources.resource_title, 
        resources.resource_id, 
        book.filepath as resource_cover, 
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_name
    FROM resourceauthors
    JOIN resources ON resourceauthors.resource_id = resources.resource_id
    JOIN author ON resourceauthors.author_id = author.author_id
    JOIN book ON book.resource_id = resources.resource_id
    WHERE resources.type_id = '1'
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

export const journalNewsletter = (req, res) => {
    const q = `
    SELECT 
        resources.resource_title, 
        resources.resource_id, 
        journalnewsletter.filepath as resource_cover, 
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_name
    FROM resourceauthors
    JOIN resources ON resourceauthors.resource_id = resources.resource_id
    JOIN author ON resourceauthors.author_id = author.author_id
    JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
    WHERE resources.type_id = '2' OR resources.type_id = '3'  
    GROUP BY resources.resource_id, resources.resource_title, journalnewsletter.filepath
    ORDER BY RAND()
    LIMIT 10`;

    db.query(q, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        console.log(results)
        return res.json(results); // Send the response as JSON
    });
}

export const featuredBook = (req, res) => {
    const q = `
       SELECT 
            resources.resource_title,
            resources.resource_description,
            resources.resource_id, 
            book.filepath, 
            GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_name
        FROM resourceauthors
        JOIN resources ON resourceauthors.resource_id = resources.resource_id
        JOIN author ON resourceauthors.author_id = author.author_id
        JOIN book ON book.resource_id = resources.resource_id
        WHERE LENGTH(resources.resource_description) > 10
        GROUP BY resources.resource_id, resources.resource_title, book.filepath
        ORDER BY RAND()
        LIMIT 1`;

    db.query(q, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        console.log(results)
        return res.json(results); // Send the response as JSON
    });
}

export const resourcesView = (req, res) => {
    const id = req.query.id;
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
        END AS resource_cover,
        topic.topic_row_no,
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_name
    FROM resources
    LEFT JOIN book ON resources.resource_id = book.resource_id
    LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
    JOIN department ON resources.dept_id = department.dept_id
    LEFT JOIN topic 
        ON book.topic_id = topic.topic_id 
        OR journalnewsletter.topic_id = topic.topic_id
    LEFT JOIN resourceauthors ON resources.resource_id = resourceauthors.resource_id
    LEFT JOIN author ON resourceauthors.author_id = author.author_id
    WHERE resources.resource_id = ?
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
                    resources.resource_title,
                    resources.resource_id, 
                    resources.type_id,
                    CASE
                        WHEN resources.type_id = '1' THEN book.filepath
                        WHEN resources.type_id IN ('2', '3') THEN journalnewsletter.filepath
                        ELSE NULL
                    END AS resource_cover,
                    GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_name
                FROM resources
                LEFT JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
                LEFT JOIN author ON resourceauthors.author_id = author.author_id
                LEFT JOIN book ON book.resource_id = resources.resource_id
                LEFT JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
                WHERE resources.type_id = ? AND resources.resource_id != ?
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

export const resources = (req, res) => {
    const offset = parseInt(req.query.offset, 10) || 0;
    const keyword = `%${req.query.keyword || ''}%`;
    const type = req.query.type ? req.query.type.map(item => parseInt(item, 10)) : []
    const department = req.query.department ? req.query.department.map(item => parseInt(item, 10)) : []
    const topic = req.query.topic ? req.query.topic.map(item => parseInt(item, 10)) : []
    const sort = req.query.sort

    let whereClauses = [`(resources.resource_title LIKE ? OR author.author_fname LIKE ? OR author.author_lname LIKE ?)`];
    let params = [keyword, keyword, keyword];

    if (type.length > 0) {
        whereClauses.push(`resources.type_id IN (${type.map(() => '?').join(', ')})`);
        params.push(...type);
    }

    if (department.length > 0) {
        whereClauses.push(`resources.dept_id IN (${department.map(() => '?').join(', ')})`);
        params.push(...department);
    }

    // Only apply topic filter to book and journalnewsletter tables
    if (topic.length > 0) {
        whereClauses.push(`(book.topic_id IN (${topic.map(() => '?').join(', ')}) OR journalnewsletter.topic_id IN (${topic.map(() => '?').join(', ')}) )`);
        params.push(...topic, ...topic);  // Push the topic filter twice: once for book and once for journalnewsletter
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let sortBy = 'ORDER BY resources.resource_title ASC'; // Default sorting

    if (sort === 'a-z') {
        sortBy = 'ORDER BY resources.resource_title ASC';
    } else if (sort === 'z-a') {
        sortBy = 'ORDER BY resources.resource_title DESC';
    } else if (sort === 'newest') {
        sortBy = 'ORDER BY resources.resource_published_date DESC';
    } else if (sort === 'oldest') {
        sortBy = 'ORDER BY resources.resource_published_date ASC';
    }

    console.log(sort)
    const q = `
        SELECT 
            resources.resource_title,
            resources.resource_id, 
            resources.type_id,
            CASE
                WHEN resources.type_id = '1' THEN book.filepath
                WHEN resources.type_id = '2' OR resources.type_id = '3' THEN journalnewsletter.filepath
            ELSE NULL
            END AS resource_cover,
            GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_name
        FROM resources
        LEFT JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
        LEFT JOIN author ON resourceauthors.author_id = author.author_id
        LEFT JOIN book ON book.resource_id = resources.resource_id
        LEFT JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
        ${whereClause}
        GROUP BY resources.resource_id, resources.resource_title, resources.resource_description, resources.type_id
        ${sortBy}
        LIMIT 10 OFFSET ?
    `;

     const countQ = `
        SELECT COUNT(DISTINCT resources.resource_id) AS total
        FROM resources
        LEFT JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
        LEFT JOIN author ON resourceauthors.author_id = author.author_id
        LEFT JOIN book ON book.resource_id = resources.resource_id
        LEFT JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
        ${whereClause}
    `;


    console.log('type: ', type)
    console.log('offset: ', offset)
    console.log('keyword: ', keyword)
    console.log('q: ', q)
    
    params.push(offset); // Add the offset as the last parameter
    console.log('params: ', params)

    // Execute the count query first
    db.query(countQ, params.slice(0, -1), (countErr, countResults) => {
        if (countErr) {
            console.error(countErr);
            return res.status(500).send({ error: 'Failed to fetch total count' });
        }

        const total = countResults[0].total;

        // Execute the main query
        db.query(q, params, (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send({ error: 'Database query failed' });
            }
            // console.log(results);
            return res.json({ results, total });
        });
    });
}