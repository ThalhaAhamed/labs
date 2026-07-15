# per-participant-video-recorder

Records each MeetStream participant video and audio stream as local files.

For a non-technical setup guide, read [quickstart.md](quickstart.md).

```
recordings/
  2026-07-09_13-02-05/
    dharrun 17/
      webcam.mp4
      audio.webm
    Alice/
      webcam.mp4
      screen_share.mp4
```

No audio/video merge. No FFmpeg.

## How It Works

`npm start` starts a local Express webhook server, opens an ngrok tunnel,
creates a MeetStream bot with `video_separate_streams: true` and
`audio_separate_streams: true`, then waits for the meeting to end.

Recordings are saved when either:

1. MeetStream sends `bot.stopped`.
2. You press Ctrl+C, which removes the bot, waits for `bot.stopped`, then saves recordings.

After that the app polls `get_recording_streams` and `get_audio_streams` until
MeetStream returns downloadable media URLs. It also writes the raw responses to
`recordings/<run-date-time>/debug_video_response.json` and
`recordings/<run-date-time>/debug_audio_response.json` for troubleshooting.

The current video response shape may be a top-level array:

```json
[
  {
    "participant": { "name": "dharrun 17" },
    "download_url": "https://...",
    "type": "webcam"
  }
]
```

Audio responses may use `participants[].streams[].segments[]`. Each downloadable
item is saved into that participant's folder using its media type, for example
`webcam.mp4` and `audio.webm`.

## Setup

```bash
npm install
```

Create `.env`:

```env
MEETSTREAM_API_KEY=...
MEETING_LINK=...
NGROK_AUTHTOKEN=...
```

Optional:

```env
BOT_NAME=MeetStream Recorder
OUTPUT_DIR=./recordings
PORT=3000
BOT_STOP_MAX_ATTEMPTS=6
BOT_STOP_RETRY_MS=10000
RECORDING_POLL_MAX_ATTEMPTS=20
RECORDING_POLL_INTERVAL_MS=15000
```

## Run

```bash
npm start
```

On Windows PowerShell, if `npm` is blocked by execution policy, use:

```powershell
npm.cmd start
```

## Test

`test_downloader.mjs` is only a local self-check. It does not join meetings,
call MeetStream, or record anything. Keep it if you want `npm test` to verify
that participant audio/video files still save into the right folders.

```bash
npm test
```

Or on Windows PowerShell:

```powershell
npm.cmd test
```
