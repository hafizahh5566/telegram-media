/**
 * Backup Service Module
 * Handles backup operations to Telegram channel
 */

const { getDatabase } = require('../database');
const Logger = require('../utils/logger');

/**
 * Get backup configuration
 * @returns {Object|null} Backup config or null
 */
function getBackupConfig() {
  try {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM backup_config WHERE id = 1');
    return stmt.get();
  } catch (error) {
    Logger.error('Error getting backup config', error);
    return null;
  }
}

/**
 * Set backup channel ID
 * @param {string} channelId - Telegram channel ID
 * @returns {boolean} Success status
 */
function setBackupChannel(channelId) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE backup_config 
      SET backup_channel_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 1
    `);
    stmt.run(channelId);
    Logger.info(`Backup channel set to: ${channelId}`);
    return true;
  } catch (error) {
    Logger.error('Error setting backup channel', error);
    return false;
  }
}

/**
 * Enable/disable auto-backup
 * @param {boolean} enabled - Enable status
 * @returns {boolean} Success status
 */
function setAutoBackup(enabled) {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE backup_config 
      SET auto_backup_enabled = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 1
    `);
    stmt.run(enabled ? 1 : 0);
    Logger.info(`Auto-backup ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  } catch (error) {
    Logger.error('Error setting auto-backup', error);
    return false;
  }
}

/**
 * Update last backup timestamp
 * @returns {boolean} Success status
 */
function updateLastBackupTime() {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE backup_config 
      SET last_backup_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 1
    `);
    stmt.run();
    return true;
  } catch (error) {
    Logger.error('Error updating last backup time', error);
    return false;
  }
}

/**
 * Check if auto-backup is enabled and channel is configured
 * @returns {Object} Status object {enabled: boolean, channelId: string|null}
 */
function isAutoBackupReady() {
  const config = getBackupConfig();
  if (!config) {
    return { enabled: false, channelId: null };
  }
  
  return {
    enabled: config.auto_backup_enabled === 1,
    channelId: config.backup_channel_id || null
  };
}

/**
 * Backup single media to channel
 * @param {Object} telegram - Telegram bot instance
 * @param {string} channelId - Channel ID
 * @param {Object} media - Media object {file_id, media_type, name, category, caption}
 * @returns {Promise<boolean>} Success status
 */
async function backupMediaToChannel(telegram, channelId, media) {
  try {
    const caption = `📦 Backup\n📌 ${media.name}\n📁 ${media.category || 'uncategorized'}` +
      (media.caption ? `\n💬 ${media.caption}` : '');

    if (media.media_type === 'video') {
      await telegram.sendVideo(channelId, media.file_id, { caption });
    } else if (media.media_type === 'photo') {
      await telegram.sendPhoto(channelId, media.file_id, { caption });
    } else if (media.media_type === 'document') {
      await telegram.sendDocument(channelId, media.file_id, { caption });
    } else if (media.media_type === 'animation') {
      await telegram.sendAnimation(channelId, media.file_id, { caption });
    }

    Logger.info(`Backed up media ${media.name} to channel ${channelId}`);
    return true;
  } catch (error) {
    Logger.error(`Error backing up media ${media.name}`, error);
    return false;
  }
}

/**
 * Backup all media to channel
 * @param {Object} telegram - Telegram bot instance
 * @param {string} channelId - Channel ID
 * @param {Array} mediaList - Array of media objects
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Object>} {success: number, failed: number}
 */
async function backupAllMedia(telegram, channelId, mediaList, progressCallback = null) {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < mediaList.length; i++) {
    const media = mediaList[i];
    
    // Skip placeholder media
    if (media.media_type === 'placeholder') {
      continue;
    }

    const result = await backupMediaToChannel(telegram, channelId, media);
    
    if (result) {
      success++;
    } else {
      failed++;
    }

    // Progress callback
    if (progressCallback) {
      progressCallback(i + 1, mediaList.length, success, failed);
    }

    // Delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  updateLastBackupTime();
  
  return { success, failed };
}

/**
 * Clear backup channel configuration
 * @returns {boolean} Success status
 */
function clearBackupChannel() {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE backup_config 
      SET backup_channel_id = NULL, auto_backup_enabled = 0, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 1
    `);
    stmt.run();
    Logger.info('Backup channel configuration cleared');
    return true;
  } catch (error) {
    Logger.error('Error clearing backup channel', error);
    return false;
  }
}

module.exports = {
  getBackupConfig,
  setBackupChannel,
  setAutoBackup,
  updateLastBackupTime,
  isAutoBackupReady,
  backupMediaToChannel,
  backupAllMedia,
  clearBackupChannel
};
