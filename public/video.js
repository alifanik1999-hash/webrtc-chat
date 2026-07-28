const socket = io();

const startBtn = document.getElementById('startBtn');
const hangupBtn = document.getElementById('hangupBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusText = document.getElementById('status');

const chatBox = document.getElementById('chatBox');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

let localStream;
let peerConnection;
let iceCandidatesQueue = []; // Candidate ধরে রাখার জন্য Queue

// STUN ও TURN সার্ভার কনফিগারেশন
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // আপনার মিটার্ড TURN সার্ভার Credentials এখানে বসাবেন
        {
            urls: "turn:a.relay.metered.ca:443?transport=tcp",
            username: "YOUR_TURN_USERNAME", 
            credential: "YOUR_TURN_PASSWORD"
        }
    ]
};

// ১. কল শুরু করা
startBtn.addEventListener('click', async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        statusText.innerText = "Status: Camera Started. Waiting for peer...";
        
        startBtn.disabled = true;
        hangupBtn.disabled = false;
        
        createPeerConnection();
    } catch (error) {
        console.error('Error accessing camera/mic:', error);
        alert('Could not access camera or microphone.');
    }
});

// ২. কল কেটে দেওয়া (Hang Up)
hangupBtn.addEventListener('click', () => {
    hangUp();
    socket.emit('hangup');
});

function hangUp() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
    }
    remoteVideo.srcObject = null;
    statusText.innerText = "Status: Disconnected";
    iceCandidatesQueue = [];
    
    startBtn.disabled = false;
    hangupBtn.disabled = true;
    messageInput.disabled = true;
    sendBtn.disabled = true;
}

// Peer Connection তৈরি
function createPeerConnection() {
    if (peerConnection) return;

    peerConnection = new RTCPeerConnection(configuration);

    // স্থানীয় স্ট্রিম যোগ করা
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // পার্টনারের ভিডিও ট্র্যাক পাওয়ার পর
    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    // লোকাল ICE Candidate তৈরি হলে পাঠাবে
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('candidate', event.candidate);
        }
    };

    // অটোমেটিক অফার তৈরির জন্য
    peerConnection.onnegotiationneeded = async () => {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer);
        } catch (e) {
            console.error('Error creating offer:', e);
        }
    };
}

// সকেট ইভেন্ট হ্যান্ডলিং

// Offer রিসিভ করা
socket.on('offer', async (offer) => {
    try {
        // ক্যামেরা চালু না থাকলে আগে ক্যামেরা চালু নিশ্চিত করা
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            startBtn.disabled = true;
            hangupBtn.disabled = false;
        }

        createPeerConnection();

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        // পেন্ডিং থাকা ক্যান্ডিডেটগুলো প্রসেস করা
        await processQueuedCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit('answer', answer);
        enableChat();
    } catch (err) {
        console.error("Error handling offer:", err);
    }
});

// Answer রিসিভ করা
socket.on('answer', async (answer) => {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        // পেন্ডিং থাকা ক্যান্ডিডেটগুলো প্রসেস করা
        await processQueuedCandidates();
        enableChat();
    } catch (err) {
        console.error("Error handling answer:", err);
    }
});

// Candidate রিসিভ করা (Queue সহ)
socket.on('candidate', async (candidate) => {
    try {
        if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            // RemoteDescription সেট হওয়ার আগ পর্যন্ত ক্যান্ডিডেট জমিয়ে রাখা
            iceCandidatesQueue.push(candidate);
        }
    } catch (e) {
        console.error('Error adding ice candidate:', e);
    }
});

// জমিয়ে রাখা Candidates যুক্ত করার ফাংশন
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

socket.on('hangup', () => {
    hangUp();
    alert('The other user ended the call.');
});

// ৩. চ্যাট ফিচার লজিক
function enableChat() {
    statusText.innerText = "Status: Connected!";
    messageInput.disabled = false;
    sendBtn.disabled = false;
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const msg = messageInput.value.trim();
    if (msg !== '') {
        appendMessage('You', msg);
        socket.emit('chat-message', msg);
        messageInput.value = '';
    }
}

socket.on('chat-message', (msg) => {
    appendMessage('Peer', msg);
});

function appendMessage(sender, msg) {
    const msgDiv = document.createElement('div');
    msgDiv.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}