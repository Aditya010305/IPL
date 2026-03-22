import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import { setupSockets } from './socketManager.js';
import apiRoutes from './routes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

connectDB();
setupSockets(io);

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Backend Server running on port ${PORT}`);
});
