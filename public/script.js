import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
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

const reportBtn = document.getElementById('reportBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const nextBtn = document.getElementById('nextBtn');

const statusText = document.getElementById('status');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const fullScreenContainer = document.getElementById('fullScreenContainer');
const fullScreenBtn = document.getElementById('fullScreenBtn');

const muteMicBtn = document.getElementById('muteMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const countrySelect = document.getElementById('countrySelect');
const onlineCountDisplay = document.getElementById('onlineCount');

const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

/* Audio Elements */
const connectSound = document.getElementById('connectSound');
const disconnectSound = document.getElementById('disconnectSound');

function playSound(audioEl) {
  if (audioEl) {
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
  }
}

/* Dual-Screen Fullscreen Toggle */
if (fullScreenBtn && fullScreenContainer) {
  fullScreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      if (fullScreenContainer.requestFullscreen) {
        fullScreenContainer.requestFullscreen();
      } else if (fullScreenContainer.webkitRequestFullscreen) {
        fullScreenContainer.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  });
}

/* Auth Logic */
(async function initAuth() {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.error("Persistence Error:", err);
  }

  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      updateUIForUser(result.user);
    }
  } catch (error) {
    console.error("Redirect Login Error:", error);
  }
})();

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    if (statusText) statusText.innerText = "Connecting to Google...";
    try {
      await setPersistence(auth, browserLocalPersistence);
      provider.setCustomParameters({ prompt: 'select_account' });
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(auth, provider);
      } else {
        try {
          await signInWithPopup(auth, provider);
        } catch (popupErr) {
          await signInWithRedirect(auth, provider);
        }
      }
    } catch (error) {
      alert("Sign-in failed: " + error.message);
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => signOut(auth));
}

function updateUIForUser(user) {
  if (user) {
    if (loggedOutUI) loggedOutUI.classList.add('hidden');
    if (loggedInUI) loggedInUI.classList.remove('hidden');
    if (loginBtn) loginBtn.style.display = 'none';
    
    if (userNameDisplay) userNameDisplay.innerText = user.displayName || 'User';
    if (userPhotoDisplay) userPhotoDisplay.src = user.photoURL || 'https://via.placeholder.com/32';
    
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    
    if (statusText) statusText.innerText = "Click Start to find a partner!";
    startLocalMedia();
  } else {
    if (loggedOutUI) loggedOutUI.classList.remove('hidden');
    if (loggedInUI) loggedInUI.classList.add('hidden');
    if (loginBtn) loginBtn.style.display = 'block';
    
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    
    if (statusText) statusText.innerText = "Please sign in with Google to start";
  }
}

onAuthStateChanged(auth, (user) => {
  updateUIForUser(user);
});

/* Socket & WebRTC Connections */
const socket = io({ 
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10
});

let localStream = null;
let peerConnection = null;
let currentRoomId = null;
let pendingCandidates = [];

/* Robust WebRTC Configuration with Multiple Global STUN Servers */
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: "turn:talk-with-world.metered.live:80",
      username: "d2d148e6efef2cfd01e1471d",
      credential: "7gA+e532a/4Q9H2d"
    },
    {
      urls: "turn:talk-with-world.metered.live:443",
      username: "d2d148e6efef2cfd01e1471d",
      credential: "7gA+e532a/4Q9H2d"
    }
  ],
  iceCandidatePoolSize: 10
};

/* Camera & Mic Initialization */
async function startLocalMedia() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.muted = true;
        localVideo.setAttribute('playsinline', 'true');
        await localVideo.play().catch(e => console.log(e));
      }
    } catch (err) {
      if (statusText) statusText.innerText = "Camera/Mic permission required!";
    }
  }
}

document.addEventListener('DOMContentLoaded', startLocalMedia);

/* Controls */
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

/* Report and Ban Handling */
if (reportBtn) {
  reportBtn.addEventListener('click', () => {
    if (currentRoomId) {
      if (confirm("Are you sure you want to report this user?")) {
        socket.emit('report-partner', { roomId: currentRoomId });
        alert("Partner reported! Finding a new match...");
        stopConnection();
        socket.emit('next-user');
      }
    }
  });
}

socket.on('banned', (reason) => {
  alert("🚫 Access Blocked: " + reason);
  window.location.reload();
});

socket.on('online-users-count', (count) => {
  if (onlineCountDisplay) onlineCountDisplay.innerText = count;
});

/* Match Controls */
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

socket.on('start-rematch', ({ country }) => {
  socket.emit('find-match', { country });
});

socket.on('waiting', (msg) => {
  if (statusText) statusText.innerText = msg;
  disableChat();
});

socket.on('match-found', async ({ roomId, isInitiator }) => {
  if (statusText) statusText.innerText = "Connected with a partner!";
  playSound(connectSound);
  
  currentRoomId = roomId;
  enableChat();
  await createPeerConnection();

  if (isInitiator) {
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);
      socket.emit('signal', { roomId: currentRoomId, signal: offer });
    } catch (err) {
      console.error("Offer creation error:", err);
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

/* Peer Connection Management & Track Binding */
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
      socket.emit('signal', { roomId: currentRoomId, signal: { candidate: event.candidate } });
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    if (peerConnection) {
      const state = peerConnection.iceConnectionState;
      console.log("ICE Connection State:", state);
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        if (statusText) statusText.innerText = "Connection lost. Click Next to reconnect.";
        playSound(disconnectSound);
      }
    }
  };

  /* Ultra-Stable Remote Track Handler */
  peerConnection.ontrack = (event) => {
    console.log("Remote track received:", event.track.kind);
    
    let inboundStream = remoteVideo.srcObject;
    if (!inboundStream || !(inboundStream instanceof MediaStream)) {
      inboundStream = new MediaStream();
      remoteVideo.srcObject = inboundStream;
    }

    if (!inboundStream.getTracks().includes(event.track)) {
      inboundStream.addTrack(event.track);
    }

    remoteVideo.setAttribute('playsinline', 'true');
    remoteVideo.muted = false;

    const playRemoteVideo = async () => {
      try {
        if (remoteVideo.paused) {
          await remoteVideo.play();
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn("Remote video play warning:", err);
        }
      }
    };

    playRemoteVideo();
  };
}

socket.on('signal', async ({ signal }) => {
  if (!peerConnection) return;

  try {
    if (signal.type === 'offer') {
      if (peerConnection.signalingState !== "stable") {
        await peerConnection.setLocalDescription({type: "rollback"}).catch(() => {});
      }
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
      await processPendingCandidates();
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', { roomId: currentRoomId, signal: answer });
    } 
    else if (signal.type === 'answer') {
      if (peerConnection.signalingState === "have-local-offer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        await processPendingCandidates();
      }
    } 
    else if (signal.candidate) {
      const candidate = new RTCIceCandidate(signal.candidate);
      if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        await peerConnection.addIceCandidate(candidate);
      } else {
        pendingCandidates.push(candidate);
      }
    }
  } catch (err) {
    console.error("Signaling error:", err);
  }
});

async function processPendingCandidates() {
  while (pendingCandidates.length > 0) {
    const candidate = pendingCandidates.shift();
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (e) {
      console.error("Error adding pending ICE candidate", e);
    }
  }
}

socket.on('peer-disconnected', () => {
  if (statusText) statusText.innerText = "Partner disconnected. Click Next to search again.";
  playSound(disconnectSound);
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
    try {
      peerConnection.close();
    } catch (e) {}
    peerConnection = null;
  }
}