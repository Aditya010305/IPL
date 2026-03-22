import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import axios from 'axios';

const API_URL = 'http://localhost:5001/api';
const IPL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'GT', 'RR', 'SRH', 'DC', 'PBKS', 'LSG'];

const Login = () => {
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const inviteCode = searchParams.get('join');

  const [isCreating, setIsCreating] = useState(false);
  const [role, setRole] = useState('Team Member');
  const [adminRole, setAdminRole] = useState('Auctioneer'); // For Admin Room Creation
  const [auctionMode, setAuctionMode] = useState('Recent'); // Dual Auction Mode
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState(inviteCode || '');
  const [teamName, setTeamName] = useState(IPL_TEAMS[0]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const savedAuth = JSON.parse(localStorage.getItem('authData')) || null;
  const [authStep, setAuthStep] = useState(savedAuth === null);
  const [authType, setAuthType] = useState(savedAuth?.authType || 'GUEST');
  const [googleData, setGoogleData] = useState(savedAuth?.googleData || null);
  const [username, setUsername] = useState(savedAuth?.username || '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');

    try {
      if (isCreating) {
        const { data } = await axios.post(`${API_URL}/create-room`, {
          name: roomName,
          adminUsername: username,
          adminRole,
          auctionMode,
          teamName: adminRole === 'Pad Holder' ? teamName : null,
          authType,
          email: googleData?.email,
          googleId: googleData?.googleId,
          picture: googleData?.picture
        });
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.teamId) {
          localStorage.setItem('teamId', data.teamId);
        }
        navigate(`/room/${data.room.roomId}`);
      } else {
        const { data } = await axios.post(`${API_URL}/join-room`, {
          roomId: roomId.toUpperCase(),
          username,
          role,
          teamName: (role === 'Team Member' || role === 'Pad Holder') ? teamName : null,
          authType,
          email: googleData?.email,
          googleId: googleData?.googleId,
          picture: googleData?.picture
        });
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.teamId) {
          localStorage.setItem('teamId', data.teamId);
        }

        if (data.user.approvalStatus === 'PENDING') {
          setMsg(data.message || 'Request submitted! Waiting for approval.');
          setTimeout(() => {
            navigate(`/room/${data.room.roomId}`);
          }, 2000);
        } else {
          navigate(`/room/${data.room.roomId}`);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    }
  };

  return (
    <div className="auth-container">
      <div className="glass-panel auth-box">
        <h1 className="auth-title">VIRTUAL IPL AUCTION</h1>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button
            style={{ background: !isCreating ? 'var(--secondary-bg)' : 'var(--accent)', flex: 1 }}
            onClick={() => setIsCreating(true)}
            type="button"
          >
            Create Room
          </button>
          <button
            style={{ background: isCreating ? 'var(--secondary-bg)' : 'var(--accent)', flex: 1 }}
            onClick={() => setIsCreating(false)}
            type="button"
          >
            Join Room
          </button>
        </div>

        {error && <div style={{ color: 'var(--sold-color)', marginBottom: '15px', fontWeight: 'bold' }}>{error}</div>}
        {msg && <div style={{ color: 'var(--success-color)', marginBottom: '15px', fontWeight: 'bold' }}>{msg}</div>}

        {authStep ? (
          <div>
            <input
              type="text"
              placeholder="Enter your name (Guest Mode)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ marginBottom: '10px' }}
            />
            <button onClick={() => {
              if (!username.trim()) return setError("Please enter a name to continue as Guest.");
              setError('');
              setAuthType('GUEST');
              setAuthStep(false);
              localStorage.setItem('authData', JSON.stringify({ username, authType: 'GUEST', googleData: null }));
            }} style={{ background: 'var(--secondary-bg)', color: 'var(--text-color)' }}>
              Continue as Guest
            </button>

            <div style={{ display: 'flex', alignItems: 'center', margin: '25px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
              <div style={{ margin: '0 10px', color: 'var(--text-muted)' }}>OR</div>
              <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  try {
                    const res = await axios.post(`${API_URL}/auth/google`, { token: credentialResponse.credential });
                    setUsername(res.data.username);
                    setAuthType('GOOGLE');
                    setGoogleData(res.data);
                    setAuthStep(false);
                    setError('');
                    localStorage.setItem('authData', JSON.stringify({ username: res.data.username, authType: 'GOOGLE', googleData: res.data }));
                  } catch (err) {
                    setError("Google Auth Failed on Backend Check");
                  }
                }}
                onError={() => setError("Google Login Failed")}
                theme="filled_black"
              />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="login-identity-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', overflow: 'hidden' }}>
                {googleData?.picture && (
                  <img
                    src={googleData.picture}
                    alt="Avatar"
                    referrerPolicy="no-referrer"
                    style={{ width: '45px', height: '45px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                )}
                <div style={{
                  display: googleData?.picture ? 'none' : 'flex',
                  width: '45px', height: '45px', borderRadius: '50%',
                  background: `hsl(${username.length * 60 % 360}, 70%, 50%)`,
                  color: 'white', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 'bold', fontSize: '1.4rem', textTransform: 'uppercase',
                  flexShrink: 0
                }}>
                  {username ? username.charAt(0) : '?'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{username}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>{authType}</span>
                </div>
              </div>
              <button type="button" onClick={() => {
                setAuthStep(true);
                localStorage.removeItem('authData');
                setUsername('');
              }} style={{ padding: '8px 15px', width: 'auto', background: 'var(--secondary-bg)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', flexShrink: 0 }}>
                Change
              </button>
            </div>

            {isCreating ? (
              <>
                <input
                  type="text"
                  placeholder="Auction Room Name"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  required
                />
                <select value={adminRole} onChange={(e) => setAdminRole(e.target.value)}>
                  <option value="Auctioneer">Auctioneer (Host)</option>
                  <option value="Pad Holder">Pad Holder (Team Owner)</option>
                </select>
                <select value={auctionMode} onChange={(e) => setAuctionMode(e.target.value)}>
                  <option value="Recent">Recent IPL Auction</option>
                  <option value="Legendary">Legendary IPL Auction</option>
                </select>
                {adminRole === 'Pad Holder' && (
                  <select value={teamName} onChange={(e) => setTeamName(e.target.value)}>
                    {IPL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Room Code (e.g. A1B2C3)"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  required
                />
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="Team Member">Team Member</option>
                  <option value="Pad Holder">Pad Holder (Team Owner)</option>
                  <option value="Auctioneer">Auctioneer</option>
                </select>

                {(role === 'Team Member' || role === 'Pad Holder') && (
                  <select value={teamName} onChange={(e) => setTeamName(e.target.value)}>
                    {IPL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </>
            )}

            <button type="submit" style={{ marginTop: '10px' }}>
              {isCreating ? 'Create Auction & Join' : 'Request to Join Room'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
