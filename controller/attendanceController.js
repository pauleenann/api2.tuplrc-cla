import { db } from "../config/db.js";

export const attendance = (req, res) => {
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

    const logAttendanceQuery = "INSERT INTO attendance (att_log_in_time, att_date, patron_id) VALUES (?, ?, ?)";
    db.query(logAttendanceQuery, [time, date, patronId], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Failed to log attendance." });
      }
      
      // Use the io instance from the request object
      req.io.emit('attendanceUpdated');
      
      return res.status(200).json({
        success: true,
        studentName: studentName,
        message: "Attendance logged successfully.",
      });
    });
  });
};