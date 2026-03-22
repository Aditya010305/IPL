import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  role: { type: String, enum: ['Auctioneer', 'Team Member', 'Pad Holder'], required: true },
  roomId: { type: String },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  isAdmin: { type: Boolean, default: false },
  approvalStatus: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'APPROVED' },
  authType: { type: String, enum: ['GUEST', 'GOOGLE'], default: 'GUEST' },
  email: { type: String },
  googleId: { type: String },
  picture: { type: String }
});

export const IPL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'GT', 'RR', 'SRH', 'DC', 'PBKS', 'LSG'];

const teamSchema = new mongoose.Schema({
  name: { type: String, enum: IPL_TEAMS, required: true },
  roomId: { type: String, required: true },
  budget: { type: Number, default: 1000000000 },
  padHolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});
teamSchema.index({ name: 1, roomId: 1 }, { unique: true });

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  roomId: { type: String, required: true }, // Add roomId for multi-tenant isolation
  basePrice: { type: Number, required: true },
  role: { type: String, default: 'All-Rounder' }, // Batsman, Bowler, etc.
  status: { type: String, enum: ['UNSOLD', 'SOLD', 'UPCOMING'], default: 'UPCOMING' },
  soldTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  finalBid: { type: Number, default: 0 },
});

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  auctionMode: { type: String, enum: ['Recent', 'Legendary'], default: 'Recent' }, // Add mode selection
  status: { type: String, enum: ['LIVE', 'PAUSED', 'COMPLETED'], default: 'PAUSED' },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  currentPlayerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
  currentBid: { type: Number, default: 0 },
  highestBidder: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  timer: { type: Number, default: 30 },
  pauseMessage: { type: String, default: '' },
});

export const User = mongoose.model('User', userSchema);
export const Team = mongoose.model('Team', teamSchema);
export const Player = mongoose.model('Player', playerSchema);
export const Room = mongoose.model('Room', roomSchema);

export const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.log('No MONGODB_URI found, provisioning MongoMemoryServer...');
      const mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      await mongoose.connect(mongoUri);
      console.log(`MongoDB connected successfully to ${mongoUri}`);
    } else {
      await mongoose.connect(mongoUri);
      console.log(`MongoDB connected successfully to ${mongoUri}`);
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Player seeding is now handled individually per room in routes.js based on auction mode.
