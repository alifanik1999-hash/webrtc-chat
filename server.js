const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.set('trust proxy', true); // Render বা প্রক্সি সার্ভারের জন্য রিয়েল IP পেতে এটি জরুরি

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static('public'));

// Global Tracking
const bannedIPs = new Set();
const userReportCounts = {}; // { socketId: count }
let onlineUsersCount = 0;
let waitingQueue = []; // [{ socketId, country }]

io.on('connection', (socket) => {
  const clientIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  // ১. IP ব্যান চেক
  if (bannedIPs.has(clientIP)) {
    socket.emit('banned', 'Your IP has been temporarily banned due to receiving multiple reports.');
    socket.disconnect(true);
    return;
  }

  // ২. লাইভ অনলাইন ইউজার আপডেট
  onlineUsersCount++;
  io.emit('online-users-count', onlineUsersCount);

  // ৩. পার্টনার খোঁজার লজিক (Matchmaking)
  socket.on('find-match', ({ country }) => {
    waitingQueue = waitingQueue.filter(user => user.socketId !== socket.id);

    const matchIndex = waitingQueue.findIndex(user => {
      if (country === 'Global' || user.country === 'Global') return true;
      return user.country === country;
    });

    if (matchIndex !== -1) {
      const partner = waitingQueue.splice(matchIndex, 1)[0];
      const partnerSocket = io.sockets.sockets.get(partner.socketId);

      if (partnerSocket) {
        const roomId = `room_${socket.id}_${partner.socketId}`;
        socket.join(roomId);
        partnerSocket.join(roomId);

        socket.emit('match-found', { roomId, isInitiator: true });
        partnerSocket.emit('match-found', { roomId, isInitiator: false });
      } else {
        waitingQueue.push({ socketId: socket.id, country });
        socket.emit('waiting', `Searching for a partner from ${country}...`);
      }
    } else {
      waitingQueue.push({ socketId: socket.id, country });
      socket.emit('waiting', `Searching for a partner from ${country}...`);
    }
  });

  // ৪. WebRTC সিগন্যালিং
  socket.on('signal', ({ roomId, signal }) => {
    socket.to(roomId).emit('signal', { signal });
  });

  // ৫. মেসেজ পাঠানো
  socket.on('send-message', ({ roomId, message }) => {
    socket.to(roomId).emit('receive-message', { message });
  });

  // ৬. রিপোর্ট ও অটো-ব্যান লজিক
  socket.on('report-partner', ({ roomId }) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      for (const id of room) {
        if (id !== socket.id) {
          userReportCounts[id] = (userReportCounts[id] || 0) + 1;

          if (userReportCounts[id] >= 3) {
            const partnerSocket = io.sockets.sockets.get(id);
            if (partnerSocket) {
              const partnerIP = partnerSocket.handshake.headers['x-forwarded-for'] || partnerSocket.handshake.address;
              bannedIPs.add(partnerIP);
              
              partnerSocket.emit('banned', 'You have been banned due to receiving multiple user reports.');
              partnerSocket.disconnect(true);
            }
          }
          break;
        }
      }
    }
  });

  // ৭. লিভ / নেক্সট ইউজার
  socket.on('leave-room', () => {
    removeFromRooms(socket);
  });

  socket.on('next-user', () => {
    removeFromRooms(socket);
    socket.emit('start-rematch', { country: 'Global' });
  });

  function removeFromRooms(s) {
    s.rooms.forEach(room => {
      if (room !== s.id) {
        s.to(room).emit('peer-disconnected');
        s.leave(room);
      }
    });
    waitingQueue = waitingQueue.filter(user => user.socketId !== s.id);
  }

  // ৮. ডিসকানেক্ট হ্যান্ডলার
  socket.on('disconnect', () => {
    removeFromRooms(socket);
    onlineUsersCount = Math.max(0, onlineUsersCount - 1);
    io.emit('online-users-count', onlineUsersCount);
    delete userReportCounts[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));