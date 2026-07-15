import path from 'path';
import fs from 'fs-extra';
import pLimit from 'p-limit';
import logger from './logger.js';
import { sanitizeFilename, dedupeName } from './utils.js';

const CONCURRENCY = 4;

/**
 * Downloads each per-participant media stream into:
 *
 *   recordings/
 *     <Participant Name>/
 *       webcam.mp4
 *       audio.webm
 *
 * @param {object} params
 * @param {object|object[]|null} params.videoData
 * @param {object|object[]|null} params.audioData
 * @param {import('./meetstream.js').MeetStreamClient} params.client
 * @param {string} params.outputDir
 */
export async function processParticipantRecordings({ videoData, audioData, client, outputDir }) {
  const participants = mergeMediaByParticipant({ videoData, audioData });

  if (participants.size === 0) {
    logger.warn('No participant audio or video recordings were reported for this meeting.');
    return;
  }

  await fs.ensureDir(outputDir);
  const usedNames = new Set();
  const limit = pLimit(CONCURRENCY);

  const jobs = [...participants.values()].map((entry) =>
    limit(() => processOneParticipant({ entry, client, outputDir, usedNames }))
  );

  const results = await Promise.allSettled(jobs);
  const failures = results.filter((r) => r.status === 'rejected');
  for (const f of failures) {
    logger.error(`Participant download failed: ${f.reason?.message ?? f.reason}`);
  }

  logger.info(
    `${results.length - failures.length}/${results.length} participant recording folder(s) saved to ${outputDir}`
  );
}

/**
 * @param {object|object[]|null} videoData
 * @returns {boolean}
 */
export function hasParticipantVideos(videoData) {
  return getMediaRecords(videoData, 'video').some((media) => getMediaUrl(media));
}

/**
 * @param {object|object[]|null} audioData
 * @returns {boolean}
 */
export function hasParticipantAudio(audioData) {
  return getMediaRecords(audioData, 'audio').some((media) => getMediaUrl(media));
}

/**
 * @param {object} params
 * @param {object|object[]|null} params.videoData
 * @param {object|object[]|null} params.audioData
 * @returns {Map<string, { name: string, videos: object[], audios: object[] }>}
 */
function mergeMediaByParticipant({ videoData, audioData }) {
  const map = new Map();

  for (const video of getMediaRecords(videoData, 'video')) {
    addMedia(map, video, 'videos');
  }
  for (const audio of getMediaRecords(audioData, 'audio')) {
    addMedia(map, audio, 'audios');
  }

  return map;
}

function addMedia(map, media, key) {
  if (!getMediaUrl(media)) return;

  const name = media.participant?.name ?? media.participant_name ?? 'Unknown Participant';
  if (!map.has(name)) {
    map.set(name, { name, videos: [], audios: [] });
  }
  map.get(name)[key].push(media);
}

/**
 * MeetStream may return a top-level array of files or a participants/streams
 * object. Support both shapes.
 *
 * @param {object|object[]|null} data
 * @param {string} defaultType
 * @returns {object[]}
 */
function getMediaRecords(data, defaultType) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.recordings)) return data.recordings;
  if (getMediaUrl(data)) return [data];

  const records = [];
  for (const section of ['participants', 'screenshares']) {
    for (const participant of data[section] ?? []) {
      const participantName = participant.participant_name ?? participant.participant?.name;
      const fallbackType = section === 'screenshares' ? 'screen_share' : defaultType;
      for (const stream of participant.streams ?? []) {
        if (getMediaUrl(stream)) {
          records.push({
            ...stream,
            type: stream.type ?? fallbackType,
            participant_name: participantName,
          });
        }
        for (const segment of stream.segments ?? []) {
          records.push({
            ...segment,
            participant_name: participantName,
            type: stream.type ?? stream.stream_type ?? fallbackType,
          });
        }
      }
    }
  }
  return records;
}

/**
 * @param {object} params
 * @param {{ name: string, videos: object[], audios: object[] }} params.entry
 * @param {import('./meetstream.js').MeetStreamClient} params.client
 * @param {string} params.outputDir
 * @param {Set<string>} params.usedNames
 */
async function processOneParticipant({ entry, client, outputDir, usedNames }) {
  const safeBaseName = sanitizeFilename(entry.name);
  const folderName = dedupeName(safeBaseName, usedNames);
  const participantDir = path.join(outputDir, folderName);
  await fs.ensureDir(participantDir);

  logger.info(`Participant media ready: ${folderName}`);

  const usedFiles = new Set();
  await downloadMediaList({ media: entry.videos, client, participantDir, usedFiles, kind: 'video' });
  await downloadMediaList({ media: entry.audios, client, participantDir, usedFiles, kind: 'audio' });
}

async function downloadMediaList({ media, client, participantDir, usedFiles, kind }) {
  for (let i = 0; i < media.length; i += 1) {
    const item = media[i];
    const url = getMediaUrl(item);
    const ext = guessExtension(item.filename ?? url, kind);
    const label = fileLabel(item, i, kind);
    const fileName = `${dedupeName(label, usedFiles)}.${ext}`;
    const dest = path.join(participantDir, fileName);

    await client.downloadMedia(url, dest);
    logger.info(`Saved: ${dest}`);
  }
}

/**
 * @param {object} video
 * @returns {string|null}
 */
function getMediaUrl(video) {
  return video?.download_url ?? video?.url ?? null;
}

/**
 * @param {object} media
 * @param {number} index
 * @param {string} fallback
 * @returns {string}
 */
function fileLabel(media, index, fallback) {
  const raw = media.type ?? media.filename ?? media.id ?? `${fallback}_${index + 1}`;
  return sanitizeFilename(String(raw).replace(/\.[a-zA-Z0-9]{2,4}$/i, ''));
}

/**
 * @param {string} nameOrUrl
 * @param {string} fallback
 * @returns {string}
 */
function guessExtension(nameOrUrl, fallback) {
  const match = /\.([a-zA-Z0-9]{2,4})(?:\?|$)/.exec(nameOrUrl);
  return match ? match[1].toLowerCase() : fallback === 'audio' ? 'webm' : 'mp4';
}
