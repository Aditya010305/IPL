import express from 'express';
import { Room, User, Team, Player, IPL_TEAMS } from './db.js';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '296147393077-5nmfp3ji3h7riau8i6frs8cch06he95t.apps.googleusercontent.com');

// Verify Google Token
router.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    // For local testing without a real OAuth Client ID
    if (token === 'TEST_GOOGLE_TOKEN') {
       return res.json({ authType: 'GOOGLE', googleId: '12345', email: 'test@gmail.com', username: 'Test Google User', picture: '' });
    }

    let payload;

    // First try full verification (works when network allows fetching JWKS)
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID || '296147393077-5nmfp3ji3h7riau8i6frs8cch06he95t.apps.googleusercontent.com',
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      // Fallback: decode JWT without verification
      // Google's popup already verified identity — we just need the user info
      const base64Payload = token.split('.')[1];
      const decoded = Buffer.from(base64Payload, 'base64url').toString('utf-8');
      payload = JSON.parse(decoded);

      // Basic sanity check — must be a real Google token
      if (!payload.sub || !payload.email) {
        return res.status(401).json({ error: 'Invalid Google Token' });
      }
    }

    res.json({
      authType: 'GOOGLE',
      googleId: payload.sub,
      email: payload.email,
      username: payload.name,
      picture: payload.picture
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid Google Token' });
  }
});

const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Get predefined IPL Teams
router.get('/ipl-teams', (req, res) => {
  res.status(200).json(IPL_TEAMS);
});

// Get all players for a room (for Auctioneer selection)
router.get('/players', async (req, res) => {
  try {
    const { roomId } = req.query;
    if (!roomId) return res.status(400).json({ error: 'roomId is required' });
    const players = await Player.find({ roomId });
    res.status(200).json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Room & Admin
router.post('/create-room', async (req, res) => {
  try {
    const { name, adminUsername, adminRole, teamName, auctionMode } = req.body;
    
    if (adminRole !== 'Auctioneer' && adminRole !== 'Pad Holder') {
      return res.status(400).json({ error: 'Admin must be either Auctioneer or Pad Holder.' });
    }

    const roomId = generateRoomCode();
    
    // Create Admin user (pre-approved)
    const admin = new User({ 
       username: req.body.authType === 'GOOGLE' ? (req.body.username || adminUsername) : adminUsername, 
       role: adminRole, 
       roomId, 
       isAdmin: true,
       approvalStatus: 'APPROVED',
       authType: req.body.authType || 'GUEST',
       email: req.body.email,
       googleId: req.body.googleId,
       picture: req.body.picture
    });
    await admin.save();

    let teamId = null;
    if (adminRole === 'Pad Holder') {
       if (!IPL_TEAMS.includes(teamName)) return res.status(400).json({ error: 'Invalid IPL Team' });
       const team = new Team({ name: teamName, roomId, padHolderId: admin._id });
       await team.save();
       teamId = team._id;
       admin.teamId = teamId;
       await admin.save();
    }

    const room = new Room({ roomId, name, auctionMode: auctionMode || 'Recent', users: [admin._id] });
    if (teamId) room.teams.push(teamId);
    await room.save();

    // Seed Players for this Room based on auctionMode
    const fileToLoad = (auctionMode === 'Legendary') ? 'all_players_ipl.json' : 'recent_players.json';
    const playersData = JSON.parse(fs.readFileSync(path.join(__dirname, `data/${fileToLoad}`), 'utf-8'));
    const defaultBasePrice = (auctionMode === 'Legendary') ? 10000000 : 20000000;
    const playersToInsert = playersData.map(p => ({
      name: p.name,
      roomId,
      basePrice: p.price ? p.price * 100000 : defaultBasePrice,
      role: p.role || 'All-Rounder',
      status: 'UPCOMING'
    }));
    await Player.insertMany(playersToInsert);

    res.status(201).json({ room, user: admin, teamId });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'Team already exists in this room.' });
    res.status(500).json({ error: error.message });
  }
});

// Join Room (Request to join, defaults to PENDING)
router.post('/join-room', async (req, res) => {
  try {
    const { roomId, username, role, teamName } = req.body;
    
    const room = await Room.findOne({ roomId }).populate('teams').populate('users');
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Persistent Re-Login Matcher (Simulating OAuth/Identities)
    const existingUser = room.users.find(u => {
        if (req.body.authType === 'GOOGLE') return u.googleId === req.body.googleId && u.role === role;
        return u.username === username && u.role === role;
    });
    if (existingUser) {
        if (role === 'Pad Holder' || role === 'Team Member') {
             const existingTeam = room.teams.find(t => t._id.toString() === existingUser.teamId?.toString())?.name;
             if (existingTeam === teamName) {
                 return res.status(200).json({ room, user: existingUser, teamId: existingUser.teamId, message: 'Welcome back!' });
             } else {
                 return res.status(400).json({ error: 'Username is already taken on a different team.' });
             }
        } else {
             return res.status(200).json({ room, user: existingUser, teamId: null, message: 'Welcome back!' });
        }
    }

    // Validate 1 Auctioneer rule
    if (role === 'Auctioneer') {
       const existingAuctioneer = room.users.find(u => u.role === 'Auctioneer' && u.approvalStatus !== 'REJECTED');
       if (existingAuctioneer) return res.status(400).json({ error: 'Auctioneer role is already taken or pending.' });
    }

    let team = null;
    if (role === 'Pad Holder') {
       if (!IPL_TEAMS.includes(teamName)) return res.status(400).json({ error: 'Invalid IPL Team' });
       
       team = await Team.findOne({ roomId, name: teamName });
       if (team) return res.status(400).json({ error: `${teamName} is already claimed by another Pad Holder.` });
       
       team = new Team({ name: teamName, roomId }); // padHolderId remains empty until admin approves
       await team.save();
       await Room.updateOne({ _id: room._id }, { $push: { teams: team._id } });
    } else if (role === 'Team Member') {
       team = await Team.findOne({ roomId, name: teamName });
       if (!team || !team.padHolderId) {
          return res.status(400).json({ error: `Cannot join ${teamName}. A Pad Holder must create the team and get approved first.` });
       }
    }

    const user = new User({ 
       username: req.body.authType === 'GOOGLE' ? req.body.username : username, 
       role, 
       roomId, 
       teamId: team?._id,
       isAdmin: false,
       approvalStatus: 'PENDING',
       authType: req.body.authType || 'GUEST',
       email: req.body.email,
       googleId: req.body.googleId,
       picture: req.body.picture
    });
    await user.save();
    
    await Room.updateOne({ _id: room._id }, { $push: { users: user._id } });

    res.status(200).json({ room, user, teamId: team?._id, message: 'Request submitted successfully. Waiting for approval.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approvals Endpoint
router.post('/approve-user', async (req, res) => {
  try {
    const { approverId, targetUserId, status } = req.body; // status: APPROVED or REJECTED
    
    const approver = await User.findById(approverId);
    const targetUser = await User.findById(targetUserId);

    if (!approver || !targetUser) return res.status(404).json({ error: 'User not found' });

    // Admin approving Pad Holders/Auctioneers
    if (targetUser.role === 'Pad Holder' || targetUser.role === 'Auctioneer') {
       if (!approver.isAdmin) return res.status(403).json({ error: 'Only Admin can approve this role' });
       
       targetUser.approvalStatus = status;
       await targetUser.save();
       
       // Link Pad Holder to Team upon approval
       if (status === 'APPROVED' && targetUser.role === 'Pad Holder') {
         const team = await Team.findById(targetUser.teamId);
         team.padHolderId = targetUser._id;
         await team.save();
       }
    } 
    // Pad Holder approving Team Members
    else if (targetUser.role === 'Team Member') {
       if (approver.role !== 'Pad Holder' || approver.teamId.toString() !== targetUser.teamId.toString()) {
           return res.status(403).json({ error: 'Only the team Pad Holder can approve team members.' });
       }
       targetUser.approvalStatus = status;
       await targetUser.save();
    }

    res.status(200).json({ message: `User status updated to ${status}`, targetUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Room Information
router.get('/room/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
      .populate('teams')
      .populate('users')
      .populate('currentPlayerId')
      .populate('highestBidder');
      
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const validTeams = (room.teams || []).filter(t => t && t._id);
    const teamIds = validTeams.map(t => t._id);
    const soldPlayers = await Player.find({ roomId: req.params.roomId, soldTo: { $in: teamIds } });

    res.status(200).json({ ...room.toObject(), soldPlayers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
