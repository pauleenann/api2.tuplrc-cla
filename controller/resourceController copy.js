import { db } from "../config/db.js";
import fs, { stat } from 'fs';
import { logAuditAction } from "./auditController.js";
import axios from 'axios'

/*-------------SAVE RESOURCE----------------- */
export const saveResource = async (req, res) => {
    console.log('Saving resource...');
    console.log(req.body)
    
    const mediaType = req.body.mediaType;
    const username = req.body.username;
    let adviserFname, adviserLname, filePath, imageFile;
    let pub = {};
    console.log('username 1: ', username)

    // Handle image upload or URL
    try{
        if (req.file) {
            // filePath = req.file.path.replace(/\\/g, "/").toString();
            //imageFile = fs.readFileSync(filePath); // Read file synchronously
            imageFile = req.file.path.replace(/\\/g, "/").toString();
        } else if (req.body.url) {
            imageFile = req.body.url
        } else{
            imageFile = 'public/images/not_found.png'; // this image must not be deleted in the server because this is the default value
        }
        
        // initialize variables based on media type
        if(mediaType==='1'){
           pub = {
                pub_id: req.body.publisher_id,
                pub_name: req.body.publisher,
                pub_add: req.body.publisher_address,
                pub_email: req.body.publisher_email,
                pub_phone:req.body.publisher_number,
                pub_web:req.body.publisher_website
            } 
        }else if(mediaType==='4'){
            // split string
            //if req.body.adviser is 'name lastname'. pag ginamitan ng split(' ') it will be ['name','lastname']
            const adviser = req.body.adviser.split(' ')
            adviserFname = adviser[0];
            adviserLname = adviser[1];
        }
        
        //authors is in string
        const authors = Array.isArray(req.body.authors)
        ? req.body.authors: req.body.authors.split(',');
       
        // Insert resource
        const resourceId = await insertResources(res, req, authors, username);
    
        if (mediaType === '1') {
            // Handle books
            const pubId = await checkIfPubExist(pub);
            console.log('Publisher ID:', pubId);
            await insertBook(req.body.isbn, resourceId, pubId, req.body.topic, res, imageFile);
        }else if(['2', '3'].includes(mediaType)){
            // insert journal/newsletter in database
            const jn = [
                req.body.volume || '',
                req.body.issue || '',
                imageFile, 
                resourceId,
                req.body.topic,
            ];

            await insertJournalNewsletter(jn,res)
        }else{
            //if thesis, after inserting data to authors, resourceauthors, and resources, check if adviser exists. If existing, insert directly to thesis table. if not, insert advisers first then insert to thesis table
            const adviser = [
                adviserFname,
                adviserLname
            ]
            
            //get adviserId
            const adviserID = await checkAdviserIfExist(adviser)
            console.log('adviserId: ',adviserID)
            //insert to thesis table
            await insertThesis(resourceId,adviserID,res)      
        }
    }catch(error){
        console.log(error)
        return res.send(error)
    }
    
}

//check if adviser exist
export const checkAdviserIfExist = async (adviser) => {
    const q = "SELECT * FROM adviser WHERE adviser_fname = ? AND adviser_lname = ?";

    return new Promise((resolve, reject) => {
        db.query(q, adviser, async (err, results) => {
            if (err) {
                return reject(err); // Reject the promise on error
            }

            if (results.length > 0) {
                resolve(results[0].adviser_id); // Resolve with existing adviser ID
            } else {
                try {
                    const adviserId = await insertAdviser(adviser); // Call insertAdviser for new adviser
                    resolve(adviserId); // Resolve with new adviser ID
                } catch (insertError) {
                    reject(insertError); // Reject if insertAdviser fails
                }
            }
        });
    });
};

//insert adviser
export const insertAdviser = async (adviser) => {
    const q = `INSERT INTO adviser (adviser_fname, adviser_lname) VALUES (?, ?)`;

    return new Promise((resolve, reject) => {
        db.query(q, adviser, (err, results) => {
            if (err) {
                return reject(err); // Reject the promise on error
            }

            resolve(results.insertId); // Resolve with the new adviser ID
        });
    });
};

//insert thesis 
export const insertThesis = async (resourceId, adviserId,res)=>{
    const q = "INSERT INTO thesis (resource_id, adviser_id) VALUES (?,?)"

    db.query(q,[resourceId,adviserId],(err,results)=>{
        if (err) {
            return res.status(500).send(err); 
        }
        return res.send({status:201,message:'Thesis inserted successfully.'});
    })
}

//insert journal and newsletter
export const insertJournalNewsletter = async(jn,res)=>{
    const q = 'INSERT INTO journalnewsletter (jn_volume, jn_issue, filepath, resource_id, topic_id) VALUES (?, ?, ?, ?,?)';
            
    db.query(q, jn, (err, result) => {
        if (err) {
            return res.status(500).send(err); 
        }
        
        return res.send({status: 201, message:'Journal/Newsletter inserted successfully.'});
    });
}

//check if publisher exist 
export const checkIfPubExist = async (pub) => {
    if (pub.pub_id == 0 && pub.pub_name == '') {
        return null;
    } else if (pub.pub_id == 0 && pub.pub_name) {
        const pubId = await insertPublisher(pub); 
        return pubId;
    }else if(pub.pub_id>0){
        return pub.pub_id
    }
    console.log(pub);
};

// Updated insertPublisher to return a Promise
export const insertPublisher = async (pub) => {
    // First, check if the publisher already exists
    const existingPubId = await new Promise((resolve, reject) => {
        const q = `
        SELECT pub_id FROM publisher 
        WHERE pub_name = ? 
        AND pub_address = ? 
        AND pub_email = ? 
        AND pub_phone = ? 
        AND pub_website = ?`;

        const values = [
            pub.pub_name,
            pub.pub_add,
            pub.pub_email,
            pub.pub_phone,
            pub.pub_web
        ];

        db.query(q, values, (err, results) => {
            if (err) {
                return reject(err); 
            }

            // If publisher exists, resolve with the publisher's ID, else resolve with null
            if (results && results.length > 0) {
                resolve(results[0].pub_id);
            } else {
                resolve(null);
            }
        });
    });

    // If the publisher exists, return the existing pub_id
    if (existingPubId) {
        return existingPubId;
    }

    // Otherwise, insert the publisher and return the new pub_id
    return new Promise((resolve, reject) => {
        const q = `
        INSERT INTO publisher (pub_name, pub_address, pub_email, pub_phone, pub_website) 
        VALUES (?,?,?,?,?)`;

        const values = [
            pub.pub_name,
            pub.pub_add,
            pub.pub_email,
            pub.pub_phone,
            pub.pub_web
        ];

        db.query(q, values, (err, results) => {
            if (err) {
                return reject(err); 
            }

            if (results) {
                const pubId = results.insertId;
                resolve(pubId); // Resolve with the new publisher's ID
            } else {
                reject(new Error('Publisher insert failed')); // Reject if insertion fails
            }
        });
    });
};

//insert book
export const insertBook = async(isbn, resourceId, pubId, topic, res, imageFile)=>{
    const q = `
    INSERT INTO book (book_isbn, resource_id, pub_id, topic_id, filepath) VALUES (?,?,?,?,?)`

    const values = [
        isbn || null,
        Number(resourceId) || null,
        Number(pubId) || null,
        Number(topic) || null,
        imageFile || null
    ]

    db.query(q, values, (err,results)=>{
        if (err) {
            return res.status(500).send(err); 
        }
        // console.log('Book inserted successfully')
        return res.send({status: 201, message:'Book inserted successfully.'});
    })

}

//check resource if exist
export const checkResourceIfExist = (title) => {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM resources WHERE resource_title = ?`;

        db.query(query, [title], (err, results) => {
            if (err) {
                return reject(err); // Reject with error
            }
            if (results.length > 0) {
                // Resolve with `true` if resource exists
                resolve(true);
            } else {
                // Resolve with `false` if resource does not exist
                resolve(false);
            }
        });
    });
};

//insert resource
export const insertResources = async (res, req, authors, username) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Check if the resource exists
            const resourceExists = await checkResourceIfExist(req.body.title);

            if (resourceExists) {
                console.log('Resource already exists.');
                return reject({ status: 409, message: 'Resource already exists.' });
            }
            console.log("username: ",username)
            // Insert the resource
            const insertQuery = `
                INSERT INTO resources (
                    resource_title, 
                    resource_description, 
                    resource_published_date, 
                    original_resource_quantity, 
                    resource_quantity, 
                    resource_is_circulation, 
                    dept_id, 
                    type_id, 
                    avail_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const resourceValues = [
                req.body.title,
                req.body.description || '',
                req.body.publishedDate,
                req.body.quantity,
                req.body.quantity,
                req.body.isCirculation,
                req.body.department,
                req.body.mediaType,
                req.body.status,
            ];

            db.query(insertQuery, resourceValues, async (err, results) => {
                if (err) {
                    return reject(err); // Reject with error
                }

                // Get the `resource_id` of the newly inserted row
                const resourceId = results.insertId;
                logAuditAction(username, 'INSERT', 'resources', null, null, JSON.stringify("Added a new resource: '" + req.body.title + "'"));
                try {
                    // Insert authors for the resource
                    await insertAuthors(res, authors, resourceId);
                    resolve(resourceId); // Resolve with the `resourceId`
                } catch (authorError) {
                    reject(authorError); // Reject if there's an error inserting authors
                }
            });
        } catch (error) {
            reject(error); // Reject with any error that occurs
        }
    });
};

//insert authors 
export const insertAuthors = async (res,authors,resourceId)=>{
    return new Promise((resolve,reject)=>{
            //insert authors
            const authorQ = 'INSERT INTO author (author_fname, author_lname) VALUES (?, ?)' 
            const resourceAuthorQ = 'INSERT INTO resourceauthors (resource_id, author_id) VALUES (?, ?)'
            const checkIfAuthorExist ='SELECT author_id FROM author WHERE author_fname = ? AND author_lname = ?'

            authors.forEach(element => {          
                    const nameParts = element.split(' '); 
                    const fname = nameParts.slice(0, -1).join(" "); // "John Michael"
                    const lname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''; // "Doe"
                    const authorValue = [
                        fname,
                        lname
                    ]

                    // check if author already exist
                    db.query(checkIfAuthorExist,[fname,lname], (err,results)=>{
                        if (err) {
                            return res.status(500).send(err); 
                        }
                        
                        //pag walang nahanap, new author sa authors table
                        if(results.length===0){
                            db.query(authorQ,authorValue,(err,results)=>{
                                if (err) {
                                    return res.status(500).send(err); 
                                }
                
                                //authorId nung author info na kakainsert lang
                                const authorId = results.insertId;
                
                                //if author is inserted, insert sa resourceAuthor table
                                db.query(resourceAuthorQ,[resourceId,authorId],(req,res)=>{
                                    if (err) {
                                        return res.status(500).send(err); 
                                    }
    
                                    resolve() 
                                })
                            })
                        }else{
                            //if author is inserted, insert sa resourceAuthor table
                            //results look like this: 
                            // [
                            //     {
                            //         author_id: 5
                            //     }
                            // ]
                            //so you have to use index to access id
                            db.query(resourceAuthorQ,[resourceId,results[0].author_id],(req,res)=>{
                                if (err) {
                                    return res.status(500).send(err); 
                                }
                                resolve() 
                            })
                        }
                    })    
                });
           
    })
}

/*------------UPDATE RESOURCE-------------- */
export const updateResource = async (req, res) => {
    const resourceId = req.params.id;
    const mediaType = req.body.mediaType;
    const username = req.body.username;
    let adviserFname, adviserLname, filePath, imageFile;
    let pub = {};
    
    try{
        if(req.file){
            filePath = req.file.path; // Get the file path 
        }

         // initialize variables based on media type
        if(mediaType==='1'){
            pub = {
                 pub_id: req.body.publisher_id,
                 pub_name: req.body.publisher,
                 pub_add: req.body.publisher_address,
                 pub_email: req.body.publisher_email,
                 pub_phone:req.body.publisher_number,
                 pub_web:req.body.publisher_website
             } 
         }else if(mediaType==='4'){
             // split string
             //if req.body.adviser is 'name lastname'. pag ginamitan ng split(' ') it will be ['name','lastname']
             const adviser = req.body.adviser.split(' ')
             adviserFname = adviser[0];
             adviserLname = adviser[1];
         }
         
         const authors = req.body.authors.split(',')

         //edit resource
         await editResource(res,req,authors,resourceId,username)

         if (mediaType === '1') {
            //  check if publisher exist 
            //check publisher if exist
            const pubId = await checkIfPubExist(pub)
            console.log('pubId: ', pubId)
            editBook(req.body.isbn,resourceId,pubId,req.body.topic,res,filePath)
        }else if(mediaType==='2'|| mediaType==='3'){
            await editJournalNewsletter(filePath,res,req.body.volume,req.body.issue,resourceId)
        }else{
            const adviser = [
                adviserFname,
                adviserLname
            ]
            
            //get adviserId
            const adviserId = await checkAdviserIfExist(adviser)
            //update thesis    
            await editThesis([adviserId,resourceId],res)
        }
    }catch(error){
        console.log(error)
        return res.send(error)
    }
};

//edit book
const editBook = async (isbn, resourceId, pubId, topic,res,filePath)=>{
    let q;
    let book;

    console.log('filepath: ', filePath)

    if (typeof filePath === 'string') {
        q = `UPDATE book SET filepath = ?, book_isbn = ?, pub_id = ?, topic_id = ? WHERE resource_id = ?`;
        book = [filePath, isbn, pubId, topic, resourceId];
    } else {
        q = `UPDATE book SET book_isbn = ?, pub_id = ?, topic_id = ? WHERE resource_id = ?`;
        book = [isbn, pubId, topic, resourceId];
    }
    

    db.query(q, book, (err, result) => {
        if (err) {
            return res.status(500).send(err); 
        }
        console.log('Book edited successfully')
        // Successfully inserted 
        return res.send({status: 201, message:'Book edited successfully.'});
    });
}
//edit journal/newsletter
const editJournalNewsletter = async(filePath,res,volume,issue,resourceId)=>{
    let q;
    let jn;

    if(typeof filePath === 'string'){
        q = `
             UPDATE 
                journalnewsletter 
            SET
                jn_volume = ?,
                jn_issue = ?,
                filepath = ?
                WHERE
                resource_id = ?`;
        jn = [
                volume,
                issue,
                filePath,
                resourceId
        ]
        }else{
        q = `
            UPDATE
                journalnewsletter 
            SET
                jn_volume = ?,
                jn_issue = ?
                WHERE
                resource_id = ?`;
            jn = [
                volume,
                issue,
                resourceId
            ]
        }
                
        db.query(q, jn, (err, result) => {
            if (err) {
                return res.status(500).send(err); 
            }

            return res.send({status:201,message:'Journal/Newsletter edited successfully.'});
        });
}
//edit resource no audit
/* const editResource = async (res,req,authors,resourceId,username)=>{
    return new Promise((resolve,reject)=>{
        
        const q = `
        UPDATE
            resources
        SET 
            resource_title = ?,
            resource_description = ?,
            resource_published_date = ?,
            resource_quantity = ?,
            resource_is_circulation = ?,
            dept_id = ?,
            type_id = ?,
            avail_id = ?
        WHERE 
            resource_id = ?
            `;

        const resources = [
            req.body.title,
            req.body.description,
            req.body.publishedDate,
            req.body.quantity,
            req.body.isCirculation,
            req.body.department,
            req.body.mediaType,
            req.body.status,
            resourceId
        ];

        console.log(resources)

        db.query(q, resources,(err, results)=>{
            if (err) {
                return res.status(500).send(err); 
            }

            editAuthors(res,authors,resourceId).then(()=>{
                resolve('success')
            })
            // resolve('success')
        })
    })
} */

const editResource = async (res, req, authors, resourceId, username) => {
    return new Promise((resolve, reject) => {
        
        const updatedValues = [
            req.body.title,
            req.body.description,
            req.body.publishedDate,
            req.body.quantity,
            req.body.isCirculation,
            req.body.department,
            req.body.mediaType,
            req.body.status,
            resourceId
        ];
        
        // Fetch old value for audit logging
        const selectQuery = 'SELECT * FROM resources WHERE resource_id = ?';
        db.query(selectQuery, [resourceId], (err, results) => {
            if (err || results.length === 0) {
                return res.status(404).json({ error: 'Resource not found' });
            }

            const oldValue = JSON.stringify(results[0]);
            console.log("old value1: ", oldValue)

            // Update resource
            const updateQuery = `
                UPDATE resources
                SET 
                    resource_title = ?,
                    resource_description = ?,
                    resource_published_date = ?,
                    resource_quantity = ?,
                    resource_is_circulation = ?,
                    dept_id = ?,
                    type_id = ?,
                    avail_id = ?
                WHERE 
                    resource_id = ?
            `;

            console.log("new values1: ", updatedValues)

            console.log(updatedValues)

            db.query(updateQuery, updatedValues, (err, results) => {
                if (err) {
                    return res.status(500).send(err);
                }

                // Update authors
                editAuthors(res, authors, resourceId)
                    .then(() => {
                        // Log audit action
                        const newValue = JSON.stringify({
                            resource_id: resourceId,
                            title: req.body.title,
                            description: req.body.description,
                            publishedDate: req.body.publishedDate,
                            quantity: req.body.quantity,
                            isCirculation: req.body.isCirculation,
                            department: req.body.department,
                            mediaType: req.body.mediaType,
                            status: req.body.status
                        });

                        logAuditAction(
                            username,  // Assuming userId is part of req.body
                            'UPDATE',
                            'resources',
                            resourceId,
                            oldValue,
                            JSON.stringify("Edited a resource: '" + req.body.title + "'")
                        );

                        resolve('success');
                    })
                    .catch((err) => reject(err));
            });
        });
    });
};

//edit thesis
const editThesis = async (values,res)=>{
    const q = `UPDATE thesis SET adviser_id = ? WHERE
    resource_id = ?`

    db.query(q, values, (err,results)=>{
        if (err) {
            return res.status(500).send(err); 
        }
        res.send({status:201, message:'Thesis edited successfully.'})
    })
}
//insert authors 
const editAuthors = async (res,authors,resourceId)=>{
    return new Promise((resolve,reject)=>{
        //delete first yung record ng given resource_id sa resource_authors
        const deleteResourceAuthorsQ = 'DELETE FROM resourceauthors WHERE resource_id = ?'

        db.query(deleteResourceAuthorsQ,[resourceId],(err,result)=>{
            if (err) {
                return res.status(500).send(err); 
            }

            //insert authors
            const authorQ = 'INSERT INTO author (author_fname, author_lname) VALUES (?, ?)' 
            const resourceAuthorQ = 'INSERT INTO resourceauthors (resource_id, author_id) VALUES (?, ?)'
            const checkIfAuthorExist ='SELECT author_id FROM author WHERE author_fname = ? AND author_lname = ?'

            authors.forEach(element => {
                const nameParts = element.split(' '); 
                const fname = nameParts.slice(0, -1).join(" "); // "John Michael"
                const lname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''; // "Doe"
                const authorValue = [
                    fname,
                    lname
                ]

                // check if author already exist
                db.query(checkIfAuthorExist,[fname,lname], (err,results)=>{
                    if (err) {
                        return res.status(500).send(err); 
                    }
                    
                    //pag walang nahanap, insert new author sa authors table
                    if(results.length===0){
                        db.query(authorQ,authorValue,(err,results)=>{
                            if (err) {
                                return res.status(500).send(err); 
                            }
            
                            //authorId nung author info na kakainsert lang
                            const authorId = results.insertId;
            
                            //if author is inserted, insert sa resourceAuthor table
                            db.query(resourceAuthorQ,[resourceId,authorId],(req,res)=>{
                                if (err) {
                                    return res.status(500).send(err); 
                                }

                                resolve() 
                            })
                        })
                    }else{
                        //if author is inserted, insert sa resourceAuthor table
                        //results look like this: 
                        // [
                        //     {
                        //         author_id: 5
                        //     }
                        // ]
                        //so you have to use index to access id
                        db.query(resourceAuthorQ,[resourceId,results[0].author_id],(req,res)=>{
                            if (err) {
                                return res.status(500).send(err); 
                            }
                            resolve() 
                        })
                    }
                })    
            });

        })
        
    })
}

/*--------------------VIEW SPECIFIC RESOURCE FROM CATALOG--------------------- */
export const viewResource = (req,res)=>{
    const id = req.params.id;

    // check first the type so i know where to store them
    const q = "SELECT resourcetype.type_name FROM resourcetype JOIN resources ON resources.type_id = resourcetype.type_id WHERE resources.resource_id = ?"

    db.query(q,[id],(err,results)=>{
        if(err) return res.send(err)

        if (!results.length) {
            return res.status(404).send({ error: "Resource not found" });
        }
        
        console.log(results[0].type_name)
        //store type name here
        const resourceType = results[0].type_name   

        switch(resourceType){
            case 'book':
                getBookResource(id,res);
                break;
            case 'journal':
            case 'newsletter':
                getNewsletterJournalResource(id,res);
                break;
            case 'thesis':
                getThesisResource(id,res);
                break;
            default:
                return res.status(404).send({ error: `Unsupported resource type: ${resourceType}` });
        }
    })
};

const getBookResource = (id,res)=>{
    const q = `
    SELECT 
        resources.resource_id, 
        resources.type_id, 
        GROUP_CONCAT(DISTINCT CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_names, 
        resources.dept_id, 
        resources.avail_id, 
        resources.resource_description, 
        resources.resource_is_circulation, 
        book.book_isbn, 
        resources.resource_published_date,
        book.pub_id, 
        resources.resource_quantity, 
        resources.resource_title, 
        publisher.pub_name,
        book.filepath,
		book.topic_id 
    FROM resources 
    JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id 
    JOIN author ON resourceauthors.author_id = author.author_id 
    JOIN resourcetype ON resources.type_id = resourcetype.type_id 
    LEFT JOIN book ON book.resource_id = resources.resource_id 
    LEFT JOIN publisher ON book.pub_id = publisher.pub_id 
    WHERE resources.resource_id = ?
    GROUP BY resources.resource_id`

    db.query(q,[id],(err,result)=>{
        if(err) return res.send(err)
            console.log(result[0])
        return res.json(result)
    })
}
const getNewsletterJournalResource = (id,res)=>{
    const q = 
    `SELECT 
        resources.resource_id,
        resources.type_id,
        resources.resource_quantity,
        resources.avail_id,
        resources.resource_title,
        resources.resource_published_date,
        resources.resource_description,
        resources.dept_id,
        journalnewsletter.topic_id,
        resources.resource_is_circulation,
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_names,
        journalnewsletter.jn_volume,
        journalnewsletter.jn_issue,
        journalnewsletter.filepath
    FROM resources
    JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
    JOIN author ON resourceauthors.author_id = author.author_id
    JOIN resourcetype ON resourcetype.type_id = resources.type_id
    JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
    WHERE resources.resource_id = ?
    GROUP BY resources.resource_id`

    db.query(q,[id],(err,result)=>{
        if(err) return res.send(err)
        console.log(result[0])
        return res.json(result)
    })
}

const getThesisResource = (id,res)=>{
    const q = 
    `SELECT
        resources.type_id,
        resources.dept_id,
        resources.resource_description,
        resources.resource_is_circulation,
        resources.resource_published_date,
        resources.resource_quantity,
        resources.avail_id,
        resources.resource_title,
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_names,
        CONCAT(adviser.adviser_fname, ' ', adviser.adviser_lname) AS adviser_name
    FROM resources
    JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
    JOIN author ON resourceauthors.author_id = author.author_id
    JOIN resourcetype ON resources.type_id = resourcetype.type_id
    JOIN thesis ON resources.resource_id = thesis.resource_id
    JOIN adviser ON adviser.adviser_id = thesis.adviser_id
    WHERE resources.resource_id = ?
    GROUP BY resources.resource_id`

    db.query(q,[id],(err,result)=>{
        if(err) return res.send(err)
        console.log(result[0])
        return res.json(result)
    })
};

/*------------IMPORT CATALOG--------------*/
export const importCatalog = async (req, res) => {
    try {
        const { importData, selectedType, username } = req.body;
        let imageFile = 'public/images/not_found.png';
        console.log(importData);
        console.log(selectedType);

        let insertedResources = []; // Array to store successfully inserted resources

        // 1. Iterate through each element
        for (const data of importData) {
            // 2. Get department ID
            const deptQ = 'SELECT dept_id FROM department WHERE dept_name = ?';
            const deptId = await new Promise((resolve, reject) => {
                db.query(deptQ, [data['Department'].toLowerCase()], (err, result) => {
                    if (err) reject(err);
                    else resolve(result.length ? result[0].dept_id : null);
                });
            });

            // 3. Get topic ID if selected type is book/journal/newsletter
            let topicId = null;
            if (selectedType !== 4) {
                const topicQ = 'SELECT topic_id FROM topic WHERE topic_name = ?';
                topicId = await new Promise((resolve, reject) => {
                    db.query(topicQ, [data['Topic'].toLowerCase()], (err, result) => {
                        if (err) reject(err);
                        else resolve(result.length ? result[0].topic_id : null);
                    });
                });
            }

            // 4. Organize authors
            const authors = data['Authors']
                ? data['Authors'].includes(',')
                    ? data['Authors'].split(',')
                    : [data['Authors']]
                : [];
            console.log(authors);

            // 5. Organize advisers and publishers
            let pub;
            let adviserFname, adviserLname;
            if (selectedType == 1) {
                pub = {
                    pub_id: 0,
                    pub_name: data['Publisher Name'],
                    pub_add: data['Publisher Address'],
                    pub_email: data['Publisher Email'],
                    pub_phone: data['Publisher Number'],
                    pub_web: data['Publisher Website']
                };
            } else if (selectedType == 4) {
                const adviser = req.body.adviser.split(' ');
                adviserFname = adviser[0];
                adviserLname = adviser[1];
            }

            // 6. Insert Resources
            const resourceId = await importResources(res, deptId, data, authors, username, selectedType);
            if (!resourceId) {
                console.log(`Skipping resource: ${data['Title']}`);
                continue;
            }

            insertedResources.push({ title: data['Title'], id: resourceId });

            // 7. Insert Books if selected type is 1 (Book)
            if (selectedType == '1') {
                const pubId = await checkIfPubExist(pub);
                console.log('Publisher ID:', pubId);
                await importBook(data['ISBN'].replace(/\s+/g, ''), resourceId, pubId, topicId, imageFile);
            }else if(['2', '3'].includes(selectedType)){

            }
        }

        // **Send a response after processing all items**
        res.status(200).json({
            message: 'Import completed successfully.',
            insertedRecords: insertedResources
        });
    } catch (error) {
        console.error('Error in importCatalog:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};


//insert resource
const importResources = async (res, deptId, data, authors, username, selectedType) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Check if the resource exists
            const resourceExists = await checkResourceIfExist(data['Title']);

            if (resourceExists) {
                console.log('Resource already exists.');
                return resolve(null);
            }
            console.log("username: ",username)
            // Insert the resource
            const insertQuery = `
                INSERT INTO resources (
                    resource_title, 
                    resource_description, 
                    resource_published_date, 
                    original_resource_quantity, 
                    resource_quantity, 
                    resource_is_circulation, 
                    dept_id, 
                    type_id, 
                    avail_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const resourceValues = [
                data['Title'],
                data['Description'] || '',
                data['Published Date'],
                data['Quantity'],
                data['Quantity'],
                selectedType==1?1:0,
                deptId,
                selectedType,
                1,
            ];

            db.query(insertQuery, resourceValues, async (err, results) => {
                if (err) {
                    return reject(err); // Reject with error
                }

                // Get the `resource_id` of the newly inserted row
                const resourceId = results.insertId;
                // logAuditAction(username, 'INSERT', 'resources', null, null, JSON.stringify("Added a new resource: '" + data['Title'] + "'"));
                try {
                    // Insert authors for the resource
                    await insertAuthors(res, authors, resourceId);
                    resolve(resourceId); // Resolve with the `resourceId`
                } catch (authorError) {
                    reject(authorError); // Reject if there's an error inserting authors
                }
            });
        } catch (error) {
            reject(error); // Reject with any error that occurs
        }
    });
};

// Remove 'res' from parameters
const importBook = async (isbn, resourceId, pubId, topicId, imageFile) => {

    // Return a new Promise
    return new Promise((resolve, reject) => {
        const q = `
            INSERT INTO book (book_isbn, resource_id, pub_id, topic_id, filepath)
            VALUES (?, ?, ?, ?, ?)`;
        
            const cleanedIsbn = typeof isbn === 'string' ? isbn.replace(/\s+/g, '') : null;

        const values = [
            cleanedIsbn,
            resourceId || null, // Ensure correct types or handle potential NaN
            pubId || null,
            topicId || null,   // Renamed param from 'topic' for clarity
            imageFile || null
        ];
        console.log(values)

        db.query(q, values, (err, results) => {
            if (err) {
                // Log the error internally if needed
                console.error(`Error inserting book (ISBN: ${isbn}, ResourceID: ${resourceId}):`, err);
                // Reject the promise with the error
                reject(err);
            } else {
                // Log success internally if needed
                // console.log(`Book inserted successfully (ISBN: ${isbn}, ResourceID: ${resourceId})`);
                // Resolve the promise (optionally with results) on success
                resolve(results);
            }
        });
    });
};

const importJournalNewsletter = async(jn,res)=>{
    const q = 'INSERT INTO journalnewsletter (jn_volume, jn_issue, filepath, resource_id, topic_id) VALUES (?, ?, ?, ?,?)';
            
    db.query(q, jn, (err, result) => {
        if (err) {
            return res.status(500).send(err); 
        }
        
        return res.send({status: 201, message:'Journal/Newsletter inserted successfully.'});
    });
}