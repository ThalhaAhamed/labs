/**
 * AssemblyAI provider
 * ─────────────────────────────────────────────────────────────────────────────
 * Free tier: https://www.assemblyai.com/dashboard/signup
 * Env required: ASSEMBLYAI_API_KEY
 *
 * Streams raw PCM to AssemblyAI's real-time STT v3 endpoint.
 */

import { WebSocket } from "ws";

const ASSEMBLYAI_URL =
  "wss://streaming.assemblyai.com/v3/ws" +
  "?sample_rate=48000&format_turns=true";

export default {
  name: "AssemblyAI (speech-to-text)",

  async connect(onResult) {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing ASSEMBLYAI_API_KEY. Sign up free: https://www.assemblyai.com/dashboard/signup"
      );
    }

    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(ASSEMBLYAI_URL, {
        headers: { Authorization: apiKey },
      });

      this.socket.on("open", () => resolve());

      this.socket.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }

        // AssemblyAI v3 sends message_type: "PartialTranscript" | "FinalTranscript"
        if (msg.message_type === "PartialTranscript" || msg.message_type === "FinalTranscript") {
          if (msg.text?.trim()) {
            const isFinal = msg.message_type === "FinalTranscript";
            onResult(msg.text, isFinal, { confidence: msg.confidence });
          }
        }
      });

      this.socket.on("error", (err) => reject(err));
    });
  },

  sendAudio(pcm) {
  console.log("Sending", pcm.length, "bytes to AssemblyAI");

  if (this.socket?.readyState === WebSocket.OPEN) {
    this.socket.send(JSON.stringify({
      audio_data: pcm.toString("base64")
    }));
  }
},

  async disconnect() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ terminate_session: true }));
      this.socket.close();
    }
  },
};
