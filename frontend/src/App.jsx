import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Login from './components/Login';
import AuctionRoom from './components/AuctionRoom';

const GOOGLE_CLIENT_ID = '296147393077-5nmfp3ji3h7riau8i6frs8cch06he95t.apps.googleusercontent.com';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/room/:roomId" element={<AuctionRoom />} />
        </Routes>
      </Router>
    </GoogleOAuthProvider>
  );
}

export default App;
