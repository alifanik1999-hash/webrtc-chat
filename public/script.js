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

// Country Name to Flag Emoji Map
const countryFlags = {
  "Global": "🌐",
  "United States": "🇺🇸",
  "United Kingdom": "🇬🇧",
  "Canada": "🇨🇦",
  "Australia": "🇦🇺",
  "Bangladesh": "🇧🇩",
  "India": "🇮🇳",
  "Pakistan": "🇵🇰",
  "Saudi Arabia": "🇸🇦",
  "United Arab Emirates": "🇦🇪",
  "Germany": "🇩🇪",
  "France": "🇫🇷",
  "Japan": "🇯🇵",
  "South Korea": "🇰🇷",
  "China": "🇨🇳",
  "Brazil": "🇧🇷",
  "Turkey": "🇹🇷",
  "Italy": "🇮🇹",
  "Spain": "🇪🇸",
  "Russia": "🇷🇺",
  "Malaysia": "🇲🇾",
  "Singapore": "🇸🇬",
  "Qatar": "🇶🇦",
  "Kuwait": "🇰🇼"
};

// ==========================================
// ২. DOM ELEMENTS
// ==========================================
const loggedOutUI = document.getElementById('loggedOutUI');
const loggedInUI = document.getElementById('loggedInUI');
const userNameDisplay = document.getElementById('userName');
const userPhotoDisplay = document.getElementById('userPhoto');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const stopBtn = document.getElementById('stopBtn');
const statusText = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const countrySelect = document.getElementById('countrySelect');
const muteAudioBtn = document.getElementById('muteAudioBtn');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');

const partnerInfo = document.getElementById('partnerInfo');
const partnerFlag = document.getElementById('partnerFlag');
const partnerName = document.getElementById('partnerName');

let activeCamName = "Cam";
let activeMicName = "Mic";

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
    
    if (userNameDisplay) userNameDisplay.innerText = user.displayName || 'User';
    if (userPhotoDisplay) userPhotoDisplay.src = user.photoURL || 'https://via.placeholder.com/32';

    if (startBtn) startBtn.disabled = false;
    if (statusText) statusText.innerText = "Select country and click Start to find a partner!";
  } else {
    console.log("Auth state: Logged Out");
    if (loggedOutUI) loggedOutUI.classList.remove('hidden');
    if (loggedInUI) loggedInUI.classList.add('hidden');
    if (userNameDisplay) userNameDisplay.innerText = '';
    if (userPhotoDisplay) userPhotoDisplay.src = '';

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

      const videoTrack = localStream.getVideoTracks()[0];
      const audioTrack = localStream.getAudioTracks()[0];

      if (videoTrack && videoTrack.label) activeCamName = videoTrack.label;
      if (audioTrack && audioTrack.label) activeMicName = audioTrack.label;

      updateControlButtons();

    } catch (err) {
      console.error('Camera/Mic permission error:', err);
      if (statusText) statusText.innerText = "Camera/Microphone permission required!";
    }
  }
}

function updateControlButtons() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];

    if (muteAudioBtn && audioTrack) {
      muteAudioBtn.innerText = audioTrack.enabled ? `🎤 Mute (${activeMicName})` : `🎙️ Unmute`;
    }
    if (toggleVideoBtn && videoTrack) {
      toggleVideoBtn.innerText = videoTrack.enabled ? `📹 Video Off (${activeCamName})` : `📷 Video On`;
    }
  }
}

startLocalMedia();

// Start Matchmaking
if (startBtn) {
  startBtn.addEventListener('click', () => {
    const country = countrySelect ? countrySelect.value : 'Global';
    const currentUser = auth.currentUser;
    const name = currentUser ? currentUser.displayName : 'Guest';

    if (statusText) statusText.innerText = "Searching for a partner...";
    
    // Send user name & country with match request
    socket.emit('find-match', { country, name, userCountry: country });
    
    startBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = false;
  });
}

// Next Match
if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    if (remoteVideo) remoteVideo.srcObject = null;
    if (partnerInfo) partnerInfo.classList.add('hidden');
    closePeerConnection();
    if (statusText) statusText.innerText = "Searching for new partner...";
    
    const country = countrySelect ? countrySelect.value : 'Global';
    const currentUser = auth.currentUser;
    const name = currentUser ? currentUser.displayName : 'Guest';
    
    socket.emit('next-user', { country, name, userCountry: country });
  });
}

// Stop Video Chat
if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    if (remoteVideo) remoteVideo.srcObject = null;
    if (partnerInfo) partnerInfo.classList.add('hidden');
    closePeerConnection();
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
socket.on('match-found', async ({ roomId, isInitiator, partnerDetails }) => {
  console.log(`Matched! Room ID: ${roomId}`);
  if (statusText) statusText.innerText = "Connected with a partner!";
  currentRoomId = roomId;

  // Show Partner Name & Flag
  if (partnerDetails) {
    const pName = partnerDetails.name || 'Partner';
    const pCountry = partnerDetails.userCountry || 'Global';
    const flag = countryFlags[pCountry] || "🌐";

    if (partnerName) partnerName.innerText = pName;
    if (partnerFlag) partnerFlag.innerText = flag;
    if (partnerInfo) partnerInfo.classList.remove('hidden');
  }

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
  if (partnerInfo) partnerInfo.classList.add('hidden');
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
    updateControlButtons();
  }
};

window.toggleVideo = function() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    updateControlButtons();
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