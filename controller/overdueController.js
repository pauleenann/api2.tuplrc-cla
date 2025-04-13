import { db } from "../config/db.js";
import nodemailer from 'nodemailer';

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
    subject: 'Overdue Notice',
    html: `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
              body {
                  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                  line-height: 1.6;
                  background-color: #f5f7fa;
                  margin: 0;
                  padding: 0;
                  color: #212121;
              }
              
              .email-container {
                  max-width: 600px;
                  margin: 20px auto;
                  background: #ffffff;
                  border-radius: 12px;
                  overflow: hidden;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
              }
              
              .header {
                  background-color: #94152B;
                  color: #ffffff;
                  padding: 24px;
                  text-align: center;
              }
              
              .header h1 {
                  margin: 0;
                  font-weight: 500;
                  font-size: 24px;
              }
              
              .content {
                  padding: 32px 24px;
              }
              
              .notice-box {
                  background-color: rgba(61, 90, 254, 0.08);
                  border-left: 4px solid #94152B;
                  padding: 16px;
                  margin-bottom: 24px;
                  border-radius: 0 4px 4px 0;
              }
              
              table {
                  width: 100%;
                  border-collapse: collapse;
                  margin: 24px 0;
                  border-radius: 8px;
                  overflow: hidden;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
              }
              
              table th, table td {
                  padding: 12px 16px;
                  text-align: left;
                  border-bottom: 1px solid #e0e0e0;
              }
              
              table th {
                  background-color: #94152B;
                  color: #ffffff;
                  font-weight: 500;
              }
              
              table tr:last-child td {
                  border-bottom: none;
              }
              
              .item-title {
                  font-weight: 500;
                  margin-top: 32px;
                  margin-bottom: 12px;
                  color: #94152B;
              }
              
              .button {
                  display: inline-block;
                  background-color: #94152B;
                  color: #ffffff;
                  text-decoration: none;
                  padding: 12px 24px;
                  border-radius: 4px;
                  font-weight: 500;
                  margin-top: 24px;
                  transition: background-color 0.2s;
              }
              
              .button:hover {
                  background-color: #94152B;
              }
              
              .signature {
                  margin-top: 32px;
                  padding-top: 24px;
                  border-top: 1px solid #e0e0e0;
              }
              
              .footer {
                  text-align: center;
                  font-size: 14px;
                  color: #757575;
                  padding: 16px;
                  background: rgba(0, 0, 0, 0.02);
              }
              
              .social-links {
                  margin-top: 12px;
              }
              
              .social-links a {
                  display: inline-block;
                  margin: 0 8px;
                  color: #757575;
                  text-decoration: none;
              }
              
              @media only screen and (max-width: 600px) {
                  .email-container {
                      margin: 0;
                      border-radius: 0;
                  }
                  
                  .content {
                      padding: 24px 16px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="email-container">
              <div class="header">
                  <h1>Overdue Notice</h1>
              </div>
              <div class="content">
                  <div class="notice-box">
                      <p>Your borrowed materials are due. Please return them immediately to avoid any penalties.</p>
                  </div>
                  
                  <p>Hello {{borrower_name}},</p>
                  <p>We hope you're enjoying your borrowed materials. This is a friendly reminder that the following item is now due:</p>
                  
                  <table>
                      <tr>
                          <th colspan="2">Borrower Information</th>
                      </tr>
                      <tr>
                          <td><strong>ID Number:</strong></td>
                          <td>{{borrower_id}}</td>
                      </tr>
                      <tr>
                          <td><strong>Checkout Date:</strong></td>
                          <td>{{borrowed_date}}</td>
                      </tr>
                      <tr>
                          <td><strong>Due Date:</strong></td>
                          <td>{{borrowed_due}}</td>
                      </tr>
                  </table>
                  
                  <h3 class="item-title">Item Details:</h3>
                  <table>
                      <tr>
                          <th>Title</th>
                          <th>Item ID</th>
                      </tr>
                      <tr>
                          <td>{{item_title}}</td>
                          <td>{{item_id}}</td>
                      </tr>
                  </table>
                  
                  <p>Please return the item immediately. If you have any questions, feel free to contact us.</p>
                  
                  <div class="signature">
                      <p>Thank you for using our services,<br><strong>Learning Resources Center</strong></p>
                  </div>
              </div>
              <div class="footer">
                  <p>This is an automated message. Please do not reply to this email.</p>
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

export const checkOverdue = async () => {
  console.log('checking overdue');
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
            WHERE checkout_id = ?`;
        
        db.query(updateStatus, [item.checkout_id], (err, updateResult) => {
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
                sendEmail(
                  item.patron_email,
                  `${item.patron_fname} ${item.patron_lname}`, 
                  item.tup_id, 
                  item.checkout_date, 
                  item.checkout_due,
                  item.resource_title, 
                  item.resource_id
                );
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

                // Use the io instance from the request object
                req.io.emit('overdueUpdated');

                console.log('New overdue entry created for checkout_id:', item.checkout_id);
                // Send email to patron
                sendEmail(
                  item.patron_email,
                  `${item.patron_fname} ${item.patron_lname}`, 
                  item.tup_id, 
                  item.checkout_date, 
                  item.checkout_due,
                  item.resource_title, 
                  item.resource_id
                );
              });
            }
          });
        });
      });
    } else {
      console.log('No overdue checkouts found.');
    }
  });
};


export const approachingOverdue = async () => {
  console.log('checking approaching overdue');
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
      WHERE c.status = 'borrowed' AND c.checkout_due = DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY);`;

  db.query(q, (err, result) => {
    if (err) {
      return console.error('Error fetching checkout data:', err);
    }

    if (result.length > 0) {
      result.forEach(item => {
        // Send email to patron
        sendEmail2(
          item.patron_email,
          `${item.patron_fname} ${item.patron_lname}`, 
          item.tup_id, 
          item.checkout_date, 
          item.checkout_due,
          item.resource_title, 
          item.resource_id
        );
     });
    } else {
      console.log('No upcoming overdue found.');
    }
  });
};

const sendEmail2 = (email, name, tupid, borrowDate, borrowDue, resourceTitle, resourceId) => {
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
    subject: 'Overdue Notice',
    html: `<!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
              body {
                  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                  line-height: 1.6;
                  background-color: #f5f7fa;
                  margin: 0;
                  padding: 0;
                  color: #212121;
              }
              
              .email-container {
                  max-width: 600px;
                  margin: 20px auto;
                  background: #ffffff;
                  border-radius: 12px;
                  overflow: hidden;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
              }
              
              .header {
                  background-color: #94152B;
                  color: #ffffff;
                  padding: 24px;
                  text-align: center;
              }
              
              .header h1 {
                  margin: 0;
                  font-weight: 500;
                  font-size: 24px;
              }
              
              .content {
                  padding: 32px 24px;
              }
              
              .notice-box {
                  background-color: rgba(61, 90, 254, 0.08);
                  border-left: 4px solid #94152B;
                  padding: 16px;
                  margin-bottom: 24px;
                  border-radius: 0 4px 4px 0;
              }
              
              table {
                  width: 100%;
                  border-collapse: collapse;
                  margin: 24px 0;
                  border-radius: 8px;
                  overflow: hidden;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
              }
              
              table th, table td {
                  padding: 12px 16px;
                  text-align: left;
                  border-bottom: 1px solid #e0e0e0;
              }
              
              table th {
                  background-color: #94152B;
                  color: #ffffff;
                  font-weight: 500;
              }
              
              table tr:last-child td {
                  border-bottom: none;
              }
              
              .item-title {
                  font-weight: 500;
                  margin-top: 32px;
                  margin-bottom: 12px;
                  color: #94152B;
              }
              
              .button {
                  display: inline-block;
                  background-color: #94152B;
                  color: #ffffff;
                  text-decoration: none;
                  padding: 12px 24px;
                  border-radius: 4px;
                  font-weight: 500;
                  margin-top: 24px;
                  transition: background-color 0.2s;
              }
              
              .button:hover {
                  background-color: #94152B;
              }
              
              .signature {
                  margin-top: 32px;
                  padding-top: 24px;
                  border-top: 1px solid #e0e0e0;
              }
              
              .footer {
                  text-align: center;
                  font-size: 14px;
                  color: #757575;
                  padding: 16px;
                  background: rgba(0, 0, 0, 0.02);
              }
              
              .social-links {
                  margin-top: 12px;
              }
              
              .social-links a {
                  display: inline-block;
                  margin: 0 8px;
                  color: #757575;
                  text-decoration: none;
              }
              
              @media only screen and (max-width: 600px) {
                  .email-container {
                      margin: 0;
                      border-radius: 0;
                  }
                  
                  .content {
                      padding: 24px 16px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="email-container">
              <div class="header">
                  <h1>Item Return Reminder</h1>
              </div>
              <div class="content">
                  <div class="notice-box">
                      <p>Your borrowed materials are due soon. Please return them by the due date to avoid any penalties.</p>
                  </div>
                  
                  <p>Hello {{borrower_name}},</p>
                  <p>We hope you're enjoying your borrowed materials. This is a friendly reminder about the following item that will be due soon:</p>
                  
                  <table>
                      <tr>
                          <th colspan="2">Borrower Information</th>
                      </tr>
                      <tr>
                          <td><strong>ID Number:</strong></td>
                          <td>{{borrower_id}}</td>
                      </tr>
                      <tr>
                          <td><strong>Checkout Date:</strong></td>
                          <td>{{borrowed_date}}</td>
                      </tr>
                      <tr>
                          <td><strong>Due Date:</strong></td>
                          <td>{{borrowed_due}}</td>
                      </tr>
                  </table>
                  
                  <h3 class="item-title">Item Details:</h3>
                  <table>
                      <tr>
                          <th>Title</th>
                          <th>Item ID</th>
                      </tr>
                      <tr>
                          <td>{{item_title}}</td>
                          <td>{{item_id}}</td>
                      </tr>
                  </table>
                  
                  <p>Please return the item on or before the due date. If you have any questions, feel free to contact us.</p>
                  
                  <div class="signature">
                      <p>Thank you for using our services,<br><strong>Learning Resources Center</strong></p>
                  </div>
              </div>
              <div class="footer">
                  <p>This is an automated message. Please do not reply to this email.</p>
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