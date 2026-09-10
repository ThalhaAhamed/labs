# Quickstart

Get an avatar into a live meeting in under 5 minutes.

1. **Install**

   ```bash
   npm install
   cp .env.example .env
   ```

   (Windows `cmd.exe`: `copy .env.example .env`. PowerShell: `Copy-Item .env.example .env`.)

2. **Add your keys** to `.env`: `MEETSTREAM_API_KEY` and `ANAM_API_KEY`.

3. **Find an avatar_id**

   ```bash
   npm run list-avatars
   ```

   Copy an `id` into `ANAM_AVATAR_ID` in `.env`.

4. **Set the meeting link** — paste a Google Meet, Zoom, or Teams link into `MEETING_LINK` in `.env`.

5. **Run it**

   ```bash
   npm start
   ```

The bot joins the call, and the avatar appears on its video tile talking within a few seconds.
