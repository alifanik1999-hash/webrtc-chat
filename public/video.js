const socket = io();

const startBtn = document.getElementById('startBtn'); // বা আপনার UI এর Start বাটন
const nextBtn = document.getElementById('nextBtn');   // Next বাটন
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusText = document.getElementById('status');

let localStream;
let peerConnection;
let partnerSocketId = null;
let iceCandidatesQueue = [];

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: "turn:a.relay.metered.ca:443?transport=tcp",
            username: "YOUR_TURN_USERNAME", // আপনার Metered Username
            credential: "YOUR_TURN_PASSWORD"  // আপনার Metered Password
        }
    ]
};

// ১. ক্যামেরা শুরু করা
async function initCamera() {
    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
        } catch (error) {
            console.error('Error accessing camera/mic:', error);
            alert('Camera/Microphone access required.');
        }
    }
}

// Start বাটন ক্লিক
if (startBtn) {
    startBtn.addEventListener('click', async () => {
        await initCamera();
        statusText.innerText = "Searching for a partner...";
        socket.emit('find-partner'); // সার্ভারকে পার্টনার খুঁজতে বলা
    });
}

// Next বাটন ক্লিক
if (nextBtn) {
    nextBtn.addEventListener('click', async () => {
        resetConnection();
        await initCamera();
        statusText.innerText = "Searching for next partner...";
        socket.emit('find-partner');
    });
}

function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    partnerSocketId = null;
    iceCandidatesQueue = [];
}

// Peer Connection তৈরি
function createPeerConnection() {
    if (peerConnection) return;

    peerConnection = new RTCPeerConnection(configuration);

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
        if (event.candidate && partnerSocketId) {
            socket.emit('candidate', { target: partnerSocketId, candidate: event.candidate });
        }
    };
}

// ================= SOCKET EVENTS =================

// পার্টনার ম্যাচ হলে সার্ভার এই ইভেন্ট পাঠাবে
socket.on('match-found', async (data) => {
    statusText.innerText = "Connected with a partner!";
    partnerSocketId = data.target;
    const isInitiator = data.isInitiator; // কে আগে কল শুরু করবে

    createPeerConnection();

    // শুধুমাত্র একজনই Offer তৈরি করবে
    if (isInitiator) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', { target: partnerSocketId, offer });
        } catch (e) {
            console.error('Error creating offer:', e);
        }
    }
});

socket.on('offer', async (data) => {
    try {
        partnerSocketId = data.sender;
        createPeerConnection();

        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        await processQueuedCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('answer', { target: partnerSocketId, answer });
    } catch (err) {
        console.error("Error handling offer:", err);
    }
});

socket.on('answer', async (data) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        await processQueuedCandidates();
    } catch (err) {
        console.error("Error handling answer:", err);
    }
});

socket.on('candidate', async (data) => {
    try {
        if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
            iceCandidatesQueue.push(data.candidate);
        }
    } catch (e) {
        console.error('Error adding ice candidate:', e);
    }
});

async function processQueuedCandidates() {
    while (iceCandidatesQueue.length > 0) {
        const candidate = iceCandidatesQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding queued candidate:', e);
        }
    }
}

socket.on('partner-left', () => {
    resetConnection();
    statusText.innerText = "Partner left. Click Next to continue.";
});