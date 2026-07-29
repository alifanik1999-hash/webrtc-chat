const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

/* ==========================================
   SECURITY CONFIGURATION (নিরাপত্তা সেটিংস)
   ========================================== */

// ১. Security Headers (Helmet) - WebRTC ও স্কিপ্টের সাথে সামঞ্জস্য রেখে
app.use(
  helmet({
    contentSecurityPolicy: false, // WebRTC এবং External Assets-এর জন্য শিথিল করা হয়েছে
    crossOriginEmbedderPolicy: false,
  })
);

// ২. Rate Limiting - স্প্যাম বা সাইট ডাউন (DDoS) করা ঠেকানোর জন্য
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ১৫ মিনিট
  max: 150, // প্রতি IP থেকে ১৫ মিনিটে সর্বোচ্চ ১৫০টি HTTP রিকোয়েস্ট
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Static files serve করার জন্য
app.use(express.static(path.join(__dirname, 'public')));

/* ==========================================
   SOCKET.IO & WEBRTC SIGNALING LOGIC
   ========================================== */

const io = new Server(server, {
  cors: {
    origin: "*", // প্রয়োজনে নির্দিষ্ট ডোমেইন দিতে পারেন
    methods: ["GET", "POST"]
  }
});

let waitingUsers = [];

// XSS Sanitization Function (ইনপুট সেফ করার জন্য)
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

  // ১. ইউজার জয়েন করলে বা ম্যাচ খুঁজলে
  socket.on('find-partner', (data = {}) => {
    // আগের ওয়েটিং লিস্টে থাকলে সরিয়ে নিন
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

    // ইনপুট নিরাপদ করা
    const userData = {
      id: socket.id,
      country: sanitizeInput(data.country || 'Global'),
      name: sanitizeInput(data.name || 'Anonymous')
    };

    // যদি কেউ আগে থেকে অপেক্ষা করে থাকে
    if (waitingUsers.length > 0) {
      const partner = waitingUsers.pop();

      // দুইজনকে কানেক্ট করিয়ে দেওয়া
      socket.emit('partner-found', { partnerId: partner.id, partnerData: partner });
      io.to(partner.id).emit('partner-found', { partnerId: socket.id, partnerData: userData });
    } else {
      // অপেক্ষা তালিকায় যোগ করা
      waitingUsers.push(userData);
      socket.emit('waiting');
    }
  });

  // ২. WebRTC Signaling (Offer, Answer, ICE Candidate)
  socket.on('signal', (data) => {
    if (data && data.to) {
      io.to(data.to).emit('signal', {
        from: socket.id,
        signal: data.signal
      });
    }
  });

  // ৩. স্কিপ বা নেক্সট বাটন ক্লিক করলে
  socket.on('leave-room', () => {
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    socket.broadcast.emit('partner-left', { partnerId: socket.id });
  });

  // ৪. সংযোগ বিচ্ছিন্ন হলে (Disconnect)
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    socket.broadcast.emit('partner-left', { partnerId: socket.id });
  });
});

/* ==========================================
   SERVER LISTEN
   ========================================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running securely on port ${PORT}`);
});