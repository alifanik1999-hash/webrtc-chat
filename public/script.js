import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

/* ==========================================
   1. FIREBASE CONFIGURATION & AUTHENTICATION
   ========================================== */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Auth DOM Elements
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loggedOutUI = document.getElementById('loggedOutUI');
const loggedInUI = document.getElementById('loggedInUI');
const userPhoto = document.getElementById('userPhoto');
const userName = document.getElementById('userName');

let currentUser = null;

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed! Please try again.");
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    if (loggedOutUI) loggedOutUI.classList.add('hidden');
    if (loggedInUI) loggedInUI.classList.remove('hidden');
    if (userPhoto) userPhoto.src = user.photoURL || '';
    if (userName) userName.innerText = user.displayName || 'User';
  } else {
    currentUser = null;
    if (loggedOutUI) loggedOutUI.classList.remove('hidden');
    if (loggedInUI) loggedInUI.classList.add('hidden');
  }
});

/* ==========================================
   2. DOM ELEMENTS & GLOBAL VARIABLES
   ========================================== */
const socket = io();

// Video Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// Buttons & Controls
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const nextBtn = document.getElementById('nextBtn');
const reportBtn = document.getElementById('reportBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');

// Status & Displays
const statusText = document.getElementById('status');
const countrySelect = document.getElementById('countrySelect');
const partnerName = document.getElementById('partnerName');
const partnerFlag = document.getElementById('partnerFlag');

// Chat Overlay Elements
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const sendBtn = document.getElementById('sendBtn');

// Media & Connection States
let localStream = null;
let peerConnection = null;
let currentPartnerId = null;
let isMicMuted = false;
let isCamOff = false;
let isSearching = false;

// STUN / TURN Server Configuration (Metered / Google STUN)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19020' },
    { urls: 'stun:stun1.l.google.com:19020' },
    { urls: 'stun:stun2.l.google.com:19020' }
  ]
};

/* ==========================================
   3. MEDIA INITIALIZATION & HARDWARE CONTROLS
   ========================================== */
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
      audio: true 
    });
    if (localVideo) {
      localVideo.srcObject = localStream;
    }
  } catch (err) {
    console.error("Media devices access error:", err);
    if (statusText) {
      statusText.innerText = "Error: Please enable Camera & Microphone permissions!";
      statusText.style.color = "#ef4444";
    }
  }
}
initMedia();

// Microphone Toggle
if (toggleMicBtn) {
  toggleMicBtn.addEventListener('click', () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      isMicMuted = !isMicMuted;
      audioTrack.enabled = !isMicMuted;
      toggleMicBtn.innerText = isMicMuted ? "🎙️ Unmute Mic" : "🎤 Mute Mic";
      toggleMicBtn.style.background = isMicMuted ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.2)";
    }
  });
}

// Camera Toggle
if (toggleCamBtn) {
  toggleCamBtn.addEventListener('click', () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      isCamOff = !isCamOff;
      videoTrack.enabled = !isCamOff;
      toggleCamBtn.innerText = isCamOff ? "📹 Turn On Cam" : "📹 Turn Off Cam";
      toggleCamBtn.style.background = isCamOff ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.2)";
    }
  });
}

/* ==========================================
   4. MATCHMAKING & CALL CONTROL HANDLERS
   ========================================== */
if (startBtn) {
  startBtn.addEventListener('click', () => {
    isSearching = true;
    startBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');
    if (nextBtn) nextBtn.disabled = false;
    if (reportBtn) reportBtn.disabled = true;
    findPartner();
  });
}

if (stopBtn) {
  stopBtn.addEventListener('click', stopChat);
}

if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    disconnectPeer();
    findPartner();
  });
}

if (reportBtn) {
  reportBtn.addEventListener('click', () => {
    if (currentPartnerId) {
      alert("User has been reported to moderators.");
      disconnectPeer();
      findPartner();
    }
  });
}

function findPartner() {
  if (statusText) {
    statusText.innerText = "Searching for a partner...";
    statusText.style.color = "#f59e0b";
  }
  if (partnerName) partnerName.innerText = "Searching...";
  if (partnerFlag) partnerFlag.innerText = "🌐";
  
  disableChat();
  
  const selectedCountry = countrySelect ? countrySelect.value : 'Global';
  const userNameVal = currentUser ? currentUser.displayName : 'Anonymous';

  socket.emit('find-partner', { 
    country: selectedCountry,
    name: userNameVal
  });
}

function stopChat() {
  isSearching = false;
  disconnectPeer();
  socket.emit('leave-room');
  
  if (startBtn) startBtn.classList.remove('hidden');
  if (stopBtn) stopBtn.classList.add('hidden');
  if (nextBtn) nextBtn.disabled = true;
  if (reportBtn) reportBtn.disabled = true;
  
  if (statusText) {
    statusText.innerText = "Stopped. Click Start to find a partner!";
    statusText.style.color = "#10b981";
  }
  if (partnerName) partnerName.innerText = "Partner";
  if (partnerFlag) partnerFlag.innerText = "🌐";
  
  disableChat();
}

/* ==========================================
   5. SOCKET.IO SIGNALING & EVENTS
   ========================================== */
socket.on('waiting', () => {
  if (statusText) {
    statusText.innerText = "Waiting for an available partner...";
    statusText.style.color = "#3b82f6";
  }
});

socket.on('partner-found', async (data) => {
  currentPartnerId = data.partnerId;
  
  if (statusText) {
    statusText.innerText = "Connected with a partner!";
    statusText.style.color = "#10b981";
  }
  if (partnerName) partnerName.innerText = data.partnerData?.name || "Stranger";
  if (partnerFlag) {
    const flags = { 'BD': '🇧🇩', 'IN': '🇮🇳', 'US': '🇺🇸', 'UK': '🇬🇧' };
    partnerFlag.innerText = flags[data.partnerData?.country] || '🌐';
  }
  
  if (reportBtn) reportBtn.disabled = false;
  enableChat();

  createPeerConnection();
  
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { to: currentPartnerId, signal: offer });
  } catch (err) {
    console.error("Offer creation error:", err);
  }
});

socket.on('signal', async (data) => {
  if (!peerConnection) createPeerConnection();

  try {
    if (data.signal.type === 'offer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', { to: data.from, signal: answer });
    } else if (data.signal.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
    }
  } catch (err) {
    console.error("Signaling handle error:", err);
  }
});

socket.on('partner-left', () => {
  if (statusText) {
    statusText.innerText = "Partner left the chat.";
    statusText.style.color = "#ef4444";
  }
  disconnectPeer();
  disableChat();
  
  // Auto search next if user was in searching mode
  if (isSearching) {
    setTimeout(() => {
      if (isSearching) findPartner();
    }, 1200);
  }
});

/* ==========================================
   6. WEBRTC PEER CONNECTION PIPELINE
   ========================================== */
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.ontrack = (event) => {
    if (remoteVideo) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentPartnerId) {
      socket.emit('signal', { 
        to: currentPartnerId, 
        signal: { candidate: event.candidate } 
      });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    if (peerConnection) {
      console.log("ICE Connection State:", peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
        if (statusText) statusText.innerText = "Connection unstable or lost...";
      }
    }
  };
}

function disconnectPeer() {
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.close();
    peerConnection = null;
  }
  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
  currentPartnerId = null;
}

/* ==========================================
   7. TEXT CHAT SYSTEM OVERLAY
   ========================================== */
if (chatForm) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!chatInput) return;
    
    const message = chatInput.value.trim();
    if (message && currentPartnerId) {
      socket.emit('send-message', {
        to: currentPartnerId,
        message: message
      });

      appendMessage(message, 'my-message');
      chatInput.value = '';
    }
  });
}

socket.on('receive-message', (data) => {
  appendMessage(data.message, 'partner-message');
});

function appendMessage(text, className) {
  if (!chatMessages) return;
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', className);
  msgDiv.innerText = text;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function enableChat() {
  if (chatInput) {
    chatInput.disabled = false;
    chatInput.placeholder = "Type a message...";
  }
  if (sendBtn) sendBtn.disabled = false;
  if (chatMessages) chatMessages.innerHTML = '';
}

function disableChat() {
  if (chatInput) {
    chatInput.disabled = true;
    chatInput.value = '';
    chatInput.placeholder = "Connect with a partner to chat...";
  }
  if (sendBtn) sendBtn.disabled = true;
}