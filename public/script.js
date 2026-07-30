import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithRedirect, 
  getRedirectResult,
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

/* Firebase Config */
const firebaseConfig = {
  apiKey: "AIzaSyCzFtRb0VPOuSalqoGe4Hn9AH9fKfpAhSg",
  authDomain: "my-video-chat-dde4c.firebaseapp.com",
  projectId: "my-video-chat-dde4c",
  storageBucket: "my-video-chat-dde4c.firebasestorage.app",
  messagingSenderId: "685304112979",
  appId: "1:685304112979:web:d0b094d9666b4413b0e3a6",
  measurementId: "G-2Z4X8B7HHY"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/* DOM Elements */
const loggedOutUI = document.getElementById('loggedOutUI');
const loggedInUI = document.getElementById('loggedInUI');
const userNameDisplay = document.getElementById('userName');
const userPhotoDisplay = document.getElementById('userPhoto');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

/* Control Elements */
const reportBtn = document.getElementById('reportBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const nextBtn = document.getElementById('nextBtn');

const statusText = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteMicBtn = document.getElementById('muteMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const countrySelect = document.getElementById('countrySelect');

/* Chat Elements */
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

/* Auth Handlers (Mobile Friendly Redirect) */
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    try {
      if (statusText) statusText.innerText = "Redirecting to Google Sign-in...";
      await signInWithRedirect(auth, provider);
    } catch (error) {
      alert("Sign in error: " + error.message);
    }
  });
}

// Handle Redirect Return
getRedirectResult(auth).catch((error) => {
  console.error("Redirect Login Error:", error);
});

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => signOut(auth));
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (loggedOutUI) loggedOutUI.classList.add('hidden');
    if (loggedInUI) loggedInUI.classList.remove('hidden');
    if (userNameDisplay) userNameDisplay.innerText = user.displayName || 'User';
    if (userPhotoDisplay) userPhotoDisplay.src = user.photoURL || 'https://via.placeholder.com/32';
    
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    
    if (statusText) statusText.innerText = "Click Start to find a partner!";
    await startLocalMedia();
  } else {
    if (loggedOutUI) loggedOutUI.classList.remove('hidden');
    if (loggedInUI) loggedInUI.classList.add('hidden');
    
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    
    if (statusText) statusText.innerText = "Please sign in with Google to start";
  }
});

/* WebRTC & Socket Setup */
const socket = io({ transports: ['websocket', 'polling'] });
let localStream = null;
let peerConnection = null;
let currentRoomId = null;
let pendingCandidates = [];

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: "turn:talk-with-world.metered.live:80",
      username: "d2d148e6efef2cfd01e1471d",
      credential: "7gA+e532a/4Q9H2d"
    },
    {
      urls: "turn:talk-with-world.metered.live:443",
      username: "d2d148e6efef2cfd01e1471d",
      credential: "7gA+e532a/4Q9H2d"
    },
    {
      urls: "turn:talk-with-world.metered.live:443?transport=tcp",
      username: "d2d148e6efef2cfd01e1471d",
      credential: "7gA+e532a/4Q9H2d"
    }
  ],
  iceCandidatePoolSize: 10
};

/* Noise Reduction & Audio Setup */
async function startLocalMedia() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.muted = true;
        localVideo.setAttribute('playsinline', true);
        await localVideo.play().catch(e => console.log(e));
      }
    } catch (err) {
      if (statusText) statusText.innerText = "Camera/Mic permission required!";
    }
  }
}

document.addEventListener('DOMContentLoaded', startLocalMedia);

/* Mic and Camera Toggle */
if (muteMicBtn) {
  muteMicBtn.addEventListener('click', () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        muteMicBtn.innerText = audioTrack.enabled ? "Mute Mic" : "Unmute Mic";
        muteMicBtn.style.backgroundColor = audioTrack.enabled ? "" : "#ef4444";
      }
    }
  });
}

if (toggleCamBtn) {
  toggleCamBtn.addEventListener('click', () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleCamBtn.innerText = videoTrack.enabled ? "Turn Off Cam" : "Turn On Cam";
        toggleCamBtn.style.backgroundColor = videoTrack.enabled ? "" : "#ef4444";
      }
    }
  });
}

/* Chat Logic */
function sendMessage() {
  const message = chatInput.value.trim();
  if (message && currentRoomId) {
    socket.emit('send-message', { roomId: currentRoomId, message });
    chatInput.value = '';
  }
}

if (sendBtn) sendBtn.addEventListener('click', sendMessage);
if (chatInput) {
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

socket.on('receive-message', ({ message }) => {
  if (statusText) statusText.innerText = `Partner: ${message}`;
});

/* Control Action Handlers */

// Report Button
if (reportBtn) {
  reportBtn.addEventListener('click', () => {
    if (currentRoomId) {
      alert("Partner reported successfully! Searching for a new match...");
      stopConnection();
      socket.emit('next-user');
    } else {
      alert("No active partner to report.");
    }
  });
}

// Start Button
if (startBtn) {
  startBtn.addEventListener('click', async () => {
    await startLocalMedia();
    const country = countrySelect ? countrySelect.value : 'Global';

    if (statusText) statusText.innerText = `Searching for a partner from ${country}...`;
    socket.emit('find-match', { country });
    
    startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    if (nextBtn) nextBtn.disabled = false;
  });
}

// Stop Function & Button
function stopConnection() {
  if (remoteVideo) remoteVideo.srcObject = null;
  closePeerConnection();
  disableChat();
  currentRoomId = null;
  
  if (statusText) statusText.innerText = "Stopped. Click Start to search again.";
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;
}

if (stopBtn) {
  stopBtn.addEventListener('click', () => {
    socket.emit('leave-room');
    stopConnection();
  });
}

// Next Button
if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    if (remoteVideo) remoteVideo.srcObject = null;
    closePeerConnection();
    if (statusText) statusText.innerText = "Searching for new partner...";
    disableChat();
    
    if (stopBtn) stopBtn.disabled = false;
    socket.emit('next-user');
  });
}

/* Socket Events */
socket.on('start-rematch', ({ country }) => {
  socket.emit('find-match', { country });
});

socket.on('waiting', (msg) => {
  if (statusText) statusText.innerText = msg;
  disableChat();
});

socket.on('match-found', async ({ roomId, isInitiator }) => {
  if (statusText) statusText.innerText = "Connected with a partner!";
  currentRoomId = roomId;
  enableChat();
  await createPeerConnection();

  if (isInitiator) {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('signal', { roomId: currentRoomId, signal: offer });
    } catch (err) {
      console.error(err);
    }
  }
});

function enableChat() {
  if (chatInput) {
    chatInput.disabled = false;
    chatInput.placeholder = "Type a message...";
  }
  if (sendBtn) sendBtn.disabled = false;
}

function disableChat() {
  if (chatInput) {
    chatInput.disabled = true;
    chatInput.placeholder = "Connect with a partner to chat...";
    chatInput.value = "";
  }
  if (sendBtn) sendBtn.disabled = true;
}

/* WebRTC Signaling & Connection Logic */
async function createPeerConnection() {
  closePeerConnection();
  peerConnection = new RTCPeerConnection(rtcConfig);
  pendingCandidates = [];

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoomId) {
      socket.emit('signal', { roomId: currentRoomId, signal: { candidate: event.candidate } });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    if (peerConnection) {
      const state = peerConnection.iceConnectionState;
      if (state === 'failed' || state === 'closed') {
        if (statusText) statusText.innerText = "Connection lost. Click Next/Start to reconnect.";
        disableChat();
        if (remoteVideo) remoteVideo.srcObject = null;
      }
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
      remoteVideo.setAttribute('playsinline', true);
      remoteVideo.play().catch(e => console.log(e));
    }
  };
}

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
    console.error(err);
  }
});

async function processPendingCandidates() {
  while (pendingCandidates.length > 0) {
    const candidate = pendingCandidates.shift();
    await peerConnection.addIceCandidate(candidate);
  }
}

socket.on('peer-disconnected', () => {
  if (statusText) statusText.innerText = "Partner disconnected. Click Next/Start to search again.";
  if (remoteVideo) remoteVideo.srcObject = null;
  disableChat();
  closePeerConnection();
  if (startBtn) startBtn.disabled = false;
  if (stopBtn) stopBtn.disabled = true;
});

function closePeerConnection() {
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.oniceconnectionstatechange = null;
    peerConnection.close();
    peerConnection = null;
  }
}