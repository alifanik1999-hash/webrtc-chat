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

// 3. Login & Logout Functions (Fixed with Redirect to avoid COOP errors)
function handleGoogleLogin() {
  auth.signInWithRedirect(provider);
}

function handleLogout() {
  auth.signOut().catch((error) => console.error("Logout Error:", error));
}

// 4. Handle Redirect Result (For Redirect Login Flow)
auth.getRedirectResult().then((result) => {
  if (result.user) {
    console.log("Logged in successfully via redirect:", result.user);
  }
}).catch((error) => {
  console.error("Redirect Login Error:", error);
});

// 5. Monitor Auth State Changes
auth.onAuthStateChanged((user) => {
  const loggedOutUI = document.getElementById('loggedOutUI');
  const loggedInUI = document.getElementById('loggedInUI');
  const userName = document.getElementById('userName');

  if (user) {
    if (loggedOutUI) loggedOutUI.classList.add('hidden');
    if (loggedInUI) loggedInUI.classList.remove('hidden');
    if (userName) userName.innerText = `Logged in as: ${user.displayName}`;
    
    // ইউজার লগইন করলে Start বাটন এনাবল হবে
    if (startBtn) startBtn.disabled = false;
  } else {
    if (loggedOutUI) loggedOutUI.classList.remove('hidden');
    if (loggedInUI) loggedInUI.classList.add('hidden');
    
    // লগআউট অবস্থায় Start বাটন ডিজেবল থাকবে
    if (startBtn) startBtn.disabled = true;
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

// ১. ক্যামেরা ও মাইক পারমিশন সেটআপ
async function setupMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error('Camera/Mic Error:', err);
    if (statusText) statusText.innerText = 'Camera or Microphone permission denied!';
  }
}

setupMedia();

// ২. Start বাটন
if (startBtn) {
  startBtn.addEventListener('click', () => {
    if (!localStream) {
      alert("Please allow camera and microphone access first!");
      return;
    }
    const language = languageSelect.value;
    const country = countrySelect.value;

    socket.emit('find-match', { language, country });
    startBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = false;
    if (statusText) statusText.innerText = 'Searching for a partner...';
  });
}

// ৩. Next বাটন
if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    closePeerConnection();
    if (statusText) statusText.innerText = 'Finding next partner...';
    socket.emit('next-user');
  });
}

socket.on('waiting', (msg) => {
  if (statusText) statusText.innerText = msg;
});

// ৪. Match Found
socket.on('match-found', async ({ roomId, isInitiator }) => {
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

// ৫. Signaling Data (WebRTC Handshake)
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

// ৬. Peer Connection তৈরি
function createPeerConnection() {
  closePeerConnection(); // পুরোনো কানেকশন থাকলে ক্লিনআপ করা

  peerConnection = new RTCPeerConnection(rtcConfig);

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
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

// ৮. Rematch
socket.on('start-rematch', ({ language, country }) => {
  closePeerConnection();
  socket.emit('find-match', { language, country });
});

// ৯. Peer Disconnect
socket.on('peer-disconnected', () => {
  closePeerConnection();
  if (statusText) statusText.innerText = 'Partner left. Click Next to continue.';
});