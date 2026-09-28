require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { parseArgs } = require("util");
const { selectProviders } = require("./src/providers");

const USAGE = `
  npm run fetch-sample                     build sample/clip.wav + sample/reference.txt
  npm run record    [-- --audio F --reference F]
                                           two bots join MEETING_LINK; one plays the clip, one records it
  npm run benchmark [-- --bot-id ID --reference F --providers a,b --rounds N --poll S]
                                           run that one recording through every provider, then score it
  npm run score     -- results/<run>       re-score a finished run offline (no API key needed)
`;

function latestRecording() {
  if (!fs.existsSync("recordings")) return null;
  const files = fs.readdirSync("recordings").filter((f) => f.endsWith(".json"));
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(path.join("recordings", b)).mtimeMs - fs.statSync(path.join("recordings", a)).mtimeMs);
  return JSON.parse(fs.readFileSync(path.join("recordings", files[0]), "utf8")).bot_id;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      audio: { type: "string", default: "sample/clip.wav" },
      reference: { type: "string" },
      "bot-id": { type: "string" },
      providers: { type: "string" },
      rounds: { type: "string", default: "3" },
      poll: { type: "string", default: "5" },
      timeout: { type: "string", default: "30" },
    },
  });
  const [command, target] = positionals;

  switch (command) {
    case "record": {
      if (!process.env.MEETING_LINK) throw new Error("MEETING_LINK is not set in your .env file.");
      if (!fs.existsSync(values.audio)) throw new Error(`${values.audio} not found. Run \`npm run fetch-sample\` first.`);
      const { record } = require("./src/recorder");
      await record({
        meetingLink: process.env.MEETING_LINK,
        audioPath: values.audio,
        referencePath: values.reference ?? "sample/reference.txt",
        port: parseInt(process.env.PORT || "3000", 10),
      });
      break;
    }
    case "benchmark": {
      const providers = selectProviders(values.providers);
      const botId = values["bot-id"] ?? latestRecording();
      if (!botId) throw new Error("No recording yet. Run `npm run record`, or pass --bot-id for an existing bot.");
      const { benchmark } = require("./src/benchmark");
      await benchmark({
        botId,
        referencePath: values.reference,
        providers,
        rounds: parseInt(values.rounds, 10),
        pollSeconds: parseFloat(values.poll),
        timeoutMinutes: parseFloat(values.timeout),
      });
      break;
    }
    case "score": {
      if (!target) throw new Error("Usage: npm run score -- results/<run>");
      const { score } = require("./src/report");
      console.log(score(target).markdown);
      break;
    }
    default:
      console.log(USAGE);
  }
}

main().then(
  // The ngrok tunnel keeps the event loop alive after a recording.
  () => process.exit(0),
  (err) => {
    console.error(`\n  ${err.message}\n`);
    process.exit(1);
  }
);
