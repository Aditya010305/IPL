import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const userSchema = new mongoose.Schema({ username: String });
const teamSchema = new mongoose.Schema({ name: String });
const roomSchema = new mongoose.Schema({
  roomId: String,
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

const User = mongoose.model('User', userSchema);
const Team = mongoose.model('Team', teamSchema);
const Room = mongoose.model('Room', roomSchema);

async function run() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const room = new Room({ roomId: 'LPM363' });
  await room.save();

  // Simulate pushing team
  const team = new Team({ name: 'CSK' });
  await team.save();

  await Room.updateOne({ _id: room._id }, { $push: { teams: team._id } });

  // Now fetch with populate
  const fetched = await Room.findOne({ roomId: 'LPM363' }).populate('teams').populate('users');
  console.log("Teams after populate:", fetched.teams);

  // Map to _id
  try {
     const teamIds = fetched.teams.map(t => t._id);
     console.log("Team IDs:", teamIds);
  } catch(e) {
     console.log("Error mapping:", e);
  }

  process.exit(0);
}

run();
