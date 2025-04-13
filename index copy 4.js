import dotenv from 'dotenv';
import express from "express";
import mysql from "mysql2";    
import mysqlPromise from 'mysql2/promise';
import cors from "cors";
import axios from 'axios';
import multer from 'multer'; // This is a tool that helps us upload files (like images or documents) from a form to our server.
import fs, { stat } from 'fs';
import http from 'http';
import { Server } from 'socket.io';
import bcrypt from 'bcrypt';
const saltRounds = 10;
import jwt from 'jsonwebtoken'
import cookieParser from 'cookie-parser'
import cron from 'node-cron'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import validateTupIdRouter from './routes/validateTupId.js'; // Adjust the path if neededimport cron from 'node-cron'

dotenv.config();


const dbPromise = mysqlPromise.createPool({ host: process.env.DB_HOST_LOCAL,
    user: process.env.DB_USER_LOCAL,
    password: process.env.DB_PASSWORD_LOCAL,
    database: process.env.DB_DATABASE_LOCAL, });

const app = express()
app.use(cookieParser());
app.use(express.json())
app.use(cors({
    origin: ['http://localhost:3000','http://localhost:3002'],
    methods: 'GET,POST,PUT,DELETE',
    credentials:true
}));

// api key for google books
const apikey = process.env.API_KEY;


 const db = mysql.createConnection({
    host: process.env.DB_HOST_LOCAL,
    user: process.env.DB_USER_LOCAL,
    password: process.env.DB_PASSWORD_LOCAL,
    database: process.env.DB_DATABASE_LOCAL,
}); 


db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to the database');
});


// How we create an HTTP server with React
const server = http.createServer(app);

// Server is a class
const io = new Server(server, {
    cors: {
        // URL for frontend
        origin: ['http://localhost:3000','http://localhost:3002'],
        
    }
});

// Handle WebSocket connections
io.on('connection', (socket) => {
    // Listen for an event from the client
    socket.on('newResource', () => {
        console.log('New data inserted');
        io.emit('updatedCatalog');
    });
});

// Function to log user actions
const logAuditAction = (userId, actionType, tableName, recordId, oldValue = null, newValue = null) => {
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


/*--------------MULTER------------------------- */

const storage = multer.diskStorage({
    destination: function(req,file,cb){
        return cb(null,"./public/images")
    },
    filename:function(req,file,cb){
        return cb(null,`${Date.now()}_${file.originalname}`)
    }
})

//upload: This is an instance of multer, configured to use the storage we just defined. It's ready to handle file uploads now!
const upload = multer({ storage });

app.post('/file', upload.single('file'), (req, res) => {
    console.log(req.file); // Log the uploaded file details
    const filePath = req.file.path; // Get the file path

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Error reading file');
        }

        // Send the file data as a response
        res.send(data); // This sends the file content to the frontend
        console.log(data)

        // Attempt to unlink (delete) the file after sending the response
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting file:', unlinkErr);
        });
    });
});

/*-----------SAVE RESOURCE ONLINE-----------*/
app.post('/save', upload.single('file'), async (req, res) => {
    console.log('Saving resource...');
    const mediaType = req.body.mediaType;
    const username = req.body.username;
    let adviserFname, adviserLname, filePath, imageFile;
    let pub = {};
    console.log('username 1: ', username)

    // Handle image upload or URL
    try{
        if (req.file) {
            filePath = req.file.path;
            imageFile = fs.readFileSync(filePath); // Read file synchronously
        } else if (req.body.url) {
            const imageUrl = req.body.url;
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            imageFile = response.data;
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
            await insertBook(imageFile, req.body.isbn, resourceId, pubId, req.body.topic, res, filePath);
        }else if(['2', '3'].includes(mediaType)){
            // insert journal/newsletter in database
            const jn = [
                req.body.volume,
                req.body.issue,
                imageFile,
                resourceId,
                req.body.topic,
            ];

            await insertJournalNewsletter(jn,res,filePath)
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
    
})

//check if adviser exist
const checkAdviserIfExist = async (adviser) => {
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
const insertAdviser = async (adviser) => {
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
const insertThesis = async (resourceId, adviserId,res)=>{
    const q = "INSERT INTO thesis (resource_id, adviser_id) VALUES (?,?)"

    db.query(q,[resourceId,adviserId],(err,results)=>{
        if (err) {
            return res.status(500).send(err); 
        }

        io.emit('updatedCatalog')
        return res.send({status:201,message:'Thesis inserted successfully.'});
    })
}

//insert journal and newsletter
const insertJournalNewsletter = async(jn,res,filePath)=>{
    const q = 'INSERT INTO journalnewsletter (jn_volume, jn_issue, jn_cover, resource_id,topic_id) VALUES (?, ?, ?, ?,?)';
            
    db.query(q, jn, (err, result) => {
        if (err) {
            return res.status(500).send(err); 
        }
    
        // Cleanup uploaded file
        if (filePath) {
            fs.unlinkSync(filePath);
        }
        io.emit('updatedCatalog')
        return res.send({status: 201, message:'Journal/Newsletter inserted successfully.'});
    });
}

//check if publisher exist 
const checkIfPubExist = async (pub) => {
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
const insertPublisher = async (pub) => {
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
const insertBook = async(cover, isbn, resourceId, pubId, topic,res, filePath)=>{
    const q = `
    INSERT INTO book (book_cover, book_isbn, resource_id, pub_id, topic_id) VALUES (?,?,?,?,?)`

    const values = [
        cover,
        isbn,
        resourceId,
        pubId,
        topic
    ]

    db.query(q, values, (err,results)=>{
        if (err) {
            return res.status(500).send(err); 
        }
        // Cleanup uploaded file
        if (filePath) {
            fs.unlinkSync(filePath);
        }
        
        io.emit('updatedCatalog')
        // console.log('Book inserted successfully')
        return res.send({status: 201, message:'Book inserted successfully.'});
    })

}

//check resource if exist
const checkResourceIfExist = (title) => {
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
const insertResources = async (res, req, authors, username) => {
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
                    resource_quantity, 
                    resource_is_circulation, 
                    dept_id, 
                    type_id, 
                    avail_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const resourceValues = [
                req.body.title,
                req.body.description,
                req.body.publishedDate,
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
                logAuditAction(username, 'INSERT', 'resources', null, null, JSON.stringify({ 'resource name': req.body.title }));
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
const insertAuthors = async (res,authors,resourceId)=>{
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

/*-----------EDIT RESOURCE ONLINE-----------*/
app.put('/file', upload.single('file'), (req, res) => {
    console.log(req.file); // Log the uploaded file details
    const filePath = req.file.path; // Get the file path

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Error reading file');
        }

        // Send the file data as a response
        res.send(data); // This sends the file content to the frontend
        console.log(data)

        // Attempt to unlink (delete) the file after sending the response
        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) console.error('Error deleting file:', unlinkErr);
        });
    });
});
app.put('/edit/:id', upload.single('file'),async (req, res) => {
    const resourceId = req.params.id;
    const mediaType = req.body.mediaType;
    const username = req.body.username;
    let adviserFname, adviserLname, filePath, imageFile;
    let pub = {};
    
    try{
        if(req.file){
            filePath = req.file.path; // Get the file path 
            fs.readFile(filePath, (err, data) => {
                 if (err) {
                     return res.status(500).send(err); 
                 }
                 imageFile = data;
             })
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
            editBook(imageFile,req.body.isbn,resourceId,pubId,req.body.topic,res,filePath)
        }else if(mediaType==='2'|| mediaType==='3'){
            await editJournalNewsletter(filePath,res,req.body.volume,req.body.issue,imageFile,resourceId)
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
})
//edit book
const editBook = async (cover, isbn, resourceId, pubId, topic,res,filePath)=>{
    let q;
    let book;

    console.log('filepath: ', filePath)

    if (typeof filePath === 'string') {
        q = `UPDATE book SET book_cover = ?, book_isbn = ?, pub_id = ?, topic_id = ? WHERE resource_id = ?`;
        book = [cover, isbn, pubId, topic, resourceId];
    } else {
        q = `UPDATE book SET book_isbn = ?, pub_id = ?, topic_id = ? WHERE resource_id = ?`;
        book = [isbn, pubId, topic, resourceId];
    }
    

    db.query(q, book, (err, result) => {
        if (err) {
            return res.status(500).send(err); 
        }
        if(typeof filePath === 'string'){
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting file:', unlinkErr);
            }); 
        }
        
        io.emit('updatedCatalog');
        console.log('Book edited successfully')
        // Successfully inserted 
        return res.send({status: 201, message:'Book edited successfully.'});
    });
}
//edit journal/newsletter
const editJournalNewsletter = async(filePath,res,volume,issue,cover,resourceId)=>{
    let q;
    let jn;

    if(typeof filePath === 'string'){
        q = `
             UPDATE 
                journalnewsletter 
            SET
                jn_volume = ?,
                jn_issue = ?,
                jn_cover = ?
                WHERE
                resource_id = ?`;
        jn = [
                volume,
                issue,
                cover,
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

            if(typeof filePath === 'string'){
                fs.unlink(filePath, (unlinkErr) => {
                    if (unlinkErr) console.error('Error deleting file:', unlinkErr);
                }); 
            }
            
            io.emit('updatedCatalog');
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
                            newValue
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

        io.emit('updatedCatalog');
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

/*-----------RETRIEVE BOOK ISBN-----------*/
// retrieve book information from google books api using isbn
app.get('/bookData/:isbn',async (req,res)=>{
    const isbn = req.params.isbn
    try{
        const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${apikey}`);
        console.log(response.data)
        return res.json(response.data);
        
    }catch(err){
        console.log(err)
        return res.status(500).json({ message: 'Error fetching data from Google Books API.' });
    }
})

/*-----------RETRIEVE DATA-----------*/
/*-----------RETRIEVE DATA-----------*/
//retrieve list of colleges from database
app.get('/college',(req,res)=>{
    const q = 'SELECT * FROM college'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
})
//retrieve list of courses from database
app.get('/course',(req,res)=>{
    const q = 'SELECT * FROM course'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
})
//retrieve list of department from database
app.get('/departments',(req,res)=>{
    const q = 'SELECT * FROM department'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
})
app.get('/topic',(req,res)=>{
    const q = 'SELECT * FROM topic'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
})
// retrieve list of genre from database
app.get('/publishers',(req,res)=>{
    const q = 'SELECT * FROM publisher'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
})
//retrieve list of genre from database
app.get('/authors',(req,res)=>{
    const q = 'SELECT * FROM author'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
})
//retrieve advisers  from database
app.get('/advisers',(req,res)=>{
    const q = 'SELECT * FROM adviser'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
           return res.json(results)
    })
})
//retrieve type  from database
app.get('/type',(req,res)=>{
    const q = 'SELECT * FROM resourcetype'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
})
//retrieve type  from database
app.get('/status',(req,res)=>{
    const q = 'SELECT * FROM availability'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
})

app.get('/roles', (req,res)=>{
    const q = 'SELECT * FROM roles'

    db.query(q,(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
})

/*---------------------------------- */

app.get("/getTotalVisitors", (req, res) => {
    const query = `SELECT COUNT(*) AS total_attendance FROM attendance WHERE DATE(att_date) = curdate()`;
  
    db.query(query, (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
      }
  
      const total_attendance = result[0]?.total_attendance || 0;
      res.json({ total_attendance });
    });
  });

app.get("/getBorrowedBooks", (req, res) => {
    const query = `SELECT COUNT(*) AS total_borrowed FROM checkout WHERE DATE(checkout_date) = curdate() AND status = 'borrowed'`;
    

    db.query(query, (err, result) => {
        if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
        }

        const total_borrowed = result[0]?.total_borrowed || 0;
        res.json({ total_borrowed });
    });
});

app.get("/getReturnedBooks", (req, res) => {
    const query = `SELECT COUNT(*) AS total_returned FROM checkin WHERE DATE(checkin_date) = curdate()`;

    db.query(query, (err, result) => {
        if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
        }

        const total_returned = result[0]?.total_returned || 0;
        res.json({ total_returned });
    });
});

app.get("/getOverdueBooks", (req, res) => {
    const query = `SELECT COUNT(*) AS total_overdue FROM overdue`;

    db.query(query, (err, result) => {
        if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Internal server error" });
        }

        const total_overdue = result[0]?.total_overdue || 0;
        res.json({ total_overdue });
    });
});


/*-------DISPLAY DATA FOR CATALOG PAGE & DYNAMIC SEARCH----- */
app.get('/catalogdetails', (req, res) => {
    const keyword = req.query.keyword || '';
    const offset = parseInt(req.query.offset, 10);
    const type = parseInt(req.query.type, 10) || 0;
    const topic = parseInt(req.query.topic, 10) || 0;
    const department = parseInt(req.query.department, 10) || 0;
    const author = parseInt(req.query.author, 10) || 0;
    const title = parseInt(req.query.title, 10) || 0;

    if (isNaN(offset)) {
        return res.status(400).send('Invalid offset value');
    }

    const searchKeyword = `%${keyword}%`;
    const params1 = [searchKeyword, searchKeyword, searchKeyword];

    // Construct WHERE clauses dynamically
    const whereClauses = [];
    if (type > 0) whereClauses.push(`resources.type_id = ${type}`);
    if (department > 0) whereClauses.push(`resources.dept_id = ${department}`);
    if (topic > 0) whereClauses.push(`book.topic_id = ${topic} OR journalnewsletter.topic_id = ${topic}`);

    const whereClause = whereClauses.length ? `AND ${whereClauses.join(' AND ')}` : '';

    // Construct ORDER BY clause
    let orderClauses = '';
    if (title === 1) orderClauses = 'ORDER BY resources.resource_title ASC';
    else if (title === 2) orderClauses = 'ORDER BY resources.resource_title DESC';
    if (author === 1) orderClauses = 'ORDER BY author.author_fname ASC';
    else if (author === 2) orderClauses = 'ORDER BY author.author_fname DESC';

    const q = `
        SELECT DISTINCT resources.resource_id
        FROM resources
        JOIN resourceauthors ON resources.resource_id = resourceauthors.resource_id
        JOIN author ON resourceauthors.author_id = author.author_id
        WHERE (resources.resource_title LIKE ? OR author.author_fname LIKE ? OR author.author_lname LIKE ?)
        ${whereClause}
        ${orderClauses}
        LIMIT 5 OFFSET ?;
    `;

    const countQ = `
        SELECT COUNT(DISTINCT resources.resource_id) AS total
        FROM resources
        JOIN resourceauthors ON resources.resource_id = resourceauthors.resource_id
        JOIN author ON resourceauthors.author_id = author.author_id
        LEFT JOIN book ON resources.resource_id = book.resource_id
        LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
        WHERE (resources.resource_title LIKE ? OR author.author_fname LIKE ? OR author.author_lname LIKE ?)
        ${whereClause};
    `;

    const resourceInfoQ = `
        SELECT 
            resources.resource_title, 
            resources.resource_id, 
            resourcetype.type_name, 
            resources.resource_quantity, 
            department.dept_name,
            CASE
                WHEN resources.type_id IN ('1', '2', '3') THEN topic.topic_name
                ELSE 'n/a'
            END AS topic_name,
            GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_names
        FROM resources
        JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id 
        JOIN author ON resourceauthors.author_id = author.author_id 
        JOIN resourcetype ON resources.type_id = resourcetype.type_id 
        JOIN department ON department.dept_id = resources.dept_id
        LEFT JOIN book ON resources.resource_id = book.resource_id
        LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
        LEFT JOIN topic 
            ON (book.topic_id = topic.topic_id OR journalnewsletter.topic_id = topic.topic_id)
        WHERE resources.resource_id = ?
        GROUP BY resources.resource_id;
    `;

    // Execute count query
    db.query(countQ, params1, (err, countResult) => {
        if (err) {
            console.error('Error counting resources:', err);
            return res.status(500).send('An internal server error occurred.');
        }

        const totalResource = countResult[0]?.total || 0;

        // Execute resource IDs query
        db.query(q, [...params1, offset], (err, result) => {
            if (err) {
                console.error('Error fetching resource IDs:', err);
                return res.status(500).send('An internal server error occurred.');
            }

            if (result.length > 0) {
                const resourceIds = result.map(res => res.resource_id);
                const resourcePromises = resourceIds.map(id =>
                    new Promise((resolve, reject) => {
                        db.query(resourceInfoQ, [id], (err, resourceResult) => {
                            if (err) return reject(err);
                            resolve(resourceResult[0] || null);
                        });
                    })
                );

                Promise.all(resourcePromises)
                    .then(resources => {
                        const validResources = resources.filter(r => r !== null);
                        res.send({ validResources, totalResource });
                    })
                    .catch(err => {
                        console.error('Error fetching resource details:', err);
                        res.status(500).send('An internal server error occurred.');
                    });
            } else {
                res.send({ validResources: [], totalResource });
            }
        });
    });
});



/*--------VIEW RESOURCE FROM CATALOG-------------*/ 
app.get('/view/:id',(req,res)=>{
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
}) 
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
        book.book_cover,
		book.topic_id 
    FROM resources 
    JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id 
    JOIN author ON resourceauthors.author_id = author.author_id 
    JOIN resourcetype ON resources.type_id = resourcetype.type_id 
    LEFT JOIN book ON book.resource_id = resources.resource_id 
    LEFT JOIN publisher ON book.pub_id = publisher.pub_id 
    WHERE resources.resource_id = ?
    GROUP BY  resources.resource_id`

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
        journalnewsletter.jn_cover
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
}

/*--------------SEARCH IN ONLINE CATALOG-------------------*/
app.get('/resource/search', async (req, res) => {
    const searchQuery = req.query.q;
    const searchFilter = req.query.filter;
    console.log(searchQuery);
    console.log(searchFilter)

    const query = 
    `SELECT 
        resource_Id 
    FROM 
        resources 
    WHERE 
        resource_title 
    LIKE ?`;

    db.query(query, [`%${searchQuery}%`], async (err, results) => {
        if (err) return res.status(500).send(err);

        if (results.length !== 0) {
            const searchResults = [];

            const titleAuthorQuery = `
                SELECT 
                    resources.resource_title, 
                    resources.resource_id,
                    book.book_cover, 
                    CONCAT(author.author_fname, ' ', author.author_lname) AS author_name 
                FROM resourceauthors 
                JOIN resources ON resourceauthors.resource_id = resources.resource_id 
                JOIN author ON resourceauthors.author_id = author.author_id 
                JOIN book ON book.resource_id = resources.resource_id 
                WHERE resourceauthors.resource_id = ?`;

            try {
                await Promise.all(
                    results.map(item => {
                        return new Promise((resolve, reject) => {
                            db.query(titleAuthorQuery, [item.resource_Id], (err, results) => {
                                if (err) return reject(err); // Reject on query error

                                if (results.length > 0) {
                                    searchResults.push({
                                        title: results[0].resource_title,
                                        author: results[0].author_name,
                                        cover: results[0].book_cover,
                                        id: results[0].resource_id
                                    });
                                }
                                resolve(); // Resolve the promise
                            });
                        });
                    })
                );

                console.log(searchResults);
                res.json(searchResults); // Send the collected results
            } catch (err) {
                res.status(500).send(err); // Handle errors in the inner queries
            }
        } else {
            res.send([]); // No results found
        }
    });
});
app.get('/resource/:id', (req,res)=>{
    const id = req.params.id;
    
    const q = "SELECT resources.resource_title,resources.resource_description, CONCAT(author.author_fname, ' ', author.author_lname) AS author_name, availability.avail_name, catalog.cat_course_code, book.book_cover, book.book_isbn FROM resourceauthors JOIN resources ON resourceauthors.resource_id = resources.resource_id JOIN author ON resourceauthors.author_id = author.author_id JOIN book ON book.resource_id = resources.resource_id AND resources.resource_id = book.resource_id JOIN availability ON resources.avail_id = availability.avail_id JOIN catalog ON resources.cat_id = catalog.cat_id WHERE resourceauthors.resource_id=?;"

    db.query(q,[id],(err,result)=>{
        if(err) return res.send(err)
            return res.json(result)
    })
})



app.get('/patron', (req, res) => {
const q = `SELECT 
            p.patron_id,
            p.tup_id,
            p.patron_fname,
            p.patron_lname,
            p.patron_email,
            p.category,
            cr.course_name,
            COUNT(CASE WHEN c.status = 'borrowed' THEN 1 END) AS total_checkouts
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
            cr.course_name;
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
});

app.get('/patron/:id',(req,res)=>{
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
})

app.get("/log-history/:id",(req,res)=>{
    const id = req.params.id;

    const q = `
        SELECT att_log_in_time, att_date 
        FROM attendance 
        WHERE patron_id = ?`

    db.query(q,[id],(err,results)=>{
        if(err) return res.send(err)
            return res.json(results)
    })
})

app.get("/circulation-history/:id",(req,res)=>{
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
})

app.get('/patronCheckin', (req, res) => {


    const q = `SELECT 
                    p.patron_id,
                    p.tup_id,
                    p.patron_fname,
                    p.patron_lname,
                    p.patron_email,
                    p.category,
                    cr.course_name,
                    COUNT(c.checkout_id) AS total_checkouts
                FROM 
                    patron p
                LEFT JOIN 
                    checkout c 
                ON 
                    p.patron_id = c.patron_id AND c.status = 'borrowed'
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
    });

app.get('/getBorrowers', (req, res) => {
    const q = `SELECT 
            p.tup_id, 
            p.patron_fname, 
            p.patron_lname, 
            p.patron_email, 
            p.category, 
            GROUP_CONCAT(r.resource_title ORDER BY r.resource_title SEPARATOR ', \n') AS borrowed_books,
            course.course_name AS course, 
            COUNT(c.checkout_id) AS total_checkouts
        FROM 
            patron p
        INNER JOIN 
            checkout c ON p.patron_id = c.patron_id
        INNER JOIN 
            resources r ON c.resource_id = r.resource_id
        JOIN 
            course ON p.course_id = course.course_id
        WHERE c.status = 'borrowed'
        GROUP BY 
            p.tup_id, 
            p.patron_fname, 
            p.patron_lname, 
            p.patron_email, 
            p.category, 
            course.course_name
        ORDER BY 
            MAX(c.checkout_date) DESC
        LIMIT 5;
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
});

app.get('/api/books/search', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }
      console.log('Incoming query:', req.query);
    try {
      const [results] = await (await dbPromise).execute(
        `
        SELECT 
            b.book_isbn, 
            b.book_cover,
            r.resource_title AS title, 
            r.resource_quantity AS quantity, 
            r.resource_id
        FROM 
            book b
        INNER JOIN 
            resources r 
        ON 
            b.resource_id = r.resource_id
        WHERE 
            (b.book_isbn LIKE ? OR r.resource_title LIKE ?)
            AND r.resource_quantity > 0
        LIMIT 10;
        `,
        [`%${query}%`, `%${query}%`]
      );
      
      const covers = results.map(book => ({
        cover: Buffer.from(book.book_cover).toString('base64'),
        resource_id: (book.resource_id),
        resource_title: (book.title),
        resource_quantity: (book.quantity),
        book_isbn: (book.book_isbn)

    }));

      res.json(covers);
    } catch (error) {
      console.error('Error fetching book suggestions:', error);
      res.status(500).send("Error fetching book suggestions");
    }
  });

  app.get('/api/books/search/checkin', async (req, res) => {
    const { query, patron_id } = req.query; // Assuming patron_id is passed as a query parameter

    // Validate query and patron_id
    if (!query || !patron_id) {
        return res.status(400).json({ error: 'Both query and patron_id parameters are required' });
    }
    
    console.log('Incoming query:', req.query);

    try {
        const [results] = await (await dbPromise).execute(
            `
            SELECT 
                b.book_isbn, 
                b.book_cover,
                r.resource_title AS title, 
                r.resource_quantity AS quantity, 
                r.resource_id
            FROM 
                book b
            INNER JOIN 
                resources r 
            ON 
                b.resource_id = r.resource_id
            WHERE 
                (b.book_isbn LIKE ? OR r.resource_title LIKE ?)
                AND r.patron_id = ?
            LIMIT 10;
            `,
            [`%${query}%`, `%${query}%`, `%${patron_id}%`]
        );

        const covers = results.map(book => ({
            cover: book.book_cover
                ? Buffer.from(book.book_cover).toString('base64')
                : null, // Handle potential null covers
            resource_id: book.resource_id,
            resource_title: book.title,
            resource_quantity: book.quantity,
            book_isbn: book.book_isbn,
        }));

        res.json(covers);
    } catch (error) {
        console.error('Error fetching book suggestions:', error);
        res.status(500).send("Error fetching book suggestions");
    }
});

app.get('/api/books/search/checkin2', async (req, res) => {
    const { query, patron_id } = req.query;

    // Validate query and patron_id
    if (!query || !patron_id) {
        return res.status(400).json({ error: 'Both query and patron_id parameters are required' });
    }

    console.log('Incoming query:', req.query);

    try {
        const [results] = await (await dbPromise).execute(
            `
            SELECT 
                b.book_isbn, 
                b.book_cover,
                r.resource_title AS title, 
                r.resource_id
            FROM 
                book b
            INNER JOIN 
                resources r 
            ON 
                b.resource_id = r.resource_id
            INNER JOIN 
                checkout c 
            ON 
                r.resource_id = c.resource_id
            WHERE 
                (b.book_isbn LIKE ? OR r.resource_title LIKE ?)
                AND c.patron_id = ? AND c.status = "borrowed"

            LIMIT 10;
            `,
            [`%${query}%`, `%${query}%`, patron_id]
        );

        const covers = results.map(book => ({
            cover: book.book_cover
                ? Buffer.from(book.book_cover).toString('base64')
                : null, // Handle potential null book covers
            resource_id: book.resource_id,
            resource_title: book.title,
            book_isbn: book.book_isbn,
        }));

        res.json(covers);
    } catch (error) {
        console.error('Error fetching book suggestions:', error);
        res.status(500).send("Error fetching book suggestions");
    }
});

app.get('/checkoutPatron', async (req, res) => {
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
});


app.post('/checkout1', async (req, res) => {
    const { checkout_date, checkout_due, resource_id, patron_id, username } = req.body;

    if (!checkout_date || !checkout_due || !resource_id || !patron_id) {
        return res.status(400).json({
            error: 'Invalid input. All fields (checkout_date, checkout_due, resource_id, patron_id) are required.',
        });
    }

    const db = await dbPromise; // Assuming `dbPromise` resolves to the database connection

    try {
        // Start a transaction
        await db.query('START TRANSACTION');

        // Insert checkout record
        const [result] = await db.query(
            'INSERT INTO checkout (checkout_date, checkout_due, resource_id, patron_id) VALUES (?, ?, ?, ?)',
            [checkout_date, checkout_due, resource_id, patron_id]
        );

        // Fetch the resource details
        const [resource] = await db.query(
            'SELECT resource_title, resource_quantity FROM resources WHERE resource_id = ?',
            [resource_id]
        );

        if (!resource || !resource.length) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Resource not found' });
        }

        const { resource_title, resource_quantity } = resource[0];

        // Check if resource_quantity is greater than 0
        if (resource_quantity <= 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Resource is not available for checkout.' });
        }

        // Decrement resource quantity
        await db.query(
            'UPDATE resources SET resource_quantity = resource_quantity - 1 WHERE resource_id = ?',
            [resource_id]
        );

        // Log audit action
        logAuditAction(
            username,
            'INSERT',
            'checkout',
            resource_id,
            null,
            JSON.stringify({ 'book name ': resource_title, status: ' borrowed' })
        );

        // Commit the transaction
        await db.query('COMMIT');

        res.status(200).json({ message: 'Checkout successful!', checkout_id: result.insertId });
    } catch (error) {
        console.error('Error processing checkout:', error.message);

        // Rollback transaction on error
        await db.query('ROLLBACK');

        res.status(500).json({ error: 'Failed to process checkout' });
    }
});

app.post('/checkout', async (req, res) => {
    const { checkout_date, checkout_due, resource_id, patron_id, username } = req.body;

    if (!checkout_date || !checkout_due || !resource_id || !patron_id) {
        return res.status(400).json({
            error: 'Invalid input. All fields (checkout_date, checkout_due, resource_id, patron_id) are required.',
        });
    }

    const db = await dbPromise; // Assuming `dbPromise` resolves to the database connection

    try {
        // Start a transaction
        await db.query('START TRANSACTION');

        // Fetch patron details
        const [patron] = await db.query(
            'SELECT patron_fname, patron_lname FROM patron WHERE patron_id = ?',
            [patron_id]
        );

        if (!patron || !patron.length) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Patron not found' });
        }

        const { patron_fname, patron_lname } = patron[0];
        const patron_name = `${patron_fname} ${patron_lname}`; // Combine patron_fname and patron_lname

        // Insert checkout record
        const [result] = await db.query(
            'INSERT INTO checkout (checkout_date, checkout_due, resource_id, patron_id) VALUES (?, ?, ?, ?)',
            [checkout_date, checkout_due, resource_id, patron_id]
        );

        // Fetch the resource details
        const [resource] = await db.query(
            'SELECT resource_title, resource_quantity FROM resources WHERE resource_id = ?',
            [resource_id]
        );

        if (!resource || !resource.length) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Resource not found' });
        }

        const { resource_title, resource_quantity } = resource[0];

        // Check if resource_quantity is greater than 0
        if (resource_quantity <= 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Resource is not available for checkout.' });
        }

        // Decrement resource quantity
        await db.query(
            'UPDATE resources SET resource_quantity = resource_quantity - 1 WHERE resource_id = ?',
            [resource_id]
        );

        // Log audit action
        logAuditAction(
            username,
            'INSERT',
            'checkout',
            resource_id,
            null,
            JSON.stringify({ 'BOOK NAME': resource_title, STATUS: ' borrowed', PATRON: patron_name })
        );

        // Commit the transaction
        await db.query('COMMIT');

        io.emit('updatedCirculation')
        res.status(200).json({
            message: 'Checkout successful!',
            checkout_id: result.insertId,
            patron_name,
        });
    } catch (error) {
        console.error('Error processing checkout:', error.message);

        // Rollback transaction on error
        await db.query('ROLLBACK');

        res.status(500).json({ error: 'Failed to process checkout' });
    }
});




app.get('/getCheckoutRecord', (req, res) => {
const { resource_id, patron_id } = req.query;
const query = 'SELECT checkout_id FROM checkout WHERE resource_id = ? AND patron_id = ? AND status = "borrowed"';

db.query(query, [resource_id, patron_id], (err, results) => {
    if (err) {
    return res.status(500).json({ error: err.message });
    }
    if (results.length === 0) {
    return res.status(404).json({ message: 'Checkout record not found.' });
    }
    res.json(results[0]);
});
});
  
  // Check In (insert records into the checkin table)
// Check In (insert records into the checkin table and delete from checkout)



app.post('/checkin', async (req, res) => {
    const { checkout_id, returned_date, patron_id, resource_id, username } = req.body;

    if (!checkout_id || !returned_date) {
        return res.status(400).json({ error: 'checkout_id and returned_date are required.' });
    }

    const db = await dbPromise; // Assuming `dbPromise` resolves to the database connection

    try {
        // Start a transaction
        await db.query('START TRANSACTION');

        // Fetch patron details
        const [patron] = await db.query(
            'SELECT patron_fname, patron_lname FROM patron WHERE patron_id = ?',
            [patron_id]
        );

        if (!patron || !patron.length) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Patron not found' });
        }

        const { patron_fname, patron_lname } = patron[0];
        const patron_name = `${patron_fname} ${patron_lname}`; // Combine patron_fname and patron_lname

        // Insert into the checkin table
        const checkinQuery = 'INSERT INTO checkin (checkout_id, checkin_date) VALUES (?, ?)';
        const [checkinResult] = await db.query(checkinQuery, [checkout_id, returned_date]);

        // Update checkout status
        const updateCheckoutStatusQuery = 'UPDATE checkout SET status = ? WHERE checkout_id = ?';
        await db.query(updateCheckoutStatusQuery, ['returned', checkout_id]);

        // Increment resource quantity
        const incrementResourceQuery =
            'UPDATE resources SET resource_quantity = resource_quantity + 1 WHERE resource_id = ?';
        await db.query(incrementResourceQuery, [resource_id]);

        // Commit the transaction
        await db.query('COMMIT');

        // After the transaction is committed, fetch the resource title
        const [resource] = await db.query(
            'SELECT resource_title FROM resources WHERE resource_id = ?',
            [resource_id]
        );

        // If no resource is found, handle the case
        if (!resource || !resource.length) {
            return res.status(404).json({ error: 'Resource not found' });
        }

        const resource_title = resource[0].resource_title;

        // Log the audit action
        logAuditAction(
            username,
            'INSERT',
            'checkin',
            resource_id,
            null,
            JSON.stringify({ 'book name ': resource_title, status: 'returned', patron: patron_name })
        );

        io.emit('updatedCirculation')
        res.status(201).json({
            message: 'Item successfully checked in and removed from checkout.',
            patron_name
        });
    } catch (error) {
        console.error('Error:', error);
        
        // Rollback transaction on error
        await db.query('ROLLBACK');

        res.status(500).json({ error: 'Failed to process checkin' });
    }
});

app.get('/getCirculation', (req, res) => {
    const { page = 1, limit = 10 } = req.query; // default to page 1 and limit 10
    const offset = (page - 1) * limit;

    const countQuery = `
        SELECT COUNT(*) AS totalCount FROM checkout c
        INNER JOIN patron p ON p.patron_id = c.patron_id
        INNER JOIN resources r ON c.resource_id = r.resource_id
        INNER JOIN course ON p.course_id = course.course_id
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
            c.status,
            c.checkout_due,
            r.resource_title AS borrowed_book,
            course.course_name AS course, 
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
        ORDER BY 
            status_category, 
            c.checkout_date DESC
        LIMIT ? OFFSET ?
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
});



app.get('/getCirculation2', (req, res) => {
    const q = `SELECT 
    p.tup_id, 
    p.patron_fname, 
    p.patron_lname, 
    p.patron_email, 
    p.category, 
    c.checkout_id,
    c.checkout_date,
    c.status,
    c.checkout_due,
    r.resource_title AS borrowed_book,
    course.course_name AS course, 
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
JOIN 
    course ON p.course_id = course.course_id
ORDER BY 
    status_category, 
    c.checkout_date DESC;


            `;
    db.query(q, (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).send({ error: 'Database error', details: err.message });
        } 
        res.json(results);
      
    });
});

app.get('/getCirculation1', (req, res) => {
    let { page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) AS total FROM checkout`;
    const dataQuery = `
        SELECT 
            p.tup_id, 
            p.patron_fname, 
            p.patron_lname, 
            c.checkout_date,
            c.status,
            GROUP_CONCAT(r.resource_title ORDER BY r.resource_title SEPARATOR ', ') AS borrowed_books,
            course.course_name AS course
        FROM patron p
        INNER JOIN checkout c ON p.patron_id = c.patron_id
        INNER JOIN resources r ON c.resource_id = r.resource_id
        JOIN course ON p.course_id = course.course_id
        GROUP BY p.tup_id, p.patron_fname, p.patron_lname, c.checkout_date, c.status, course.course_name
        ORDER BY MAX(c.checkout_date) DESC
        LIMIT ? OFFSET ?;
    `;

    db.query(countQuery, (err, countResult) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });

        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        db.query(dataQuery, [limit, offset], (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error', details: err.message });

            res.json({ records: results, totalPages });
        });
    });
});


app.get('/getAudit', (req, res) => {
    const q = `SELECT * FROM audit_log`;

    db.query(q, (err, results) => {
        if (err) {
            console.error('Database query error:', err.message);
            res.status(500).send({ error: 'Database error', details: err.message });
        } else {
            res.json(results.length > 0 ? results : []);
        }
    });
});

app.get('/getAddedBooks', (req, res) => {
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
});


/* app.get('/patronSort', (req, res) => {
    const { search, startDate, endDate, limit } = req.query;
    
    // Base query with JOINs
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

    // Add search filter if provided
    if (search) {
        q += ` AND (patron.tup_id LIKE ? OR patron.patron_fname LIKE ? OR patron.patron_lname LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Add date range filter if provided
    if (startDate) {
        q += ` AND DATE(attendance.att_date) >= ?`;
        params.push(startDate);
    }

    if (endDate) {
        q += ` AND DATE(attendance.att_date) <= ?`;
        params.push(endDate);
    }

    // Add ordering
    q += ` ORDER BY att_date DESC, att_log_in_time DESC`;

    // Add limit for pagination
    if (limit) {
        q += ` LIMIT ?`;
        params.push(parseInt(limit));
    }

    // Execute query
    db.query(q, params, (err, results) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('Database error: ' + err.message);
        } else if (results.length > 0) {
            res.json(results);
        } else {
            res.json({ message: 'No patrons found' });
        }
    })
})  */

    /* app.get('/patronSort', (req, res) => {
        const { search, startDate, endDate, limit, page } = req.query;
    
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
        if (search) {
            q += ` AND (patron.tup_id LIKE ? OR patron.patron_fname LIKE ? OR patron.patron_lname LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
    
        if (startDate) {
            q += ` AND DATE(attendance.att_date) >= ?`;
            params.push(startDate);
        }
    
        if (endDate) {
            q += ` AND DATE(attendance.att_date) <= ?`;
            params.push(endDate);
        }
    
        const countQuery = `SELECT COUNT(*) AS total FROM (${q}) AS countQuery`;
    
        db.query(countQuery, params, (err, countResult) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Database error: ' + err.message);
                return;
            }
    
            const total = countResult[0].total;
    
            // Add pagination
            const offset = (page - 1) * limit;
            q += ` ORDER BY att_date DESC, att_log_in_time DESC LIMIT ? OFFSET ?`;
            params.push(parseInt(limit), parseInt(offset));
    
            db.query(q, params, (err, results) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('Database error: ' + err.message);
                } else {
                    res.json({ results, total });
                }
            });
        });
    }); */

    
    app.get('/patronSort', (req, res) => {
        const { search, startDate, endDate, limit, page } = req.query;
    
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
        if (search) {
            q += ` AND (patron.tup_id LIKE ? OR patron.patron_fname LIKE ? OR patron.patron_lname LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
    
        if (startDate) {
            q += ` AND DATE(attendance.att_date) >= ?`;
            params.push(startDate);
        }
    
        if (endDate) {
            q += ` AND DATE(attendance.att_date) <= ?`;
            params.push(endDate);
        }
    
        const countQuery = `SELECT COUNT(*) AS total FROM (${q}) AS countQuery`;
    
        db.query(countQuery, params, (err, countResult) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Database error: ' + err.message);
                return;
            }
    
            const total = countResult[0].total;
    
            // Add pagination only if limit is not "All"
            if (limit !== "null") {
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
    });
        
    

app.get('/getCover', (req, res) => {
    const query = `SELECT 
                    b.book_cover, 
                    b.resource_id, 
                    r.resource_title
                FROM 
                    book b
                JOIN 
                    resources r
                ON 
                    b.resource_id = r.resource_id
                ORDER BY 
                    b.book_id DESC
                LIMIT 5`;
    
    db.query(query, (error, results) => {
        if (error) return res.status(500).json({ error });
        
        // Convert BLOB data to base64 for use in React
        const covers = results.map(book => ({
            cover: Buffer.from(book.book_cover).toString('base64'),
            resource_id: (book.resource_id),
            resource_title: (book.resource_title)
        }));
        
        res.json(covers);
    });
});

app.get('/api/overdue-books', (req, res) => {
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
});

app.get('/issued-books', (req, res) => {
    const query = `
       SELECT
            p.tup_id,
            r.resource_title,
            DATE_FORMAT(cout.checkout_due, '%Y-%m-%d') AS duedate
        FROM 
            checkout cout
        JOIN patron p ON cout.patron_id = p.patron_id
        JOIN resources r ON cout.resource_id = r.resource_id
        WHERE cout.status = 'borrowed';
    `;
    
    db.query(query, (error, results) => {
        if (error) return res.status(500).json({ error });
    
        res.json(results);
    });
});


app.get('/popular-choices', (req, res) => {
    const query = `
       SELECT 
            r.resource_id,
            r.resource_title, 
            CONCAT(a.author_fname, ' ', a.author_lname) AS authors,
            r.resource_published_date,
            b.book_cover
        FROM 
            resources r
        JOIN book b ON b.resource_id = r.resource_id
        JOIN resourceauthors ra ON ra.resource_id = r.resource_id
        JOIN author a ON a.author_id = ra.author_id
        JOIN checkout cout ON cout.resource_id = r.resource_id
        WHERE r.resource_id = cout.resource_id
        GROUP BY r.resource_title, r.resource_published_date, b.book_cover, r.resource_id
        LIMIT 5`;
    
    db.query(query, (error, results) => {
        if (error) return res.status(500).json({ error });
    
        res.json(results);
    });
});


app.get('/checkout-info', async (req, res) => {
    /* try {
        const query = `SELECT p.tup_id, p.patron_fname, p.patron_lname, r.resource_title, c.checkout_due FROM patron p JOIN checkout c ON p.patron_id = c.patron_id JOIN resources r ON c.resource_id = r.resource_id WHERE c.checkout_due >= CURRENT_DATE()`;
        const [rows] = await db.execute(query);
        res.json(rows);
        await db.end();
    } catch (error) {
        console.error('Database query failed:', error);
        res.status(500).send('Internal Server Error');
    } */

    const query = `SELECT p.tup_id, p.patron_fname, p.patron_lname, r.resource_title, c.checkout_due FROM patron p JOIN checkout c ON p.patron_id = c.patron_id JOIN resources r ON c.resource_id = r.resource_id WHERE c.checkout_due >= CURRENT_DATE()`;
    
    db.query(query, (error, results) => {
        if (error) return res.status(500).json({ error });
        
        res.json(results);
    });
});


/*------------SYNC DATA------------------*/
// Sync resources table
app.post("/sync/resources", async (req, res) => {
    const resource = req.body;

    //check first if resource exist 
    const resourceExists =await checkResourceIfExist(resource.resource_title)

    if (resourceExists) {
        console.log('Resource already exists.');
        return res.send({ status: 409, message: `Resource with a title "${resource.resource_title}" already exists. Skipping insertion.` });
    }

    const q = `
    INSERT INTO 
        resources (resource_title, resource_description, resource_published_date, resource_quantity, resource_is_circulation, dept_id, type_id, avail_id) 
    VALUES (?,?,?,?,?,?,?,?)`;

    const values = [
        resource.resource_title,
        resource.resource_description,
        resource.resource_published_date,
        resource.resource_quantity,
        resource.resource_is_circulation,
        resource.dept_id,
        resource.type_id,
        resource.avail_id
    ];
  
    db.query(q, values, (err, results) => {
      if (err) {
        console.error("Error syncing resources:", err);
        return res.status(500).send("Failed to sync resources.");
      } else {
        const insertedId = results.insertId; // Get the ID of the inserted row
        console.log("Resource synced successfully with ID:", insertedId);
        res.status(200).json({ message: "Resource synced successfully.", resource_id: insertedId });
      }
    });
});

// Sync authors table
app.post("/sync/authors", (req, res) => {
    const { author, resourceId } = req.body;

    // Step 1: Check if the author already exists
    const checkAuthorQuery = `
        SELECT author_id 
        FROM author 
        WHERE author_fname = ? AND author_lname = ?`;

    const checkValues = [author.author_fname, author.author_lname];

    db.query(checkAuthorQuery, checkValues, (err, results) => {
        if (err) {
            console.error("Error checking if author exists:", err);
            return res.status(500).send("Failed to check author.");
        }

        if (results.length > 0) {
            // If author exists, use the existing author_id
            const authorId = results[0].author_id;
            console.log("Author already exists with ID:", authorId);

            // Sync resource-authors relationship after author is found
            syncResourceAuthors(authorId, resourceId);

            return res.status(200).json({ message: "Author already exists.", author_id: authorId });
        } else {
            // Step 2: If the author does not exist, insert the new author
            const insertAuthorQuery = `
                INSERT INTO 
                    author (author_fname, author_lname) 
                VALUES (?,?)`;

            const insertValues = [author.author_fname, author.author_lname];

            db.query(insertAuthorQuery, insertValues, (err, results) => {
                if (err) {
                    console.error("Error syncing authors:", err);
                    return res.status(500).send("Failed to sync authors.");
                } else {
                    const authorId = results.insertId; // Get the ID of the inserted author
                    console.log("Author synced successfully with ID:", authorId);

                    // Sync resource-authors relationship after author is synced
                    syncResourceAuthors(authorId, resourceId);

                    res.status(200).json({ message: "Author synced successfully.", author_id: authorId });
                }
            });
        }
    });
});

// Sync resourceauthors table
const syncResourceAuthors = (authorId, resourceId) => {
    
    const q = `
    INSERT INTO 
        resourceauthors (resource_id, author_id) 
    VALUES (?,?)`;

    const values = [resourceId, authorId];

    db.query(q, values, (err) => {
      if (err) {
        console.error("Error syncing resourceauthors:", err);
      } else {
        console.log("Resource-Author relationship synced successfully.");
      }
    });
};

//sync publishers table
app.post("/sync/publisher", (req, res) => {
    const publisher = req.body;

    // Check if publisher already exists based on unique attributes (e.g., pub_name, pub_email)
    const checkQuery = `
    SELECT * FROM publisher 
    WHERE pub_name = ? AND pub_email = ?`;

    const checkValues = [
        publisher.pub_name,
        publisher.pub_email
    ];

    db.query(checkQuery, checkValues, (err, results) => {
        if (err) {
            console.error("Error checking publisher existence:", err);
            return res.status(500).send("Failed to check publisher existence.");
        }

        // If publisher exists, return the existing publisher ID
        if (results.length > 0) {
            console.log("Publisher already exists.");
            return res.status(200).json({
                message: "Publisher already exists.",
                pub_id: results[0].pub_id // Return the existing publisher ID
            });
        }

        // If publisher doesn't exist, insert new publisher
        const insertQuery = `
        INSERT INTO 
            publisher (pub_name, pub_address, pub_email, pub_phone, pub_website) 
        VALUES (?, ?, ?, ?, ?)`;

        const insertValues = [
            publisher.pub_name,
            publisher.pub_add,
            publisher.pub_email,
            publisher.pub_phone,
            publisher.pub_website
        ];

        db.query(insertQuery, insertValues, (err, results) => {
            if (err) {
                console.error("Error syncing publishers:", err);
                return res.status(500).send("Failed to sync publishers.");
            } else {
                const pubId = results.insertId;
                console.log("Publisher synced successfully.");

                // Send the response with the publisher ID
                return res.status(200).json({
                    message: "Publisher synced successfully.",
                    pub_id: pubId
                });
            }
        });
    });
});


//sync books table
app.post("/sync/book", upload.single('file'), async (req, res) => {
  try {
    // Log incoming request for debugging
    console.log("Received body:", req.body);
    console.log("Received file:", req.file);

    console.log(req.body)

    const { resourceId, pubId, book_isbn, topic_id } = req.body;
    const file = req.file ? fs.readFileSync(req.file.path) : null;

    const q = `
      INSERT INTO 
          book (book_cover, book_isbn, resource_id, pub_id, topic_id) 
      VALUES (?, ?, ?, ?, ?)`;

    const values = [
      file,
      book_isbn || 'n/a',
      resourceId,
      pubId,
      topic_id || null,
    ];

    db.query(q, values, (err) => {
      if (err) {
        console.error("Error syncing book:", err);
        res.status(500).send("Failed to sync book.");
      } else {
        console.log("Book synced successfully.");
        res.status(200).send("Book synced successfully.");
      }
    });
  } catch (error) {
    console.error("Error syncing book:", error.message);
    res.status(500).send("Internal server error.");
  }
});


//sync journal/newsletter table
app.post("/sync/journalnewsletter", upload.single('file'), async (req, res) => {
    try {
        // Log incoming request for debugging
        console.log("Received body:", req.body);
        console.log("Received file:", req.file);
    
        const { resourceId, jn_volume, jn_issue, topic_id } = req.body;
        const file = req.file ? fs.readFileSync(req.file.path) : null;
    
        const q = `
          INSERT INTO 
              journalnewsletter (jn_volume, jn_issue, jn_cover, resource_id, topic_id) 
          VALUES (?, ?, ?, ?, ?)`;
    
        const values = [
          jn_volume,
          jn_issue,
          file,
          resourceId,
          topic_id,
        ];
    
        db.query(q, values, (err) => {
          if (err) {
            console.error("Error syncing journal/newsletter:", err);
            res.status(500).send("Failed to sync journal/newsletter.");
          } else {
            console.log("Journal/Newsletter synced successfully.");
            res.status(200).send("Journal/Newsletter synced successfully.");
          }
        });
      } catch (error) {
        console.error("Error syncing Journal/Newsletter:", error.message);
        res.status(500).send("Internal server error.");
      }
});

//sync theses 
app.post("/sync/adviser",async (req,res)=>{
    const {adviser, resourceId} = req.body;
    console.log('adviser sent from frontend: ', adviser)

    const values =[
        adviser.adviser_fname,
        adviser.adviser_lname
    ];

    const adviserId = await checkAdviserIfExist(values)
    await syncThesisOnline(adviserId,resourceId,res)
})

//sync theses 
const syncThesisOnline = async(adviserId,resourceId,res)=>{
    const q = `
    INSERT INTO 
        thesis (resource_id,adviser_id) 
    VALUES (?, ?)`;

    db.query(q, [resourceId,adviserId], (err) => {
        if (err) {
          console.error("Error syncing thesis:", err);
          res.status(500).send("Failed to sync thesis.");
        } else {
          console.log("Thesis synced successfully.");
          res.status(200).send("Thesis synced successfully.");
        }
    });
}

app.post("/attendance", (req, res) => {
    //const { studentId, date, time } = req.body;
    const studentId = req.body.studentId;
    const date = req.body.date;
    const time = req.body.time;
 
  
    if (!studentId) {
      return res.status(400).json({ success: false, message: "Student ID is required." });
    }
  
    // Step 1: Fetch Student Name
    const getPatronIdQuery = "SELECT patron_id, patron_fname, patron_lname FROM patron WHERE tup_id = ?";
    db.query(getPatronIdQuery, [studentId], (err, results) => {
    if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Error retrieving patron ID." });
    }
    if (results.length === 0) {
        return res.status(404).json({ success: false, message: "Student not found." });
    }

    const patronId = results[0].patron_id;
    const studentName = `${results[0].patron_fname} ${results[0].patron_lname}`;

    const logAttendanceQuery = "INSERT INTO attendance (att_log_in_time, att_date, patron_id) VALUES ( ?, ?, ?)";
    db.query(logAttendanceQuery, [time, date, patronId], (err) => {
        if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Failed to log attendance." });
        }

        io.emit('attendanceUpdated');
        return res.status(200).json({
        success: true,
        studentName: studentName,
        message: "Attendance logged successfully.",
        });
      });
    });
  });


/*--------------------ONLINE CATALOG-------------------------- */
app.get('/featured-books', (req, res) => {
    const q = `
    SELECT 
        resources.resource_title, 
        resources.resource_id, 
        book.book_cover as resource_cover, 
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_name
    FROM resourceauthors
    JOIN resources ON resourceauthors.resource_id = resources.resource_id
    JOIN author ON resourceauthors.author_id = author.author_id
    JOIN book ON book.resource_id = resources.resource_id
    WHERE resources.type_id = '1'
    GROUP BY resources.resource_id, resources.resource_title, book.book_cover
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
});

app.get('/journals-newsletters', (req, res) => {
    const q = `
    SELECT 
        resources.resource_title, 
        resources.resource_id, 
        journalnewsletter.jn_cover as resource_cover, 
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_name
    FROM resourceauthors
    JOIN resources ON resourceauthors.resource_id = resources.resource_id
    JOIN author ON resourceauthors.author_id = author.author_id
    JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
    WHERE resources.type_id = '2' OR resources.type_id = '3'  
    GROUP BY resources.resource_id, resources.resource_title, journalnewsletter.jn_cover
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
});

app.get('/featured-book', (req, res) => {
    const q = `
    SELECT 
        resources.resource_title,
        resources.resource_description,
        resources.resource_id, 
        book.book_cover, 
        GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_name
    FROM resourceauthors
    JOIN resources ON resourceauthors.resource_id = resources.resource_id
    JOIN author ON resourceauthors.author_id = author.author_id
    JOIN book ON book.resource_id = resources.resource_id
    WHERE resources.resource_description NOT LIKE '%n/a%' AND 
    resources.type_id='1'
    GROUP BY resources.resource_id, resources.resource_title, book.book_cover
    LIMIT 1`;

    db.query(q, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        console.log(results)
        return res.json(results); // Send the response as JSON
    });
});

app.get('/resources', (req, res) => {
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
                WHEN resources.type_id = '1' THEN book.book_cover
                WHEN resources.type_id = '2' OR resources.type_id = '3' THEN journalnewsletter.jn_cover
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
});


app.get('/resources/view', (req, res) => {
    const id = req.query.id;
    console.log('view id: ', id);

    const q = `
       SELECT 
        resources.resource_title,
        resources.resource_quantity,
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
            WHEN resources.type_id = '1' THEN book.book_cover
            WHEN resources.type_id IN ('2', '3') THEN journalnewsletter.jn_cover
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
                        WHEN resources.type_id = '1' THEN book.book_cover
                        WHEN resources.type_id IN ('2', '3') THEN journalnewsletter.jn_cover
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
});

/*------------------USER ACCOUNT-------------*/
app.post('/accounts/create',(req,res)=>{
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

                    logAuditAction(username, 'INSERT', 'staffaccount', null, null, JSON.stringify({ account_info: values}));
                    io.emit('userUpdated')
                    res.send({status: 201, message:'User Created Successfully'});
                
                })

            })
        }
    })
})

app.get('/accounts', (req,res)=>{
    const keyword = req.query.keyword || '';
    const searchKeyword = `%${keyword}%`;
    const offset = parseInt(req.query.offset, 10)
    const params = [searchKeyword, searchKeyword, searchKeyword]
    const fname = parseInt(req.query.fname)
    const lname = parseInt(req.query.lname)
    const uname = parseInt(req.query.uname)
    const role = parseInt(req.query.role)
    const status = req.query.status

    console.log('status', status)
    console.log('role', role)

    let orderClauses = "";
    
    // Handle sorting by fname
    if (fname) {
        if (fname == '1') {
            orderClauses='ORDER BY staffaccount.staff_fname ASC';
        } else if (fname == '2') {
            orderClauses='ORDER BY staffaccount.staff_fname DESC';
        }
    }
    
    // Handle sorting by lname
    if (lname) {
        if (lname == '1') {
            orderClauses='ORDER BY staffaccount.staff_lname ASC';
        } else if (lname == '2') {
            orderClauses='ORDER BY staffaccount.staff_lname DESC';
        }
    }

    // Handle sorting by lname
    if (uname) {
        if (uname == '1') {
            orderClauses='ORDER BY staffaccount.staff_uname ASC';
        } else if (uname == '2') {
            orderClauses='ORDER BY staffaccount.staff_uname DESC';
        }
    }


    const whereClauses = [`(staff_fname LIKE ? OR staff_uname LIKE ? OR staff_lname LIKE ?)`]

    if(role){
        whereClauses.push(`staffaccount.role_id = '${role}'`)
    }
    if(status){
        whereClauses.push(`staffaccount.staff_status = '${status}'`)
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const q = `
        SELECT 
            staffaccount.staff_id, 
            staffaccount.staff_uname, 
            staffaccount.staff_lname, 
            staffaccount.staff_fname,
            staffaccount.staff_status,
            roles.role_name
        FROM staffaccount
        JOIN roles ON staffaccount.role_id = roles.role_id
        ${whereClause}
        ${orderClauses}
        LIMIT 5 OFFSET ?`
    
    const countQ = `
        SELECT COUNT(DISTINCT staff_id) as total
        FROM staffaccount
        ${whereClause}`

    console.log(q)
    
    db.query(countQ, params, (err,countResult)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        const totalUsers = countResult[0]?.total || 0;

        db.query(q, [...params, offset], (err,results)=>{
            if (err) {
                console.error(err);
                return res.status(500).send({ error: 'Database query failed' });
            }

            res.send({results,totalUsers});
        
        })
    })

        
})

app.get('/account/:id', (req,res)=>{
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
})

app.put('/account1', (req,res)=>{
    console.log(req.body)
    const password = req.body.password;


    const q = `
    UPDATE  
        staffaccount 
    SET 
        staff_uname = ?,
        staff_fname = ?,
        staff_lname = ?,
        role_id = ?,
        staff_password = ?
    WHERE 
        staff_id = ?`

        bcrypt.hash(password,saltRounds,(err,hash)=>{
            if(err){
                console.log(err)
            }

            const values = [
                req.body.uname,
                req.body.fname,
                req.body.lname,
                req.body.role,
                hash,
                req.body.id
            ]

            db.query(q, values, (err,results)=>{
                if (err) {
                    console.error(err);
                    return res.status(500).send({ error: 'Database query failed' });
                }

                io.emit('userUpdated');
                res.send({status: 201, message:'User Edited Successfully'});
            
            })

        })
})

app.put('/account', (req, res) => {
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

        // Hash the new password
        bcrypt.hash(password, saltRounds, (err, hash) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Password hashing failed' });
            }

            const updateQuery = `
                UPDATE  
                    staffaccount 
                SET 
                    staff_uname = ?,
                    staff_fname = ?,
                    staff_lname = ?,
                    role_id = ?,
                    staff_password = ?
                WHERE 
                    staff_id = ?`;

            const values = [
                req.body.uname,
                req.body.fname,
                req.body.lname,
                req.body.role,
                hash,
                req.body.id
            ];

            db.query(updateQuery, values, (err, results) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Database query failed' });
                }

                const newValue = JSON.stringify({
                    staff_uname: req.body.uname,
                    staff_fname: req.body.fname,
                    staff_lname: req.body.lname,
                    role_id: req.body.role,
                    staff_password: hash,
                });

                // Log the audit action
                logAuditAction(username, 'UPDATE', 'staffaccount', req.body.id, oldValue, newValue);

                io.emit('userUpdated');
                res.send({status: 201, message:'User Edited Successfully'});
                res.status(200).json({ message: 'User edited successfully' });
            });
        });
    });
});


app.put('/account/deactivate/:id', (req, res) => {
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
            logAuditAction(username, 'UPDATE', 'staffaccount', staffUname, 'active', JSON.stringify({ 'staff status ': 'inactive' }));

            // Notify clients via socket
            io.emit('userUpdated');

            res.send({ status: 201, message: 'User Deactivated' });
        });
    });
});

app.put('/account/activate/:id', (req, res) => {
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
            logAuditAction(username, 'UPDATE', 'staffaccount', staffUname, 'inactive', JSON.stringify({ 'staff status ': 'active' }));

            // Notify clients via socket
            io.emit('userUpdated');

            res.send({ status: 201, message: 'User Deactivated' });
        });
    });
});

app.put('/account/activate/:id1',(req,res)=>{
    const id = req.params.id;

    const q = `
    UPDATE 
        staffaccount
    SET 
        staff_status = ?
    WHERE 
        staff_id = ?`

    db.query(q, ['active', id],(err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }
        
        io.emit('userUpdated');
        res.send({status: 201, message:'User Activated'});
    })
})

/*----------------------REPORT GENERATION---------------- */
app.get('/reports', (req, res) => {
    const type = req.query.type;
    const kind = req.query.kind;
    const startDate = req.query.startDate; // Custom start date
    const endDate = req.query.endDate; // Custom end date
  
    console.log(type);
    console.log(kind);
    console.log(startDate, endDate);
  
    switch (type) {
      case 'Attendance Report':
        generateAttendance(res, kind, startDate, endDate);
        break;
      case 'Inventory Report':
        generateInventory(res,kind);
        break;
      case 'Circulation Report':
        generateCirculation(res,kind);
        break;
      // Add cases for other report types as needed
    }
  });
  
const generateAttendance = async (res, kind, startDate, endDate) => {
    let q = `
      SELECT 
          patron.tup_id,
          patron.patron_fname,
          patron.patron_lname,
          patron.patron_sex,
          patron.patron_mobile,
          patron.patron_email,
          patron.category,
          college.college_name,
          course.course_name,
          attendance.att_log_in_time,
          attendance.att_date
      FROM attendance
      JOIN patron ON patron.patron_id = attendance.patron_id
      JOIN college ON patron.college_id = college.college_id
      JOIN course ON patron.course_id = course.course_id
    `;
  
    if (kind === 'Daily Report') {
      q += `WHERE attendance.att_date = CURRENT_DATE()`;
    } else if (kind === 'Monthly Report') {
      // Adjust the query to select records for the current month
      q += `WHERE MONTH(attendance.att_date) = MONTH(CURRENT_DATE()) AND YEAR(attendance.att_date) = YEAR(CURRENT_DATE())`;
    } else if (kind === 'Custom Date') {
      // If the kind is 'Custom Date', use the provided startDate and endDate
      q += `WHERE attendance.att_date BETWEEN ? AND ?`;
    }
  
    db.query(q,[startDate,endDate],(err,results)=>{
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Database query failed' });
        }

        res.send(results)
    })
    
};

const generateCirculation = async (res, kind, startDate, endDate) => {

    if(kind!='Borrowed Resources'){
        let q = `
        SELECT
            checkout.checkout_id,
            resources.resource_title,
            patron.patron_fname,
            patron.patron_lname,
            patron.category,
            college.college_name,
            course.course_name,
            checkout.checkout_date,
            checkout.checkout_due
        FROM 
            checkout
        JOIN patron ON patron.patron_id = checkout.patron_id
        JOIN resources ON resources.resource_id = checkout.resource_id
        JOIN college ON patron.college_id = college.college_id
        JOin course ON patron.course_id = course.course_id
        `;
    
        if (kind === 'Daily Report') {
        q += `WHERE checkout.checkout_date = CURRENT_DATE()`;
        } else if (kind === 'Monthly Report') {
        // Adjust the query to select records for the current month
        q += `WHERE MONTH(checkout.checkout_date) = MONTH(CURRENT_DATE()) AND YEAR(checkout.checkout_date) = YEAR(CURRENT_DATE())`;
        } else if (kind === 'Custom Date') {
        // If the kind is 'Custom Date', use the provided startDate and endDate
        q += `WHERE checkout.chekcout_date BETWEEN ? AND ?`;
        }
    
        db.query(q,[startDate,endDate],(err,results)=>{
            if (err) {
                console.error(err);
                return res.status(500).send({ error: 'Database query failed' });
            }

            res.send(results)
        })
    }else if(kind=='Borrowed Resources'){
        const q = `
        SELECT	resources.resource_id,
            resources.resource_title, 
            resourcetype.type_name, 
            department.dept_name,
            CASE
                WHEN resources.type_id IN ('1', '2', '3') THEN topic.topic_name
                ELSE 'n/a'
            END AS topic_name,
            GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_names
        FROM resources
        JOIN checkout ON checkout.resource_id = resources.resource_id
        JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id 
        JOIN author ON resourceauthors.author_id = author.author_id 
        JOIN resourcetype ON resources.type_id = resourcetype.type_id 
        JOIN department ON department.dept_id = resources.dept_id
        LEFT JOIN book ON resources.resource_id = book.resource_id
        LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
        LEFT JOIN topic 
            ON (book.topic_id = topic.topic_id OR journalnewsletter.topic_id = topic.topic_id)
		WHERE checkout.resource_id = resources.resource_id
        GROUP BY resources.resource_id
        `
        db.query(q,[startDate,endDate],(err,results)=>{
            if (err) {
                console.error(err);
                return res.status(500).send({ error: 'Database query failed' });
            }

            res.send(results)
        })
    }
    
    
};

const generateInventory = async(res,kind)=>{
    let whereClause = ''

    switch(kind){
        case 'Book':
            whereClause+='WHERE resources.type_id = 1'
            break;
        case 'Journals':
            whereClause+='WHERE resources.type_id = 2'
            break;
        case 'Newsletters':
            whereClause+='WHERE resources.type_id = 3'
            break;
        case 'Thesis & Dissertations':
            whereClause+='WHERE resources.type_id = 4'
            break;
        case 'Available Resources':
            whereClause+='WHERE resources.avail_id = 1'
            break;
        case 'Lost Resources':
            whereClause+='WHERE resources.avail_id = 2'
            break;
        case 'Damaged Resources':
            whereClause+='WHERE resources.avail_id = 3'
            break;
    }
    
    let q = `
        SELECT 
			resources.resource_id,
            resources.resource_title, 
            resourcetype.type_name, 
            resources.resource_quantity, 
            department.dept_name,
            CASE
                WHEN resources.type_id IN ('1', '2', '3') THEN topic.topic_name
                ELSE 'n/a'
            END AS topic_name,
            GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_names
        FROM resources
        JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id 
        JOIN author ON resourceauthors.author_id = author.author_id 
        JOIN resourcetype ON resources.type_id = resourcetype.type_id 
        JOIN department ON department.dept_id = resources.dept_id
        LEFT JOIN book ON resources.resource_id = book.resource_id
        LEFT JOIN journalnewsletter ON resources.resource_id = journalnewsletter.resource_id
        LEFT JOIN topic 
            ON (book.topic_id = topic.topic_id OR journalnewsletter.topic_id = topic.topic_id)
        ${whereClause}
        GROUP BY resources.resource_id`

        

        console.log(q)

        db.query(q,(err,results)=>{
            if (err) {
                console.error(err);
                return res.status(500).send({ error: 'Database query failed' });
            }
    
            res.send(results)
        })
}
  
/*------------------login------------------ */
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    
    const query = `
        SELECT staff_uname, staff_password, role_name
        FROM staffaccount
        JOIN roles ON staffaccount.role_id = roles.role_id
        WHERE staff_uname = ? AND staff_status = 'active'`;

    try {
        db.query(query, [username], async (err, results) => {
            if (err) {
                return res.status(500).json({ error: 'Database query failed' });
            }

            if (results.length === 0) {
                return res.status(404).json({ message: 'Invalid username or password' });
            }

            const user = results[0];
            const role = user.role_name;

            // Compare provided password with hashed password from the database
            const isMatch = await bcrypt.compare(password, user.staff_password);

            if (!isMatch) {
                return res.status(401).json({ message: 'Invalid username or password' });
            }

            // Generate a JWT for the user
            const payload = { username: user.staff_uname, role };
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

            // Optionally store the token as a secure cookie
            res.cookie('authToken', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
            });

            // Send the response
            return res.status(200).json({
                message: 'Login successful',
                token, // Send the token (if needed for client-side use)
                user: { username: user.staff_uname, role },
                
            });
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/logout', (req, res) => {
    // Clear the authToken cookie
    res.clearCookie('authToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Secure cookie for HTTPS only in production
        sameSite: 'strict',
    });

    // Send response indicating successful logout
    return res.status(200).json({ message: 'Logged out successfully' });
});

// Check Session Route
app.get('/check-session', (req, res) => {
    const token = req.cookies.authToken;

    if (!token) {
        return res.status(401).json({ loggedIn: false });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ loggedIn: false });
        }

        // Check if token has expired
        const currentTime = Math.floor(Date.now() / 1000);
        if (decoded.exp < currentTime) {
            return res.status(401).json({ loggedIn: false });
        }

        return res.status(200).json({ loggedIn: true, userRole: decoded.role, username: decoded.username });
    });
});

/*------------------CHARTS IN DASHBOARD--------------- */
app.get('/borrowed/book/trends', (req,res)=>{
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
        COALESCE(COUNT(c.resource_id), 0) AS total_books_borrowed
    FROM 
        week_days wd
    LEFT JOIN 
        checkout c ON DAYOFWEEK(c.checkout_date) = wd.day_num
        AND c.checkout_date >= DATE_ADD(CURDATE(), INTERVAL - WEEKDAY(CURDATE()) DAY)
        AND c.checkout_date < DATE_ADD(CURDATE(), INTERVAL - WEEKDAY(CURDATE()) + 6 DAY)
    GROUP BY 
        wd.day_num, wd.day_name
    ORDER BY 
        wd.day_num;`

    db.query(q, (err,result)=>{
        if (err) return res.status(500).send({ error: 'Database query failed' });

        res.send(result)
    })
})

// app.get('/borrowed/jn/trends', (req,res)=>{
//     const q = `
//     SELECT 
//         DAYNAME(c.checkout_date) AS day_of_week, 
//         COUNT(*) AS total_jn_borrowed
//     FROM 
//         checkout c
//     JOIN 
//         journalnewsletter jn ON c.resource_id = jn.resource_id
//     WHERE
//         c.checkout_date >= DATE_ADD(CURDATE(), INTERVAL - WEEKDAY(CURDATE()) DAY) 
//         AND c.checkout_date < DATE_ADD(CURDATE(), INTERVAL - WEEKDAY(CURDATE()) + 6 DAY) 
//     GROUP BY 
//         DAYOFWEEK(c.checkout_date)
//     ORDER BY 
//         CASE 
//             WHEN DAYOFWEEK(c.checkout_date) = 1 THEN 7 
//             ELSE DAYOFWEEK(c.checkout_date) - 1 
//         END;`

//     db.query(q, (err,result)=>{
//         if (err) return res.status(500).send({ error: 'Database query failed' });

//         res.send(result)
//     })
// })

app.get('/visitor/stats', (req,res)=>{
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
})

/*--------------check overdue resources using cron-------- */
const sendEmail = (email, name, tupid, borrowDate, borrowDue, resourceTitle, resourceId) => {
    
let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.USER_EMAIL,
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      refreshToken: process.env.REFRESH_TOKEN
    }
  });


  let borrowerData = {
    borrower_name: name,
    borrower_id: tupid,
    borrowed_date: borrowDate,
    borrowed_due: borrowDue,
    item_title: resourceTitle,
    item_id: resourceId
  };

  let mailOptions = {
    from: process.env.USER_EMAIL,
    to: email,
    subject: 'Overdue Notice', // Email subject
    html: `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                background-color: #f9f9f9;
                margin: 0;
                padding: 0;
            }
            p{
                color: #0c0c0c;
            }
            .email-container {
                max-width: 600px;
                margin: 20px auto;
                background: #ffffff;
                border: 1px solid #ddd;
                border-radius: 5px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                background-color: #94152B;
                color: white;
                padding: 15px;
                text-align: center;
            }
            .content {
                padding: 20px;
                color: #333;
            }
            .footer {
                text-align: center;
                font-size: 12px;
                color: #999;
                padding: 10px;
                background: #f1f1f1;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }
            table th, table td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
            }
            table th {
                background-color: #94152B;
                color: white;
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <h1>Overdue Notice</h1>
            </div>
            <div class="content">
                <p>Dear {{borrower_name}},</p>
                <p>We hope this email finds you well. This is a reminder that the following items you borrowed from the Learning Resources Center are overdue:</p>
                
                <table>
                    <tr>
                        <th>Borrower's ID</th>
                        <td>{{borrower_id}}</td>
                    </tr>
                    <tr>
                        <th>Borrowed Date</th>
                        <td>{{borrowed_date}}</td>
                    </tr>
                    <tr>
                        <th>Due Date</th>
                        <td>{{borrowed_due}}</td>
                    </tr>
                </table>
                
                <h3>Overdue Item:</h3>
                <table>
                    <tr>
                        <th>Item Title</th>
                        <th>Item ID</th>
                    </tr>
                    <tr>
                        <td>{{item_title}}</td>
                        <td>{{item_id}}</td>
                    </tr>
                </table>
                <p>Please return the items as soon as possible to avoid additional fines. If you have any questions, feel free to contact us.</p>
                
                <p>Thank you,<br>Learning Resources Center</p>
            </div>
            <div class="footer">
                This is an automated email. Please do not reply.
            </div>
        </div>
    </body>
    </html>`
    .replace('{{borrower_name}}', borrowerData.borrower_name)
    .replace('{{borrower_id}}', borrowerData.borrower_id)
    .replace('{{borrowed_date}}', borrowerData.borrowed_date)
    .replace('{{borrowed_due}}', borrowerData.borrowed_due)
    .replace('{{item_title}}', borrowerData.item_title)
    .replace('{{item_id}}', borrowerData.item_id)
  };

  transporter.sendMail(mailOptions, function(err, data) {
    if (err) {
      console.log("Error " + err);
    } else {
      console.log("Email sent successfully");
    }
  });
};

const checkOverdue = async () => {
    console.log('checking overdue')
    const q = `
    SELECT 
            c.checkout_id, 
            c.checkout_date,
            c.checkout_due,
            p.patron_email, 
            p.tup_id, 
            p.patron_fname, 
            p.patron_lname,
            r.resource_title,
            r.resource_id
        FROM checkout c
        JOIN patron p ON c.patron_id = p.patron_id
        JOIN resources r ON r.resource_id = c.resource_id
        WHERE c.status = 'borrowed' AND c.checkout_due < current_date()`;

    db.query(q, (err, result) => {
        if (err) {
            return console.error('Error fetching checkout data:', err);
        }

        if (result.length > 0) {
            result.forEach(item => {
                console.log('Processing checkout_id:', item.checkout_id);

                // Check if the checkout_id already exists in the overdue table
                const checkOverdueQuery = `
                SELECT * FROM overdue WHERE checkout_id = ?`;

                db.query(checkOverdueQuery, [item.checkout_id], (err, overdueResult) => {
                    if (err) {
                        return console.error('Error checking overdue table:', err);
                    }

                    if (overdueResult.length > 0) {
                        // If the checkout_id exists, increment the overdue_days by 1
                        const updateOverdueQuery = `
                        UPDATE overdue
                        SET overdue_days = overdue_days + 1
                        WHERE checkout_id = ?`;

                        db.query(updateOverdueQuery, [item.checkout_id], (err, updateResult) => {
                            if (err) {
                                return console.error('Error updating overdue table:', err);
                            }

                            console.log('Overdue days incremented for checkout_id:', item.checkout_id);
                            // Send email to patron
                            sendEmail(item.patron_email,`${item.patron_fname} ${item.patron_lname}`, item.tup_id, item.checkout_date, item.checkout_due,item.resource_title, item.resource_id);
                        });
                    } else {
                        // If checkout_id doesn't exist in the overdue table, insert it
                        const insertOverdueQuery = `
                        INSERT INTO overdue (overdue_days, overdue_fine, checkout_id)
                        VALUES (?, ?, ?)`;

                        const values = [1, 0, item.checkout_id];

                        db.query(insertOverdueQuery, values, (err, insertResult) => {
                            if (err) {
                                return console.error('Error inserting into overdue table:', err);
                            }

                            console.log('New overdue entry created for checkout_id:', item.checkout_id);
                            // Send email to patron
                            sendEmail(item.patron_email,`${item.patron_fname} ${item.patron_lname}`, item.tup_id, item.checkout_date, item.checkout_due,item.resource_title, item.resource_id);
                        });
                    }
                });
            });
        } else {
            console.log('No overdue checkouts found.');
        }
    });
};

cron.schedule('0 0 * * *', () => {
    checkOverdue()
});

/*-------- ADD PATRON -------- */



// Middleware to parse JSON body
app.use(express.json()); // This is the line you need to add

// MySQL connection setup


// POST route for adding a patron
app.post('/add-patron', (req, res) => {
    const {
        patron_fname,
        patron_lname,
        patron_sex,
        patron_mobile,
        patron_email,
        category,
        college,  // college_id
        program,  // course_id
        tup_id,
    } = req.body;

    const values = [
        patron_fname,
        patron_lname,
        patron_sex,
        patron_mobile,
        patron_email,
        category,
        college,
        program,
        tup_id,
    ]

    console.log(values)
  
  // SQL query to insert new patron into the database
  const query = 'INSERT INTO patron (patron_fname, patron_lname, patron_sex, patron_mobile, patron_email, category, college_id, course_id, tup_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?,?)';

  // Execute the query with the data from the request body
  db.query(query, values, (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Error adding patron', error: err });
    }
    res.status(200).json({ message: 'Patron added successfully', result });
  });
});


/*-------- DELETE PATRON -------- */
app.delete('/delete-patron/:id', (req, res) => {
    const patronId = req.params.id;
  
    // Ensure patronId is not empty or invalid
    if (!patronId) {
      return res.status(400).json({ error: 'Patron ID is required' });
    }
  
    // SQL query to delete the patron based on the patron_id
    const query = 'DELETE FROM patron WHERE patron_id = ?';
  
    db.query(query, [patronId], (err, result) => {
      if (err) {
        console.error('Error deleting patron:', err);
        return res.status(500).json({ error: 'Failed to delete patron' });
      }
  
      // If no rows are affected, that means the patron doesn't exist
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Patron not found' });
      }
  
      // Success response
      res.status(200).json({ message: 'Patron deleted successfully' });
    });
  });
  



  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

/*-------- UPDATE PATRON -------- */
app.get('/update-patron/:id', async (req, res) => {
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
});

app.put('/update-patron/:id', async (req, res) => {
    const patronId = req.params.id;
    const {
        patron_fname,
        patron_lname,
        patron_sex,
        patron_mobile,
        patron_email,
        category,
        college,  // college_id
        program,  // course_id
        tup_id,
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
            college,
            program,
            tup_id,
            patronId,
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Patron not found' });
        }

        res.json({ message: 'Patron updated successfully' });
    } catch (err) {
        console.error('Error updating patron:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/category-options', async (req, res) => {
    const query = `
        SELECT COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'patron' AND COLUMN_NAME = 'category';
    `;

    try {
        const [results] = await (await dbPromise).execute(query);
        if (results.length === 0) {
            return res.status(404).json({ message: 'Category options not found' });
        }

        const enumString = results[0].COLUMN_TYPE; // e.g., "enum('Student','Faculty','','')"
        const options = enumString
            .match(/'([^']+)'/g) // Extract values within single quotes
            .map(option => option.replace(/'/g, '')); // Remove quotes

        res.json(options); // Send the array of options to the frontend
    } catch (err) {
        console.error('Error fetching category options:', err);
        res.status(500).send('Internal Server Error');
    }
});

// 
app.post('/validate-tup-id', async (req, res) => {
    const { tup_id } = req.body;

    if (!tup_id) {
        return res.status(400).json({ error: 'TUP ID is required.' });
    }

    try {
        const query = 'SELECT 1 FROM patron WHERE tup_id = ? LIMIT 1';
        const [rows] = await dbPromise.query(query, [tup_id]);

        if (rows.length > 0) {
            return res.status(200).json({ exists: true, message: 'TUP ID already exists.' });
        }

        res.status(200).json({ exists: false, message: 'TUP ID is available.' });
    } catch (error) {
        console.error('Error checking TUP ID:', error);
        res.status(500).json({ error: 'Server error while checking TUP ID.' });
    }
});



export { dbPromise, db };

(async () => {
    try {
        const [rows] = await dbPromise.execute('SELECT 1');
        console.log('Database connection test successful:', rows);
    } catch (error) {
        console.error('Database connection test failed:', error);
    }
})();

app.use((req, res, next) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    next();
});

app.use('/', validateTupIdRouter); // Connect the router


server.listen(3001,()=>{
    console.log('this is the backend')
})