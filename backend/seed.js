import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB, Player } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const playersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/players.json'), 'utf-8'));
const players = playersData.map(p => ({
  name: p.name,
  basePrice: p.price ? p.price * 100000 : 20000000,
  role: p.role,
  status: 'UPCOMING'
}));

const seedDB = async () => {
  await connectDB();
  console.log('Clearing existing players...');
  await Player.deleteMany({});
  
  console.log('Seeding players...');
  await Player.insertMany(players);
  
  console.log('Database seeded successfully!');
  process.exit(0);
};

seedDB();
