const socket = io();

// Get name from URL
const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || '';

let player;
let playerReady = false;
let seeking = false;
let currentSourceType = 'youtube';
let syncThreshold = 0.5; // seconds

// Initialize Video.js player
document.addEventListener('DOMContentLoaded', () => {
    player = videojs('player', {
        controls: true,
        autoplay: false,
        preload: 'auto',
        fluid: true,
        techOrder: ['html5', 'youtube'],
        sources: []
    });

    player.ready(() => {
        playerReady = true;
        console.log('Video.js player ready');
        
        // Join party
        socket.emit('join', userName, (response) => {
            if (response.success) {
                console.log('Joined as', response.name);
            }
        });

        // Handle local playback events to send to server
        player.on('play', () => {
            if (!seeking && playerReady) {
                socket.emit('play', player.currentTime());
            }
        });

        player.on('pause', () => {
            if (!seeking && playerReady) {
                socket.emit('pause', player.currentTime());
            }
        });

        player.on('seeked', () => {
            if (!seeking && playerReady) {
                socket.emit('seek', player.currentTime());
            }
            seeking = false;
        });

        player.on('error', (error) => {
            console.error('Player error:', error);
            let errorMessage = 'Error loading video. ';
            if (error.code === 4) {
                errorMessage += 'The video format may be unsupported or the URL is not directly playable. Try a different source.';
            } else if (error.code === 2) {
                errorMessage += 'Network error – the video could not be fetched.';
            } else {
                errorMessage += 'Check the URL and try again.';
            }
            document.getElementById('loadStatus').textContent = errorMessage;
        });
    });
});

// Socket event handlers
socket.on('init', (state) => {
    currentSourceType = state.sourceType;
    setVideoSource(state.sourceType, state.videoUrl, state.currentTime, state.isPlaying);
    updateUserList(state.users);
    document.getElementById('userCount').textContent = state.users.length;
});

socket.on('sourceChanged', (data) => {
    currentSourceType = data.sourceType;
    setVideoSource(data.sourceType, data.videoUrl, 0, false);
});

socket.on('play', (time) => {
    if (!playerReady) return;
    const currentTime = player.currentTime();
    if (Math.abs(currentTime - time) > syncThreshold) {
        seeking = true;
        player.currentTime(time);
    }
    player.play();
});

socket.on('pause', (time) => {
    if (!playerReady) return;
    const currentTime = player.currentTime();
    if (Math.abs(currentTime - time) > syncThreshold) {
        seeking = true;
        player.currentTime(time);
    }
    player.pause();
});

socket.on('seek', (time) => {
    if (!playerReady) return;
    seeking = true;
    player.currentTime(time);
});

socket.on('users', (users) => {
    updateUserList(users);
    document.getElementById('userCount').textContent = users.length;
});

socket.on('chat', (data) => {
    const msgDiv = document.getElementById('messages');
    const className = data.system ? 'system' : '';
    msgDiv.innerHTML += `<div class="${className}"><strong>${data.user}:</strong> ${data.message}</div>`;
    msgDiv.scrollTop = msgDiv.scrollHeight;
});

socket.on('sync', (data) => {
    if (!playerReady) return;
    applySync(data.currentTime, data.isPlaying);
});

function applySync(serverTime, shouldBePlaying) {
    if (!playerReady) return;
    const currentTime = player.currentTime();
    const drift = Math.abs(currentTime - serverTime);
    if (drift > syncThreshold) {
        seeking = true;
        player.currentTime(serverTime);
        setTimeout(() => { seeking = false; }, 100);
    }
    if (shouldBePlaying && player.paused()) {
        player.play();
    } else if (!shouldBePlaying && !player.paused()) {
        player.pause();
    }
}

function setVideoSource(type, url, startTime, autoPlay) {
    if (!playerReady) return;

    // Clear previous source
    player.src('');

    if (type === 'youtube') {
        // Use the YouTube plugin
        player.src({ type: 'video/youtube', src: `https://www.youtube.com/watch?v=${url}` });
    } else {
        // For direct videos (MP4, WebM, HLS, Google Drive direct view)
        let mimeType = 'video/mp4';
        if (url.includes('.m3u8')) mimeType = 'application/x-mpegURL';
        else if (url.includes('.webm')) mimeType = 'video/webm';
        else if (url.includes('.ogg')) mimeType = 'video/ogg';
        else if (url.includes('.mov')) mimeType = 'video/quicktime';
        
        player.src({ type: mimeType, src: url });
    }

    player.currentTime(startTime);
    if (autoPlay) {
        player.play().catch(e => console.log('Autoplay prevented:', e));
    } else {
        player.pause();
    }
}

function updateUserList(users) {
    const list = document.getElementById('userList');
    list.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        list.appendChild(li);
    });
}

// Load video button
document.getElementById('loadVideoBtn').addEventListener('click', () => {
    const url = document.getElementById('videoUrlInput').value.trim();
    if (!url) {
        alert('Please enter a URL');
        return;
    }

    const statusDiv = document.getElementById('loadStatus');
    statusDiv.textContent = 'Loading...';
    
    socket.emit('loadVideo', url, (response) => {
        if (response.success) {
            statusDiv.textContent = 'Video loaded!';
            setTimeout(() => { statusDiv.textContent = ''; }, 3000);
        } else {
            statusDiv.textContent = 'Error: ' + response.error;
        }
    });
});

// Manual play/pause buttons
document.getElementById('playBtn').addEventListener('click', () => {
    if (playerReady) player.play();
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (playerReady) player.pause();
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
        socket.emit('chat', msg);
        input.value = '';
    }
}

// Ping server every 30 seconds
setInterval(() => {
    socket.emit('ping');
}, 30000);