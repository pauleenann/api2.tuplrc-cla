import dotenv from 'dotenv';
import axios from 'axios'

dotenv.config();

export const fetchIsbn = async (req,res)=>{
    const isbn = req.params.isbn
    try{
        const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${process.env.API_KEY}`);
        console.log(response.data)
        return res.json(response.data);
        
    }catch(err){
        console.log(err)
        return res.status(500).json({ message: 'Error fetching data from Google Books API.' });
    }
}