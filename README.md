<div align="center">

# 🏏 Virtual IPL Auction

**A real-time, multiplayer IPL auction simulator — bid live, build your squad, dominate the season.**

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://reactjs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?logo=socketdotio)](https://socket.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)](https://mongoosejs.com)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)

</div>

---

## 📖 Overview

**Virtual IPL Auction** is a full-stack, real-time web application that lets groups of friends, colleagues, or cricket fans run their own IPL-style player auction — live, from anywhere. A host creates a room, team owners join, and the Auctioneer calls players one by one while everyone bids in real time.

Choose from **two distinct auction modes**:
- 🟢 **Recent IPL Auction** — Current & active IPL player pool
- 🌟 **Legendary IPL Auction** — All-time IPL players (including legends & retired stars)

---

## ✨ Feature Highlights

| Feature | Description |
|---|---|
| 🔴 **Real-Time Bidding** | Live bids sync instantly across all connected users via WebSockets |
| 🎭 **Role-Based Access** | Auctioneer, Pad Holder (Team Owner), and Team Member roles |
| 🕹️ **Auctioneer Controls** | Call players, pause with a custom message, force sell, manage the roster |
| ♻️ **Unsold Player Recall** | Unsold players remain available and can be called again in future rounds |
| ⏱️ **Smart Timer** | 30s countdown with auto-extend on bids (+5s) and auto-sell on expiry |
| 📊 **Live Team Rosters** | All teams' rosters visible to everyone in real time |
| 📥 **CSV Export** | Download any team's full player roster as a `.csv` file |
| 🔐 **Auth** | Google OAuth or Guest Mode — no forced signups |
| 🔗 **Room Sharing** | Share a direct join link or room code with anyone |
| 📱 **Mobile Responsive** | Fully optimized for phone screens |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                     │
│                                                             │
│   ┌─────────────┐         ┌──────────────────────────────┐  │
│   │  Login.jsx  │         │       AuctionRoom.jsx        │  │
│   │─────────────│         │──────────────────────────────│  │
│   │ Auth (Guest │         │  Player Card + Stamp         │  │
│   │ / Google)   │         │  Live Bid Display + Timer    │  │
│   │ Room Create │──HTTP──▶│  Auctioneer Controls Panel   │  │
│   │ Room Join   │         │  Team Rosters + Chat         │  │
│   └─────────────┘         │  CSV Download                │  │
│                           └──────────┬───────────────────┘  │
└──────────────────────────────────────┼──────────────────────┘
                                       │ WebSocket (Socket.io)
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│                         SERVER (Node.js)                    │
│                                                             │
│   ┌─────────────┐    ┌──────────────┐    ┌──────────────┐  │
│   │  server.js  │    │  routes.js   │    │socketManager │  │
│   │─────────────│    │──────────────│    │──────────────│  │
│   │ Express App │    │ REST API     │    │ Game Events  │  │
│   │ Socket Init │    │ Room Create  │    │ Timer Logic  │  │
│   │ MongoDB Conn│    │ Room Join    │    │ Bid Handling │  │
│   └─────────────┘    │ Player Fetch │    │ Sell / Unsold│  │
│                      │ Google Auth  │    └──────────────┘  │
│                      └──────────────┘                       │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │              MongoDB (In-Memory or Atlas)           │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │  │
│   │  │   User   │  │   Team   │  │      Player      │  │  │
│   │  │──────────│  │──────────│  │──────────────────│  │  │
│   │  │ username │  │  name    │  │  name, role      │  │  │
│   │  │ role     │  │  budget  │  │  basePrice       │  │  │
│   │  │ googleId │  │  roomId  │  │  status          │  │  │
│   │  └──────────┘  └──────────┘  │  roomId          │  │  │
│   │                              │  soldTo, finalBid │  │  │
│   │               ┌──────────┐   └──────────────────┘  │  │
│   │               │   Room   │                          │  │
│   │               │──────────│                          │  │
│   │               │ roomId   │                          │  │
│   │               │ auctMode │                          │  │
│   │               │ status   │                          │  │
│   │               │ timer    │                          │  │
│   │               └──────────┘                          │  │
│   └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Auction Flow

```
Host Creates Room
      │
      ▼
  Select Mode
  ┌──────────────┐    ┌────────────────────────┐
  │ Recent IPL   │    │   Legendary IPL        │
  │ (Current     │    │   (All-Time Players    │
  │  Pool)       │    │   Base: 1 Cr)          │
  └──────┬───────┘    └────────────┬───────────┘
         └───────────┬─────────────┘
                     ▼
         Players Seeded into DB (by roomId)
                     │
                     ▼
         Teams Join with Roles
         ┌───────────┬────────────────┐
         │Pad Holder │  Team Member   │
         │(bids on   │  (watches,     │
         │ behalf of │   chats)       │
         │ their team│                │
         └─────┬─────┴────────────────┘
               │
               ▼ Auctioneer Calls Next Player
         ┌─────────────────────┐
         │  30s Timer Starts   │  ◀──── Bid placed → +5s
         └─────────┬───────────┘
                   │
         ┌─────────▼──────────┐
         │  Timer Reaches 0   │
         │  or Force Sold     │
         └────────┬───────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
  Has Highest Bidder?   No Bidder?
        │                    │
        ▼                    ▼
   SOLD ✅              UNSOLD ❌
   Team Budget             Player stays
   Deducted                available to
   Player on Roster        be recalled
```

---

## 🛠️ Tech Stack

### Backend
| Package | Purpose |
|---|---|
| **Express.js 5** | REST API Server |
| **Socket.IO 4** | Real-time bidding & game events |
| **Mongoose 9** | MongoDB ODM for schema management |
| **mongodb-memory-server** | Zero-config in-memory DB for dev |
| **google-auth-library** | Server-side Google OAuth token verification |
| **dotenv** | Environment variable management |

### Frontend
| Package | Purpose |
|---|---|
| **React 18** | UI Component Framework |
| **Vite 6** | Lightning-fast dev server & bundler |
| **Socket.IO Client** | WebSocket connection to backend |
| **Axios** | HTTP requests to REST API |
| **react-router-dom** | Client-side routing |
| **@react-oauth/google** | Google One-Tap login button |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18+ installed
- **npm** v9+ installed
- A Google OAuth Client ID (optional, for Google sign-in)

### 1. Clone the repository
```bash
git clone https://github.com/your-username/virtual-ipl-auction.git
cd virtual-ipl-auction
```

### 2. Set up the Backend
```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:
```env
# Optional: Connect to a real MongoDB instance. 
# If omitted, an in-memory DB is used automatically (great for dev!).
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/ipl

# Optional: Enable Google OAuth login
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

Start the backend server:
```bash
node server.js
```
> Server starts on **http://localhost:5001**

### 3. Set up the Frontend
```bash
cd ../frontend
npm install
npm run dev
```
> Frontend starts on **http://localhost:5173**

---

## 📁 Project Structure

```
IPL/
├── backend/
│   ├── data/
│   │   ├── recent_players.json      # Recent IPL player dataset
│   │   └── all_players_ipl.json     # Legendary IPL player dataset
│   ├── db.js                        # Mongoose schemas: User, Team, Player, Room
│   ├── routes.js                    # REST API routes (create/join room, players, auth)
│   ├── server.js                    # App entry point: Express + Socket.IO init
│   ├── socketManager.js             # All real-time game logic (bids, timer, sell)
│   └── package.json
│
└── frontend/
    └── src/
        ├── components/
        │   ├── Login.jsx            # Auth, room create/join, mode selection
        │   └── AuctionRoom.jsx      # Main auction game UI
        ├── index.css                # Global styles, animations, responsive breakpoints
        ├── App.jsx                  # Router setup
        └── main.jsx                 # React app entry
```

---

## 🔌 API Reference

### REST Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/create-room` | Create new auction room, seed players |
| `POST` | `/api/join-room` | Request to join an existing room |
| `GET` | `/api/room/:roomId` | Fetch room state (teams, players sold, etc.) |
| `GET` | `/api/players?roomId=` | Get all available players for a room |
| `POST` | `/api/auth/google` | Verify Google OAuth token |
| `POST` | `/api/approve/:roomId/:userId` | Approve/reject a join request |

### Socket.IO Events

| Event | Direction | Description |
|---|---|---|
| `join_room` | Client → Server | Join a room |
| `next_player` | Client → Server | Auctioneer calls the next player |
| `call_specific_player` | Client → Server | Auctioneer selects a specific player |
| `place_bid` | Client → Server | Team Pad Holder places a bid |
| `pause_auction` | Client → Server | Auctioneer pauses with a message |
| `resume_auction` | Client → Server | Auctioneer resumes |
| `auctioneer_sell_player` | Client → Server | Auctioneer force-sells |
| `new_player` | Server → Client | Broadcast new player to all users |
| `bid_update` | Server → Client | Broadcast new bid |
| `player_sold` | Server → Client | Broadcast sale result |
| `player_unsold` | Server → Client | Broadcast unsold result |
| `timer_tick` | Server → Client | Countdown tick (every 1s) |

---

## 🎭 Roles Explained

| Role | Permissions |
|---|---|
| **Auctioneer** | Calls players, pauses, resumes, force-sells, manages the entire auction flow |
| **Pad Holder** | Raises bids on behalf of their assigned IPL team |
| **Team Member** | Read-only view — watches bids, chats, sees rosters |

> One person can be both the room Admin and the Auctioneer. The Admin also handles join request approvals.

---

## 🌐 Auction Modes

### 🟢 Recent IPL Auction
- Dataset: `recent_players.json`
- Players from the latest IPL auction cycles
- Default base price: **₹2 Crore**

### 🌟 Legendary IPL Auction  
- Dataset: `all_players_ipl.json`
- All players who have ever featured in the IPL — including legends like MS Dhoni, Sachin Tendulkar, AB de Villiers
- Default base price: **₹1 Crore**

---

## 📱 Mobile Support

The app is fully responsive and designed to work on Android and iOS devices:
- Glassmorphism UI scales cleanly to small screens
- Custom dropdown menus (no native OS-style popups)
- Auction stamps (`SOLD` / `UNSOLD`) resize dynamically
- All action buttons stack vertically on narrow viewports

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **ISC License**.

---

<div align="center">

Made with ❤️ for cricket fans everywhere

**⭐ Star this repo if you enjoyed it!**

</div>
