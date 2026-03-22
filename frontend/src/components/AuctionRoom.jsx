import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';

const SOCKET_URL = 'https://ipl-ns9d.onrender.com';
const API_URL = 'https://ipl-ns9d.onrender.com/api';

const formatMoney = (amount) => {
  if (!amount) return '0';
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(2)} L`;
  return amount.toString();
};

const AuctionRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [roomData, setRoomData] = useState(null);
  
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [currentBid, setCurrentBid] = useState(0);
  const [highestBidder, setHighestBidder] = useState(null);
  const [timer, setTimer] = useState(0);
  const [pauseMessage, setPauseMessage] = useState('');
  const [isPausing, setIsPausing] = useState(false);
  const [pauseTime, setPauseTime] = useState('');
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [allPlayers, setAllPlayers] = useState([]);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  
  const [globalChat, setGlobalChat] = useState([]);
  const [teamChat, setTeamChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatTab, setChatTab] = useState('global');
  
  const [errorMsg, setErrorMsg] = useState('');
  
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('user')));
  const teamId = localStorage.getItem('teamId');

  const fetchRoom = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/room/${roomId}`);
      setRoomData(data);
      if (data.currentPlayerId) {
        setCurrentPlayer(data.currentPlayerId);
        setCurrentBid(data.currentBid);
        setHighestBidder(data.highestBidder?._id || data.highestBidder);
      }
      if (data.status === 'PAUSED' && data.currentPlayerId) {
         setPauseMessage(data.pauseMessage || 'Auction Paused');
      } else {
         setPauseMessage('');
      }
      
      const me = data.users.find(u => u._id === currentUser._id);
      if (me && me.approvalStatus !== currentUser.approvalStatus) {
         const updated = { ...currentUser, approvalStatus: me.approvalStatus };
         localStorage.setItem('user', JSON.stringify(updated));
         setCurrentUser(updated);
      }
    } catch (err) {
       console.error(err);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }

    fetchRoom();
    const intervalId = setInterval(fetchRoom, 3000); // Polling for robust approval state & room sync

    const newSocket = io(SOCKET_URL, {
        transports: ["websocket"],
        withCredentials: false
    });
    setSocket(newSocket);

    // Only join socket interactions if approved
    if (currentUser.approvalStatus === 'APPROVED') {
      newSocket.emit('join_room', { roomId, user: currentUser });
      if (teamId) {
         newSocket.emit('join_team_chat', { roomId, teamId });
      }
    }

    newSocket.on('new_player', ({ player, currentBid }) => {
      setCurrentPlayer(player);
      setCurrentBid(currentBid);
      setHighestBidder(null);
      setTimer(30);
      setPauseMessage('');
    });

    newSocket.on('bid_update', ({ currentBid, highestBidder }) => {
      setCurrentBid(currentBid);
      setHighestBidder(highestBidder); 
    });

    newSocket.on('timer_tick', ({ timeLeft }) => {
      setTimer(timeLeft);
    });

    newSocket.on('player_sold', ({ player, team, finalBid }) => {
      setCurrentPlayer({ ...player, status: 'SOLD' });
      fetchRoom(); // refresh budgets
    });

    newSocket.on('player_unsold', ({ player }) => {
      setCurrentPlayer({ ...player, status: 'UNSOLD' });
    });

    newSocket.on('auction_paused', ({ message }) => {
      setPauseMessage(message);
    });

    newSocket.on('auction_resumed', () => {
      setPauseMessage('');
    });

    newSocket.on('global_chat', (msg) => {
      setGlobalChat(prev => [...prev, msg]);
    });

    newSocket.on('team_chat', (msg) => {
      setTeamChat(prev => [...prev, msg]);
    });

    newSocket.on('error', (err) => {
      setErrorMsg(err);
      setTimeout(() => setErrorMsg(''), 4000);
    });

    return () => {
       clearInterval(intervalId);
       newSocket.close()
    };
  }, [roomId, navigate, currentUser, teamId]);

  const handleNextPlayer = () => {
    socket?.emit('next_player', { roomId, role: currentUser.role });
  };

  const handleOpenPlayerSelection = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/players?roomId=${roomId}`);
      setAllPlayers(data.filter(p => p.status === 'UPCOMING' || p.status === 'UNSOLD'));
      setPlayerSearchQuery('');
      setShowPlayerModal(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePlaceBid = () => {
    let nextBid = currentBid;
    if (currentBid === currentPlayer.basePrice && !highestBidder) {
       nextBid = currentBid;
    } else if (currentBid < 20000000) {
      nextBid += 2000000;
    } else if (currentBid < 50000000) {
      nextBid += 2500000;
    } else {
      nextBid += 5000000;
    }
    
    socket?.emit('place_bid', { 
      roomId, 
      bidAmount: nextBid, 
      teamId, 
      role: currentUser.role 
    });
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    if (chatTab === 'global') {
      socket?.emit('send_global_chat', { roomId, message: chatInput, user: currentUser });
    } else {
      socket?.emit('send_team_chat', { roomId, teamId, message: chatInput, user: currentUser });
    }
    setChatInput('');
  };

  const handleApproval = async (targetUserId, status) => {
    try {
      await axios.post(`${API_URL}/approve-user`, {
        approverId: currentUser._id,
        targetUserId,
        status
      });
      fetchRoom();
    } catch (err) {
      alert(err.response?.data?.error || 'Approval failed');
    }
  };

  if (currentUser?.approvalStatus === 'PENDING') {
    return (
      <div className="auth-container">
        <div className="glass-panel auth-box" style={{ textAlign: 'center' }}>
           <h2 style={{ color: 'var(--accent)' }}>Waiting for Approval</h2>
           <p style={{ marginTop: '15px' }}>Your request to join Room <strong>{roomId}</strong> as a <strong>{currentUser.role}</strong> is pending.</p>
           {currentUser.role === 'Team Member' && <p style={{ marginTop: '10px' }}>Waiting for the Pad Holder of your team to approve you.</p>}
           {(currentUser.role === 'Pad Holder' || currentUser.role === 'Auctioneer') && <p style={{ marginTop: '10px' }}>Waiting for the Room Admin to approve you.</p>}
           <div style={{ marginTop: '20px', fontSize: '3rem' }}>⏳</div>
        </div>
      </div>
    );
  }

  if (currentUser?.approvalStatus === 'REJECTED') {
    return (
      <div className="auth-container">
        <div className="glass-panel auth-box" style={{ textAlign: 'center' }}>
           <h2 style={{ color: 'var(--sold-color)' }}>Request Rejected</h2>
           <p style={{ marginTop: '15px' }}>Your request to join this room was declined.</p>
        </div>
      </div>
    );
  }

  const handleForceSold = () => {
    socket?.emit('auctioneer_sell_player', { roomId, role: currentUser.role });
  };

  const handleLeave = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('teamId');
    navigate('/');
  };

  const downloadTeamCSV = (team, boughtPlayers) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Player Name,Role,Final Bid\n";
    boughtPlayers.forEach(p => {
       csvContent += `"${p.name}","${p.role}",${p.finalBid}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${team.name}_Roster.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const myTeam = roomData?.teams?.find(t => t._id === teamId);
  const highestBidderTeam = roomData?.teams?.find(t => t._id === (highestBidder?._id || highestBidder));
  
  // Resolve Pending Requests
  const pendingRequests = roomData?.users?.filter(u => u.approvalStatus === 'PENDING') || [];
  let viewableRequests = [];
  if (currentUser?.isAdmin) {
      viewableRequests = pendingRequests.filter(u => u.role === 'Pad Holder' || u.role === 'Auctioneer');
  } else if (currentUser?.role === 'Pad Holder') {
      viewableRequests = pendingRequests.filter(u => u.role === 'Team Member' && u.teamId === teamId);
  }

  return (
    <div className="auction-layout">
      {/* Main Board */}
      <div className="auction-main">
        <div className="room-header">
          <div>
            <h2 style={{ marginBottom: '5px' }}>Room: {roomData?.name}</h2>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px' }}>
               <span>Code: <strong style={{ color: 'var(--text-color)', letterSpacing: '1px' }}>{roomId}</strong></span>
               <button onClick={() => {
                   navigator.clipboard.writeText(roomId);
                   setCopyMsg('Copied!');
                   setTimeout(() => setCopyMsg(''), 2000);
               }} style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '5px', width: 'auto' }}>
                  📋 Copy
               </button>
               <button onClick={() => {
                   const joinUrl = `${window.location.origin}/?join=${roomId}`;
                   if (navigator.share) {
                       navigator.share({
                           title: 'Virtual IPL Auction',
                           text: `Join my Virtual IPL Auction!`,
                           url: joinUrl
                       }).catch(console.error);
                   } else {
                       navigator.clipboard.writeText(`Join my Virtual IPL Auction at: ${joinUrl}`);
                       setCopyMsg('Invite Copied!');
                       setTimeout(() => setCopyMsg(''), 2000);
                   }
               }} style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'var(--accent)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', gap: '5px', width: 'auto' }}>
                  🔗 Share
               </button>
               {copyMsg && <span style={{ color: 'var(--success-color)', fontSize: '0.85rem', fontWeight: 'bold' }}>{copyMsg}</span>}
            </div>
          </div>
          <div className="room-header-actions">
            {myTeam && <h3>Budget: {formatMoney(myTeam.budget)}</h3>}
            <p style={{ color: 'var(--accent)' }}>Role: {currentUser?.role} {currentUser?.isAdmin && '(Admin)'}</p>
            <button onClick={handleLeave} style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'transparent', border: '1px solid var(--sold-color)', color: 'var(--sold-color)', width: 'auto' }}>
               Leave / Reset
            </button>
          </div>
        </div>

        {viewableRequests.length > 0 && (
          <div className="glass-panel" style={{ border: '1px solid var(--accent)', padding: '15px' }}>
            <h3 style={{ marginBottom: '10px', color: 'var(--accent)' }}>Pending Approvals ({viewableRequests.length})</h3>
            {viewableRequests.map(reqUser => (
              <div key={reqUser._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
                 <div>
                   <strong>{reqUser.username}</strong> wants to join as <strong>{reqUser.role}</strong>
                   {reqUser.teamId && (() => {
                      const tName = roomData.teams.find(t => t._id === reqUser.teamId)?.name;
                      return tName ? ` for ${tName}` : '';
                   })()}
                 </div>
                 <div style={{ display: 'flex', gap: '10px' }}>
                   <button onClick={() => handleApproval(reqUser._id, 'APPROVED')} style={{ background: 'var(--success-color)', padding: '8px 15px', width: 'auto' }}>Approve</button>
                   <button onClick={() => handleApproval(reqUser._id, 'REJECTED')} style={{ background: 'var(--sold-color)', padding: '8px 15px', width: 'auto' }}>Reject</button>
                 </div>
              </div>
            ))}
          </div>
        )}

        {errorMsg && <div style={{ padding: '15px', background: 'var(--sold-color)', borderRadius: '8px', fontWeight: 'bold', marginBottom: '15px' }}>{errorMsg}</div>}
        
        {pauseMessage ? (
          <div className="glass-panel player-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '160px' }}>
            <h1 className="player-name" style={{ color: 'var(--accent)', marginBottom: '20px' }}>{pauseMessage}</h1>
            <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px', overflowY: 'auto', maxHeight: '400px' }}>
              {roomData?.teams?.map(t => {
                const boughtPlayers = roomData?.soldPlayers?.filter(p => p.soldTo === t._id) || [];
                return (
                  <div key={t._id} style={{ background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '8px' }}>
                    <h3 style={{ color: 'var(--accent)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                      {t.name}
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)'}}>{formatMoney(t.budget)}</span>
                    </h3>
                    {boughtPlayers.slice(0, 3).map(p => (
                      <div key={p._id} style={{ fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span>{p.name}</span>
                        <span style={{ color: 'var(--success-color)' }}>{formatMoney(p.finalBid)}</span>
                      </div>
                    ))}
                    {boughtPlayers.length > 3 && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '5px' }}>
                        + {boughtPlayers.length - 3} more...
                      </div>
                    )}
                    {boughtPlayers.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No players yet</div>}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="glass-panel player-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {currentPlayer?.status === 'SOLD' && <div className="sold-stamp">SOLD</div>}
            {currentPlayer?.status === 'UNSOLD' && <div className="unsold-stamp">UNSOLD</div>}
            
            <h1 className="player-name">{currentPlayer?.name || 'Waiting for Auction to Start...'}</h1>
            {currentPlayer && <div className="player-role">{currentPlayer.role}</div>}
            
            {currentPlayer && (
              <div className="bid-container">
                <div>
                  <p>Base Price: {formatMoney(currentPlayer.basePrice)}</p>
                  <div style={{ marginTop: '10px' }}>
                    Current Bid:<br/>
                    <span style={{ color: 'var(--accent)', fontSize: '2.5rem', fontWeight: 'bold' }}>
                      {formatMoney(currentBid)}
                    </span>
                  </div>
                  {highestBidderTeam && <p style={{ color: 'var(--success-color)'}}>Highest Bidder: {highestBidderTeam.name}</p>}
                </div>
                
                <div className={`timer ${timer <= 10 ? 'warning' : ''}`} style={{ fontSize: '3.5rem', whiteSpace: 'nowrap' }}>
                  {timer > 0 ? `${timer}s` : '0s'}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="auction-actions">
          {currentUser?.role === 'Auctioneer' && (
             <>
                {!pauseMessage && !isPausing && (
                  <button onClick={handleOpenPlayerSelection}>
                     {currentPlayer ? 'Select Next Player' : 'Start Auction'}
                  </button>
                )}
                {currentPlayer && currentPlayer.status === 'UPCOMING' && !pauseMessage && (
                  isPausing ? (
                    <div className="pause-input-group">
                       <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>Pause until:</span>
                       <input 
                         type="time" 
                         value={pauseTime} 
                         onChange={e => setPauseTime(e.target.value)} 
                         style={{ flex: 2, height: '55px', borderRadius: '8px', border: '1px solid var(--accent)', background: 'var(--primary-bg)', color: 'white', fontSize: '1.2rem', textAlign: 'center', padding: '0 10px', boxSizing: 'border-box', margin: 0 }}
                       />
                       <button onClick={() => {
                          let msg = "Auction Paused";
                          if (pauseTime) {
                             const [h, m] = pauseTime.split(':');
                             const hours = parseInt(h, 10);
                             const suffix = hours >= 12 ? 'PM' : 'AM';
                             const displayHour = hours % 12 || 12;
                             msg = `Next round begins at ${displayHour}:${m} ${suffix}`;
                          }
                          socket?.emit('pause_auction', { roomId, role: currentUser.role, message: msg });
                          setIsPausing(false);
                          setPauseTime('');
                       }} style={{ background: 'var(--success-color)', flex: 1, height: '55px', fontSize: '1.2rem', fontWeight: 'bold', border: 'none', borderRadius: '8px', margin: 0 }}>
                         Confirm Pause
                       </button>
                       <button onClick={() => { 
                          setIsPausing(false); 
                          setPauseTime(''); 
                          socket?.emit('resume_timer_only', { roomId, role: currentUser.role });
                       }} style={{ background: 'var(--sold-color)', flex: 1, height: '55px', fontSize: '1.2rem', fontWeight: 'bold', border: 'none', borderRadius: '8px', margin: 0 }}>
                         Cancel
                       </button>
                    </div>
                  ) : (
                    <button onClick={() => {
                       setIsPausing(true);
                       socket?.emit('suspend_timer', { roomId, role: currentUser.role });
                    }} style={{ background: 'var(--secondary-bg)' }}>
                       Pause Menu
                    </button>
                  )
                )}
                {pauseMessage && (
                  <button onClick={() => socket?.emit('resume_auction', { roomId, role: currentUser.role })} style={{ background: 'var(--success-color)', fontSize: '1.2rem', padding: '15px', flex: 1 }}>
                     Resume Auction
                  </button>
                )}
                {currentPlayer && currentPlayer.status === 'UPCOMING' && !pauseMessage && !isPausing && (
                  <button onClick={handleForceSold} style={{ background: 'var(--sold-color)' }}>
                     Force SOLD
                  </button>
                )}
             </>
          )}

          {currentUser?.role === 'Pad Holder' && currentPlayer && currentPlayer.status === 'UPCOMING' && !pauseMessage && (
            <button 
              onClick={handlePlaceBid}
              style={{ background: 'var(--success-color)', fontSize: '1.2rem', padding: '15px', flex: 1 }}
            >
              RAISE BID
            </button>
          )}
        </div>
      </div>

      {/* Right Sidebar: Chat & Roster */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        <div className="glass-panel chat-panel" style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button 
              style={{ padding: '10px', background: chatTab === 'global' ? 'var(--accent)' : 'var(--secondary-bg)' }}
              onClick={() => setChatTab('global')}
            >Global Chat</button>
            {(currentUser?.role === 'Pad Holder' || currentUser?.role === 'Team Member') && teamId && (
              <button 
                style={{ padding: '10px', background: chatTab === 'team' ? 'var(--accent)' : 'var(--secondary-bg)' }}
                onClick={() => setChatTab('team')}
              >Team Sync</button>
            )}
          </div>
          
          <div className="chat-messages">
            {(chatTab === 'global' ? globalChat : teamChat).map((msg, idx) => (
               <div key={idx} className="chat-msg">
                 <span style={{ color: msg.isSystem ? 'var(--text-muted)' : 'var(--accent)'}}>
                   {msg.isSystem ? 'System' : msg.user?.username}: 
                 </span> {msg.message}
               </div>
            ))}
          </div>

          <form onSubmit={sendChat} style={{ display: 'flex', gap: '10px' }}>
             <input 
               type="text" 
               value={chatInput} 
               onChange={e => setChatInput(e.target.value)} 
               placeholder={chatTab === 'global' ? "Message everyone..." : "Message team privately..."}
               style={{ marginBottom: 0 }}
             />
             <button type="submit" style={{ width: 'auto' }}>Send</button>
          </form>
        </div>

        {/* Team Roster History */}
        <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
          <h3 style={{ color: 'var(--accent)', marginBottom: '15px' }}>Team Rosters</h3>
          {roomData?.teams?.map(t => {
            const boughtPlayers = roomData?.soldPlayers?.filter(p => p.soldTo === t._id) || [];
            if (boughtPlayers.length === 0) return null;
            return (
              <div key={t._id} style={{ marginBottom: '15px', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {t.name}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 'normal' }}>Budget: {formatMoney(t.budget)}</span>
                  </h4>
                  <button onClick={() => downloadTeamCSV(t, boughtPlayers)} style={{ padding: '6px 12px', fontSize: '0.8rem', width: 'auto', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)' }}>
                     📥 CSV
                  </button>
                </div>
                <ul style={{ listStyle: 'none', marginTop: '10px' }}>
                  {boughtPlayers.map(p => (
                    <li key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--glass-border)' }}>
                      <span>{p.name}</span>
                      <span style={{ color: 'var(--success-color)' }}>{formatMoney(p.finalBid)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {(!roomData?.soldPlayers || roomData.soldPlayers.length === 0) && (
            <p style={{ color: 'var(--text-muted)' }}>No players sold yet.</p>
          )}
        </div>

      </div>

      {/* Player Selection Modal */}
      {showPlayerModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, paddingTop: '10vh' }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <h2 style={{ color: 'var(--accent)', marginBottom: '15px' }}>Select Next Player</h2>
            <button onClick={() => setShowPlayerModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: '1px solid var(--sold-color)', color: 'var(--sold-color)', padding: '5px 10px', width: 'auto' }}>Close</button>
            
            <input 
              type="text" 
              placeholder="Search by name or role..." 
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              style={{ marginBottom: '15px', padding: '10px', width: '100%', borderRadius: '8px', border: '1px solid var(--accent)', background: 'var(--primary-bg)', color: 'white', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'grid', gap: '10px', overflowY: 'auto', paddingRight: '5px' }}>
              {allPlayers.filter(p => p.name.toLowerCase().includes(playerSearchQuery.toLowerCase()) || p.role.toLowerCase().includes(playerSearchQuery.toLowerCase())).map((p) => (
                 <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                    <div>
                       <strong style={{ fontSize: '1.2rem' }}>
                         {p.name} 
                         {p.status === 'UNSOLD' && <span style={{ color: 'var(--sold-color)', fontSize: '0.8rem', marginLeft: '10px', verticalAlign: 'middle', border: '1px solid var(--sold-color)', padding: '2px 5px', borderRadius: '4px' }}>UNSOLD</span>}
                       </strong>
                       <div style={{ color: 'var(--text-muted)' }}>{p.role}  •  Base: {formatMoney(p.basePrice)}</div>
                    </div>
                    <button onClick={() => {
                        socket?.emit('call_specific_player', { roomId, role: currentUser.role, playerId: p._id });
                        setShowPlayerModal(false);
                    }} style={{ width: 'auto', padding: '8px 20px', background: 'var(--success-color)', fontSize: '1rem', flexShrink: 0 }}>
                       Call
                    </button>
                 </div>
              ))}
              {allPlayers.filter(p => p.name.toLowerCase().includes(playerSearchQuery.toLowerCase()) || p.role.toLowerCase().includes(playerSearchQuery.toLowerCase())).length === 0 && (
                 <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No players match your search!</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AuctionRoom;
