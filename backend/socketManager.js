import { Room, Player, Team } from './db.js';

const roomTimers = {};
const roomTimeLeft = {};

export const setupSockets = (io) => {
  io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Join room and optional team chat room
    socket.on('join_room', ({ roomId, user }) => {
      socket.join(roomId);
      console.log(`User ${user?.username} joined room ${roomId}`);
      io.to(roomId).emit('global_chat', { message: `${user?.username || 'Someone'} joined the room`, isSystem: true });
      if (roomTimeLeft[roomId] !== undefined) {
         socket.emit('timer_tick', { timeLeft: roomTimeLeft[roomId] });
      }
    });

    socket.on('join_team_chat', ({ roomId, teamId }) => {
      socket.join(`${roomId}_team_${teamId}`);
    });

    // Auctioneer / Admin: Move to next player
    socket.on('next_player', async ({ roomId, role }) => {
      if (role !== 'Admin' && role !== 'Auctioneer') return;
      
      // Get the next unsold player (prioritize UPCOMING, then fallback to UNSOLD)
      let player = await Player.findOne({ status: 'UPCOMING', roomId });
      if (!player) {
         player = await Player.findOne({ status: 'UNSOLD', roomId });
      }
      if (!player) {
         io.to(roomId).emit('auction_complete', { message: 'All players have been auctioned.' });
         return;
      }

      player.status = 'UPCOMING';
      await player.save();

      // Update room state
      await Room.findOneAndUpdate({ roomId }, { 
        currentPlayerId: player._id,
        currentBid: player.basePrice,
        highestBidder: null,
        timer: 30,
        status: 'LIVE',
        pauseMessage: ''
      });
      
      io.to(roomId).emit('new_player', { player, currentBid: player.basePrice });
      
      // Automatically start auction timer
      startTimer(io, roomId, 30);
    });

    // Auctioneer: Select specific Next Player
    socket.on('call_specific_player', async ({ roomId, role, playerId }) => {
      if (role !== 'Admin' && role !== 'Auctioneer') return;
      
      const room = await Room.findOne({ roomId });
      if (!room) return;
      
      const player = await Player.findById(playerId);
      if (!player) return socket.emit('error', 'Player not found!');
      if (player.status === 'SOLD') return socket.emit('error', 'Player already sold!');

      player.status = 'UPCOMING';
      await player.save();

      await Room.findOneAndUpdate({ roomId }, { 
        currentPlayerId: player._id,
        currentBid: player.basePrice,
        highestBidder: null,
        timer: 30,
        status: 'LIVE',
        pauseMessage: ''
      });

      io.to(roomId).emit('new_player', { player, currentBid: player.basePrice });
      startTimer(io, roomId, 30);
    });

    // Auctioneer: Pause Auction
    socket.on('pause_auction', async ({ roomId, role, message }) => {
      if (role !== 'Admin' && role !== 'Auctioneer') return;
      
      if (roomTimers[roomId]) {
         clearInterval(roomTimers[roomId]);
         delete roomTimers[roomId];
      }
      
      await Room.findOneAndUpdate({ roomId }, { 
        status: 'PAUSED',
        pauseMessage: message || 'Auction Paused',
        timer: roomTimeLeft[roomId] || 30
      });
      
      io.to(roomId).emit('auction_paused', { message: message || 'Auction Paused' });
    });

    // Auctioneer: Resume Auction
    socket.on('resume_auction', async ({ roomId, role }) => {
      if (role !== 'Admin' && role !== 'Auctioneer') return;
      
      const room = await Room.findOneAndUpdate({ roomId }, { status: 'LIVE', pauseMessage: '' }, { new: true });
      if (room && room.currentPlayerId) {
         io.to(roomId).emit('auction_resumed');
         let timeLeft = roomTimeLeft[roomId];
         if (timeLeft === undefined || timeLeft === null) timeLeft = room.timer || 30;
         startTimer(io, roomId, timeLeft);
      }
    });

    socket.on('suspend_timer', ({ roomId, role }) => {
      if (role !== 'Admin' && role !== 'Auctioneer') return;
      if (roomTimers[roomId]) {
         clearInterval(roomTimers[roomId]);
         delete roomTimers[roomId];
      }
    });

    socket.on('resume_timer_only', ({ roomId, role }) => {
      if (role !== 'Admin' && role !== 'Auctioneer') return;
      let timeLeft = roomTimeLeft[roomId] || 30;
      startTimer(io, roomId, timeLeft);
    });

    // Bidding Logic
    socket.on('place_bid', async ({ roomId, bidAmount, teamId, role }) => {
      try {
        if (role !== 'Pad Holder') return socket.emit('error', 'Only the Pad Holder can place bids');
        if (!teamId) return socket.emit('error', 'Your Team ID is invalid! Please click Leave / Reset to rejoin.');
        
        const room = await Room.findOne({ roomId }).populate('currentPlayerId');
        if (!room || !room.currentPlayerId) return;
        if (room.status === 'PAUSED') return socket.emit('error', 'Action failed: Auction is paused!');
        if (!roomTimers[roomId]) return socket.emit('error', 'Action failed: Timer is suspended by Auctioneer.');

        if (room.highestBidder && room.highestBidder.toString() === teamId.toString()) {
          return socket.emit('error', 'You cannot place consecutive bids against yourself!');
        }

        if (bidAmount <= room.currentBid && room.highestBidder) {
          return socket.emit('error', 'Bid must be higher than the current bid');
        }

        const team = await Team.findById(teamId);
        if (!team) return socket.emit('error', 'Team not found in database');
        if (team.budget < bidAmount) {
           return socket.emit('error', 'Insufficient team budget');
        }

        room.currentBid = bidAmount;
        room.highestBidder = teamId;
        await room.save();

        io.to(roomId).emit('bid_update', { currentBid: bidAmount, highestBidder: teamId });
        
        let nextTimer = (roomTimeLeft[roomId] || 0) + 5;
        if (nextTimer > 30) nextTimer = 30;
        startTimer(io, roomId, nextTimer);
      } catch (err) {
        console.error("Bid error:", err);
        socket.emit('error', 'Failed to process bid due to a server error.');
      }
    });

    // Auctioneer Manual Sell Override
    socket.on('auctioneer_sell_player', async ({ roomId, role }) => {
      if (role !== 'Admin' && role !== 'Auctioneer') return;
      
      if (roomTimers[roomId]) {
         clearInterval(roomTimers[roomId]);
         delete roomTimers[roomId];
      }
      roomTimeLeft[roomId] = 0;
      io.to(roomId).emit('timer_tick', { timeLeft: 0 });

      const room = await Room.findOne({ roomId }).populate('currentPlayerId').populate('highestBidder');
      if (room && room.currentPlayerId) {
         const player = await Player.findById(room.currentPlayerId._id);
         if (room.highestBidder) {
            player.status = 'SOLD';
            player.soldTo = room.highestBidder._id;
            player.finalBid = room.currentBid;
            await player.save();
            
            const team = await Team.findById(room.highestBidder._id);
            team.budget -= room.currentBid;
            await team.save();

            io.to(roomId).emit('player_sold', { player, team, finalBid: room.currentBid });
         } else {
            player.status = 'UNSOLD';
            await player.save();
            io.to(roomId).emit('player_unsold', { player });
         }
      }
    });

    // Chat functionality
    socket.on('send_global_chat', ({ roomId, message, user }) => {
      io.to(roomId).emit('global_chat', { user, message, isSystem: false });
    });

    socket.on('send_team_chat', ({ roomId, teamId, message, user }) => {
      io.to(`${roomId}_team_${teamId}`).emit('team_chat', { user, message });
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
};

const startTimer = (io, roomId, duration = 30) => {
  if (roomTimers[roomId]) clearInterval(roomTimers[roomId]);
  
  roomTimeLeft[roomId] = duration;
  io.to(roomId).emit('timer_tick', { timeLeft: roomTimeLeft[roomId] });
  
  roomTimers[roomId] = setInterval(async () => {
    roomTimeLeft[roomId]--;
    io.to(roomId).emit('timer_tick', { timeLeft: roomTimeLeft[roomId] });
    
    // Time's up -> Player Sold or Unsold
    if (roomTimeLeft[roomId] <= 0) {
      clearInterval(roomTimers[roomId]);
      delete roomTimers[roomId];
      
      const room = await Room.findOne({ roomId }).populate('currentPlayerId').populate('highestBidder');
      if (room && room.currentPlayerId) {
         const player = await Player.findById(room.currentPlayerId._id);
         
         if (room.highestBidder) {
            // Player SOLD
            player.status = 'SOLD';
            player.soldTo = room.highestBidder._id;
            player.finalBid = room.currentBid;
            await player.save();
            
            // Deduct from Team budget
            const team = await Team.findById(room.highestBidder._id);
            team.budget -= room.currentBid;
            await team.save();

            io.to(roomId).emit('player_sold', { player, team, finalBid: room.currentBid });
         } else {
            // Player UNSOLD
            player.status = 'UNSOLD';
            await player.save();
            io.to(roomId).emit('player_unsold', { player });
         }
      }
    }
  }, 1000);
};
