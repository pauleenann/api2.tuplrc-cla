import mysql from "mysql2";    
import mysqlPromise from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const dbPromise = mysqlPromise.createPool({ host: process.env.DB_HOST_LOCAL,
    user: process.env.DB_USER_LOCAL,
    password: process.env.DB_PASSWORD_LOCAL,
    database: process.env.DB_DATABASE_LOCAL, });

export const db = mysql.createConnection({
    host: process.env.DB_HOST_LOCAL,
    user: process.env.DB_USER_LOCAL,
    password: process.env.DB_PASSWORD_LOCAL,
    database: process.env.DB_DATABASE_LOCAL,
}); 
