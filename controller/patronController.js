import { db } from "../config/db.js";
import { dbPromise } from "../config/db.js";
import { logAuditAction } from "./auditController.js";

export const patronSort = (req, res) => {
    const { search, startDate, endDate, limit, page, filter } = req.query;

    let q = `
        SELECT 
            patron.patron_id, 
            patron.tup_id, 
            patron.patron_fname, 
            patron.patron_lname, 
            patron.patron_sex, 
            patron.patron_mobile,
            patron.patron_email, 
            course.course_name AS course, 
            college.college_name AS college, 
            DATE(attendance.att_date) AS att_date, 
            attendance.att_log_in_time 
        FROM patron 
        JOIN course ON patron.course_id = course.course_id 
        JOIN college ON patron.college_id = college.college_id 
        JOIN attendance ON patron.patron_id = attendance.patron_id 
        WHERE 1=1
    `;

    const params = [];

    // Apply search filter
    if (search) {
        q += ` AND (patron.tup_id LIKE ? OR patron.patron_fname LIKE ? OR patron.patron_lname LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Check if filter=today is passed
    if (filter === "today") {
        const today = new Date().toISOString().split('T')[0]; // Get today's date (YYYY-MM-DD)
        q += ` AND DATE(attendance.att_date) = ?`;
        params.push(today);
    } else {
        // Apply date range filters if provided
        if (startDate) {
            q += ` AND DATE(attendance.att_date) >= ?`;
            params.push(startDate);
        }
    
        if (endDate) {
            q += ` AND DATE(attendance.att_date) <= ?`;
            params.push(endDate);
        }
    }

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) AS total FROM (${q}) AS countQuery`;

    db.query(countQuery, params, (err, countResult) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Database error: ' + err.message);
            return;
        }

        const total = countResult[0].total;

        // Add pagination only if limit is not "All"
        if (limit !== "null" && limit !== "All") {
            const offset = (page - 1) * limit;
            q += ` ORDER BY att_date DESC, att_log_in_time DESC LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), parseInt(offset));
        } else {
            q += ` ORDER BY att_date DESC, att_log_in_time DESC`; // No limit or offset
        }

        db.query(q, params, (err, results) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Database error: ' + err.message);
            } else {
                res.json({ results, total });
            }
        });
    });
};

export const borrowers = (req, res) => {
    const { page = 1, limit = 10, query = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    console.log('Query:', query);

    let whereQuery = '';
    if (query === 'returned' || query === 'borrowed' || query === 'overdue') {
        whereQuery = `WHERE c.status = '${query}'`;
    }

    console.log('Where Clause:', whereQuery);

    const countQuery = `
        SELECT COUNT(*) AS totalCount 
        FROM checkout c
        INNER JOIN patron p ON p.patron_id = c.patron_id
        INNER JOIN resources r ON c.resource_id = r.resource_id
        INNER JOIN course ON p.course_id = course.course_id
        LEFT JOIN checkin ci ON c.checkout_id = ci.checkout_id
        ${whereQuery}
    `;

    const dataQuery = `
        SELECT 
            p.tup_id, 
            p.patron_fname, 
            p.patron_lname, 
            p.patron_email, 
            p.category, 
            c.checkout_id,
            c.checkout_date,
            c.checkout_due,
            c.status,
            r.resource_id,
            r.resource_title AS borrowed_book,
            course.course_name AS course, 
            ci.checkin_date,
            GROUP_CONCAT(DISTINCT CONCAT(a.author_fname, ' ', a.author_lname) ORDER BY a.author_lname SEPARATOR ', ') AS authors,
            CASE 
                WHEN c.status = 'borrowed' THEN 'Currently Borrowed'
                WHEN c.status = 'returned' THEN 'Returned'
                ELSE 'Other'
            END AS status_category
        FROM 
            patron p
        INNER JOIN 
            checkout c ON p.patron_id = c.patron_id
        INNER JOIN 
            resources r ON c.resource_id = r.resource_id
        INNER JOIN 
            course ON p.course_id = course.course_id
        INNER JOIN 
            resourceauthors ra ON ra.resource_id = r.resource_id
        INNER JOIN 
            author a ON a.author_id = ra.author_id
        LEFT JOIN 
            checkin ci ON c.checkout_id = ci.checkout_id
        ${whereQuery}
        GROUP BY 
            c.checkout_id, r.resource_id, p.tup_id
        ORDER BY 
            status_category, 
            c.checkout_date DESC
        LIMIT ? OFFSET ?;

    `;

    db.query(countQuery, (err, countResult) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database error', details: err.message });
        }

        const totalCount = countResult[0].totalCount;

        db.query(dataQuery, [parseInt(limit), parseInt(offset)], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send({ error: 'Database error', details: err.message });
            }

            res.json({ data: results, totalCount });
        });
    });
};

export const patron = (req, res) => {
    const q = `SELECT 
                p.patron_id,
                p.tup_id,
                p.patron_fname,
                p.patron_lname,
                p.patron_email,
                p.category,
                p.status,
                cr.course_name,
                COUNT(CASE WHEN (c.status = 'borrowed' OR c.status = 'overdue') THEN 1 END) AS total_checkouts
            FROM 
                patron p
            LEFT JOIN 
                checkout c ON p.patron_id = c.patron_id
            LEFT JOIN 
                course cr ON p.course_id = cr.course_id
            
            GROUP BY 
                p.tup_id, 
                p.patron_fname, 
                p.patron_lname, 
                p.patron_email, 
                p.category, 
                cr.course_name
            ORDER BY p.tup_id DESC
    `;

    db.query(q, (err, results) => {
        if (err) {
        res.send(err);
        } else if (results.length > 0) {
        res.json(results);
        } else {
        res.json({ message: 'No patrons found' });
        }
    });
};

export const checkIn = (req, res) => {
    const q = `SELECT 
                    p.patron_id,
                    p.tup_id,
                    p.patron_fname,
                    p.patron_lname,
                    p.patron_email,
                    p.status,
                    p.category,
                    cr.course_name,
                    COUNT(c.checkout_id) AS total_checkouts
                FROM 
                    patron p
                LEFT JOIN 
                    checkout c 
                ON 
                    p.patron_id = c.patron_id AND (c.status = 'borrowed' OR c.status = 'overdue')
                LEFT JOIN 
                    course cr
                ON 
                    p.course_id = cr.course_id
                GROUP BY 
                    p.tup_id, 
                    p.patron_fname, 
                    p.patron_lname, 
                    p.patron_email, 
                    p.category, 
                    cr.course_name
                HAVING 
                    COUNT(c.checkout_id) > 0;
    `;
    
    db.query(q, (err, results) => {
        if (err) {
        res.send(err);
        } else if (results.length > 0) {
        res.json(results);
        } else {
        res.json({ message: 'No patrons found' });
        }
    });
};

export const checkOut = async (req, res) => {
    const { id } = req.query;

    if (!id) {
        return res.status(400).json({ message: 'Missing id parameter' });
    }

    const query = `
        SELECT 
            patron.patron_id, 
            patron.tup_id, 
            patron.patron_fname, 
            patron.patron_lname, 
            patron.patron_sex, 
            patron.patron_mobile,
            patron.patron_email, 
            course.course_name AS course, 
            college.college_name AS college 
        FROM patron 
        JOIN course ON patron.course_id = course.course_id 
        JOIN college ON patron.college_id = college.college_id 
        WHERE patron.patron_id = ?;
    `;

    try {
        const [results] = await (await dbPromise).execute(query, [id]);
        if (results.length === 0) {
        return res.status(404).json({ message: 'Patron not found' });
        }
        res.status(200).json([results[0]]);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};

export const viewPatronToUpdate = async (req, res) => {
    console.log(`Received PUT request for patron ID: ${req.params.id}`);
    console.log('Request body:', req.body);
    const patronId = req.params.id;
    const query = `
        SELECT 
            p.patron_id, 
            p.tup_id, 
            p.patron_fname, 
            p.patron_lname, 
            p.patron_sex, 
            p.patron_mobile, 
            p.patron_email, 
            p.category, 
            p.status,
            p.college_id, 
            p.course_id, 
            col.college_name, 
            cr.course_name
        FROM patron p
        LEFT JOIN college col ON p.college_id = col.college_id
        LEFT JOIN course cr ON p.course_id = cr.course_id
        WHERE p.patron_id = ?;
    `;

    try {
        const [results] = await (await dbPromise).execute(query, [patronId]);
        if (results.length === 0) {
            return res.status(404).json({ message: 'Patron not found' });
        }

        const patronData = results[0];

        // Fetch colleges and courses for dropdown options
        const [colleges] = await (await dbPromise).execute('SELECT * FROM college');
        const [courses] = await (await dbPromise).execute('SELECT * FROM course');

        res.json({ patronData, colleges, courses });
    } catch (err) {
        console.error('Error fetching patron data:', err);
        res.status(500).send('Internal Server Error');
    }
};

export const addPatron = (req, res) => {
    const {
        patron_fname,
        patron_lname,
        patron_sex,
        patron_mobile,
        patron_email,
        category,
        patron_status,
        college,  // college_id
        program,  // course_id
        tup_id,
        username,
    } = req.body;

    const values = [
        patron_fname,
        patron_lname,
        patron_sex,
        patron_mobile,
        patron_email,
        category,
        patron_status,
        college,
        program,
        tup_id,
    ]

    console.log(values)
  
  // SQL query to insert new patron into the database
  const query = 'INSERT INTO patron (patron_fname, patron_lname, patron_sex, patron_mobile, patron_email, category, status, college_id, course_id, tup_id) VALUES (?,?, ?, ?, ?, ?, ?, ?, ?,?)';

  console.log(query)
  // Execute the query with the data from the request body
  db.query(query, values, (err, result) => {
    if (err) {
        console.log(err)
      return res.status(500).json({ message: 'Error adding patron', error: err });
    }
    logAuditAction(
        username,
        'INSERT',
        'patron',
        null,
        null,
        JSON.stringify("Added new patron: " + patron_fname + " " + patron_lname)
    );
    res.status(200).json({ message: 'Patron added successfully', result });
  });
};

export const updatePatron = async (req, res) => {
    const patronId = req.params.id;
    const {
        patron_fname,
        patron_lname,
        patron_sex,
        patron_mobile,
        patron_email,
        category,
        patron_status,
        college,  // college_id
        program,  // course_id
        tup_id,
        username,
    } = req.body;

    const query = `
        UPDATE patron
        SET 
            patron_fname = ?, 
            patron_lname = ?, 
            patron_sex = ?, 
            patron_mobile = ?, 
            patron_email = ?, 
            category = ?, 
            status = ?,
            college_id = ?, 
            course_id = ?, 
            tup_id = ?
        WHERE patron_id = ?;
    `;

    try {
        const [result] = await (await dbPromise).execute(query, [
            patron_fname,
            patron_lname,
            patron_sex,
            patron_mobile,
            patron_email,
            category,
            patron_status,
            college,
            program,
            tup_id,
            patronId,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Patron not found' });
        }

        logAuditAction(
            username,
            'UPDATE',
            'patron',
            null,
            null,
            JSON.stringify("Edited a patron: " + patron_fname + " " + patron_lname))

        res.json({ message: 'Patron updated successfully' });
    } catch (err) {
        console.error('Error updating patron:', err);
        res.status(500).send('Internal Server Error');
    }
};

export const patronLog = (req,res)=>{
    const id = req.params.id;

    const q = `
        SELECT att_log_in_time, att_date 
        FROM attendance 
        WHERE patron_id = ?`

    db.query(q,[id],(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
}

export const viewPatron = (req,res)=>{
    const id = req.params.id;
    console.log(id)

    const q = `SELECT  
            p.patron_fname,
            p.patron_lname,
            p.tup_id,
            p.patron_sex,
            p.patron_mobile,
            p.patron_email,
            p.category,
            p.status,
            col.college_name,
            cou.course_name
        FROM 
            patron p
        JOIN college col ON col.college_id = p.college_id
        JOIN course cou ON cou.course_id = p.course_id
        WHERE p.patron_id = ?`

    db.query(q,[id],(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
};

export const patronCirculation = (req,res)=>{
    const id = req.params.id;
    const q = `
        SELECT 
            cout.checkout_id,
            res.resource_title,
            cout.checkout_date,
            cout.checkout_due,
            cin.checkin_date,
            COALESCE(ov.overdue_days, 0) AS overdue_days 
        FROM 
            checkout cout
        JOIN resources res ON cout.resource_id = res.resource_id
        LEFT JOIN checkin cin ON cin.checkout_id = cout.checkout_id
        LEFT JOIN overdue ov ON ov.checkout_id = cout.checkout_id
        WHERE cout.patron_id = ?`

    db.query(q,[id],(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
}

// export const importPatron = async (req, res) => {
//     try {
//         const { patrons } = req.body;

//         if (!patrons || patrons.length === 0) {
//             return res.status(400).json({ message: 'No patron data provided.' });
//         }

//         await Promise.all(patrons.map(async (item) => {
//             const tupId = item['TUP ID'];

//             // Validate TUP ID format (TUPM-00-0000)
//             const tupIdRegex = /^TUPM-\d{2}-\d{4}$/;
//             if (!tupIdRegex.test(tupId)) {
//                 return; // Skip invalid TUP ID
//             }

//             // Check if patron already exists
//             const checkPatronQuery = `SELECT * FROM patron WHERE tup_id = ?`;
//             const existingPatron = await new Promise((resolve, reject) => {
//                 db.query(checkPatronQuery, [tupId], (err, results) => {
//                     if (err) reject(err);
//                     resolve(results);
//                 });
//             });

//             // If patron already exists, skip
//             if (existingPatron.length > 0) return;

//             // If College and Program exist, get their IDs
//             if (item.College && item.Program) {
//                 const getCollegeIdQuery = `SELECT college_id FROM college WHERE college_name = ?`;
//                 const getCourseIdQuery = `SELECT course_id FROM course WHERE course_name = ?`;

//                 // Get College ID
//                 const collegeResult = await new Promise((resolve, reject) => {
//                     db.query(getCollegeIdQuery, [item.College], (err, results) => {
//                         if (err) reject(err);
//                         resolve(results);
//                     });
//                 });

//                 // Get Course ID
//                 const courseResult = await new Promise((resolve, reject) => {
//                     db.query(getCourseIdQuery, [item.Program], (err, results) => {
//                         if (err) reject(err);
//                         resolve(results);
//                     });
//                 });

//                 // If college or course is not found, skip the patron insertion
//                 if (collegeResult.length === 0 || courseResult.length === 0) return;

//                 const collegeId = collegeResult[0].college_id;
//                 const courseId = courseResult[0].course_id;

//                 // Insert the new patron into the database
//                 const insertPatronQuery = `
//                     INSERT INTO patron (tup_id, patron_fname, patron_lname, patron_sex, patron_mobile, patron_email, category, college_id, course_id)
//                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//                 `;

//                 const values = [
//                     tupId,
//                     item['First name'],
//                     item['Last name'],
//                     item['Sex'],
//                     item['Phone number'],
//                     item['TUP email address'],
//                     item['Category'],
//                     collegeId,
//                     courseId
//                 ];

//                 await new Promise((resolve, reject) => {
//                     db.query(insertPatronQuery, values, (err, result) => {
//                         if (err) reject(err);
//                         resolve(result);
//                     });
//                 });
//             }
//         }));

//         return res.status(200).json({ message: 'Patrons imported successfully.' });

//     } catch (error) {
//         console.error('Server error:', error);
//         res.status(500).json({ error: 'Server error while importing patrons' });
//     }
// };

export const importPatron = async (req, res) => {
    try {
        const { patrons, username } = req.body;
        console.log('Attempting to import patrons:', patrons);

        if (!patrons || patrons.length === 0) {
            return res.status(400).json({ message: 'No patron data provided.' });
        }

        const invalidPatrons = [];
        const insertedPatrons = [];
        const skippedPatrons = [];

        for (const item of patrons) {
            try {
                const tupId = item['tup id'];
                const firstName = item['first name'];
                const lastName = item['last name'];
                const phoneNumber = item['phone number'];
                const email = item['tup email address'];
                const college = item['college'];
                const program = item['program'];
                const sex = item['sex'];
                const category = item['category'];

                // Skip this record if essential fields are missing
                if (!tupId || !firstName || !lastName || !email) {
                    invalidPatrons.push({ 
                        tupId: tupId || 'Missing ID', 
                        reason: 'Missing required fields. Make sure TUP ID, First name, Last name, and TUP email address are not empty.' 
                    });
                    continue;
                }

                // Validation checks
                let isValid = true;
                let validationErrors = [];

                // Validate TUP ID format (TUPM-00-0000)
                const tupIdRegex = /^TUPM-\d{2}-\d{4}$/;
                if (!tupIdRegex.test(tupId)) {
                    isValid = false;
                    validationErrors.push('Invalid TUP ID format');
                }

                // Validate Phone Number (should be 11 digits and start with 09)
                if (phoneNumber) {
                    const phoneRegex = /^09\d{9}$/;
                    if (!phoneRegex.test(phoneNumber)) {
                        isValid = false;
                        validationErrors.push('Phone number must be 11 digits starting with 09');
                    }
                }

                // Validate Email Address
                const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                if (!emailRegex.test(email)) {
                    isValid = false;
                    validationErrors.push('Invalid email address');
                }

                // If validation failed, add to invalid list and skip
                if (!isValid) {
                    invalidPatrons.push({ 
                        tupId: tupId, 
                        reason: validationErrors.join(', ') 
                    });
                    continue;
                }

                // Check if patron already exists
                const checkPatronQuery = `SELECT * FROM patron WHERE tup_id = ?`;
                const [existingPatrons] = await new Promise((resolve, reject) => {
                    db.query(checkPatronQuery, [tupId], (err, results) => {
                        if (err) reject(err);
                        resolve([results]);
                    });
                });

                if (existingPatrons.length > 0) {
                    invalidPatrons.push({
                        tupId: tupId,
                        reason: 'Patron already exists'
                    });
                    continue;
                }

                // Look up college and program IDs
                if (!college || !program) {
                    invalidPatrons.push({
                        tupId: tupId,
                        reason: 'College and program are required'
                    });
                    continue;
                }

                // Get College ID
                const getCollegeIdQuery = `SELECT college_id FROM college WHERE college_name = ?`;
                const [collegeResults] = await new Promise((resolve, reject) => {
                    db.query(getCollegeIdQuery, [college], (err, results) => {
                        if (err) reject(err);
                        resolve([results]);
                    });
                });

                if (collegeResults.length === 0) {
                    invalidPatrons.push({
                        tupId: tupId,
                        reason: `College "${college}" not found in database`
                    });
                    continue;
                }

                // Get Course ID
                const getCourseIdQuery = `SELECT course_id FROM course WHERE course_name = ?`;
                const [courseResults] = await new Promise((resolve, reject) => {
                    db.query(getCourseIdQuery, [program], (err, results) => {
                        if (err) reject(err);
                        resolve([results]);
                    });
                });

                if (courseResults.length === 0) {
                    invalidPatrons.push({
                        tupId: tupId,
                        reason: `Program "${program}" not found in database`
                    });
                    continue;
                }

                const collegeId = collegeResults[0].college_id;
                const courseId = courseResults[0].course_id;

                // Insert the new patron into the database
                const insertPatronQuery = `
                    INSERT INTO patron (tup_id, patron_fname, patron_lname, patron_sex, patron_mobile, patron_email, category, college_id, course_id, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
                `;

                const values = [
                    tupId,
                    firstName,
                    lastName,
                    sex || '',
                    phoneNumber || '',
                    email,
                    category || 'Student',
                    collegeId,
                    courseId
                ];

                await new Promise((resolve, reject) => {
                    db.query(insertPatronQuery, values, (err, result) => {
                        if (err) {
                            console.error('Error inserting patron:', err);
                            reject(err);
                        }
                        resolve(result);
                    });
                });

                insertedPatrons.push({ 
                    tupId: tupId,
                    name: `${firstName} ${lastName}`
                });

                logAuditAction(
                    username,
                    'INSERT',
                    'patron',
                    null,
                    null,
                    JSON.stringify("Added new patron: " + firstName + " " + lastName)
                );
                

            } catch (itemError) {
                console.error('Error processing patron item:', itemError);
                invalidPatrons.push({
                    tupId: item['tup id'] || 'Unknown',
                    reason: 'Processing error: ' + itemError.message
                });
            }
        }

        // Return a success response even if some patrons were invalid
        return res.status(200).json({ 
            message: 'Import process completed',
            stats: {
                total: patrons.length,
                inserted: insertedPatrons.length,
                invalid: invalidPatrons.length,
                skipped: skippedPatrons.length
            },
            insertedPatrons,
            invalidPatrons,
            skippedPatrons
        });

    } catch (error) {
        console.error('Server error during patron import:', error);
        res.status(500).json({ 
            error: 'Server error while importing patrons',
            message: error.message
        });
    }
};
