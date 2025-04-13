import { db } from "../config/db.js";
import fs, { stat } from 'fs';

export const resources = async (req, res) => {
    const resource = req.body;

    //check first if resource exist 
    const resourceExists =await checkResourceIfExist(resource.resource_title)

    if (resourceExists) {
        console.log('Resource already exists.');
        return res.send({ status: 409, message: `Resource with a title "${resource.resource_title}" already exists. Skipping insertion.` });
    }

    const q = `
    INSERT INTO 
        resources (resource_title, resource_description, resource_published_date, original_resource_quantity, resource_quantity, resource_is_circulation, dept_id, type_id, avail_id) 
    VALUES (?,?,?,?,?,?,?,?,?)`;

    const values = [
        resource.resource_title,
        resource.resource_description || '',
        resource.resource_published_date,
        resource.resource_quantity,
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
}

export const adviser = async (req,res)=>{
    const {adviser, resourceId} = req.body;
    console.log('adviser sent from frontend: ', adviser)

    const values =[
        adviser.adviser_fname,
        adviser.adviser_lname
    ];

    const adviserId = await checkAdviserIfExist(values)
    await syncThesisOnline(adviserId,resourceId,res)
};

export const authors = (req, res) => {
    const { author, resourceId } = req.body;
    console.log('sync author',author)

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
};

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

export const publisher = (req, res) => {
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
};

export const book = async (req, res) => {
  try {
    // Log incoming request for debugging
    console.log("Received body:", req.body);
    console.log("Received file:", req.file);

    console.log(req.body)

    const { resourceId, pubId, book_isbn, topic_id } = req.body;
    const file = req.file.path.replace(/\\/g, "/").toString();

    const q = `
      INSERT INTO 
          book (filepath, book_isbn, resource_id, pub_id, topic_id) 
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
};

export const journalNewsletter = async (req, res) => {
    try {
        // Log incoming request for debugging
        console.log("Received body:", req.body);
        console.log("Received file:", req.file);
    
        const { resourceId, jn_volume, jn_issue, topic_id } = req.body;
        const file = req.file.path.replace(/\\/g, "/").toString();
    
        const q = `
          INSERT INTO 
              journalnewsletter (jn_volume, jn_issue, filepath, resource_id, topic_id) 
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
};

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

