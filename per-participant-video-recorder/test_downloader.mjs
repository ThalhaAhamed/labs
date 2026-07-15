import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import {
  hasParticipantAudio,
  hasParticipantVideos,
  processParticipantRecordings,
} from './src/downloader.js';
import { formatTimestampForFolder } from './src/utils.js';

const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meetstream-video-'));
const downloads = [];

const videoData = [
  {
    participant: { name: 'dharrun 17' },
    download_url: 'https://example.com/dharrun_17_889297633_0.mp4?token=test',
    type: 'webcam',
  },
  {
    participant: { name: 'Alice' },
    download_url: 'https://example.com/alice_123.mp4?token=test',
    type: 'webcam',
  },
];

const audioData = {
  participants: [
    {
      participant_name: 'dharrun 17',
      streams: [
        {
          segments: [
            {
              segment_index: 0,
              url: 'https://example.com/dharrun_17_audio.webm?token=test',
              filename: 'dharrun_17_audio.webm',
            },
          ],
        },
      ],
    },
  ],
};

assert.equal(hasParticipantVideos([]), false);
assert.equal(hasParticipantVideos(videoData), true);
assert.equal(hasParticipantAudio([]), false);
assert.equal(hasParticipantAudio(audioData), true);

await processParticipantRecordings({
  videoData,
  audioData,
  outputDir,
  client: {
    async downloadMedia(url, destPath) {
      downloads.push({ url, destPath });
      await fs.ensureDir(path.dirname(destPath));
      await fs.writeFile(destPath, url);
    },
  },
});

assert.equal(downloads.length, 3);
assert.equal(path.basename(downloads[0].destPath), 'webcam.mp4');
assert.ok(await fs.pathExists(path.join(outputDir, 'dharrun 17', 'webcam.mp4')));
assert.ok(await fs.pathExists(path.join(outputDir, 'dharrun 17', 'audio.webm')));
assert.ok(await fs.pathExists(path.join(outputDir, 'Alice', 'webcam.mp4')));
assert.equal(
  formatTimestampForFolder(new Date(2026, 6, 9, 13, 2, 5)),
  '2026-07-09_13-02-05'
);

await fs.remove(outputDir);
console.log('downloader self-check passed');
