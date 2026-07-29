// ==========================================
// ১. FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyC2mJpT-fX6p5O6_d0E2x7L-7W8P0Y1Z2", // আপনার আসল Firebase API Key দিয়ে রিপ্লেস করুন (যদি আলাদা থাকে)
  authDomain: "talkwithworld.firebaseapp.com",
  projectId: "talkwithworld",
  storageBucket: "talkwithworld.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};

// Initialize Firebase App & Auth
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// ==========================================
// ২. DOM ELEMENTS
// ==========================================
const loggedOutUI = document.getElementById('loggedOutUI');
const loggedInUI = document.getElementById('loggedInUI');
const userNameDisplay = document.getElementById('userName');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const statusText = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const languageSelect = document.getElementById('languageSelect');
const countrySelect = document.getElementById('countrySelect');

// ==========================================
// ৩. FIREBASE AUTHENTICATION LOGIC
// ==========================================
window.handleGoogleLogin = function() {
  auth.signInWithPopup(provider)
    .then((result) => {
      console.log("Logged in user:", result.user);
    })
    .catch((error) => {
      console.error("Login Error:", error);
      alert("Sign in failed: " + error.message);
    });
};

window.handleLogout = function() {
  auth.signOut()
    .then(() => {
      console.log("User signed out");
    })
    .catch((error) => {
      console.error("Logout Error:", error);
    });
};

// Auth State Observer
auth.onAuthStateChanged((user) => {
  if (user) {
    if (loggedOutUI) loggedOutUI.classList.add('hidden');
    if (loggedInUI) loggedInUI.classList.remove('hidden');
    if (userNameDisplay) userNameDisplay.innerText = `Logged in as: ${user.displayName || 'User'}`;
    if (startBtn) startBtn.disabled = false;
    if (statusText) statusText.innerText = "Select options and click Start to find a partner!";
  } else {
    if (loggedOutUI) loggedOutUI.classList.remove('hidden');
    if (loggedInUI) loggedInUI.classList.add('hidden');
    if (userNameDisplay) userNameDisplay.innerText = '';
    if (startBtn) startBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (statusText) statusText.innerText = "Please sign in with Google to start";
  }
});

// ==========================================
// ৪. WEBRTC & SOCKET.IO LOGIC
// ==========================================
const socket = io();

let localStream = null;
let peerConnection = null;
let currentRoomId = null;
let pendingCandidates = [];

// Google STUN Configuration
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ক্যামেরা এবং মাইক চালু করা
async function startLocalMedia() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideo) localVideo.srcObject = localStream;
    } catch (err) {
      console.error('Camera/Mic permission error:', err);
      if (statusText) statusText.innerText = "Camera/Microphone permission required!";
    }
  }
}

// পেজ লোড হলেই লোকাল স্ট্রিম চালু
startLocalMedia();

// Matchmaking Event Listeners
if (startBtn) {
  startBtn.addEventListener('click', () => {
    const language = languageSelect ? languageSelect.value : 'English';
    const country = countrySelect ? countrySelect.value : 'Global';

    if (statusText) statusText.innerText = "Searching for a partner...";
    socket.emit('find-match', { language, country });
    startBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = false;
  });
}

if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    if (remoteVideo) remoteVideo.srcObject = null;
    closePeerConnection();
    if (statusText) statusText.innerText = "Searching for new partner...";
    socket.emit('next-user');
  });
}

socket.on('start-rematch', ({ language, country }) => {
  socket.emit('find-match', { language, country });
});

socket.on('waiting', (msg) => {
  if (statusText) statusText.innerText = msg;
});

// Match Found & Connection Setup
socket.on('match-found', async ({ roomId, isInitiator }) => {
  console.log(`Matched! Room ID: ${roomId}, Initiator: ${isInitiator}`);
  if (statusText) statusText.innerText = "Connected with a partner!";
  currentRoomId = roomId;

  await createPeerConnection();

  if (isInitiator) {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('signal', { roomId: currentRoomId, signal: offer });
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  }
});

async function createPeerConnection() {
  closePeerConnection();

  peerConnection = new RTCPeerConnection(rtcConfig);
  pendingCandidates = [];

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoomId) {
      socket.emit('signal', {
        roomId: currentRoomId,
        signal: { candidate: event.candidate }
      });
    }
  };

  peerConnection.ontrack = (event) => {
    console.log("Remote track received:", event.streams);
    if (remoteVideo) {
      if (event.streams && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
      } else {
        const stream = new MediaStream();
        stream.addTrack(event.track);
        remoteVideo.srcObject = stream;
      }

      remoteVideo.play().catch(e => console.log("Video Play Error:", e));
    }
  };
}

// Signaling Handler
socket.on('signal', async ({ signal }) => {
  if (!peerConnection) return;

  try {
    if (signal.type === 'offer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
      await processPendingCandidates();

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', { roomId: currentRoomId, signal: answer });

    } else if (signal.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
      await processPendingCandidates();

    } else if (signal.candidate) {
      const candidate = new RTCIceCandidate(signal.candidate);
      if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        await peerConnection.addIceCandidate(candidate);
      } else {
        pendingCandidates.push(candidate);
      }
    }
  } catch (err) {
    console.error("Signal Processing Error:", err);
  }
});

async function processPendingCandidates() {
  while (pendingCandidates.length > 0) {
    const candidate = pendingCandidates.shift();
    await peerConnection.addIceCandidate(candidate);
  }
}

// Peer Disconnected Cleanup
socket.on('peer-disconnected', () => {
  console.log('Partner disconnected');
  if (statusText) statusText.innerText = "Partner disconnected. Click Next or Start to search again.";
  if (remoteVideo) remoteVideo.srcObject = null;
  closePeerConnection();
  if (startBtn) startBtn.disabled = false;
});

function closePeerConnection() {
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.close();
    peerConnection = null;
  }
}