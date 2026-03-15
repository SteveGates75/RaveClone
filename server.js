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

function extractYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

async function getGoogleDriveDirectLink(url) {
  try {
    let fileId = null;
    const patterns = [
      /\/d\/([a-zA-Z0-9_-]+)/,
      /id=([a-zA-Z0-9_-]+)/,
      /\/file\/d\/([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        fileId = match[1];
        break;
      }
    }
    if (!fileId) throw new Error('Could not extract Google Drive file ID');

    // Use the direct view link – this returns the video with correct MIME type
    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    
    return {
      success: true,
      directUrl: directUrl,
      fileId: fileId
    };
  } catch (error) {
    console.error('Google Drive error:', error);
    return { success: false, error: error.message };
  }
}

const party = {
  sourceType: 'youtube',
  videoUrl: 'dQw4w9WgXcQ',
  currentTime: 0,
  isPlaying: false,
  lastUpdateTime: Date.now(),
  users: new Map(),
};

function generateName() {
  const adjectives = ['Happy', 'Sleepy', 'Grumpy', 'Sneezy', 'Bashful', 'Dopey', 'Doc', 'Cool', 'Smart', 'Funny'];
  const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Wolf', 'Bear', 'Cat', 'Dog', 'Lion'];
  return adjectives[Math.floor(Math.random() * adjectives.length)] +
         nouns[Math.floor(Math.random() * nouns.length)] +
         Math.floor(Math.random() * 100);
}

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
      sourceType: party.sourceType,
      videoUrl: party.videoUrl,
      currentTime: getCurrentVideoTime(),
      isPlaying: party.isPlaying,
      users: Array.from(party.users.values()).map(u => u.name)
    });

    io.emit('users', Array.from(party.users.values()).map(u => u.name));
    socket.broadcast.emit('chat', { user: 'System', message: `${name} joined`, system: true });

    callback({ success: true, name });
  });

  socket.on('loadVideo', async (url, callback) => {
    try {
      let sourceType = 'direct';
      let videoUrl = url.trim();

      const youtubeId = extractYouTubeId(url);
      if (youtubeId) {
        sourceType = 'youtube';
        videoUrl = youtubeId;
      }
      else if (url.includes('drive.google.com')) {
        const driveInfo = await getGoogleDriveDirectLink(url);
        if (driveInfo.success) {
          sourceType = 'googledrive';
          videoUrl = driveInfo.directUrl;
        } else {
          throw new Error(driveInfo.error);
        }
      }

      party.sourceType = sourceType;
      party.videoUrl = videoUrl;
      party.currentTime = 0;
      party.isPlaying = false;
      party.lastUpdateTime = Date.now();

      io.emit('sourceChanged', {
        sourceType: party.sourceType,
        videoUrl: party.videoUrl
      });

      callback({ success: true, sourceType, videoUrl });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

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

setInterval(() => {
  if (party.users.size > 0) {
    io.emit('sync', {
      currentTime: getCurrentVideoTime(),
      isPlaying: party.isPlaying
    });
  }
}, 2000);

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