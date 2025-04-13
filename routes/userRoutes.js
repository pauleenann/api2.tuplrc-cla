import express from 'express';
import { checkSession, login, logout } from '../controller/userController.js';

const router = express.Router();

router.post('/login',login);
router.post('/logout',logout);
router.get('/check-session', checkSession);

export default router;