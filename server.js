const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Store rooms
const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateUserName() {
  const adjectives = ['Happy', 'Sleepy', 'Grumpy', 'Sneezy', 'Bashful', 'Dopey', 'Doc', 'Cool', 'Smart', 'Funny'];
  const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Wolf', 'Bear', 'Cat', 'Dog', 'Lion'];
  return adjectives[Math.floor(Math.random() * adjectives.length)] + 
         nouns[Math.floor(Math.random() * nouns.length)] +
         Math.floor(Math.random() * 100);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new room
  socket.on('create-room', (callback) => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      videoId: 'dQw4w9WgXcQ',
      currentTime: 0,
      isPlaying: false,
      users: new Set(),
      userNames: new Map()
    });
    socket.join(roomId);
    const room = rooms.get(roomId);
    room.users.add(socket.id);
    const userName = generateUserName();
    room.userNames.set(socket.id, userName);
    socket.roomId = roomId;
    socket.userName = userName;

    console.log(`✅ Room created: ${roomId} by ${socket.id}`);
    console.log('Current rooms:', Array.from(rooms.keys()));
    callback({ roomId, videoId: room.videoId });
  });

  // Join an existing room
  socket.on('join-room', ({ roomId, requestedUserName }, callback) => {
    roomId = roomId.trim().toUpperCase();
    console.log(`🔍 Attempt to join room: ${roomId} by ${socket.id}`);
    console.log('Available rooms:', Array.from(rooms.keys()));

    const room = rooms.get(roomId);
    if (!room) {
      console.log(`❌ Room not found: ${roomId}`);
      callback({ error: 'Room not found' });
      return;
    }

    socket.join(roomId);
    room.users.add(socket.id);
    const userName = requestedUserName || generateUserName();
    room.userNames.set(socket.id, userName);
    socket.roomId = roomId;
    socket.userName = userName;

    // Send current room state to the new user
    socket.emit('room-state', {
      videoId: room.videoId,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      users: Array.from(room.userNames.values())
    });

    // Broadcast updated user list
    io.to(roomId).emit('user-list', Array.from(room.userNames.values()));

    // Notify others
    socket.to(roomId).emit('chat-message', {
      user: 'System',
      message: `${userName} joined the room.`,
      system: true
    });

    console.log(`✅ User ${socket.id} joined room ${roomId} as ${userName}`);
    callback({ success: true, videoId: room.videoId });
  });

  // Video control events (unchanged)
  socket.on('play', (data) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    room.isPlaying = true;
    room.currentTime = data.currentTime;
    socket.to(roomId).emit('play', { currentTime: data.currentTime });
  });

  socket.on('pause', (data) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    room.isPlaying = false;
    room.currentTime = data.currentTime;
    socket.to(roomId).emit('pause', { currentTime: data.currentTime });
  });

  socket.on('seek', (data) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    room.currentTime = data.currentTime;
    socket.to(roomId).emit('seek', { currentTime: data.currentTime });
  });

  socket.on('change-video', (data) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    room.videoId = data.videoId;
    room.currentTime = 0;
    room.isPlaying = false;
    io.to(roomId).emit('video-changed', { videoId: data.videoId });
  });

  socket.on('chat-message', (message) => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    if (!room) return;
    const userName = room.userNames.get(socket.id) || 'Unknown';
    io.to(roomId).emit('chat-message', {
      user: userName,
      message,
      system: false
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.users.delete(socket.id);
      room.userNames.delete(socket.id);

      if (room.users.size > 0) {
        io.to(roomId).emit('user-list', Array.from(room.userNames.values()));
        io.to(roomId).emit('chat-message', {
          user: 'System',
          message: `${socket.userName || 'A user'} left the room.`,
          system: true
        });
      } else {
        rooms.delete(roomId);
        console.log(`🗑️ Room ${roomId} deleted (empty)`);
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});