import { dbPromise } from "../config/db.js";
import { db } from "../config/db.js";
import { logAuditAction } from "./auditController.js";
import { bookList } from "./dashboardController.js";
import { authors } from "./dataController.js";

/*----------SEARCH BOOK FROM CIRCULATION SELECT ITEM--------- */
export const checkoutSearch = async (req, res) => {
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
            b.filepath,
            r.resource_title AS title, 
            r.resource_quantity AS quantity, 
            r.resource_id,
            pub.pub_name,
            r.resource_is_archived,
            GROUP_CONCAT(DISTINCT CONCAT(a.author_fname, ' ', a.author_lname) ORDER BY a.author_lname SEPARATOR ', ') AS authors
        FROM 
            book b
        INNER JOIN 
            resources r ON b.resource_id = r.resource_id
        INNER JOIN 
            resourceauthors ra ON ra.resource_id = r.resource_id
        INNER JOIN
            publisher pub ON pub.pub_id = b.pub_id
        INNER JOIN 
            author a ON a.author_id = ra.author_id
        WHERE 
            (b.book_isbn LIKE ? OR r.resource_title LIKE ? OR r.resource_id LIKE ?)
            AND r.resource_quantity > 0
            AND r.resource_is_archived = 0
        GROUP BY 
            b.book_isbn, b.filepath, r.resource_id
        LIMIT 10;

        `,
        [`%${query}%`, `%${query}%`, `%${query}%`]
      );
      
      const covers = results.map(book => ({
        cover: book.filepath,
        resource_id: (book.resource_id),
        resource_title: (book.title),
        resource_quantity: (book.quantity),
        book_isbn: (book.book_isbn),
        authors: book.authors,
        publisher: (book.pub_name),
    }));

      res.json(covers);
    } catch (error) {
      console.error('Error fetching book suggestions:', error);
      res.status(500).send("Error fetching book suggestions");
    }
};

export const checkinSearch = async (req, res) => {
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
                b.filepath,
                pub.pub_name,
                r.resource_title AS title, 
                r.resource_id,
                GROUP_CONCAT(DISTINCT CONCAT(a.author_fname, ' ', a.author_lname) ORDER BY a.author_lname SEPARATOR ', ') AS authors
            FROM 
                book b
            INNER JOIN 
                resources r ON b.resource_id = r.resource_id
            INNER JOIN 
                resourceauthors ra ON ra.resource_id = r.resource_id
            INNER JOIN 
                author a ON a.author_id = ra.author_id
            INNER JOIN
                publisher pub ON pub.pub_id = b.pub_id
            INNER JOIN 
                checkout c ON r.resource_id = c.resource_id
            WHERE 
                (b.book_isbn LIKE ? OR r.resource_title LIKE ?)
                AND c.patron_id = ? AND (c.status = "borrowed" OR c.status = "overdue")
            GROUP BY 
                b.book_isbn, b.filepath, r.resource_id
            LIMIT 10;
            `,
            [`%${query}%`, `%${query}%`, patron_id]
        );

        const covers = results.map(book => ({
            cover: book.filepath,
            resource_id: book.resource_id,
            resource_title: book.title,
            book_isbn: book.book_isbn,
            authors: book.authors,  
            publisher: book.pub_name,
        }));

        res.json(covers);
    } catch (error) {
        console.error('Error fetching book suggestions:', error);
        res.status(500).send("Error fetching book suggestions");
    }
};

export const checkoutRecord = (req, res) => {
    const { resource_id, patron_id } = req.query;
    const query = 'SELECT checkout_id FROM checkout WHERE resource_id = ? AND patron_id = ? AND (status = "borrowed" OR status= "overdue") ';

    db.query(query, [resource_id, patron_id], (err, results) => {
        if (err) {
        return res.status(500).json({ error: err.message });
        }
        if (results.length === 0) {
        return res.status(404).json({ message: 'Checkout record not found.' });
        }
        res.json(results[0]);
    });
};

export const checkIn = async (req, res) => {
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
            JSON.stringify("Patron: " + patron_name + " returned a book: '" + resource_title + "'")
        );

        // Use the io instance from the request object
        req.io.emit('checkinUpdated');

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
};

export const checkOut =  async (req, res) => {
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
            JSON.stringify("Patron: " + patron_name + " borrowed a book: '" + resource_title + "'")
        );

        // Commit the transaction
        await db.query('COMMIT');

        // Use the io instance from the request object
        req.io.emit('checkoutUpdated');

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
};