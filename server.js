const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

let waitingQueue = [];
let rooms = {}; 

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find-match', (data = {}) => {
    const country = data.country || 'Global';
    socket.userData = {
      name: data.name || 'Guest',
      userCountry: data.userCountry || country
    };
    socket.selectedCountry = country;

    // Remove from existing queue if already there
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

    // Try finding a match
    let matchIndex = -1;

    for (let i = 0; i < waitingQueue.length; i++) {
      const peer = waitingQueue[i];
      // Match if country aligns or either selected Global
      if (
        country === 'Global' || 
        peer.selectedCountry === 'Global' || 
        peer.selectedCountry === country
      ) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex !== -1) {
      const partner = waitingQueue.splice(matchIndex, 1)[0];
      const roomId = `room_${socket.id}_${partner.id}`;

      socket.join(roomId);
      partner.join(roomId);

      rooms[socket.id] = roomId;
      rooms[partner.id] = roomId;

      socket.emit('match-found', { 
        roomId, 
        isInitiator: true, 
        partnerDetails: partner.userData 
      });

      partner.emit('match-found', { 
        roomId, 
        isInitiator: false, 
        partnerDetails: socket.userData 
      });

      console.log(`Matched ${socket.id} with ${partner.id} in ${roomId}`);
    } else {
      waitingQueue.push(socket);
      socket.emit('waiting', 'Searching for a partner...');
    }
  });

  socket.on('signal', ({ roomId, signal }) => {
    socket.to(roomId).emit('signal', { signal });
  });

  socket.on('next-user', (data) => {
    leaveCurrentRoom(socket);
    if (data && data.country) {
      socket.emit('find-match', data);
    }
  });

  socket.on('report-user', ({ roomId }) => {
    console.log(`User ${socket.id} reported room ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
    leaveCurrentRoom(socket);
  });

  function leaveCurrentRoom(socket) {
    const roomId = rooms[socket.id];
    if (roomId) {
      socket.to(roomId).emit('peer-disconnected');
      socket.leave(roomId);
      delete rooms[socket.id];
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});