import { db } from "../config/db.js";

export const inactivePatron = (req,res)=>{
    const q = `
    SELECT * 
    FROM patron 
    WHERE (CAST(SUBSTRING(tup_id, 6, 2) AS UNSIGNED) + 2000) = YEAR(CURDATE()) - 4;
    `

    db.query(q, (err, result) => {
        if (err) {
          return console.error('Error fetching patron data:', err);
        }

        const updateStatus = `
          UPDATE patron
          SET status = 'inactive'
          WHERE tup_id = ?
        `

        if(result.length>0){
          result.map(patron=>{
            db.query(updateStatus, [patron.tup_id],(err,results)=>{
              if(err) return res.send(err)
              console.log(`Updated patron with id ${patron.patron_id}`)
            })
          })
        }

        
    })
}