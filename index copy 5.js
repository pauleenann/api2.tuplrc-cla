import dotenv from 'dotenv';
import express from "express";
import cors from "cors";
import cron from 'node-cron'
import cookieParser from 'cookie-parser';
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 1;
import resourceRoutes from "./routes/resourceRoutes.js";
import dataRoutes from "./routes/dataRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js"
import patronRoutes from "./routes/patronRoutes.js";
import circulationRoutes from "./routes/circulationRoutes.js"
import catalogRoutes from "./routes/catalogRoutes.js";
import syncRoutes from "./routes/syncRoutes.js" 
import reportsRoutes from "./routes/reportsRoutes.js"
import auditRoutes from './routes/auditRoutes.js'
import accountRoutes from './routes/accountRoutes.js'
import isbnRoutes from './routes/isbnRoutes.js'
import validateTupId from './routes/validateTupId.js'
import onlineCatalogRoutes from './routes/onlineCatalogRoutes.js'
import attendanceRoutes from './routes/attendanceRoutes.js'
import { db } from './config/db.js';
import nodemailer from 'nodemailer'; // ES Module import

dotenv.config();

const app = express();
app.use(cookieParser());
const PORT = process.env.PORT || 3001;
// api key for google books
const apikey = process.env.API_KEY;

app.use(express.json());
app.use(cors({
    origin: ['http://localhost:3000','http://localhost:3002'],
    methods: 'GET,POST,PUT,DELETE,OPTIONS',
    credentials:true
}));    

app.use("/api/resources", resourceRoutes);
app.use("/api/data", dataRoutes); 
app.use("/api/user", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/patron", patronRoutes);
app.use('/api/circulation', circulationRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit', auditRoutes)
app.use('/api/account', accountRoutes)
app.use('/api/isbn',isbnRoutes)
app.use('/api/validate-tup-id', validateTupId)
app.use('/api/online-catalog', onlineCatalogRoutes)
app.use('/api/attendance', attendanceRoutes)
// app.use('/server', express.static(path.join(__dirname, 'server')));

/*--------------check overdue resources using cron-------- */
const sendEmail = (email, name, tupid, borrowDate, borrowDue, resourceTitle, resourceId) => {

//if di gumana to, naexpire na yata ung refresh token 
//go to this link nalang https://www.freecodecamp.org/news/use-nodemailer-to-send-emails-from-your-node-js-server/
    
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
        WHERE (c.status = 'borrowed' OR c.status = 'overdue') AND c.checkout_due < current_date()`;

    db.query(q, (err, result) => {
        if (err) {
            return console.error('Error fetching checkout data:', err);
        }

        if (result.length > 0) {
            result.forEach(item => {
                console.log('Processing checkout_id:', item.checkout_id);

                const updateStatus = `
                    UPDATE checkout 
                    SET status = 'overdue'
                    WHERE checkout_id = ?`
                
                db.query(updateStatus, [item.checkout_id], (err, updateResult)=>{
                    if (err) {
                        return console.error('Error updating status:', err);
                    }

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
                })
            });
        } else {
            console.log('No overdue checkouts found.');
        }
    });
};

cron.schedule('0 0 * * *', () => {
    checkOverdue()
});

app.listen(PORT, () => {
	console.log("Server started at http://localhost:" + PORT);
});
