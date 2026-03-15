const socket = io();

// Get name from URL
const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || '';

let player;
let playerReady = false;
let seeking = false;
let currentPlatform = 'youtube';
let useEmbedFallback = false;
let syncThreshold = 0.5; // seconds

// YouTube API callback
function onYouTubeIframeAPIReady() {
    // Will be called when API loads
}

// Initialize player based on platform
function initPlayer(platform, videoId, embedUrl) {
    const playerDiv = document.getElementById('player');
    const embedDiv = document.getElementById('embedFallback');
    const embedFrame = document.getElementById('embedFrame');
    
    currentPlatform = platform;
    
    // Hide both initially
    playerDiv.style.display = 'none';
    embedDiv.style.display = 'none';
    
    if (platform === 'youtube') {
        // Use YouTube player
        playerDiv.style.display = 'block';
        if (!player) {
            player = new YT.Player('player', {
                videoId: videoId,
                events: {
                    onReady: onPlayerReady,
                    onStateChange: onPlayerStateChange
                }
            });
        } else {
            player.loadVideoById(videoId);
            player.pauseVideo();
        }
        useEmbedFallback = false;
    }
    else if (platform === 'googledrive') {
        // Use iframe for Google Drive
        embedDiv.style.display = 'block';
        embedFrame.src = embedUrl || `https://drive.google.com/file/d/${videoId}/preview`;
        useEmbedFallback = true;
    }
    else {
        // For Netflix, Prime, etc. - try iframe (may not work due to CORS)
        embedDiv.style.display = 'block';
        embedFrame.src = videoId; // The URL itself
        useEmbedFallback = true;
    }
}

function onPlayerReady() {
    playerReady = true;
    socket.emit('join', userName, (response) => {
        if (response.success) {
            console.log('Joined as', response.name);
        }
    });
}

function onPlayerStateChange(event) {
    if (!playerReady || seeking || useEmbedFallback) return;

    if (event.data === YT.PlayerState.PLAYING) {
        socket.emit('play', player.getCurrentTime());
    } else if (event.data === YT.PlayerState.PAUSED) {
        socket.emit('pause', player.getCurrentTime());
    }
}

// Apply sync for YouTube (iframes can't be synced programmatically)
function applySync(serverTime, shouldBePlaying) {
    if (!playerReady || useEmbedFallback) return;
    
    const currentTime = player.getCurrentTime();
    const drift = Math.abs(currentTime - serverTime);
    
    if (drift > syncThreshold) {
        seeking = true;
        player.seekTo(serverTime);
        setTimeout(() => { seeking = false; }, 100);
    }
    
    const playerState = player.getPlayerState();
    if (shouldBePlaying && playerState !== YT.PlayerState.PLAYING) {
        player.playVideo();
    } else if (!shouldBePlaying && playerState === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    }
}

// Socket handlers
socket.on('init', (state) => {
    initPlayer(state.platform, state.videoId, state.embedUrl);
    
    // Only sync if we're using YouTube player
    if (state.platform === 'youtube' && playerReady) {
        player.seekTo(state.currentTime);
        if (state.isPlaying) {
            player.playVideo();
        } else {
            player.pauseVideo();
        }
    }
    
    updateUserList(state.users);
    document.getElementById('userCount').textContent = state.users.length;
});

socket.on('sourceChanged', (data) => {
    initPlayer(data.platform, data.videoId, data.embedUrl);
});

socket.on('play', (time) => {
    if (!playerReady || useEmbedFallback) return;
    
    const currentTime = player.getCurrentTime();
    if (Math.abs(currentTime - time) > syncThreshold) {
        seeking = true;
        player.seekTo(time);
        setTimeout(() => { seeking = false; }, 100);
    }
    player.playVideo();
});

socket.on('pause', (time) => {
    if (!playerReady || useEmbedFallback) return;
    
    const currentTime = player.getCurrentTime();
    if (Math.abs(currentTime - time) > syncThreshold) {
        seeking = true;
        player.seekTo(time);
        setTimeout(() => { seeking = false; }, 100);
    }
    player.pauseVideo();
});

socket.on('seek', (time) => {
    if (!playerReady || useEmbedFallback) return;
    
    seeking = true;
    player.seekTo(time);
    setTimeout(() => { seeking = false; }, 100);
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
    applySync(data.currentTime, data.isPlaying);
});

socket.on('error', (data) => {
    alert('Error: ' + data.message);
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
    if (playerReady && !useEmbedFallback) {
        player.playVideo();
    } else {
        alert('Playback controls only work for YouTube videos');
    }
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (playerReady && !useEmbedFallback) {
        player.pauseVideo();
    } else {
        alert('Playback controls only work for YouTube videos');
    }
});

document.getElementById('loadSourceBtn').addEventListener('click', () => {
    const platform = document.getElementById('platformSelect').value;
    const url = document.getElementById('sourceUrlInput').value.trim();
    
    if (!url) {
        alert('Please enter a URL or video ID');
        return;
    }
    
    socket.emit('changeSource', { platform, url });
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