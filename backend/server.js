import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import { setupSockets } from './socketManager.js';
import apiRoutes from './routes.js';

dotenv.config();

// Build allowed origins: localhost for dev + any vercel.app deployment + custom FRONTEND_URL
const allowedOrigins = ['http://localhost:5173', 'http://localhost:4173'];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow: no origin (server-to-server / Postman), localhost, vercel.app previews, custom domain
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      /\.vercel\.app$/.test(origin)   // allow ALL vercel.app preview deployments
    ) {
      callback(null, true);
    } else {
      // Return false (blocks request) instead of Error (causes 500)
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.use('/api', apiRoutes);

// Health check endpoint for FastCron / uptime monitors
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || /\.vercel\.app$/.test(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['polling', 'websocket']
});

connectDB();
setupSockets(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
});
