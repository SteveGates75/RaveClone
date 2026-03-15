# Multi-Platform Watch Party (Rave Clone)

Watch videos together from multiple platforms:
- ✅ YouTube (full sync with play/pause/seek)
- ✅ Google Drive (public videos via embed)
- ✅ Netflix, Prime Video, Disney+, HBO Max (experimental - via iframe)

## Features

- **Multi-platform support** – Select from dropdown and paste any URL
- **Google Drive integration** – Share your personal videos [citation:5][citation:6]
- **Real-time chat** – Text chat with system messages
- **Live user list** – See who's watching
- **Smooth sync** – Periodic drift correction for YouTube

## How to Use Different Platforms

### YouTube
- Paste any YouTube URL or video ID
- Full playback control sync

### Google Drive
1. Upload video to Google Drive
2. Set sharing to "Anyone with the link can view"
3. Paste the sharing link
4. Video will embed (playback not synced, but everyone sees same video)

### Netflix / Prime / Disney+
- Paste the direct video URL
- Note: Due to DRM and platform restrictions, these will open in iframes
- Each user needs their own account/login
- Playback cannot be programmatically synced, but everyone can start manually

## Technical Notes

- Google Drive uses the public embed feature [citation:6]
- Premium streaming platforms are embedded – users control their own playback
- For full sync with Netflix/Prime, a browser extension would be needed [citation:3]

## Installation

```bash
npm install
npm start