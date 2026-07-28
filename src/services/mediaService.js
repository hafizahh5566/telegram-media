/**
 * Media Service
 * Handles all database operations for media
 */

const { getDatabase } = require('../database');
const Logger = require('../utils/logger');

class MediaService {
  /**
   * Save media to database
   * @param {Object} mediaData - Media data to save
   * @param {string} mediaData.name - Unique name for the media
   * @param {string} mediaData.file_id - Telegram file ID
   * @param {string} mediaData.file_unique_id - Telegram unique file ID
   * @param {string} mediaData.media_type - Type of media (video, photo, document, animation)
   * @param {string} [mediaData.caption] - Optional caption
   * @param {string} [mediaData.category] - Optional category
   * @param {number} [mediaData.message_id] - Optional message ID for backup purposes
   * @param {string} [mediaData.chat_id] - Optional chat ID for backup purposes
   * @returns {string} - Name of saved media
   */
  static saveMedia(mediaData) {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO media (name, file_id, file_unique_id, media_type, caption, category, message_id, chat_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const info = stmt.run(
        mediaData.name,
        mediaData.file_id,
        mediaData.file_unique_id,
        mediaData.media_type,
        mediaData.caption || null,
        mediaData.category || 'uncategorized',
        mediaData.message_id || null,
        mediaData.chat_id || null
      );
      
      Logger.info(`Saved media: ${mediaData.name}`);
      return mediaData.name;
    } catch (error) {
      // Check if it's a duplicate entry
      if (error.message.includes('UNIQUE constraint failed')) {
        if (error.message.includes('name')) {
          Logger.warn(`Media name already exists: ${mediaData.name}`);
          throw new Error(`Media name "${mediaData.name}" already exists. Please choose a different name.`);
        }
        Logger.warn(`File already exists: ${mediaData.file_unique_id}`);
        
        // Return existing media name
        const existing = this.getMediaByUniqueId(mediaData.file_unique_id);
        return existing ? existing.name : null;
      }
      
      Logger.error('Failed to save media', error);
      throw error;
    }
  }

  /**
   * Get media by unique ID
   * @param {string} fileUniqueId - Telegram unique file ID
   * @returns {Object|null} - Media object or null
   */
  static getMediaByUniqueId(fileUniqueId) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('SELECT * FROM media WHERE file_unique_id = ?');
      return stmt.get(fileUniqueId);
    } catch (error) {
      Logger.error('Failed to get media by unique ID', error);
      throw error;
    }
  }

  /**
   * Get media by name
   * @param {string} name - Media name
   * @returns {Object|null} - Media object or null
   */
  static getMediaByName(name) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('SELECT * FROM media WHERE name = ?');
      return stmt.get(name);
    } catch (error) {
      Logger.error('Failed to get media by name', error);
      throw error;
    }
  }

  /**
   * Get all media (no limit)
   * @returns {Array} - Array of all media objects
   */
  static getAllMedia() {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM media 
        ORDER BY created_at DESC
      `);
      return stmt.all();
    } catch (error) {
      Logger.error('Failed to get all media', error);
      throw error;
    }
  }

  /**
   * Get latest media (limited)
   * @param {number} limit - Maximum number of results
   * @returns {Array} - Array of media objects
   */
  static getLatestMedia(limit = 20) {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM media 
        ORDER BY created_at DESC 
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch (error) {
      Logger.error('Failed to get latest media', error);
      throw error;
    }
  }

  /**
   * Search media by caption
   * @param {string} keyword - Search keyword
   * @param {number} limit - Maximum number of results
   * @returns {Array} - Array of media objects
   */
  static searchMedia(keyword, limit = 20) {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM media 
        WHERE caption LIKE ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `);
      return stmt.all(`%${keyword}%`, limit);
    } catch (error) {
      Logger.error('Failed to search media', error);
      throw error;
    }
  }

  /**
   * Delete media by name
   * @param {string} name - Media name to delete
   * @returns {boolean} - True if deleted, false otherwise
   */
  static deleteMedia(name) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('DELETE FROM media WHERE name = ?');
      const info = stmt.run(name);
      
      if (info.changes > 0) {
        Logger.info(`Deleted media: ${name}`);
        return true;
      }
      
      return false;
    } catch (error) {
      Logger.error('Failed to delete media', error);
      throw error;
    }
  }

  /**
   * Get total media count
   * @returns {number} - Total number of media
   */
  static getMediaCount() {
    try {
      const db = getDatabase();
      const stmt = db.prepare('SELECT COUNT(*) as count FROM media');
      const result = stmt.get();
      return result.count;
    } catch (error) {
      Logger.error('Failed to get media count', error);
      throw error;
    }
  }

  /**
   * Get all categories
   * @returns {Array} - Array of category names
   */
  static getCategories() {
    try {
      const db = getDatabase();
      const stmt = db.prepare('SELECT DISTINCT category FROM media WHERE category IS NOT NULL ORDER BY category');
      return stmt.all().map(row => row.category);
    } catch (error) {
      Logger.error('Failed to get categories', error);
      throw error;
    }
  }

  /**
   * Get media by category
   * @param {string} category - Category name
   * @param {number} limit - Maximum number of results
   * @returns {Array} - Array of media objects
   */
  static getMediaByCategory(category, limit = 20) {
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM media 
        WHERE category = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `);
      return stmt.all(category, limit);
    } catch (error) {
      Logger.error('Failed to get media by category', error);
      throw error;
    }
  }

  /**
   * Delete media by name within a specific category
   * @param {string} name - Media name to delete
   * @param {string} category - Category the media must belong to
   * @returns {boolean} - True if deleted, false otherwise
   */
  static deleteMediaFromCategory(name, category) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('DELETE FROM media WHERE name = ? AND category = ?');
      const info = stmt.run(name, category);

      if (info.changes > 0) {
        Logger.info(`Deleted media "${name}" from category "${category}"`);
        return true;
      }

      return false;
    } catch (error) {
      Logger.error('Failed to delete media from category', error);
      throw error;
    }
  }

  /**
   * Delete entire category and all its media
   * @param {string} category - Category name to delete
   * @returns {number} - Number of media deleted
   */
  static deleteCategory(category) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('DELETE FROM media WHERE category = ?');
      const info = stmt.run(category);

      Logger.info(`Deleted category "${category}" with ${info.changes} media items`);
      return info.changes;
    } catch (error) {
      Logger.error('Failed to delete category', error);
      throw error;
    }
  }

  /**
   * Update media category
   * @param {string} name - Media name
   * @param {string} category - New category name
   * @returns {boolean} - True if updated, false otherwise
   */
  static updateMediaCategory(name, category) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('UPDATE media SET category = ? WHERE name = ?');
      const info = stmt.run(category, name);
      
      if (info.changes > 0) {
        Logger.info(`Updated media ${name} category to ${category}`);
        return true;
      }
      
      return false;
    } catch (error) {
      Logger.error('Failed to update media category', error);
      throw error;
    }
  }

  /**
   * Get the next counter number for a category
   * @param {string} category - Category name
   * @returns {number} - Next counter number
   */
  static getNextCounterForCategory(category) {
    try {
      const db = getDatabase();
      // Count non-placeholder media in the category
      const stmt = db.prepare(`
        SELECT COUNT(*) as count 
        FROM media 
        WHERE category = ? AND media_type != 'placeholder'
      `);
      const result = stmt.get(category);
      return (result.count || 0) + 1;
    } catch (error) {
      Logger.error('Failed to get next counter for category', error);
      throw error;
    }
  }

  /**
   * Add channel/group to whitelist
   * @param {string} name - Name for the channel/group
   * @param {string} chatId - Chat ID
   * @param {string} [topicId] - Optional topic ID for supergroups
   * @returns {number} - Insert ID
   */
  static addToWhitelist(name, chatId, topicId = null) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('INSERT INTO whitelist (name, chat_id, topic_id) VALUES (?, ?, ?)');
      const info = stmt.run(name, chatId, topicId);
      Logger.info(`Added to whitelist: ${name} (${chatId}${topicId ? `, topic: ${topicId}` : ''})`);
      return info.lastInsertRowid;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        if (error.message.includes('name')) {
          throw new Error(`Name "${name}" already exists in whitelist.`);
        } else if (error.message.includes('whitelist.chat_id, whitelist.topic_id')) {
          throw new Error(`This combination of Chat ID "${chatId}" and Topic ID "${topicId || 'None'}" already exists in whitelist.`);
        } else {
          throw new Error(`This entry already exists in whitelist. Try using a different name, chat ID, or topic ID.`);
        }
      }
      Logger.error('Failed to add to whitelist', error);
      throw error;
    }
  }

  /**
   * Get all whitelisted channels/groups
   * @returns {Array} - Array of whitelist objects
   */
  static getWhitelist() {
    try {
      const db = getDatabase();
      const stmt = db.prepare('SELECT * FROM whitelist ORDER BY name');
      return stmt.all();
    } catch (error) {
      Logger.error('Failed to get whitelist', error);
      throw error;
    }
  }

  /**
   * Delete from whitelist by name
   * @param {string} name - Name to delete
   * @returns {boolean} - True if deleted
   */
  static deleteFromWhitelist(name) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('DELETE FROM whitelist WHERE name = ?');
      const info = stmt.run(name);
      
      if (info.changes > 0) {
        Logger.info(`Deleted from whitelist: ${name}`);
        return true;
      }
      
      return false;
    } catch (error) {
      Logger.error('Failed to delete from whitelist', error);
      throw error;
    }
  }

  /**
   * Get whitelist entry by name
   * @param {string} name - Name to find
   * @returns {Object|null} - Whitelist object or null
   */
  static getWhitelistByName(name) {
    try {
      const db = getDatabase();
      const stmt = db.prepare('SELECT * FROM whitelist WHERE name = ?');
      return stmt.get(name);
    } catch (error) {
      Logger.error('Failed to get whitelist by name', error);
      throw error;
    }
  }
}

module.exports = MediaService;
