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

const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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

// ২. কল কেটে দেওয়া (Hang Up)
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
    
    startBtn.disabled = false;
    hangupBtn.disabled = true;
    messageInput.disabled = true;
    sendBtn.disabled = true;
}

// Peer Connection তৈরি
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('candidate', event.candidate);
        }
    };

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
socket.on('offer', async (offer) => {
    if (!peerConnection) createPeerConnection();

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.emit('answer', answer);
    enableChat();
});

socket.on('answer', async (answer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    enableChat();
});

socket.on('candidate', async (candidate) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

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