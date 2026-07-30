const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

/* Security */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests, try again later.',
});

app.use(limiter);
app.use(express.static(path.join(__dirname, 'public')));

/* Socket.io */
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket', 'polling']
});

let waitingUsers = [];

function sanitizeInput(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('find-match', (data = {}) => {
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

    const userData = {
      id: socket.id,
      country: sanitizeInput(data.country || 'Global'),
      language: sanitizeInput(data.language || 'English')
    };

    if (waitingUsers.length > 0) {
      const partner = waitingUsers.pop();
      const roomId = `room_${socket.id}_${partner.id}`;

      socket.join(roomId);
      partner.socket.join(roomId);

      socket.emit('match-found', { roomId, isInitiator: true });
      partner.socket.emit('match-found', { roomId, isInitiator: false });
    } else {
      waitingUsers.push({ id: socket.id, socket, userData });
      socket.emit('waiting', 'Searching for a partner...');
    }
  });

  socket.on('signal', ({ roomId, signal }) => {
    socket.to(roomId).emit('signal', { signal });
  });

  socket.on('next-user', () => {
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    socket.broadcast.emit('peer-disconnected');
    socket.emit('start-rematch', { language: 'English', country: 'Global' });
  });

  socket.on('disconnect', () => {
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    socket.broadcast.emit('peer-disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));