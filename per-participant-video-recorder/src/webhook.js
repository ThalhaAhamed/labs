import express from 'express';
import logger from './logger.js';

/**
 * Event names we care about, per MeetStream's documented webhook events
 * (https://docs.meetstream.ai/guides/webhooks/webhooks-and-events).
 * Anything not listed here is logged and ignored rather than causing an
 * error, since MeetStream may add event types over time.
 */
const KNOWN_EVENTS = new Set([
  'bot.joining',
  'bot.inmeeting',
  'bot.stopped',
  'audio.processed',
  'video.processed',
  'transcription.processed',
  'data_deletion',
]);

/**
 * Builds the Express router that receives all MeetStream webhook events
 * for a single bot session. The entire lifecycle is webhook-driven - no
 * polling.
 *
 * @param {object} params
 * @param {(eventType: string, payload: object) => void} params.onEvent
 * @returns {import('express').Router}
 */
export function createWebhookRouter({ onEvent }) {
  const router = express.Router();

  // MeetStream doesn't send a delivery-id header; its own docs recommend
  // de-duping by {bot_id, event, timestamp}. This mainly matters for
  // `bot.joining`, which MeetStream may send up to 3 times if join
  // retries are configured - other events are documented as "sent at
  // most once".
  const seenDeliveries = new Set();

  router.post('/webhook', express.json({ limit: '5mb' }), (req, res) => {
    const body = req.body ?? {};
    const eventType = body.event ?? 'unknown';
    const deliveryKey = `${body.bot_id ?? ''}:${eventType}:${body.timestamp ?? ''}`;

    // Acknowledge immediately so MeetStream doesn't retry due to slow
    // downstream processing; the real work happens after we respond.
    res.status(200).json({ received: true });

    if (deliveryKey !== '::' ) {
      if (seenDeliveries.has(deliveryKey)) {
        logger.debug(`Ignoring duplicate webhook delivery: ${deliveryKey}`);
        return;
      }
      seenDeliveries.add(deliveryKey);
    }

    if (!KNOWN_EVENTS.has(eventType)) {
      logger.debug(`Received unrecognized webhook event: ${eventType}`);
    }

    try {
      onEvent(eventType, body);
    } catch (err) {
      logger.error(`Error handling webhook event "${eventType}": ${err.message}`);
    }
  });

  return router;
}
