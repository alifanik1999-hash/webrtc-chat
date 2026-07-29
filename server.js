const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

/* ==========================================
   SECURITY CONFIGURATION
   ========================================== */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.static(path.join(__dirname, 'public')));

/* ==========================================
   SOCKET.IO LOGIC
   ========================================== */
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let waitingUsers = [];

function sanitizeInput(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[&<>"']/g, function (m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('find-partner', (data = {}) => {
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

    const userData = {
      id: socket.id,
      country: sanitizeInput(data.country || 'Global'),
      name: sanitizeInput(data.name || 'Anonymous')
    };

    if (waitingUsers.length > 0) {
      const partner = waitingUsers.pop();
      socket.emit('partner-found', { partnerId: partner.id, partnerData: partner });
      io.to(partner.id).emit('partner-found', { partnerId: socket.id, partnerData: userData });
    } else {
      waitingUsers.push(userData);
      socket.emit('waiting');
    }
  });

  socket.on('signal', (data) => {
    if (data && data.to) {
      io.to(data.to).emit('signal', {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  // 👇 চ্যাট মেসেজ রিসেপশন ও ট্রান্সমিশন
  socket.on('send-message', (data) => {
    if (data && data.to && data.message) {
      const cleanMessage = sanitizeInput(data.message);
      io.to(data.to).emit('receive-message', {
        message: cleanMessage,
        from: socket.id
      });
    }
  });

  socket.on('leave-room', () => {
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    socket.broadcast.emit('partner-left', { partnerId: socket.id });
  });

  socket.on('disconnect', () => {
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    socket.broadcast.emit('partner-left', { partnerId: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running securely on port ${PORT}`);
});