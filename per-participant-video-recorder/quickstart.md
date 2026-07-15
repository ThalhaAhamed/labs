# Quickstart

This guide is for running the recorder without needing to understand the code.

## What This Does

When you run this app, a MeetStream bot joins your meeting and records each
participant separately.

After the meeting ends, files are saved like this:

```text
recordings/
  2026-07-15_14-30-00/
    Person Name/
      webcam.mp4
      audio.webm
```

Video and audio are saved separately. This app does not merge them into one file.

## Before You Start

You need:

1. A MeetStream API key.
2. An ngrok auth token.
3. The meeting link you want the bot to join.
4. Node.js installed.

## First-Time Setup

Open PowerShell in this project folder:

```powershell
C:\Users\marju\Downloads\per-participant-video-recorder-update2\per-participant-video-recorder
```

Install the app once:

```powershell
npm.cmd install
```

Create a `.env` file and fill in these values:

```env
MEETSTREAM_API_KEY=your_meetstream_key_here
MEETING_LINK=your_meeting_link_here
NGROK_AUTHTOKEN=your_ngrok_token_here
```

Leave the other settings alone unless you know you need to change them.

## Start Recording

Run:

```powershell
npm.cmd start
```

Wait until you see:

```text
Bot joined meeting
```

Keep the PowerShell window open while the meeting is running.

## Stop Recording

When you want to stop:

1. Click the PowerShell window.
2. Press `Ctrl+C` once.
3. Wait until you see `Meeting complete`.

Do not press `Ctrl+C` a second time unless you want to force quit without saving.

## Find Your Recordings

Open the `recordings` folder.

Each run gets its own date/time folder:

```text
recordings/2026-07-15_14-30-00/
```

Inside that, each participant gets their own folder.

## Optional Test

You can run this to check that the save logic still works:

```powershell
npm.cmd test
```

This uses `test_downloader.mjs`. It does not start the bot, join a meeting, or
call MeetStream. It only checks the local file-saving logic.

## Common Problems

If PowerShell says scripts are disabled, use `npm.cmd` instead of `npm`.

Good:

```powershell
npm.cmd start
```

Avoid:

```powershell
npm start
```

If no files appear, check the newest folder inside `recordings`. The debug files
there can help show whether MeetStream returned audio/video URLs.
