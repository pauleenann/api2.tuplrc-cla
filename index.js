import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Route imports
import resourceRoutes from './routes/resourceRoutes.js';
import dataRoutes from './routes/dataRoutes.js';
import userRoutes from './routes/userRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import patronRoutes from './routes/patronRoutes.js';
import circulationRoutes from './routes/circulationRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import syncRoutes from './routes/syncRoutes.js';
import reportsRoutes from './routes/reportsRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import accountRoutes from './routes/accountRoutes.js';
import isbnRoutes from './routes/isbnRoutes.js';
import validateTupId from './routes/validateTupId.js';
import onlineCatalogRoutes from './routes/onlineCatalogRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import advancedSearchRoutes from './routes/advancedSearchRoutes.js';
import { approachingOverdue, checkOverdue } from './controller/overdueController.js';
import { inactivePatron } from './routes/patronInactiveController.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Define CORS options
const corsOptions = {
  origin: ['https://administrator.tuplrc-cla.com', 'https://api2.tuplrc-cla.com', 'http://localhost:8080'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Allow cookies to be sent and received
  preflightContinue: false, // Let express handle OPTIONS requests
  optionsSuccessStatus: 204 // Standard for preflight requests
};

// Apply CORS middleware globally
app.use(cors(corsOptions));

// Explicitly handle OPTIONS requests
app.options('*', cors(corsOptions));

// Middleware for cookies and JSON parsing
app.use(cookieParser());
app.use(express.json());

// Create HTTP server for socket.io
const httpServer = createServer(app);

// Set up Socket.IO with the same CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: ['https://administrator.tuplrc-cla.com', 'https://api2.tuplrc-cla.com', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  }
});

// Attach Socket.IO to all routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Define API Routes
app.use("/api/resources", resourceRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/user", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/patron", patronRoutes);
app.use('/api/circulation', circulationRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/isbn', isbnRoutes);
app.use('/api/validate-tup-id', validateTupId);
app.use('/api/online-catalog', onlineCatalogRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/advanced-search', advancedSearchRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Cron jobs for scheduled tasks
cron.schedule('0 0 * * *', () => {
  console.log('Cron running to check overdue resources');
  checkOverdue(io);
});

cron.schedule('0 0 * * *', () => {
  console.log('Cron running to check approaching overdue');
  approachingOverdue();
});

cron.schedule('0 0 30 8 *', () => {
  console.log('Cron running to set patrons to inactive');
  inactivePatron();
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS configured for: https://administrator.tuplrc-cla.com`);
});

// Export io for external use if needed
export { io };
