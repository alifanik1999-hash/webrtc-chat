// ==========================================
// ১. FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCzFtRb0VPOuSalqoGe4Hn9AH9fKfpAhSg",
  authDomain: "my-video-chat-dde4c.firebaseapp.com",
  projectId: "my-video-chat-dde4c",
  storageBucket: "my-video-chat-dde4c.firebasestorage.app",
  messagingSenderId: "685304112979",
  appId: "1:685304112979:web:d0b094d9666b4413b0e3a6",
  measurementId: "G-2Z4X8B7HHY"
};

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
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const countrySelect = document.getElementById('countrySelect');

// ==========================================
// ৩. RELIABLE AUTH LOGIC
// ==========================================

window.handleGoogleLogin = function() {
  if (statusText) statusText.innerText = "Signing in...";
  
  auth.signInWithPopup(provider)
    .then((result) => {
      console.log("Login success:", result.user);
    })
    .catch((error) => {
      console.error("Popup error, attempting redirect fallback:", error);
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
        auth.signInWithRedirect(provider);
      } else {
        alert("Sign in failed: " + error.message);
      }
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

auth.getRedirectResult().catch((error) => {
  if (error && error.code) {
    console.error("Redirect Login Error:", error);
  }
});

auth.onAuthStateChanged((user) => {
  if (user) {
    console.log("Auth state: Logged In as", user.displayName);
    if (loggedOutUI) loggedOutUI.classList.add('hidden');
    if (loggedInUI) loggedInUI.classList.remove('hidden');
    if (userNameDisplay) userNameDisplay.innerText = `Logged in as: ${user.displayName || 'User'}`;
    if (startBtn) startBtn.disabled = false;
    if (statusText) statusText.innerText = "Select options and click Start to find a partner!";
  } else {
    console.log("Auth state: Logged Out");
    if (loggedOutUI) loggedOutUI.classList.remove('hidden');
    if (loggedInUI) loggedInUI.classList.add('hidden');
    if (userNameDisplay) userNameDisplay.innerText = '';
    if (startBtn) startBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
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

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "de2fad12ff781e4aa7e9c308",
      credential: "KdnZN2O/QdYhlq68"
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "de2fad12ff781e4aa7e9c308",
      credential: "KdnZN2O/QdYhlq68"
    },
    {
      urls: "turn:global.relay.metered.ca:443?transport=tcp",
      username: "de2fad12ff781e4aa7e9c308",
      credential: "KdnZN2O/QdYhlq68"
    }
  ]
};

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

startLocalMedia();

// Start Matchmaking
if (startBtn) {
  startBtn.addEventListener('click', () => {
    const country = countrySelect ? countrySelect.value : 'Global';

    if (statusText) statusText.innerText = "Searching for a partner...";
    socket.emit('find-match', { country });
    startBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = false;
  });
}

// Next Match
if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    if (remoteVideo) remoteVideo.srcObject = null;
    closePeerConnection();
    if (statusText) statusText.innerText = "Searching for new partner...";
    socket.emit('next-user');
  });
}

// 🛑 Stop Video Chat Functionality
if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    if (remoteVideo) remoteVideo.srcObject = null;
    closePeerConnection();
    
    // Server-এ জানান দেওয়া যে কনেকশন লিভ করা হয়েছে
    socket.emit('next-user'); 
    
    if (statusText) statusText.innerText = "Stopped. Click Start to search again.";
    
    startBtn.disabled = false;
    nextBtn.disabled = true;
    stopBtn.disabled = true;
  });
}

socket.on('waiting', (msg) => {
  if (statusText) statusText.innerText = msg;
});

// Match Found
socket.on('match-found', async ({ roomId, isInitiator }) => {
  console.log(`Matched! Room ID: ${roomId}`);
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

socket.on('peer-disconnected', () => {
  console.log('Partner disconnected');
  if (statusText) statusText.innerText = "Partner disconnected. Click Next or Start to search again.";
  if (remoteVideo) remoteVideo.srcObject = null;
  closePeerConnection();
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
});

function closePeerConnection() {
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.close();
    peerConnection = null;
  }
}

// ==========================================
// ৫. MEDIA CONTROLS & REPORT FUNCTIONS
// ==========================================

window.toggleAudio = function() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    const btn = document.getElementById('muteAudioBtn');
    if (btn) btn.innerText = audioTrack.enabled ? '🎤 Mute' : '🎙️ Unmute';
  }
};

window.toggleVideo = function() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    const btn = document.getElementById('toggleVideoBtn');
    if (btn) btn.innerText = videoTrack.enabled ? '📹 Video Off' : '📷 Video On';
  }
};

window.reportUser = function() {
  if (!currentRoomId) {
    alert("You are not connected to anyone!");
    return;
  }
  socket.emit('report-user', { roomId: currentRoomId });
  alert("User reported successfully.");

  if (nextBtn) nextBtn.click();
};