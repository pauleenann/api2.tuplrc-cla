import { db } from "../config/db.js";
import { logAuditAction } from "./auditController.js";


// export const catalog = (req, res) => {
//     const keyword = req.query.keyword || '';
//     const offset = parseInt(req.query.offset, 10);
//     const type = parseInt(req.query.type, 10) || 0;
//     const topic = parseInt(req.query.topic, 10) || 0;
//     const department = parseInt(req.query.department, 10) || 0;
//     const author = parseInt(req.query.author, 10) || 0;
//     const title = parseInt(req.query.title, 10) || 0;

//     if (isNaN(offset)) {
//         return res.status(400).send('Invalid offset value');
//     }

//     const searchKeyword = `%${keyword}%`;
//     const params1 = [searchKeyword, searchKeyword, searchKeyword];

//     // Construct WHERE clauses dynamically
//     const whereClauses = [];
//     if (type > 0) whereClauses.push(`resources.type_id = ${type}`);
//     if (department > 0) whereClauses.push(`resources.dept_id = ${department}`);
//     if (topic > 0) whereClauses.push(`(book.topic_id = ${topic} OR journalnewsletter.topic_id = ${topic})`);

//     const whereClause = whereClauses.length ? `AND ${whereClauses.join(' AND ')}` : '';

//     // Construct ORDER BY clause
//     let orderClauses = '';
//     if (title === 1) orderClauses = 'ORDER BY resources.resource_title ASC';
//     else if (title === 2) orderClauses = 'ORDER BY resources.resource_title DESC';
//     if (author === 1) orderClauses = 'ORDER BY author.author_fname ASC';
//     else if (author === 2) orderClauses = 'ORDER BY author.author_fname DESC';

//     const q = `
//         SELECT DISTINCT resources.resource_id
//         FROM resources
//         JOIN resourceauthors ON resources.resource_id = resourceauthors.resource_id
//         JOIN author ON resourceauthors.author_id = author.author_id
//         LEFT JOIN book ON resources.resource_id = book.resource_id
//         LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
//         WHERE (resources.resource_title LIKE ? OR author.author_fname LIKE ? OR author.author_lname LIKE ?)
//         ${whereClause}
//         ${orderClauses}
//         LIMIT 5 OFFSET ?;
//     `;

//     const countQ = `
//         SELECT COUNT(DISTINCT resources.resource_id) AS total
//         FROM resources
//         JOIN resourceauthors ON resources.resource_id = resourceauthors.resource_id
//         JOIN author ON resourceauthors.author_id = author.author_id
//         LEFT JOIN book ON resources.resource_id = book.resource_id
//         LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
//         WHERE (resources.resource_title LIKE ? OR author.author_fname LIKE ? OR author.author_lname LIKE ?)
//         ${whereClause};
//     `;

//     const resourceInfoQ = `
//         SELECT 
//             resources.resource_title, 
//             resources.resource_id, 
//             resourcetype.type_name, 
//             resources.original_resource_quantity, 
//             resources.resource_quantity, 
//             department.dept_name,
//             CASE
//                 WHEN resources.type_id IN ('1', '2', '3') THEN topic.topic_name
//                 ELSE 'n/a'
//             END AS topic_name,
//             GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_names
//         FROM resources
//         JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id 
//         JOIN author ON resourceauthors.author_id = author.author_id 
//         JOIN resourcetype ON resources.type_id = resourcetype.type_id 
//         JOIN department ON department.dept_id = resources.dept_id
//         LEFT JOIN book ON resources.resource_id = book.resource_id
//         LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
//         LEFT JOIN topic 
//             ON (book.topic_id = topic.topic_id OR journalnewsletter.topic_id = topic.topic_id)
//         WHERE resources.resource_id = ?
//         GROUP BY resources.resource_id;
//     `;

//     // Execute count query
//     db.query(countQ, params1, (err, countResult) => {
//         if (err) {
//             console.error('Error counting resources:', err);
//             return res.status(500).send('An internal server error occurred.');
//         }

//         const totalResource = countResult[0]?.total || 0;

//         // Execute resource IDs query
//         db.query(q, [...params1, offset], (err, result) => {
//             if (err) {
//                 console.error('Error fetching resource IDs:', err);
//                 return res.status(500).send('An internal server error occurred.');
//             }

//             if (result.length > 0) {
//                 const resourceIds = result.map(res => res.resource_id);
//                 const resourcePromises = resourceIds.map(id =>
//                     new Promise((resolve, reject) => {
//                         db.query(resourceInfoQ, [id], (err, resourceResult) => {
//                             if (err) return reject(err);
//                             resolve(resourceResult[0] || null);
//                         });
//                     })
//                 );

//                 Promise.all(resourcePromises)
//                     .then(resources => {
//                         const validResources = resources.filter(r => r !== null);
//                         res.send({ validResources, totalResource });
//                     })
//                     .catch(err => {
//                         console.error('Error fetching resource details:', err);
//                         res.status(500).send('An internal server error occurred.');
//                     });
//             } else {
//                 res.send({ validResources: [], totalResource });
//             }
//         });
//     });
// };

export const catalog = (req, res) => {
    const { keyword, type, dept, topic, isArchived } = req.query;
    console.log("Search Query:", keyword);
    console.log("Type Array:", type);
    console.log("Department Array:", dept);
    console.log("Topic Array:", topic);

    // Format search param with wildcards
    const searchParam = keyword ? `%${keyword}%` : '%';

    // WHERE clauses array
    let whereClauses = [`(resources.resource_title LIKE ? OR author.author_fname LIKE ? OR author.author_lname LIKE ?)`];
    let params = [searchParam, searchParam, searchParam];

    // Handle type filtering (ensure it's an array)
    if (type.length>0) {
        whereClauses.push(`resources.type_id IN (?)`);
        params.push(type);
    }

    // Handle department filtering (ensure it's an array)
    if (dept.length>0) {
        whereClauses.push(`resources.dept_id IN (?)`);
        params.push(dept);
    }

    // Handle topic filtering (ensure it's an array)
    if (topic.length>0) {
        whereClauses.push(`(book.topic_id IN (?) OR journalnewsletter.topic_id IN (?))`);
        params.push(topic, topic);
    }

    // Handle archive/unarchive
    if (isArchived) {
        whereClauses.push(`resources.resource_is_archived = ?`);
        params.push(isArchived);
    }

    // Combine WHERE clause
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // SQL query
    const q = `
        SELECT 
            resources.resource_quantity,
            resources.resource_title,
            resources.resource_is_archived,
            resources.resource_id, 
            resources.original_resource_quantity,
            resources.resource_quantity,
            resourcetype.type_name,
            department.dept_name,
            topic.topic_name,
            resources.resource_published_date,
            CASE
                WHEN resources.type_id = 1 THEN book.filepath
                WHEN resources.type_id IN (2, 3) THEN journalnewsletter.filepath
                ELSE NULL
            END AS filepath,
            GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_names 
        FROM resources
        JOIN resourcetype ON resourcetype.type_id = resources.type_id
        JOIN department ON department.dept_id = resources.dept_id
        LEFT JOIN book ON book.resource_id = resources.resource_id
        LEFT JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
        LEFT JOIN topic ON COALESCE(book.topic_id, journalnewsletter.topic_id) = topic.topic_id
        LEFT JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
        LEFT JOIN author ON resourceauthors.author_id = author.author_id
        ${whereClause}
        GROUP BY 
            resources.resource_id, 
            resources.resource_title, 
            resources.type_id, 
            resources.resource_quantity,
            resourcetype.type_name,
            department.dept_name,
            topic.topic_name,
            resources.resource_published_date
        ORDER BY resources.timestamp DESC
    `;

    console.log(q);
    console.log(params);

    // Execute query
    db.query(q, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        return res.json(results); // Send the response as JSON
    });
};


export const barcodeData = (req,res)=>{
    const q = `
        SELECT 
            r.resource_id,
            r.resource_title,
            t.type_name,
            b.book_isbn AS isbn
        FROM resources r
        JOIN resourcetype t ON r.type_id = t.type_id
        LEFT JOIN book b ON r.resource_id = b.resource_id
        WHERE r.type_id = '1'
    `;

        db.query(q,(err,results)=>{
            if(err) return res.send(err)
               return res.json(results)
        })
}

export const archive = (req,res)=>{
    console.log(req.body)
    const {id,resourceState,username} = req.body;
    // updated avail_id
    const availId = resourceState==1?4:1;
    const oldValue = resourceState==1?'Unarchived':'Archived';
    const newValue = resourceState==1?'Archived':'Unarchived';

    const q = `
    UPDATE resources
    SET resource_is_archived = ?
    WHERE resource_id = ?`

    db.query(q,[resourceState,id],(err,results)=>{
        if(err) return res.send(err)
        
        const availQ = `
        UPDATE resources
        SET avail_id = ?
        WHERE resource_id = ?`

        db.query(availQ,[availId,id],(err,results)=>{
            if(err) return res.send(err)
            
            logAuditAction(username, 'UPDATE', 'resources', id, oldValue, JSON.stringify("Changed archive status to: " + newValue));
            return res.json(results)
        })
    })
}
