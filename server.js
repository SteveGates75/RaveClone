const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Global room state (single room for all users)
const globalRoom = {
  videoId: 'dQw4w9WgXcQ', // default Rick Roll
  currentTime: 0,
  isPlaying: false,
  users: new Map() // socketId -> userName
};

function generateUserName() {
  const adjectives = ['Happy', 'Sleepy', 'Grumpy', 'Sneezy', 'Bashful', 'Dopey', 'Doc', 'Cool', 'Smart', 'Funny'];
  const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Wolf', 'Bear', 'Cat', 'Dog', 'Lion'];
  return adjectives[Math.floor(Math.random() * adjectives.length)] + 
         nouns[Math.floor(Math.random() * nouns.length)] +
         Math.floor(Math.random() * 100);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // When a user joins, they send their chosen name (or we generate one)
  socket.on('join-global', (userName, callback) => {
    const finalName = userName || generateUserName();
    globalRoom.users.set(socket.id, finalName);
    socket.userName = finalName;

    // Send current room state to the new user
    socket.emit('room-state', {
      videoId: globalRoom.videoId,
      currentTime: globalRoom.currentTime,
      isPlaying: globalRoom.isPlaying,
      users: Array.from(globalRoom.users.values())
    });

    // Broadcast updated user list to everyone
    io.emit('user-list', Array.from(globalRoom.users.values()));

    // Notify others that a new user joined
    socket.broadcast.emit('chat-message', {
      user: 'System',
      message: `${finalName} joined the party.`,
      system: true
    });

    callback({ success: true });
  });

  // Handle video control events
  socket.on('play', (data) => {
    globalRoom.isPlaying = true;
    globalRoom.currentTime = data.currentTime;
    socket.broadcast.emit('play', { currentTime: data.currentTime });
  });

  socket.on('pause', (data) => {
    globalRoom.isPlaying = false;
    globalRoom.currentTime = data.currentTime;
    socket.broadcast.emit('pause', { currentTime: data.currentTime });
  });

  socket.on('seek', (data) => {
    globalRoom.currentTime = data.currentTime;
    socket.broadcast.emit('seek', { currentTime: data.currentTime });
  });

  socket.on('change-video', (data) => {
    globalRoom.videoId = data.videoId;
    globalRoom.currentTime = 0;
    globalRoom.isPlaying = false;
    io.emit('video-changed', { videoId: data.videoId });
  });

  socket.on('chat-message', (message) => {
    const userName = globalRoom.users.get(socket.id) || 'Unknown';
    io.emit('chat-message', {
      user: userName,
      message,
      system: false
    });
  });

  socket.on('disconnect', () => {
    const userName = globalRoom.users.get(socket.id);
    if (userName) {
      globalRoom.users.delete(socket.id);
      io.emit('user-list', Array.from(globalRoom.users.values()));
      io.emit('chat-message', {
        user: 'System',
        message: `${userName} left the party.`,
        system: true
      });
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});