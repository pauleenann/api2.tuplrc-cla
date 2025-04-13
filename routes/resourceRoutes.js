import express from 'express';
import multer from 'multer';
import fs, { stat } from 'fs';
import {importCatalog, saveResource, updateResource, viewResource } from '../controller/resourceController.js';

const router = express.Router();

const storage = multer.diskStorage({
    destination: function(req,file,cb){
        return cb(null,"./public/images")
    },
    filename:function(req,file,cb){
        return cb(null,file.originalname)
    }
})

//upload: This is an instance of multer, configured to use the storage we just defined. It's ready to handle file uploads now!
const upload = multer({ storage });

router.post('/file', upload.single('file'), (req, res) => {
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

router.put('/file', upload.single('file'), (req, res) => {
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

router.post('/',upload.single('file'),saveResource)
router.post('/import', importCatalog)
router.put('/:id',upload.single('file'),updateResource)
router.get('/:id', viewResource)

export default router;
