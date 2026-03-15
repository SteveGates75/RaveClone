const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const mime = require('mime-types');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Google Drive API setup
const drive = google.drive({ version: 'v3', auth: process.env.GOOGLE_API_KEY });

function extractYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function extractGoogleDriveId(url) {
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

app.get('/proxy', async (req, res) => {
  const videoUrl = req.query.url;
  const driveFileId = req.query.driveId;
  if (!videoUrl && !driveFileId) return res.status(400).send('Missing url or driveId parameter');

  try {
    let actualUrl = videoUrl;
    let fileSize = null;
    let contentType = null;

    if (driveFileId) {
      try {
        const file = await drive.files.get({
          fileId: driveFileId,
          fields: 'size, mimeType, webContentLink',
        });
        fileSize = parseInt(file.data.size);
        contentType = file.data.mimeType;
        actualUrl = file.data.webContentLink;
      } catch (err) {
        console.error('Google Drive API error:', err.message);
        return res.status(500).send('Google Drive error: ' + err.message);
      }
    } else {
      try {
        const head = await axios.head(actualUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 5000,
        });
        fileSize = parseInt(head.headers['content-length'] || '0');
        contentType = head.headers['content-type'] || mime.lookup(actualUrl) || 'video/mp4';
      } catch {
        // proceed without size
      }
    }

    // Force correct MIME for MKV
    if (actualUrl.toLowerCase().includes('.mkv')) {
      contentType = 'video/x-matroska';
    }

    const range = req.headers.range;
    if (range && fileSize) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      const response = await axios({
        method: 'get',
        url: actualUrl,
        responseType: 'stream',
        headers: {
          Range: `bytes=${start}-${end}`,
          'User-Agent': 'Mozilla/5.0',
        },
        timeout: 30000,
      });
      response.data.pipe(res);
    } else {
      if (fileSize) res.setHeader('Content-Length', fileSize);
      res.setHeader('Content-Type', contentType || 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');

      const response = await axios({
        method: 'get',
        url: actualUrl,
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
      });
      response.data.pipe(res);
    }
  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).send('Proxy error: ' + error.message);
  }
});

// Global party state
const party = {
  sourceType: 'youtube',
  videoId: 'dQw4w9WgXcQ',
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

      const youtubeId = extractYouTubeId(url);
      if (youtubeId) {
        sourceType = 'youtube';
        videoId = youtubeId;
      }
      else if (url.includes('drive.google.com')) {
        const fileId = extractGoogleDriveId(url);
        if (fileId) {
          sourceType = 'direct';
          videoId = `/proxy?driveId=${fileId}`;
        } else {
          throw new Error('Could not extract Google Drive file ID');
        }
      }
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