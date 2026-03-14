const socket = io();

// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
if (roomId) {
    document.getElementById('roomDisplay').innerText = roomId;
} else {
    window.location.href = '/';
}

let player;
let isSeeking = false; // prevent feedback loop

// Load YouTube IFrame API
const tag = document.createElement('script');
tag.src = 'https://www.youtube.com/iframe_api';
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

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
    // Join room
    socket.emit('join-room', roomId, (response) => {
        if (response.error) {
            alert(response.error);
            window.location.href = '/';
        } else {
            // Load the correct video
            player.loadVideoById(response.videoId);
        }
    });
}

function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.PLAYING && !isSeeking) {
        socket.emit('play', { currentTime: player.getCurrentTime() });
    } else if (event.data == YT.PlayerState.PAUSED && !isSeeking) {
        socket.emit('pause', { currentTime: player.getCurrentTime() });
    }
}

// Handle remote events
socket.on('room-state', (state) => {
    player.loadVideoById(state.videoId);
    player.seekTo(state.currentTime);
    if (state.isPlaying) {
        player.playVideo();
    } else {
        player.pauseVideo();
    }
});

socket.on('play', (data) => {
    isSeeking = true;
    player.seekTo(data.currentTime);
    player.playVideo();
    setTimeout(() => { isSeeking = false; }, 100);
});

socket.on('pause', (data) => {
    isSeeking = true;
    player.seekTo(data.currentTime);
    player.pauseVideo();
    setTimeout(() => { isSeeking = false; }, 100);
});

socket.on('seek', (data) => {
    isSeeking = true;
    player.seekTo(data.currentTime);
    setTimeout(() => { isSeeking = false; }, 100);
});

// Manual control buttons
document.getElementById('playBtn').addEventListener('click', () => {
    player.playVideo();
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    player.pauseVideo();
});

// Chat
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

socket.on('chat-message', (data) => {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML += `<div><strong>${data.user}:</strong> ${data.message}</div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// Add system message when someone joins (optional)
socket.on('user-joined', (userId) => {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML += `<div class="system">User ${userId} joined</div>`;
});