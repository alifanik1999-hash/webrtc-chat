const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

const queues = {};
const userSessions = {};

io.on('connection', (socket) => {
  console.log(`User Joined: ${socket.id}`);

  socket.on('find-match', ({ language, country }) => {
    const selectedLang = language || 'English';
    const selectedCountry = country || 'Any';
    const queueKey = `${selectedLang}_${selectedCountry}`;

    // আগের কোনো রুমে থাকলে তা থেকে বের করে দেওয়া
    leaveCurrentRoom(socket);

    if (!queues[queueKey]) {
      queues[queueKey] = [];
    }

    if (!queues[queueKey].includes(socket.id)) {
      queues[queueKey].push(socket.id);
    }

    userSessions[socket.id] = {
      language: selectedLang,
      country: selectedCountry,
      queueKey: queueKey,
      roomId: null
    };

    // ম্যাচ খোঁজার চেষ্টা
    tryMatchUser(queueKey);
  });

  function tryMatchUser(queueKey) {
    if (queues[queueKey] && queues[queueKey].length >= 2) {
      const user1 = queues[queueKey].shift();
      const user2 = queues[queueKey].shift();

      const socket1 = io.sockets.sockets.get(user1);
      const socket2 = io.sockets.sockets.get(user2);

      // FIXED: যদি ইউজার১ ডিসকানেক্টড থাকে, তবে ইউজার২-কে আবার কিউতে ফেরত পাঠানো
      if (!socket1 && socket2) {
        queues[queueKey].unshift(user2);
        return;
      }
      // FIXED: যদি ইউজার২ ডিসকানেক্টড থাকে, তবে ইউজার১-কে আবার কিউতে ফেরত পাঠানো
      if (socket1 && !socket2) {
        queues[queueKey].unshift(user1);
        return;
      }

      if (socket1 && socket2) {
        const roomId = `room_${user1}_${user2}`;

        socket1.join(roomId);
        socket2.join(roomId);

        if (userSessions[user1]) userSessions[user1].roomId = roomId;
        if (userSessions[user2]) userSessions[user2].roomId = roomId;

        socket1.emit('match-found', { roomId, isInitiator: true });
        socket2.emit('match-found', { roomId, isInitiator: false });
      }
    }
  }

  socket.on('signal', (data) => {
    if (data && data.roomId) {
      socket.to(data.roomId).emit('signal', {
        signal: data.signal,
        from: socket.id
      });
    }
  });

  socket.on('next-user', () => {
    const session = userSessions[socket.id];
    const lang = session?.language || 'English';
    const country = session?.country || 'Any';

    leaveCurrentRoom(socket);

    socket.emit('start-rematch', { language: lang, country: country });
  });

  socket.on('disconnect', () => {
    console.log(`User Left: ${socket.id}`);
    leaveCurrentRoom(socket);
    delete userSessions[socket.id];
  });

  function leaveCurrentRoom(socket) {
    const session = userSessions[socket.id];
    if (session) {
      const qKey = session.queueKey;
      if (queues[qKey]) {
        queues[qKey] = queues[qKey].filter(id => id !== socket.id);
      }

      if (session.roomId) {
        socket.to(session.roomId).emit('peer-disconnected');
        socket.leave(session.roomId);
        session.roomId = null;
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));