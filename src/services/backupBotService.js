/**
 * Backup Bot Service
 * Handles backing up media to another bot instance
 */

const Logger = require('../utils/logger');
const MediaService = require('./mediaService');
const { Telegraf } = require('telegraf');

class BackupBotService {
  /**
   * Test connection to backup bot
   * @param {string} botToken - Backup bot token
   * @returns {Promise<Object>} - Bot info if successful
   */
  static async testBackupBot(botToken) {
    try {
      const bot = new Telegraf(botToken);
      const botInfo = await bot.telegram.getMe();
      Logger.info(`Backup bot connected: @${botInfo.username}`);
      return botInfo;
    } catch (error) {
      Logger.error('Error testing backup bot:', error);
      throw new Error('Invalid bot token or connection failed');
    }
  }

  /**
   * Test if backup bot can access a specific chat
   * @param {string} botToken - Backup bot token
   * @param {string} chatId - Chat ID to test
   * @returns {Promise<Object>} - Chat info if accessible
   */
  static async testChatAccess(botToken, chatId) {
    try {
      const bot = new Telegraf(botToken);
      const chatInfo = await bot.telegram.getChat(chatId);
      Logger.info(`Backup bot can access chat: ${chatInfo.title || chatInfo.first_name || chatId}`);
      return chatInfo;
    } catch (error) {
      Logger.error('Error testing chat access:', error);
      
      if (error.response && error.response.error_code === 400) {
        throw new Error('Chat not found. Pastikan bot sudah ditambahkan ke chat/channel dan punya akses yang diperlukan.');
      } else if (error.response && error.response.error_code === 403) {
        throw new Error('Bot tidak punya akses ke chat ini. Pastikan bot adalah admin (untuk channel) atau member (untuk grup).');
      }
      
      throw new Error('Tidak bisa mengakses chat. Periksa Chat ID dan permission bot.');
    }
  }

  /**
   * Get backup bot configuration from database
   * @returns {Object|null} - Backup bot config
   */
  static getBackupBotConfig() {
    try {
      const db = require('../database').getDatabase();
      const stmt = db.prepare('SELECT * FROM backup_bot_config WHERE id = 1');
      return stmt.get();
    } catch (error) {
      Logger.error('Error getting backup bot config:', error);
      return null;
    }
  }

  /**
   * Save backup bot token to database
   * @param {string} botToken - Backup bot token
   * @param {string} botUsername - Backup bot username
   * @param {string} backupChatId - Chat ID where backups will be sent
   */
  static saveBackupBotToken(botToken, botUsername, backupChatId = null) {
    try {
      const db = require('../database').getDatabase();
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO backup_bot_config (id, bot_token, bot_username, backup_chat_id, updated_at)
        VALUES (1, ?, ?, ?, datetime('now'))
      `);
      stmt.run(botToken, botUsername, backupChatId);
      Logger.info(`Saved backup bot: @${botUsername}${backupChatId ? ` (chat: ${backupChatId})` : ''}`);
    } catch (error) {
      Logger.error('Error saving backup bot token:', error);
      throw error;
    }
  }

  /**
   * Clear backup bot configuration
   */
  static clearBackupBot() {
    try {
      const db = require('../database').getDatabase();
      const stmt = db.prepare('DELETE FROM backup_bot_config WHERE id = 1');
      stmt.run();
      Logger.info('Cleared backup bot configuration');
    } catch (error) {
      Logger.error('Error clearing backup bot:', error);
      throw error;
    }
  }

  /**
   * Send a single media to backup bot
   * @param {Object} originalTelegram - Original bot telegram instance (to copy messages)
   * @param {Object} backupTelegram - Backup bot telegram instance
   * @param {string} backupChatId - Chat ID where backup will be sent
   * @param {Object} media - Media object to send
   * @returns {Promise<boolean>} - Success status
   */
  static async sendMediaToBackupBot(originalTelegram, backupTelegram, backupChatId, media) {
    try {
      // Check if we have message_id and chat_id for copying
      if (media.message_id && media.chat_id) {
        // Use copyMessage to forward from original bot to backup chat
        // This works because the original bot has access to the file
        await originalTelegram.copyMessage(
          backupChatId,
          media.chat_id,
          media.message_id,
          {
            caption: media.caption || media.name
          }
        );
        Logger.info(`Copied media ${media.name} to backup chat via message copy`);
        return true;
      } else {
        // Fallback: Try using file_id (may fail for cross-bot usage)
        Logger.warn(`Media ${media.name} missing message_id/chat_id, attempting direct send (may fail)`);
        const sendOptions = {
          caption: media.caption || media.name
        };

        if (media.media_type === 'video') {
          await backupTelegram.sendVideo(backupChatId, media.file_id, sendOptions);
        } else if (media.media_type === 'photo') {
          await backupTelegram.sendPhoto(backupChatId, media.file_id, sendOptions);
        } else if (media.media_type === 'document') {
          await backupTelegram.sendDocument(backupChatId, media.file_id, sendOptions);
        } else if (media.media_type === 'animation') {
          await backupTelegram.sendAnimation(backupChatId, media.file_id, sendOptions);
        }

        Logger.info(`Sent media ${media.name} to backup chat`);
        return true;
      }
    } catch (error) {
      Logger.error(`Error sending media ${media.name} to backup chat:`, error);
      return false;
    }
  }

  /**
   * Backup all media to backup bot
   * @param {Object} originalTelegram - Original bot telegram instance
   * @param {Function} progressCallback - Callback for progress updates (optional)
   * @returns {Promise<Object>} - Backup result
   */
  static async backupAllMedia(originalTelegram, progressCallback = null) {
    try {
      // Get backup bot config
      const config = this.getBackupBotConfig();
      if (!config || !config.bot_token) {
        throw new Error('Backup bot not configured. Please set backup bot token first.');
      }

      if (!config.backup_chat_id) {
        throw new Error('Backup chat ID not configured. Please set backup chat ID first.');
      }

      // Initialize backup bot
      const backupBot = new Telegraf(config.bot_token);
      const backupBotInfo = await backupBot.telegram.getMe();
      
      Logger.info(`Starting backup to @${backupBotInfo.username}...`);

      // Get all media from database
      const allMedia = MediaService.getAllMedia();
      const totalMedia = allMedia.length;

      if (totalMedia === 0) {
        return {
          success: true,
          total: 0,
          sent: 0,
          failed: 0,
          message: 'No media to backup'
        };
      }

      let sentCount = 0;
      let failedCount = 0;

      // Send each media to backup chat
      for (let i = 0; i < allMedia.length; i++) {
        const media = allMedia[i];
        
        // Skip placeholder media
        if (media.media_type === 'placeholder') {
          continue;
        }

        try {
          const success = await this.sendMediaToBackupBot(
            originalTelegram,
            backupBot.telegram,
            config.backup_chat_id,
            media
          );

          if (success) {
            sentCount++;
          } else {
            failedCount++;
          }

          // Progress callback
          if (progressCallback && (i + 1) % 10 === 0) {
            await progressCallback(i + 1, totalMedia, sentCount, failedCount);
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          Logger.error(`Failed to backup media ${media.name}:`, error);
          failedCount++;
        }
      }

      // Update last backup timestamp
      const db = require('../database').getDatabase();
      const updateStmt = db.prepare(`
        UPDATE backup_bot_config 
        SET last_backup_at = datetime('now')
        WHERE id = 1
      `);
      updateStmt.run();

      Logger.info(`Backup complete: ${sentCount} sent, ${failedCount} failed`);

      return {
        success: true,
        total: totalMedia,
        sent: sentCount,
        failed: failedCount,
        botUsername: backupBotInfo.username
      };
    } catch (error) {
      Logger.error('Error backing up media:', error);
      throw error;
    }
  }

  /**
   * Backup specific category to backup bot
   * @param {Object} originalTelegram - Original bot telegram instance
   * @param {string} category - Category name
   * @param {Function} progressCallback - Progress callback (optional)
   * @returns {Promise<Object>} - Backup result
   */
  static async backupCategory(originalTelegram, category, progressCallback = null) {
    try {
      // Get backup bot config
      const config = this.getBackupBotConfig();
      if (!config || !config.bot_token) {
        throw new Error('Backup bot not configured');
      }

      if (!config.backup_chat_id) {
        throw new Error('Backup chat ID not configured. Please set backup chat ID first.');
      }

      // Initialize backup bot
      const backupBot = new Telegraf(config.bot_token);
      const backupBotInfo = await backupBot.telegram.getMe();

      // Get media from category
      const mediaList = MediaService.getMediaByCategory(category, 10000)
        .filter(m => m.media_type !== 'placeholder');

      if (mediaList.length === 0) {
        throw new Error(`No media found in category: ${category}`);
      }

      let sentCount = 0;
      let failedCount = 0;

      for (let i = 0; i < mediaList.length; i++) {
        const media = mediaList[i];
        
        try {
          const success = await this.sendMediaToBackupBot(
            originalTelegram,
            backupBot.telegram,
            config.backup_chat_id,
            media
          );

          if (success) {
            sentCount++;
          } else {
            failedCount++;
          }

          if (progressCallback && (i + 1) % 5 === 0) {
            await progressCallback(i + 1, mediaList.length, sentCount, failedCount);
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          Logger.error(`Failed to backup media ${media.name}:`, error);
          failedCount++;
        }
      }

      return {
        success: true,
        category,
        total: mediaList.length,
        sent: sentCount,
        failed: failedCount,
        botUsername: backupBotInfo.username
      };
    } catch (error) {
      Logger.error(`Error backing up category ${category}:`, error);
      throw error;
    }
  }
}

module.exports = BackupBotService;
