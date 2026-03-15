const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const mime = require('mime-types');
const rangeParser = require('range-parser');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Video proxy endpoint with range support (for seeking)
app.get('/proxy', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send('Missing url parameter');

  try {
    // First, make a HEAD request to get file size and content type
    const headResponse = await axios({
      method: 'head',
      url: videoUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    }).catch(() => null); // Some servers don't support HEAD

    const totalSize = headResponse ? parseInt(headResponse.headers['content-length'] || '0') : 0;
    const contentType = headResponse?.headers['content-type'] || mime.lookup(videoUrl) || 'video/mp4';

    // Handle range request (for seeking)
    const range = req.headers.range;
    if (range && totalSize > 0) {
      const positions = rangeParser(totalSize, range);
      if (positions === -1 || positions === -2) {
        res.status(416).set('Content-Range', `bytes */${totalSize}`).end();
        return;
      }
      const start = positions[0].start;
      const end = positions[0].end;
      const chunkSize = end - start + 1;

      res.status(206);
      res.set({
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });

      // Stream the chunk
      const response = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream',
        headers: {
          Range: `bytes=${start}-${end}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      response.data.pipe(res);
    } else {
      // No range, stream whole file
      res.set({
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType
      });
      if (totalSize) res.set('Content-Length', totalSize);

      const response = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      response.data.pipe(res);
    }
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).send('Could not fetch video');
  }
});

// Helper: extract YouTube video ID
function extractYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Helper: get Google Drive file ID and generate direct download URL
function getGoogleDriveDirectUrl(url) {
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return null;
}

// Global party state
const party = {
  sourceType: 'youtube', // 'youtube' or 'direct'
  videoId: 'dQw4w9WgXcQ', // YouTube ID or proxied URL
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
      videoId: party.videoId,
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
      let videoId = url.trim();

      // Check YouTube
      const youtubeId = extractYouTubeId(url);
      if (youtubeId) {
        sourceType = 'youtube';
        videoId = youtubeId;
      }
      // Check Google Drive
      else if (url.includes('drive.google.com')) {
        const directUrl = getGoogleDriveDirectUrl(url);
        if (directUrl) {
          // Proxy the Google Drive direct link to avoid CORS
          sourceType = 'direct';
          videoId = `/proxy?url=${encodeURIComponent(directUrl)}`;
        } else {
          throw new Error('Could not extract Google Drive file ID');
        }
      }
      // For any other URL, we proxy it
      else {
        sourceType = 'direct';
        videoId = `/proxy?url=${encodeURIComponent(url)}`;
      }

      party.sourceType = sourceType;
      party.videoId = videoId;
      party.currentTime = 0;
      party.isPlaying = false;
      party.lastUpdateTime = Date.now();

      io.emit('sourceChanged', {
        sourceType: party.sourceType,
        videoId: party.videoId
      });

      callback({ success: true, sourceType, videoId });
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