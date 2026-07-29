/**
 * Telegram Rate Limit Utilities
 *
 * Handles Telegram Bot API 429 responses by waiting for `retry_after`
 * before retrying the request. This is especially important when sending
 * many media files to the same chat/channel/topic.
 */

const DEFAULT_SEND_DELAY_MS = 1200;
const DEFAULT_MAX_RETRIES = 5;
const MAX_FALLBACK_DELAY_MS = 30000;

/**
 * Sleep helper.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Read a positive integer from environment variables.
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function getPositiveIntegerEnv(key, fallback) {
  const value = Number.parseInt(process.env[key], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Delay between successful media sends.
 * Override with TELEGRAM_SEND_DELAY_MS when needed.
 * @returns {number}
 */
function getSendDelayMs() {
  return getPositiveIntegerEnv('TELEGRAM_SEND_DELAY_MS', DEFAULT_SEND_DELAY_MS);
}

/**
 * Maximum retry attempts for Telegram 429 errors.
 * Override with TELEGRAM_MAX_RETRIES when needed.
 * @returns {number}
 */
function getMaxRetries() {
  return getPositiveIntegerEnv('TELEGRAM_MAX_RETRIES', DEFAULT_MAX_RETRIES);
}

/**
 * Extract Telegram retry_after value from known Telegraf/Bot API error shapes.
 * @param {Error|Object} error
 * @returns {number|null} seconds
 */
function getRetryAfterSeconds(error) {
  const candidates = [
    error?.parameters?.retry_after,
    error?.response?.parameters?.retry_after,
    error?.response?.body?.parameters?.retry_after
  ];

  for (const candidate of candidates) {
    const value = Number.parseInt(candidate, 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  const text = `${error?.description || ''} ${error?.message || ''}`;
  const match = text.match(/retry after\s+(\d+)/i);
  if (match) {
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

/**
 * Check whether an error is a Telegram rate limit response.
 * @param {Error|Object} error
 * @returns {boolean}
 */
function isRateLimitError(error) {
  return Boolean(
    error?.code === 429 ||
    error?.response?.error_code === 429 ||
    error?.response?.body?.error_code === 429 ||
    getRetryAfterSeconds(error)
  );
}

/**
 * Retry a Telegram API call when Telegram returns 429 Too Many Requests.
 * @template T
 * @param {() => Promise<T>} operation
 * @param {Object} [options]
 * @param {number} [options.maxRetries]
 * @param {Object} [options.logger]
 * @param {string} [options.label]
 * @returns {Promise<T>}
 */
async function callTelegramWithRetry(operation, options = {}) {
  const maxRetries = options.maxRetries ?? getMaxRetries();
  const logger = options.logger;
  const label = options.label ? ` (${options.label})` : '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= maxRetries) {
        throw error;
      }

      const retryAfterSeconds = getRetryAfterSeconds(error);
      const fallbackDelay = Math.min(1000 * (2 ** attempt), MAX_FALLBACK_DELAY_MS);
      const waitMs = retryAfterSeconds ? (retryAfterSeconds * 1000) + 500 : fallbackDelay;

      if (logger?.warn) {
        logger.warn(`Telegram rate limit${label}. Retry ${attempt + 1}/${maxRetries} in ${Math.ceil(waitMs / 1000)}s`);
      }

      await sleep(waitMs);
    }
  }
}

/**
 * Send stored media by type with automatic Telegram 429 retry handling.
 * @param {Object} telegram - Telegraf telegram instance
 * @param {string|number} chatId
 * @param {Object} media
 * @param {string} media.media_type
 * @param {string} media.file_id
 * @param {Object} [sendOptions]
 * @param {Object} [retryOptions]
 * @returns {Promise<*>}
 */
async function sendMediaWithRetry(telegram, chatId, media, sendOptions = {}, retryOptions = {}) {
  const operation = () => {
    if (media.media_type === 'video') {
      return telegram.sendVideo(chatId, media.file_id, sendOptions);
    }
    if (media.media_type === 'photo') {
      return telegram.sendPhoto(chatId, media.file_id, sendOptions);
    }
    if (media.media_type === 'document') {
      return telegram.sendDocument(chatId, media.file_id, sendOptions);
    }
    if (media.media_type === 'animation') {
      return telegram.sendAnimation(chatId, media.file_id, sendOptions);
    }

    throw new Error(`Unsupported media type: ${media.media_type}`);
  };

  return callTelegramWithRetry(operation, retryOptions);
}

module.exports = {
  sleep,
  getSendDelayMs,
  getMaxRetries,
  getRetryAfterSeconds,
  isRateLimitError,
  callTelegramWithRetry,
  sendMediaWithRetry,
};