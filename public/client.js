const socket = io();

// Get name from URL
const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || '';

// Player references
let videoPlayer; // video.js player
let youtubePlayer; // YouTube iframe player
let currentSourceType = 'youtube';
let seeking = false;
let syncThreshold = 0.5;

// UI elements
const videoContainer = document.getElementById('player-container');
const embedContainer = document.getElementById('embed-container');
const videoElement = document.getElementById('video-player');
const embedElement = document.getElementById('embed-player');

// Hide both initially
videoContainer.style.display = 'none';
embedContainer.style.display = 'none';

// Initialize video.js player (for direct videos)
videoPlayer = videojs('video-player', {
    controls: true,
    autoplay: false,
    preload: 'auto',
    fluid: true,
    sources: []
});

videoPlayer.ready(() => {
    console.log('Video.js player ready');
    // Join after player is ready? But we need to wait for source.
});

// YouTube IFrame API callback
window.onYouTubeIframeAPIReady = function() {
    console.log('YouTube API ready');
    // We'll create player when needed
};

function createYouTubePlayer(videoId) {
    if (youtubePlayer) {
        youtubePlayer.destroy();
    }
    youtubePlayer = new YT.Player('embed-player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0
        },
        events: {
            onReady: onYouTubePlayerReady,
            onStateChange: onYouTubeStateChange
        }
    });
}

function onYouTubePlayerReady(event) {
    console.log('YouTube player ready');
    // Sync initial state if needed
    seeking = false;
}

function onYouTubeStateChange(event) {
    if (seeking) return;
    if (event.data === YT.PlayerState.PLAYING) {
        socket.emit('play', event.target.getCurrentTime());
    } else if (event.data === YT.PlayerState.PAUSED) {
        socket.emit('pause', event.target.getCurrentTime());
    }
}

// Join party once everything is loaded
socket.emit('join', userName, (response) => {
    if (response.success) {
        console.log('Joined as', response.name);
    }
});

// Socket event handlers
socket.on('init', (state) => {
    currentSourceType = state.sourceType;
    setSource(state.sourceType, state.videoId, state.currentTime, state.isPlaying);
    updateUserList(state.users);
    document.getElementById('userCount').textContent = state.users.length;
});

socket.on('sourceChanged', (data) => {
    currentSourceType = data.sourceType;
    setSource(data.sourceType, data.videoId, 0, false);
});

socket.on('play', (time) => {
    if (currentSourceType === 'youtube' && youtubePlayer) {
        const current = youtubePlayer.getCurrentTime();
        if (Math.abs(current - time) > syncThreshold) {
            seeking = true;
            youtubePlayer.seekTo(time, true);
            setTimeout(() => { seeking = false; }, 100);
        }
        youtubePlayer.playVideo();
    } else if (currentSourceType === 'direct' && videoPlayer) {
        const current = videoPlayer.currentTime();
        if (Math.abs(current - time) > syncThreshold) {
            seeking = true;
            videoPlayer.currentTime(time);
            setTimeout(() => { seeking = false; }, 100);
        }
        videoPlayer.play();
    }
    // For Google Drive embed, we cannot sync playback programmatically.
});

socket.on('pause', (time) => {
    if (currentSourceType === 'youtube' && youtubePlayer) {
        const current = youtubePlayer.getCurrentTime();
        if (Math.abs(current - time) > syncThreshold) {
            seeking = true;
            youtubePlayer.seekTo(time, true);
            setTimeout(() => { seeking = false; }, 100);
        }
        youtubePlayer.pauseVideo();
    } else if (currentSourceType === 'direct' && videoPlayer) {
        const current = videoPlayer.currentTime();
        if (Math.abs(current - time) > syncThreshold) {
            seeking = true;
            videoPlayer.currentTime(time);
            setTimeout(() => { seeking = false; }, 100);
        }
        videoPlayer.pause();
    }
});

socket.on('seek', (time) => {
    if (currentSourceType === 'youtube' && youtubePlayer) {
        seeking = true;
        youtubePlayer.seekTo(time, true);
        setTimeout(() => { seeking = false; }, 100);
    } else if (currentSourceType === 'direct' && videoPlayer) {
        seeking = true;
        videoPlayer.currentTime(time);
        setTimeout(() => { seeking = false; }, 100);
    }
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
    // For YouTube and direct, we rely on individual events, but can use sync as fallback
    if (currentSourceType === 'youtube' && youtubePlayer) {
        const current = youtubePlayer.getCurrentTime();
        if (Math.abs(current - data.currentTime) > syncThreshold) {
            seeking = true;
            youtubePlayer.seekTo(data.currentTime, true);
            setTimeout(() => { seeking = false; }, 100);
        }
        if (data.isPlaying && youtubePlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
            youtubePlayer.playVideo();
        } else if (!data.isPlaying && youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
            youtubePlayer.pauseVideo();
        }
    } else if (currentSourceType === 'direct' && videoPlayer) {
        const current = videoPlayer.currentTime();
        if (Math.abs(current - data.currentTime) > syncThreshold) {
            seeking = true;
            videoPlayer.currentTime(data.currentTime);
            setTimeout(() => { seeking = false; }, 100);
        }
        if (data.isPlaying && videoPlayer.paused()) {
            videoPlayer.play();
        } else if (!data.isPlaying && !videoPlayer.paused()) {
            videoPlayer.pause();
        }
    }
});

function setSource(type, id, startTime, autoPlay) {
    // Hide both containers
    videoContainer.style.display = 'none';
    embedContainer.style.display = 'none';
    
    if (type === 'youtube') {
        embedContainer.style.display = 'block';
        createYouTubePlayer(id);
        // Wait for player ready then seek and play
        setTimeout(() => {
            if (youtubePlayer && youtubePlayer.seekTo) {
                youtubePlayer.seekTo(startTime, true);
                if (autoPlay) youtubePlayer.playVideo();
            }
        }, 1000);
    } else if (type === 'googledrive-embed') {
        embedContainer.style.display = 'block';
        // Use Google Drive embed iframe
        embedElement.src = `https://drive.google.com/file/d/${id}/preview`;
    } else if (type === 'direct') {
        videoContainer.style.display = 'block';
        // Use video.js with the proxied URL
        videoPlayer.src({ src: id, type: 'video/mp4' }); // type may be detected automatically
        videoPlayer.currentTime(startTime);
        if (autoPlay) videoPlayer.play();
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

// Manual play/pause buttons (for YouTube and direct)
document.getElementById('playBtn').addEventListener('click', () => {
    if (currentSourceType === 'youtube' && youtubePlayer) {
        youtubePlayer.playVideo();
    } else if (currentSourceType === 'direct' && videoPlayer) {
        videoPlayer.play();
    } else {
        alert('Playback controls not available for this source (Google Drive embed). Use the player controls inside the iframe.');
    }
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (currentSourceType === 'youtube' && youtubePlayer) {
        youtubePlayer.pauseVideo();
    } else if (currentSourceType === 'direct' && videoPlayer) {
        videoPlayer.pause();
    } else {
        alert('Playback controls not available for this source (Google Drive embed). Use the player controls inside the iframe.');
    }
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