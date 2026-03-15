const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Google Drive API helper (for public files)
async function getGoogleDriveVideoInfo(fileId) {
  try {
    // For public files, we can just return the embed URL
    return {
      embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      directUrl: `https://drive.google.com/uc?export=download&id=${fileId}`
    };
  } catch (error) {
    console.error('Google Drive error:', error);
    return null;
  }
}

// YouTube helper
function extractYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Global party state
const party = {
  platform: 'youtube', // 'youtube', 'googledrive', 'netflix', 'prime', etc.
  videoId: 'dQw4w9WgXcQ', // platform-specific ID
  currentTime: 0,
  isPlaying: false,
  lastUpdateTime: Date.now(),
  users: new Map(), // socketId -> { name, lastPing }
  embedUrl: null, // For platforms that need full embed URL
};

// Helper to generate random names
function generateName() {
  const adjectives = ['Happy', 'Sleepy', 'Grumpy', 'Sneezy', 'Bashful', 'Dopey', 'Doc', 'Cool', 'Smart', 'Funny'];
  const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Wolf', 'Bear', 'Cat', 'Dog', 'Lion'];
  return adjectives[Math.floor(Math.random() * adjectives.length)] +
         nouns[Math.floor(Math.random() * nouns.length)] +
         Math.floor(Math.random() * 100);
}

// Get current video time accounting for playback
function getCurrentVideoTime() {
  if (!party.isPlaying) return party.currentTime;
  const elapsed = (Date.now() - party.lastUpdateTime) / 1000;
  return party.currentTime + elapsed;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userName, callback) => {
    const name = userName.trim() || generateName();
    party.users.set(socket.id, { name, lastPing: Date.now() });

    socket.emit('init', {
      platform: party.platform,
      videoId: party.videoId,
      embedUrl: party.embedUrl,
      currentTime: getCurrentVideoTime(),
      isPlaying: party.isPlaying,
      users: Array.from(party.users.values()).map(u => u.name)
    });

    io.emit('users', Array.from(party.users.values()).map(u => u.name));
    socket.broadcast.emit('chat', { user: 'System', message: `${name} joined`, system: true });

    callback({ success: true, name });
  });

  // Handle platform/video changes
  socket.on('changeSource', async (data) => {
    const { platform, url } = data;
    
    try {
      let videoId = null;
      let embedUrl = null;
      
      if (platform === 'youtube') {
        videoId = extractYouTubeId(url) || url;
        if (!videoId) throw new Error('Invalid YouTube URL');
        party.platform = 'youtube';
        party.videoId = videoId;
        party.embedUrl = null;
      }
      else if (platform === 'googledrive') {
        // Extract file ID from Google Drive URL
        const fileIdMatch = url.match(/[-\w]{25,}/);
        if (!fileIdMatch) throw new Error('Invalid Google Drive URL');
        videoId = fileIdMatch[0];
        const driveInfo = await getGoogleDriveVideoInfo(videoId);
        party.platform = 'googledrive';
        party.videoId = videoId;
        party.embedUrl = driveInfo.embedUrl;
      }
      else if (platform === 'netflix' || platform === 'prime' || platform === 'disney') {
        // For premium platforms, we'll use a proxy/embed approach
        // Note: This is simplified - real implementation would need proper authentication
        party.platform = platform;
        party.videoId = url; // Store the original URL
        party.embedUrl = url; // For iframe embedding (may not work due to CORS)
      }
      
      party.currentTime = 0;
      party.isPlaying = false;
      party.lastUpdateTime = Date.now();
      
      io.emit('sourceChanged', {
        platform: party.platform,
        videoId: party.videoId,
        embedUrl: party.embedUrl
      });
      
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Video control events
  socket.on('play', (time) => {
    party.isPlaying = true;
    party.currentTime = time;
    party.lastUpdateTime = Date.now();
    socket.broadcast.emit('play', time);
  });

  socket.on('pause', (time) => {
    party.isPlaying = false;
    party.currentTime = time;
    party.lastUpdateTime = Date.now();
    socket.broadcast.emit('pause', time);
  });

  socket.on('seek', (time) => {
    party.currentTime = time;
    party.lastUpdateTime = Date.now();
    socket.broadcast.emit('seek', time);
  });

  socket.on('chat', (msg) => {
    const user = party.users.get(socket.id);
    if (user) {
      io.emit('chat', { user: user.name, message: msg, system: false });
    }
  });

  socket.on('ping', () => {
    const user = party.users.get(socket.id);
    if (user) {
      user.lastPing = Date.now();
    }
  });

  socket.on('disconnect', () => {
    const user = party.users.get(socket.id);
    if (user) {
      party.users.delete(socket.id);
      io.emit('users', Array.from(party.users.values()).map(u => u.name));
      io.emit('chat', { user: 'System', message: `${user.name} left`, system: true });
    }
    console.log('User disconnected:', socket.id);
  });
});

// Periodic sync
setInterval(() => {
  if (party.users.size > 0) {
    io.emit('sync', {
      currentTime: getCurrentVideoTime(),
      isPlaying: party.isPlaying
    });
  }
}, 2000);

// Cleanup inactive users
setInterval(() => {
  const now = Date.now();
  for (let [id, user] of party.users.entries()) {
    if (now - user.lastPing > 60000) {
      party.users.delete(id);
      io.emit('users', Array.from(party.users.values()).map(u => u.name));
      io.emit('chat', { user: 'System', message: `${user.name} timed out`, system: true });
    }
  }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});