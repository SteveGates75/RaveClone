const socket = io();

// Get room ID and optional username from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const requestedUserName = urlParams.get('name') || '';

if (!roomId) {
    window.location.href = '/';
}
document.getElementById('roomDisplay').innerText = roomId;
document.getElementById('roomIdDisplay').innerText = roomId;

let player;
let isSeeking = false; // prevent feedback loop
let localVideoId = null;

// Load YouTube IFrame API
let playerReady = false;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '400',
        width: '100%',
        videoId: 'dQw4w9WgXcQ', // temporary, will be updated
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    playerReady = true;
    // Join room
    socket.emit('join-room', { roomId, requestedUserName }, (response) => {
        if (response.error) {
            alert(response.error);
            window.location.href = '/';
        } else {
            // The video will be set by 'room-state' event
        }
    });
}

function onPlayerStateChange(event) {
    if (!playerReady || isSeeking) return;

    if (event.data == YT.PlayerState.PLAYING) {
        socket.emit('play', { currentTime: player.getCurrentTime() });
    } else if (event.data == YT.PlayerState.PAUSED) {
        socket.emit('pause', { currentTime: player.getCurrentTime() });
    }
}

// Socket event handlers
socket.on('room-state', (state) => {
    if (!playerReady) return;
    localVideoId = state.videoId;
    player.loadVideoById(state.videoId);
    player.seekTo(state.currentTime);
    if (state.isPlaying) {
        player.playVideo();
    } else {
        player.pauseVideo();
    }
    // Update user list
    updateUserList(state.users);
});

socket.on('play', (data) => {
    if (!playerReady) return;
    isSeeking = true;
    player.seekTo(data.currentTime);
    player.playVideo();
    setTimeout(() => { isSeeking = false; }, 100);
});

socket.on('pause', (data) => {
    if (!playerReady) return;
    isSeeking = true;
    player.seekTo(data.currentTime);
    player.pauseVideo();
    setTimeout(() => { isSeeking = false; }, 100);
});

socket.on('seek', (data) => {
    if (!playerReady) return;
    isSeeking = true;
    player.seekTo(data.currentTime);
    setTimeout(() => { isSeeking = false; }, 100);
});

socket.on('video-changed', (data) => {
    if (!playerReady) return;
    localVideoId = data.videoId;
    player.loadVideoById(data.videoId);
    player.pauseVideo(); // start paused
});

socket.on('user-list', (users) => {
    updateUserList(users);
});

function updateUserList(users) {
    const list = document.getElementById('userList');
    list.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        list.appendChild(li);
    });
}

// Chat
socket.on('chat-message', (data) => {
    const messagesDiv = document.getElementById('messages');
    const messageClass = data.system ? 'system' : '';
    messagesDiv.innerHTML += `<div class="${messageClass}"><strong>${data.user}:</strong> ${data.message}</div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// UI Controls
document.getElementById('playBtn').addEventListener('click', () => {
    if (playerReady) player.playVideo();
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (playerReady) player.pauseVideo();
});

document.getElementById('changeVideoBtn').addEventListener('click', () => {
    const input = document.getElementById('videoUrlInput').value.trim();
    let videoId = extractVideoId(input);
    if (videoId && playerReady) {
        socket.emit('change-video', { videoId });
    } else {
        alert('Invalid YouTube URL or Video ID');
    }
});

function extractVideoId(input) {
    // Simple extraction: if it looks like a URL, try to get v parameter
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = input.match(regex);
    if (match) return match[1];
    // If input is 11 characters, assume it's a video ID
    if (input.length === 11) return input;
    return null;
}

// Send message on button click or Enter
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('chat-message', msg);
        input.value = '';
    }
}