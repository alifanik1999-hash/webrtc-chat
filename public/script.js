// 1. Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCzFtRb0VPOuSalqoGe4Hn9AH9fKfpAhSg",
  authDomain: "my-video-chat-dde4c.firebaseapp.com",
  projectId: "my-video-chat-dde4c",
  storageBucket: "my-video-chat-dde4c.firebasestorage.app",
  messagingSenderId: "685304112979",
  appId: "1:685304112979:web:d0b094d9666b4413b0e3a6",
  measurementId: "G-2Z4X8B7HHY"
};

// 2. Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// Global Auth Handlers (for HTML onclick or direct triggers)
window.handleGoogleLogin = async function() {
  console.log("Attempting Login...");
  try {
    await auth.signInWithPopup(provider);
  } catch (error) {
    console.warn("Popup failed/blocked, falling back to Redirect:", error);
    try {
      await auth.signInWithRedirect(provider);
    } catch (redirectErr) {
      console.error("Login completely failed:", redirectErr);
      alert("Login failed: " + redirectErr.message);
    }
  }
};

window.handleLogout = function() {
  auth.signOut()
    .then(() => console.log("User signed out successfully"))
    .catch((error) => console.error("Logout Error:", error));
};

// Catch Redirect Login Result
auth.getRedirectResult().catch((error) => {
  if (error && error.code) {
    console.error("Redirect Result Error:", error);
  }
});

// WebRTC & Socket.io Global Variables
const socket = io();
let localStream = null;
let peerConnection = null;
let currentRoomId = null;
let pendingCandidates = [];

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: "turn:a.relay.metered.ca:443?transport=tcp",
      username: "de2fad12ff781e4aa7e9c308",
      credential: "7_ESuH77TI6_P905Po9vR0m536wKH21_i47pKc8JYYFbMvul"
    },
    {
      urls: "turn:a.relay.metered.ca:80",
      username: "de2fad12ff781e4aa7e9c308",
      credential: "7_ESuH77TI6_P905Po9vR0m536wKH21_i47pKc8JYYFbMvul"
    }
  ]
};

// Camera Setup
async function setupMedia() {
  const localVideo = document.getElementById('localVideo');
  const statusText = document.getElementById('status');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideo) localVideo.srcObject = localStream;
  } catch (err) {
    console.error('Camera/Mic Error:', err);
    if (statusText) statusText.innerText = 'Camera/Microphone permission denied!';
  }
}

// Execute DOM Dependent Logic after page renders fully
document.addEventListener('DOMContentLoaded', () => {
  setupMedia();

  // DOM Elements
  const startBtn = document.getElementById('startBtn');
  const nextBtn = document.getElementById('nextBtn');
  const statusText = document.getElementById('status');
  const languageSelect = document.getElementById('languageSelect');
  const countrySelect = document.getElementById('countrySelect');
  const loggedOutUI = document.getElementById('loggedOutUI');
  const loggedInUI = document.getElementById('loggedInUI');
  const userName = document.getElementById('userName');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // Event Listeners for Login/Logout buttons
  if (loginBtn) loginBtn.onclick = window.handleGoogleLogin;
  if (logoutBtn) logoutBtn.onclick = window.handleLogout;

  // 4. Monitor Auth State Changes (UI & Button Controls)
  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log("User logged in:", user.displayName);
      
      // UI Switch
      if (loggedOutUI) loggedOutUI.classList.add('hidden');
      if (loggedInUI) loggedInUI.classList.remove('hidden');
      if (userName) userName.innerText = `Logged in as: ${user.displayName}`;
      
      // Enable Start Button
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.style.cursor = "pointer";
        startBtn.style.opacity = "1";
      }
      if (statusText) statusText.innerText = 'Click Start to find a partner';

    } else {
      console.log("No user logged in");
      
      // UI Switch
      if (loggedOutUI) loggedOutUI.classList.remove('hidden');
      if (loggedInUI) loggedInUI.classList.add('hidden');
      
      // Disable Start Button
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.style.cursor = "not-allowed";
        startBtn.style.opacity = "0.5";
      }
      if (statusText) statusText.innerText = 'Please sign in with Google to start';
    }
  });

  // Start Button Handler
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (!localStream) {
        alert("Please allow camera and microphone access first!");
        return;
      }
      const language = languageSelect ? languageSelect.value : 'English';
      const country = countrySelect ? countrySelect.value : 'Any';

      socket.emit('find-match', { language, country });
      startBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = false;
      if (statusText) statusText.innerText = 'Searching for a partner...';
    });
  }

  // Next Button Handler
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      closePeerConnection();
      if (statusText) statusText.innerText = 'Finding next partner...';
      socket.emit('next-user');
    });
  }
});

// Socket Events
socket.on('waiting', (msg) => {
  const statusText = document.getElementById('status');
  if (statusText) statusText.innerText = msg;
});

socket.on('match-found', async ({ roomId, isInitiator }) => {
  const statusText = document.getElementById('status');
  currentRoomId = roomId;
  if (statusText) statusText.innerText = 'Connected with a partner!';
  
  createPeerConnection();

  if (isInitiator) {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('signal', { roomId: currentRoomId, signal: offer });
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  }
});

socket.on('signal', async ({ signal }) => {
  if (!peerConnection) createPeerConnection();

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
    console.error('Signaling Error:', err);
  }
});

async function processPendingCandidates() {
  for (const candidate of pendingCandidates) {
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (err) {
      console.error('Error adding pending candidate:', err);
    }
  }
  pendingCandidates = [];
}

function createPeerConnection() {
  const remoteVideo = document.getElementById('remoteVideo');
  closePeerConnection();

  peerConnection = new RTCPeerConnection(rtcConfig);

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0] && remoteVideo) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoomId) {
      socket.emit('signal', { roomId: currentRoomId, signal: { candidate: event.candidate } });
    }
  };
}

function closePeerConnection() {
  const remoteVideo = document.getElementById('remoteVideo');
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.close();
    peerConnection = null;
  }
  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
  currentRoomId = null;
  pendingCandidates = [];
}

socket.on('start-rematch', ({ language, country }) => {
  closePeerConnection();
  socket.emit('find-match', { language, country });
});

socket.on('peer-disconnected', () => {
  const statusText = document.getElementById('status');
  closePeerConnection();
  if (statusText) statusText.innerText = 'Partner left. Click Next to continue.';
});