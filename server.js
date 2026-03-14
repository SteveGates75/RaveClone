const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for rooms: { roomId: { videoId, currentTime, isPlaying, users: [] } }
const rooms = {};

// Generate a random 6-character room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle creating a room
  socket.on('create-room', (callback) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      videoId: 'dQw4w9WgXcQ', // default Rick Astley – never gonna give you up
      currentTime: 0,
      isPlaying: false,
      users: []
    };
    socket.join(roomId);
    socket.roomId = roomId;
    rooms[roomId].users.push(socket.id);
    callback({ roomId, videoId: rooms[roomId].videoId });
  });

  // Handle joining a room
  socket.on('join-room', (roomId, callback) => {
    roomId = roomId.trim().toUpperCase();
    const room = rooms[roomId];
    if (!room) {
      callback({ error: 'Room not found' });
      return;
    }
    socket.join(roomId);
    socket.roomId = roomId;
    room.users.push(socket.id);
    // Send current room state to the new user
    socket.emit('room-state', {
      videoId: room.videoId,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying
    });
    callback({ success: true, videoId: room.videoId });
  });

  // Handle video control events
  socket.on('play', (data) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].isPlaying = true;
    rooms[roomId].currentTime = data.currentTime;
    // Broadcast to others in the room
    socket.to(roomId).emit('play', data);
  });

  socket.on('pause', (data) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].isPlaying = false;
    rooms[roomId].currentTime = data.currentTime;
    socket.to(roomId).emit('pause', data);
  });

  socket.on('seek', (data) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].currentTime = data.currentTime;
    socket.to(roomId).emit('seek', data);
  });

  // Handle chat messages
  socket.on('chat-message', (message) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    io.to(roomId).emit('chat-message', {
      user: socket.id.substring(0, 4), // short ID
      message
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].users = rooms[roomId].users.filter(id => id !== socket.id);
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId]; // clean up empty room
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
