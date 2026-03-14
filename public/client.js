const socket = io();

// Get name from URL
const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || '';

let player;
let playerReady = false;
let seeking = false; // prevent event loop

// YouTube API callback
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        videoId: 'dQw4w9WgXcQ', // placeholder
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange
        }
    });
}

function onPlayerReady() {
    playerReady = true;
    // Join the party
    socket.emit('join', userName, (response) => {
        if (response.success) {
            console.log('Joined as', response.name);
        }
    });
}

function onPlayerStateChange(event) {
    if (!playerReady || seeking) return;

    if (event.data === YT.PlayerState.PLAYING) {
        socket.emit('play', player.getCurrentTime());
    } else if (event.data === YT.PlayerState.PAUSED) {
        socket.emit('pause', player.getCurrentTime());
    }
}

// Socket event handlers
socket.on('init', (state) => {
    if (!playerReady) return;
    player.loadVideoById(state.videoId);
    player.seekTo(state.currentTime);
    if (state.isPlaying) {
        player.playVideo();
    } else {
        player.pauseVideo();
    }
    updateUserList(state.users);
    document.querySelector('.stats span').textContent = state.users.length;
});

socket.on('play', (time) => {
    if (!playerReady) return;
    seeking = true;
    player.seekTo(time);
    player.playVideo();
    setTimeout(() => seeking = false, 100);
});

socket.on('pause', (time) => {
    if (!playerReady) return;
    seeking = true;
    player.seekTo(time);
    player.pauseVideo();
    setTimeout(() => seeking = false, 100);
});

socket.on('seek', (time) => {
    if (!playerReady) return;
    seeking = true;
    player.seekTo(time);
    setTimeout(() => seeking = false, 100);
});

socket.on('videoChanged', (videoId) => {
    if (!playerReady) return;
    player.loadVideoById(videoId);
    player.pauseVideo();
});

socket.on('users', (users) => {
    updateUserList(users);
    document.querySelector('.stats span').textContent = users.length;
});

socket.on('chat', (data) => {
    const msgDiv = document.getElementById('messages');
    const className = data.system ? 'system' : '';
    msgDiv.innerHTML += `<div class="${className}"><strong>${data.user}:</strong> ${data.message}</div>`;
    msgDiv.scrollTop = msgDiv.scrollHeight;
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

// UI Controls
document.getElementById('playBtn').addEventListener('click', () => {
    if (playerReady) player.playVideo();
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (playerReady) player.pauseVideo();
});

document.getElementById('changeVideoBtn').addEventListener('click', () => {
    const input = document.getElementById('videoUrlInput').value.trim();
    const videoId = extractVideoId(input);
    if (videoId) {
        socket.emit('changeVideo', videoId);
    } else {
        alert('Invalid YouTube URL or video ID');
    }
});

function extractVideoId(url) {
    // Regex to extract YouTube video ID from various URL formats
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = url.match(regex);
    if (match) return match[1];
    // If input is exactly 11 characters, assume it's a video ID
    if (url.length === 11) return url;
    return null;
}

// Chat
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('chat', msg);
        input.value = '';
    }
}

// Ping server every 30 seconds to keep connection alive
setInterval(() => {
    socket.emit('ping');
}, 30000);