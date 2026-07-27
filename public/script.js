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
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// 3. Login & Logout Functions
function handleGoogleLogin() {
  auth.signInWithPopup(provider).catch((error) => console.error("Login Error:", error));
}

function handleLogout() {
  auth.signOut().catch((error) => console.error("Logout Error:", error));
}

// 4. Monitor Auth State Changes
auth.onAuthStateChanged((user) => {
  const loggedOutUI = document.getElementById('loggedOutUI');
  const loggedInUI = document.getElementById('loggedInUI');
  const userName = document.getElementById('userName');

  if (user) {
    loggedOutUI.classList.add('hidden');
    loggedInUI.classList.remove('hidden');
    userName.innerText = `Logged in as: ${user.displayName}`;
  } else {
    loggedOutUI.classList.remove('hidden');
    loggedInUI.classList.add('hidden');
  }
});
const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const statusText = document.getElementById('status');
const languageSelect = document.getElementById('languageSelect');
const countrySelect = document.getElementById('countrySelect');

let localStream = null;
let peerConnection = null;
let currentRoomId = null;
let pendingCandidates = [];

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: "turn:a.relay.metered.ca:443?transport=tcp",
      username: "e8838a688fb4042ea0f4eb78",
      credential: "7_ESuH77TI6_P905Po9vR0m536wKH21_i47pKc8JYYFbMvul"
    },
    {
      urls: "turn:a.relay.metered.ca:80",
      username: "e8838a688fb4042ea0f4eb78",
      credential: "7_ESuH77TI6_P905Po9vR0m536wKH21_i47pKc8JYYFbMvul"
    }
  ]
};

// ১. ক্যামেরা ও মাইক পারমিশন সেটআপ
async function setupMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error('Camera/Mic Error:', err);
    statusText.innerText = 'Camera or Microphone permission denied!';
  }
}

setupMedia();

// ২. Start кнопка
startBtn.addEventListener('click', () => {
  const language = languageSelect.value;
  const country = countrySelect.value;

  socket.emit('find-match', { language, country });
  startBtn.disabled = true;
  nextBtn.disabled = false;
  statusText.innerText = 'Searching for a partner...';
});

// ৩. Next кнопка
nextBtn.addEventListener('click', () => {
  closePeerConnection();
  statusText.innerText = 'Finding next partner...';
  socket.emit('next-user');
});

socket.on('waiting', (msg) => {
  statusText.innerText = msg;
});

// ৪. Match Found
socket.on('match-found', async ({ roomId, isInitiator }) => {
  currentRoomId = roomId;
  statusText.innerText = 'Connected with a partner!';
  
  createPeerConnection();

  if (isInitiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { roomId: currentRoomId, signal: offer });
  }
});

// ৫. Signaling Data (WebRTC Handshake)
socket.on('signal', async ({ signal }) => {
  if (!peerConnection) createPeerConnection();

  if (signal.type === 'offer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    processPendingCandidates();

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('signal', { roomId: currentRoomId, signal: answer });

  } else if (signal.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    processPendingCandidates();

  } else if (signal.candidate) {
    const candidate = new RTCIceCandidate(signal.candidate);
    if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
      await peerConnection.addIceCandidate(candidate);
    } else {
      pendingCandidates.push(candidate);
    }
  }
});

function processPendingCandidates() {
  pendingCandidates.forEach(async (candidate) => {
    await peerConnection.addIceCandidate(candidate);
  });
  pendingCandidates = [];
}

// ৬. Peer Connection তৈরি
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoomId) {
      socket.emit('signal', { roomId: currentRoomId, signal: { candidate: event.candidate } });
    }
  };
}

// ৭. কানেকশন ক্লোজ করা
function closePeerConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  currentRoomId = null;
  pendingCandidates = [];
}

// ৮. Rematch
socket.on('start-rematch', ({ language, country }) => {
  socket.emit('find-match', { language, country });
});

// ৯. Peer Disconnect
socket.on('peer-disconnected', () => {
  closePeerConnection();
  statusText.innerText = 'Partner left. Click Next to continue.';
});