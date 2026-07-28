/**
 * Forum Service
 * Handles Telegram Forum Groups (Topics) operations
 */

const Logger = require('../utils/logger');
const MediaService = require('./mediaService');

class ForumService {
  /**
   * Check if a group is a forum (has topics enabled)
   * @param {Object} telegram - Telegram API instance
   * @param {number} groupId - Group chat ID
   * @returns {Promise<boolean>}
   */
  static async isForumGroup(telegram, groupId) {
    try {
      const chat = await telegram.getChat(groupId);
      return chat.is_forum === true;
    } catch (error) {
      Logger.error('Error checking if group is forum:', error);
      return false;
    }
  }

  /**
   * Get all topics in a forum group
   * Note: Telegram doesn't provide direct API to list all topics
   * We need to track them in database
   * @param {string} category - Category name
   * @returns {number|null} - Topic ID if exists
   */
  static getCachedTopicId(category) {
    try {
      const db = require('../database').getDatabase();
      const stmt = db.prepare('SELECT topic_id FROM forum_topics WHERE category = ?');
      const result = stmt.get(category);
      return result ? result.topic_id : null;
    } catch (error) {
      Logger.error('Error getting cached topic ID:', error);
      return null;
    }
  }

  /**
   * Cache topic ID for a category
   * @param {string} category - Category name
   * @param {number} topicId - Telegram topic/thread ID
   */
  static cacheTopicId(category, topicId) {
    try {
      const db = require('../database').getDatabase();
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO forum_topics (category, topic_id, created_at)
        VALUES (?, ?, datetime('now'))
      `);
      stmt.run(category, topicId);
      Logger.info(`Cached topic ID ${topicId} for category: ${category}`);
    } catch (error) {
      Logger.error('Error caching topic ID:', error);
    }
  }

  /**
   * Create a new forum topic for a category
   * @param {Object} telegram - Telegram API instance
   * @param {number} groupId - Forum group ID
   * @param {string} categoryName - Category name
   * @returns {Promise<number>} - Topic ID (message_thread_id)
   */
  static async createCategoryTopic(telegram, groupId, categoryName) {
    try {
      Logger.info(`Creating forum topic for category: ${categoryName}`);
      
      // Create forum topic
      const topic = await telegram.createForumTopic(groupId, `📁 ${categoryName}`);
      
      const topicId = topic.message_thread_id;
      Logger.info(`Created topic with ID: ${topicId}`);
      
      // Cache the topic ID
      this.cacheTopicId(categoryName, topicId);
      
      return topicId;
    } catch (error) {
      Logger.error(`Error creating forum topic for ${categoryName}:`, error);
      throw error;
    }
  }

  /**
   * Get or create topic for a category
   * @param {Object} telegram - Telegram API instance
   * @param {number} groupId - Forum group ID
   * @param {string} categoryName - Category name
   * @returns {Promise<number>} - Topic ID
   */
  static async ensureCategoryTopic(telegram, groupId, categoryName) {
    try {
      // Check cache first
      const cachedTopicId = this.getCachedTopicId(categoryName);
      if (cachedTopicId) {
        Logger.info(`Using cached topic ID ${cachedTopicId} for category: ${categoryName}`);
        return cachedTopicId;
      }
      
      // Create new topic
      return await this.createCategoryTopic(telegram, groupId, categoryName);
    } catch (error) {
      Logger.error('Error ensuring category topic:', error);
      throw error;
    }
  }

  /**
   * Send media to forum topic
   * @param {Object} telegram - Telegram API instance
   * @param {number} groupId - Forum group ID
   * @param {number} topicId - Topic ID
   * @param {Object} media - Media object
   * @param {number} fromChatId - Source chat ID
   */
  static async sendMediaToTopic(telegram, groupId, topicId, media, fromChatId) {
    try {
      const options = {
        message_thread_id: topicId,
        caption: media.caption || `📎 ${media.name}\nType: ${media.media_type}`
      };

      if (media.media_type === 'video') {
        await telegram.sendVideo(groupId, media.file_id, options);
      } else if (media.media_type === 'photo') {
        await telegram.sendPhoto(groupId, media.file_id, options);
      } else if (media.media_type === 'document') {
        await telegram.sendDocument(groupId, media.file_id, options);
      } else if (media.media_type === 'animation') {
        await telegram.sendAnimation(groupId, media.file_id, options);
      }

      Logger.info(`Sent media ${media.name} to topic ${topicId}`);
    } catch (error) {
      Logger.error(`Error sending media ${media.name} to topic:`, error);
      throw error;
    }
  }

  /**
   * Send all media in a category to its forum topic
   * @param {Object} telegram - Telegram API instance
   * @param {number} groupId - Forum group ID
   * @param {string} category - Category name
   * @param {number} fromChatId - Source chat ID
   * @returns {Promise<{sent: number, failed: number, topicId: number}>}
   */
  static async sendCategoryToForum(telegram, groupId, category, fromChatId) {
    try {
      Logger.info(`Sending category ${category} to forum group ${groupId}`);
      
      // Check if it's a forum group
      const isForum = await this.isForumGroup(telegram, groupId);
      if (!isForum) {
        throw new Error('Target group is not a forum. Please enable topics in group settings.');
      }

      // Get or create topic for this category
      const topicId = await this.ensureCategoryTopic(telegram, groupId, category);
      
      // Get all media in category
      const mediaList = MediaService.getMediaByCategory(category, 1000)
        .filter(m => m.media_type !== 'placeholder');
      
      if (mediaList.length === 0) {
        throw new Error(`No media found in category: ${category}`);
      }

      let sentCount = 0;
      let failedCount = 0;

      // Send each media to the topic
      for (const media of mediaList) {
        try {
          await this.sendMediaToTopic(telegram, groupId, topicId, media, fromChatId);
          sentCount++;
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          Logger.error(`Failed to send media ${media.name}:`, error);
          failedCount++;
        }
      }

      Logger.info(`Sent ${sentCount}/${mediaList.length} media to topic ${topicId}`);
      
      return { sent: sentCount, failed: failedCount, topicId };
    } catch (error) {
      Logger.error('Error sending category to forum:', error);
      throw error;
    }
  }

  /**
   * Delete a cached topic
   * @param {string} category - Category name
   */
  static deleteCachedTopic(category) {
    try {
      const db = require('../database').getDatabase();
      const stmt = db.prepare('DELETE FROM forum_topics WHERE category = ?');
      stmt.run(category);
      Logger.info(`Deleted cached topic for category: ${category}`);
    } catch (error) {
      Logger.error('Error deleting cached topic:', error);
    }
  }
}

module.exports = ForumService;
