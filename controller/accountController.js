import { db } from "../config/db.js";
import { logAuditAction } from "./auditController.js";
import bcrypt from 'bcrypt';

const saltRounds = 10;

// export const getAccounts = (req,res)=>{
//     const keyword = req.query.keyword || '';
//     const searchKeyword = `%${keyword}%`;
//     const offset = parseInt(req.query.offset, 10)
//     const params = [searchKeyword, searchKeyword, searchKeyword]
//     const fname = parseInt(req.query.fname)
//     const lname = parseInt(req.query.lname)
//     const uname = parseInt(req.query.uname)
//     const role = parseInt(req.query.role)
//     const status = req.query.status

//     console.log('status', status)
//     console.log('role', role)

//     let orderClauses = "";
    
//     // Handle sorting by fname
//     if (fname) {
//         if (fname == '1') {
//             orderClauses='ORDER BY staffaccount.staff_fname ASC';
//         } else if (fname == '2') {
//             orderClauses='ORDER BY staffaccount.staff_fname DESC';
//         }
//     }
    
//     // Handle sorting by lname
//     if (lname) {
//         if (lname == '1') {
//             orderClauses='ORDER BY staffaccount.staff_lname ASC';
//         } else if (lname == '2') {
//             orderClauses='ORDER BY staffaccount.staff_lname DESC';
//         }
//     }

//     // Handle sorting by lname
//     if (uname) {
//         if (uname == '1') {
//             orderClauses='ORDER BY staffaccount.staff_uname ASC';
//         } else if (uname == '2') {
//             orderClauses='ORDER BY staffaccount.staff_uname DESC';
//         }
//     }


//     const whereClauses = [`(staff_fname LIKE ? OR staff_uname LIKE ? OR staff_lname LIKE ?)`]

//     if(role){
//         whereClauses.push(`staffaccount.role_id = '${role}'`)
//     }
//     if(status){
//         whereClauses.push(`staffaccount.staff_status = '${status}'`)
//     }

//     const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
//     const q = `
//         SELECT 
//             staffaccount.staff_id, 
//             staffaccount.staff_uname, 
//             staffaccount.staff_lname, 
//             staffaccount.staff_fname,
//             staffaccount.staff_status,
//             roles.role_name
//         FROM staffaccount
//         JOIN roles ON staffaccount.role_id = roles.role_id
//         ${whereClause}
//         ${orderClauses}
//         LIMIT 5 OFFSET ?`
    
//     const countQ = `
//         SELECT COUNT(DISTINCT staff_id) as total
//         FROM staffaccount
//         ${whereClause}`

//     console.log(q)
    
//     db.query(countQ, params, (err,countResult)=>{
//         if (err) {
//             console.error(err);
//             return res.status(500).send({ error: 'Database query failed' });
//         }

//         const totalUsers = countResult[0]?.total || 0;

//         db.query(q, [...params, offset], (err,results)=>{
//             if (err) {
//                 console.error(err);
//                 return res.status(500).send({ error: 'Database query failed' });
//             }

//             res.send({results,totalUsers});
        
//         })
//     })
// }

export const getAccounts = (req,res)=>{
    const q = `
        SELECT 
            staffaccount.staff_id, 
            staffaccount.staff_uname, 
            staffaccount.staff_lname, 
            staffaccount.staff_fname,
            staffaccount.staff_status,
            roles.role_name
        FROM staffaccount
        JOIN roles ON staffaccount.role_id = roles.role_id`

    
    db.query(q, (err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        res.send(results);
    })
}

export const createAccount = (req,res)=>{
    console.log(req.body)
    const username = req.body.username;
    const password = req.body.password;

    //check if user exist 
    const checkQ = `
    SELECT * FROM staffaccount WHERE staff_uname = ? AND staff_fname = ? AND staff_lname = ?`

    const checkValues = [
        req.body.uname,
        req.body.fname,
        req.body.lname
    ]

    db.query(checkQ, checkValues, (err, checkResults)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        if(checkResults.length>0){
            return res.send({status: 409, message: 'This user already exist. Please create a new one.'})
        }else{
            const q = `
            INSERT INTO staffaccount (staff_uname, staff_fname, staff_lname, staff_password, staff_status, role_id ) 
            VALUES (?, ?, ?, ?, ?, ?)`
            
            bcrypt.hash(password,saltRounds,(err,hash)=>{
                if(err){
                    console.log(err)
                }
                const values = [
                    req.body.uname,
                    req.body.fname,
                    req.body.lname,
                    hash,
                    'active',
                    req.body.role
                ]

                db.query(q, values, (err,results)=>{
                    if (err) {
                        console.error(err);
                        return res.status(500).send({ error: 'Database query failed' });
                    }

                    logAuditAction(username, 'INSERT', 'staffaccount', null, null, JSON.stringify("Added a new user: " + req.body.uname));
                    res.send({status: 201, message:'User Created Successfully'});
                
                })

            })
        }
    })
}

export const viewAccount = (req,res)=>{
    const id = req.params.id;
    const keyword = req.query.keyword || '';

    const q = `
    SELECT staff_id, staff_fname, staff_lname, staff_uname, role_id FROM staffaccount WHERE staff_id = ?`


    db.query(q,[id], (err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        res.send(results);
    
    })
}

// export const editAccount = (req, res) => {
//     console.log(req.body);
//     const password = req.body.password;
//     const username = req.body.username;
//     const selectQuery = `
//         SELECT staff_uname, staff_fname, staff_lname, role_id, staff_password 
//         FROM staffaccount 
//         WHERE staff_id = ?`;

//     db.query(selectQuery, [req.body.id], (err, results) => {
//         if (err || results.length === 0) {
//             return res.status(404).json({ error: 'Account not found' });
//         }

//         const oldValue = JSON.stringify(results[0]);

//         // Hash the new password
//         bcrypt.hash(password, saltRounds, (err, hash) => {
//             if (err) {
//                 console.error(err);
//                 return res.status(500).json({ error: 'Password hashing failed' });
//             }

//             const updateQuery = `
//                 UPDATE  
//                     staffaccount 
//                 SET 
//                     staff_uname = ?,
//                     staff_fname = ?,
//                     staff_lname = ?,
//                     role_id = ?,
//                     staff_password = ?
//                 WHERE 
//                     staff_id = ?`;

//             const values = [
//                 req.body.uname,
//                 req.body.fname,
//                 req.body.lname,
//                 req.body.role,
//                 hash,
//                 req.body.id
//             ];

//             db.query(updateQuery, values, (err, results) => {
//                 if (err) {
//                     console.error(err);
//                     return res.status(500).json({ error: 'Database query failed' });
//                 }

//                 const newValue = JSON.stringify({
//                     staff_uname: req.body.uname,
//                     staff_fname: req.body.fname,
//                     staff_lname: req.body.lname,
//                     role_id: req.body.role,
//                     staff_password: hash,
//                 });

//                 // Log the audit action
//                 logAuditAction(username, 'UPDATE', 'staffaccount', req.body.id, oldValue, JSON.stringify("Edited a user: " + req.body.uname + " with ID: " + req.body.id));
                
//                 res.send({status: 201, message:'User Edited Successfully'});
//                 // res.status(200).json({ message: 'User edited successfully' });
//             });
//         });
//     });
// }

export const editAccount = (req, res) => {
    console.log(req.body);
    const password = req.body.password;
    const username = req.body.username;

    const selectQuery = `
        SELECT staff_uname, staff_fname, staff_lname, role_id, staff_password 
        FROM staffaccount 
        WHERE staff_id = ?`;

    db.query(selectQuery, [req.body.id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Account not found' });
        }

        const oldValue = JSON.stringify(results[0]);

        // Fix: Removed trailing comma before WHERE
        const updateQuery = `
            UPDATE staffaccount 
            SET 
                staff_uname = ?,
                staff_fname = ?,
                staff_lname = ?,
                role_id = ?
            WHERE 
                staff_id = ?`;

        const values = [
            req.body.uname,
            req.body.fname,
            req.body.lname,
            req.body.role,
            req.body.id
        ];

        db.query(updateQuery, values, (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database query failed' });
            }

            // Correct newValue logging
            const newValue = JSON.stringify({
                staff_uname: req.body.uname,
                staff_fname: req.body.fname,
                staff_lname: req.body.lname,
                role_id: req.body.role,
            });

            logAuditAction(
                username, 'UPDATE', 'staffaccount', req.body.id, oldValue,
                JSON.stringify(`Edited a user: ${req.body.uname} with ID: ${req.body.id}`)
            );

            // If password is changed
            if (password.length > 0) {
                bcrypt.hash(password, saltRounds, (err, hash) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Password hashing failed' });
                    }

                    const updatePassword = `
                        UPDATE staffaccount 
                        SET staff_password = ? 
                        WHERE staff_id = ?`;

                    db.query(updatePassword, [hash, req.body.id], (err) => {  // Pass req.body.id
                        if (err) {
                            console.error(err);
                            return res.status(500).json({ error: 'Database query failed' });
                        }

                        const newPassword = JSON.stringify({ staff_password: hash });

                        logAuditAction(
                            username, 'UPDATE', 'staffaccount', req.body.id, oldValue,
                            JSON.stringify(`Edited a user: ${req.body.uname} with ID: ${req.body.id}`)
                        );

                        return res.status(201).json({ message: 'User Edited Successfully' }); // Return response here
                    });
                });
            } else {
                return res.status(201).json({ message: 'User Edited Successfully' }); // Response for no password change
            }
        });
    });
};

export const activateAccount = (req, res) => {
    const id = req.params.id;
    const username = req.body.staffUname;

    // Step 1: Retrieve staff_uname from the database
    const selectQuery = `SELECT staff_uname FROM staffaccount WHERE staff_id = ?`;

    db.query(selectQuery, [id], (selectErr, selectResults) => {
        if (selectErr) {
            console.error('Error fetching username:', selectErr);
            return res.status(500).send({ error: 'Failed to retrieve username from database' });
        }

        if (selectResults.length === 0) {
            return res.status(404).send({ error: 'Staff account not found' });
        }

        const staffUname = selectResults[0].staff_uname; // Store the username in a variable

        console.log('Fetched staff username:', staffUname);

        // Step 2: Perform the update
        const updateQuery = `
            UPDATE 
                staffaccount
            SET 
                staff_status = ?
            WHERE 
                staff_id = ?
        `;

        db.query(updateQuery, ['active', id], (updateErr, updateResults) => {
            if (updateErr) {
                console.error(updateErr);
                return res.status(500).send({ error: 'Database query failed' });
            }

            // Log the audit action
            logAuditAction(username, 'UPDATE', 'staffaccount', staffUname, 'inactive', JSON.stringify("Activated a user: " + staffUname));

            res.send({ status: 201, message: 'User Deactivated' });
        });
    });
}

export const deactivateAccount = (req, res) => {
    const id = req.params.id;
    const username = req.body.staffUname;

    // Step 1: Retrieve staff_uname from the database
    const selectQuery = `SELECT staff_uname FROM staffaccount WHERE staff_id = ?`;

    db.query(selectQuery, [id], (selectErr, selectResults) => {
        if (selectErr) {
            console.error('Error fetching username:', selectErr);
            return res.status(500).send({ error: 'Failed to retrieve username from database' });
        }

        if (selectResults.length === 0) {
            return res.status(404).send({ error: 'Staff account not found' });
        }

        const staffUname = selectResults[0].staff_uname; // Store the username in a variable

        console.log('Fetched staff username:', staffUname);

        // Step 2: Perform the update
        const updateQuery = `
            UPDATE 
                staffaccount
            SET 
                staff_status = ?
            WHERE 
                staff_id = ?
        `;

        db.query(updateQuery, ['inactive', id], (updateErr, updateResults) => {
            if (updateErr) {
                console.error(updateErr);
                return res.status(500).send({ error: 'Database query failed' });
            }

            // Log the audit action
            logAuditAction(username, 'UPDATE', 'staffaccount', staffUname, 'active', JSON.stringify("Deactivated a user: " + staffUname));

            res.send({ status: 201, message: 'User Deactivated' });
        });
    });
}