import { db } from "../config/db.js";

export const reports = (req, res) => {
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
  };

  const generateAttendance = async (res, kind, startDate, endDate) => {
    let q = `
      SELECT 
          patron.tup_id as 'TUP ID',
          patron.patron_fname as 'first name',
          patron.patron_lname as 'last name',
          patron.patron_sex as sex,
          patron.patron_mobile as mobile,
          patron.patron_email as email,
          patron.category as category,
          college.college_name as college,
          course.course_name as course,
          attendance.att_log_in_time as 'time in',
          attendance.att_date as date
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
            resources.resource_title as 'resource title',
            patron.patron_fname as 'first name',
            patron.patron_lname as 'last name',
            patron.category as category,
            college.college_name as college, 
            course.course_name as course,
            checkout.checkout_date as 'borrowed date',
            checkout.checkout_due as 'due date'
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
            resources.resource_title as 'resource title', 
            resourcetype.type_name as 'resource type', 
            resources.resource_quantity as quantity, 
            department.dept_name as department,
            CASE
                WHEN resources.type_id IN ('1', '2', '3') THEN topic.topic_name
                ELSE 'n/a'
            END AS topic,
            GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS authors
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
};