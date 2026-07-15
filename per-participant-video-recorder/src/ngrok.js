import ngrok from '@ngrok/ngrok';
import logger from './logger.js';

/**
 * Start an ngrok tunnel pointed at the local Express server.
 * Fully automated: no manual `ngrok http` command needed.
 *
 * @param {object} opts
 * @param {number} opts.port
 * @param {string} opts.authtoken
 * @param {string} [opts.domain] - optional reserved ngrok domain
 * @returns {Promise<{ url: string, listener: import('@ngrok/ngrok').Listener }>}
 */
export async function startTunnel({ port, authtoken, domain }) {
  logger.info('Authenticating ngrok...');

  try {
    const listener = await ngrok.forward({
      addr: port,
      authtoken,
      domain: domain || undefined,
    });

    const url = listener.url();
    logger.info(`Tunnel created`);
    logger.info(`Webhook URL: ${url}/webhook`);

    return { url, listener };
  } catch (err) {
    throw new Error(
      `Failed to start ngrok tunnel. Check NGROK_AUTHTOKEN in .env. Original error: ${err.message}`
    );
  }
}
