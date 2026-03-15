const socket = io();

// Get name from URL
const urlParams = new URLSearchParams(window.location.search);
const userName = urlParams.get('name') || '';

// Player references
let videoPlayer; // video.js player (for direct videos)
let youtubePlayer; // YouTube iframe player
let currentSourceType = 'youtube';
let seeking = false;
let syncThreshold = 0.5;

// UI elements
const playerContainer = document.getElementById('player-container');
const youtubeContainer = document.getElementById('youtube-container');

// Initialize video.js player
videoPlayer = videojs('video-player', {
    controls: true,
    autoplay: false,
    preload: 'auto',
    fluid: true,
    sources: []
});

videoPlayer.ready(() => {
    console.log('Video.js player ready');
});

videoPlayer.on('play', () => {
    if (!seeking && currentSourceType === 'direct') {
        socket.emit('play', videoPlayer.currentTime());
    }
});

videoPlayer.on('pause', () => {
    if (!seeking && currentSourceType === 'direct') {
        socket.emit('pause', videoPlayer.currentTime());
    }
});

videoPlayer.on('seeked', () => {
    if (!seeking && currentSourceType === 'direct') {
        socket.emit('seek', videoPlayer.currentTime());
    }
    seeking = false;
});

videoPlayer.on('error', (error) => {
    console.error('Video.js error:', error);
    document.getElementById('loadStatus').textContent = 'Error loading video. The server may be blocking access or the format is unsupported.';
});

// YouTube IFrame API callback
window.onYouTubeIframeAPIReady = function() {
    console.log('YouTube API ready');
};

function createYouTubePlayer(videoId) {
    if (youtubePlayer) {
        youtubePlayer.destroy();
    }
    youtubeContainer.style.display = 'block';
    playerContainer.style.display = 'none';
    youtubePlayer = new YT.Player('youtube-player', {
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
}

function onYouTubeStateChange(event) {
    if (seeking) return;
    if (event.data === YT.PlayerState.PLAYING) {
        socket.emit('play', event.target.getCurrentTime());
    } else if (event.data === YT.PlayerState.PAUSED) {
        socket.emit('pause', event.target.getCurrentTime());
    }
}

// Join party
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
    if (type === 'youtube') {
        playerContainer.style.display = 'none';
        youtubeContainer.style.display = 'block';
        createYouTubePlayer(id);
        setTimeout(() => {
            if (youtubePlayer && youtubePlayer.seekTo) {
                youtubePlayer.seekTo(startTime, true);
                if (autoPlay) youtubePlayer.playVideo();
            }
        }, 1000);
    } else {
        youtubeContainer.style.display = 'none';
        playerContainer.style.display = 'block';
        // Let video.js handle the source – it will try to play whatever format the browser supports
        videoPlayer.src({ src: id });
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

// Manual play/pause buttons
document.getElementById('playBtn').addEventListener('click', () => {
    if (currentSourceType === 'youtube' && youtubePlayer) {
        youtubePlayer.playVideo();
    } else if (currentSourceType === 'direct' && videoPlayer) {
        videoPlayer.play();
    }
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (currentSourceType === 'youtube' && youtubePlayer) {
        youtubePlayer.pauseVideo();
    } else if (currentSourceType === 'direct' && videoPlayer) {
        videoPlayer.pause();
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