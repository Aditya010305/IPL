import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import http from 'http';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  role: { type: String, enum: ['Auctioneer', 'Team Member', 'Pad Holder'], required: true },
  roomId: { type: String },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  isAdmin: { type: Boolean, default: false },
  approvalStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'APPROVED' }
});
export const IPL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'GT', 'RR', 'SRH', 'DC', 'PBKS', 'LSG'];
const teamSchema = new mongoose.Schema({
  name: { type: String, enum: IPL_TEAMS, required: true },
  roomId: { type: String, required: true },
  budget: { type: Number, default: 100000000 },
  padHolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});
const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String },
  basePrice: { type: Number, required: true },
  status: { type: String, enum: ['UPCOMING', 'SOLD', 'UNSOLD'], default: 'UPCOMING' },
  soldTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  finalBid: { type: Number }
});
const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, default: 'LIVE' },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  currentPlayerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
  highestBidder: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  timer: { type: Number, default: 30 }
});
const User = mongoose.model('User', userSchema);
const Team = mongoose.model('Team', teamSchema);
const Player = mongoose.model('Player', playerSchema);
const Room = mongoose.model('Room', roomSchema);

import appRouter from './routes.js';

async function run() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const app = express();
  app.use(express.json());
  app.use('/api', appRouter);

  const server = http.createServer(app);
  server.listen(5002, async () => {
    try {
      console.log('Server started on 5002');
      const createRes = await fetch('http://localhost:5002/api/create-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Room1', adminUsername: 'A', adminRole: 'Auctioneer' })
      }).then(r => r.json());
      const roomId = createRes.room.roomId;
      
      const res2 = await fetch('http://localhost:5002/api/join-room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, username: 'Pad1', role: 'Pad Holder', teamName: 'CSK' })
      }).then(r=>r.json());
      
      const res3 = await fetch(`http://localhost:5002/api/room/${roomId}`).then(r => r.json());
      console.log("Users in room:", res3.users);

    } catch(err) {
      console.error(err);
    }
    process.exit(0);
  });
}
run();
