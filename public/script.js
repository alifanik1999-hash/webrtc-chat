const socket = io();

// DOM Elements
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

// STUN Server Configuration
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// ১. ক্যামেরা ও মাইক্রোফোন পারমিশন নেওয়া
async function startLocalMedia() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (localVideo) localVideo.srcObject = localStream;
    } catch (err) {
      console.error('Camera/Mic access error:', err);
      if (statusText) statusText.innerText = "Camera/Microphone permission required!";
    }
  }
}

// পেজ লোড হলেই লোকাল স্ট্রিম শুরু
startLocalMedia();

// ২. Start এবং Next বাটন হ্যান্ডলার
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

// ৩. Match Found হলে WebRTC Connection তৈরি
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

// ৪. Peer Connection ও Track ম্যানেজমেন্ট
async function createPeerConnection() {
  closePeerConnection();

  peerConnection = new RTCPeerConnection(rtcConfig);
  pendingCandidates = [];

  // Local Tracks যোগ করা
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // ICE Candidate ট্রান্সফার
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && currentRoomId) {
      socket.emit('signal', {
        roomId: currentRoomId,
        signal: { candidate: event.candidate }
      });
    }
  };

  // Remote Stream গ্রহণ করা
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

      // Autoplay নিশ্চিতকরণ
      remoteVideo.play().catch(e => console.log("Video Play Error:", e));
    }
  };
}

// ৫. Signaling Data হ্যান্ডলিং
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

// ৬. Peer Disconnect Cleanup
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