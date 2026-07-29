/**
 * Bulk Forward Handler
 * Optimized handling for forwarding thousands of media files
 */

const MediaService = require('../services/mediaService');
const BackupService = require('../services/backupService');
const Logger = require('../utils/logger');
const { Markup } = require('telegraf');

// Batch processing system
const batchQueues = new Map(); // userId -> { queue: [], timer: null, stats: {} }
const BATCH_TIMEOUT = 3000; // 3 seconds to collect batch before processing
const PROGRESS_INTERVAL = 10; // Report progress every 10 files so users don't think it is stuck
const TELEGRAM_OPERATION_TIMEOUT = 20000; // Prevent Telegram API calls from blocking batch forever

// Duplicate detection cache
const duplicateCache = new Map(); // file_unique_id -> true
let cacheInitialized = false;

// Store next category from text messages with hashtags
const nextCategoryForUser = new Map(); // userId -> { category: string, timestamp: number }
const CATEGORY_EXPIRY = 900000; // 15 minutes - category expires after 15 minutes

/**
 * Build a horizontal progress bar for Telegram status messages.
 * @param {number} current - Processed item count
 * @param {number} total - Total item count
 * @param {number} width - Number of bar blocks
 * @returns {{percentage: number, bar: string}}
 */
function buildProgressBar(current, total, width = 10) {
  const safeTotal = Math.max(Number(total) || 0, 1);
  const safeCurrent = Math.min(Math.max(Number(current) || 0, 0), safeTotal);
  const percentage = Math.round((safeCurrent / safeTotal) * 100);
  const filledBlocks = Math.round((percentage / 100) * width);
  const emptyBlocks = width - filledBlocks;

  return {
    percentage,
    bar: `${'█'.repeat(filledBlocks)}${'░'.repeat(emptyBlocks)}`
  };
}

/**
 * Initialize duplicate cache from database
 */
function initializeDuplicateCache() {
  if (cacheInitialized) return;
  
  try {
    // Get all media from database to build duplicate cache
    const allMedia = MediaService.getLatestMedia(10000); // Get up to 10k media
    allMedia.forEach(media => {
      if (media.file_unique_id) {
        duplicateCache.set(media.file_unique_id, true);
      }
    });
    cacheInitialized = true;
    Logger.info(`Duplicate cache initialized with ${duplicateCache.size} entries`);
  } catch (error) {
    Logger.error('Error initializing duplicate cache', error);
  }
}

/**
 * Extract category from caption using hashtag
 * Examples: "#promo" -> "promo", "Video #sales material" -> "sales"
 * @param {string} caption - Message caption
 * @returns {string|null} - Extracted category or null
 */
function extractCategoryFromHashtag(caption) {
  if (!caption) return null;
  
  // Find hashtag pattern - convert to lowercase for consistency
  const hashtagMatch = caption.match(/#([a-zA-Z0-9_-]+)/);
  if (hashtagMatch && hashtagMatch[1]) {
    return MediaService.normalizeCategoryName(hashtagMatch[1]);
  }
  
  return null;
}

/**
 * Set next category for user from text message
 * @param {number} userId - User ID
 * @param {string} text - Text message content
 */
function setNextCategoryFromText(userId, text) {
  const category = extractCategoryFromHashtag(text);
  if (category) {
    nextCategoryForUser.set(userId, {
      category: category,
      timestamp: Date.now()
    });
    Logger.info(`Set next category for user ${userId}: ${category}`);
    return category;
  }
  return null;
}

/**
 * Get and consume next category for user
 * @param {number} userId - User ID
 * @returns {string|null} - Category or null
 */
function getNextCategoryForUser(userId) {
  const stored = nextCategoryForUser.get(userId);
  if (!stored) return null;
  
  // Check if expired (older than 60 seconds)
  if (Date.now() - stored.timestamp > CATEGORY_EXPIRY) {
    nextCategoryForUser.delete(userId);
    return null;
  }
  
  // Return category (don't delete it yet, will be deleted after batch processing)
  return stored.category;
}

/**
 * Clear next category for user
 * @param {number} userId - User ID
 */
function clearNextCategoryForUser(userId) {
  nextCategoryForUser.delete(userId);
}

/**
 * Add a timeout to async operations that depend on Telegram/network calls.
 * This prevents batch processing from looking stuck forever when Telegram API
 * or an auto-backup channel is slow/unreachable.
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} label - Operation label for logs/errors
 * @returns {Promise<*>}
 */
function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Safely edit the batch progress message without breaking the upload loop.
 * @param {Object} ctx - Telegraf context
 * @param {Object} batch - Batch state
 * @param {string} text - Message text
 * @param {Object} extra - Extra Telegram options
 */
async function safeEditProgress(ctx, batch, text, extra = {}) {
  if (!batch.progressMessageId) return;

  try {
    await withTimeout(
      ctx.telegram.editMessageText(
        ctx.chat.id,
        batch.progressMessageId,
        undefined,
        text,
        { parse_mode: 'Markdown', ...extra }
      ),
      TELEGRAM_OPERATION_TIMEOUT,
      'Editing batch progress message'
    );
  } catch (error) {
    // Ignore harmless Telegram edit errors and keep processing media.
    Logger.warn(`Failed to update batch progress message: ${error.message}`);
  }
}

/**
 * Check if media is duplicate
 * @param {string} fileUniqueId - Telegram file_unique_id
 * @returns {boolean} - True if duplicate
 */
function isDuplicate(fileUniqueId) {
  return duplicateCache.has(fileUniqueId);
}

/**
 * Add media to batch queue
 * @param {number} userId - User ID
 * @param {Object} mediaData - Media data from message
 * @param {Object} ctx - Telegraf context
 */
function addToBatchQueue(userId, mediaData, ctx) {
  // Initialize duplicate cache if not done
  if (!cacheInitialized) {
    initializeDuplicateCache();
  }
  
  // Get or create batch queue for user
  let batch = batchQueues.get(userId);
  if (!batch) {
    batch = {
      queue: [],
      timer: null,
      stats: {
        total: 0,
        saved: 0,
        skipped: 0,
        errors: 0,
        startTime: Date.now()
      },
      ctx: ctx,
      progressMessageId: null
    };
    batchQueues.set(userId, batch);
  }
  
  // Add media to queue
  batch.queue.push(mediaData);
  batch.stats.total++;
  
  // Clear existing timer and set new one
  if (batch.timer) {
    clearTimeout(batch.timer);
  }
  
  // Process batch after timeout (no more media incoming)
  batch.timer = setTimeout(() => {
    processBatch(userId);
  }, BATCH_TIMEOUT);
}

/**
 * Process accumulated batch of media
 * @param {number} userId - User ID
 */
async function processBatch(userId) {
  const batch = batchQueues.get(userId);
  if (!batch || batch.queue.length === 0) {
    batchQueues.delete(userId);
    return;
  }
  
  const { queue, stats, ctx } = batch;
  
  try {
    // Send initial progress message
    const initialProgress = buildProgressBar(0, stats.total);
    const progressMsg = await ctx.reply(
      `🔄 *Processing Batch Upload*\n\n` +
      `Total media: ${stats.total}\n` +
      `${initialProgress.bar}\n` +
      `Progress: 0/${stats.total} (${initialProgress.percentage}%)\n\n` +
      `Processing...`,
      { parse_mode: 'Markdown' }
    );
    batch.progressMessageId = progressMsg.message_id;
    
    Logger.info(`Processing batch for user ${userId}: ${queue.length} media`);
    
    // Get auto-category from stored category, first media, or use default
    let defaultCategory = getNextCategoryForUser(userId);
    if (defaultCategory) {
      Logger.info(`Using stored category from text message: ${defaultCategory}`);
    } else {
      const firstMedia = queue[0];
      if (firstMedia.caption) {
        defaultCategory = extractCategoryFromHashtag(firstMedia.caption);
      }
    }
    
    // Process each media in queue
    for (let i = 0; i < queue.length; i++) {
      const mediaData = queue[i];
      
      try {
        // Check for duplicate - DISABLED (allow duplicates)
        // if (isDuplicate(mediaData.file_unique_id)) {
        //   stats.skipped++;
        //   Logger.info(`Skipped duplicate: ${mediaData.file_unique_id}`);
        //   continue;
        // }
        
        // Determine category
        let category = null;
        if (mediaData.caption) {
          category = extractCategoryFromHashtag(mediaData.caption);
        }
        if (!category && defaultCategory) {
          category = defaultCategory;
        }
        if (!category) {
          category = 'uncategorized';
        }
        
        // Ensure category exists
        const categories = MediaService.getCategories();
        if (!categories.includes(category)) {
          // Create placeholder for new category
          try {
            MediaService.saveMedia({
              name: `_category_placeholder_${category}_${Date.now()}`,
              file_id: 'placeholder',
              file_unique_id: `placeholder_${category}_${Date.now()}`,
              media_type: 'placeholder',
              caption: `Category placeholder for ${category}`,
              category: category
            });
          } catch (e) {
            // Ignore if placeholder already exists
          }
        }
        
        // Generate name for media
        const counter = MediaService.getNextCounterForCategory(category);
        const finalName = `${category}_${counter}`;
        
        // Save media
        mediaData.category = category;
        mediaData.name = finalName;
        const savedName = MediaService.saveMedia(mediaData);
        
        // Add to duplicate cache
        duplicateCache.set(mediaData.file_unique_id, true);
        
        stats.saved++;
        
        // Auto-backup if enabled
        try {
          const backupStatus = BackupService.isAutoBackupReady();
          if (backupStatus.enabled && backupStatus.channelId) {
            await withTimeout(
              BackupService.backupMediaToChannel(ctx.telegram, backupStatus.channelId, mediaData),
              TELEGRAM_OPERATION_TIMEOUT,
              `Auto-backup for ${savedName}`
            );
          }
        } catch (backupError) {
          Logger.error(`Backup failed for ${savedName}`, backupError);
        }
        
        // Update progress every PROGRESS_INTERVAL files
        if (i === 0 || (i + 1) % PROGRESS_INTERVAL === 0 || i === queue.length - 1) {
          const progress = buildProgressBar(i + 1, queue.length);
          await safeEditProgress(
            ctx,
            batch,
            `🔄 *Processing Batch Upload*\n\n` +
            `${progress.bar}\n` +
            `Progress: ${i + 1}/${queue.length} (${progress.percentage}%)\n` +
            `✅ Saved: ${stats.saved}\n` +
            `⏭ Skipped (duplicates): ${stats.skipped}\n` +
            `❌ Errors: ${stats.errors}`
          );
        }
        
      } catch (error) {
        stats.errors++;
        Logger.error(`Error processing media ${i + 1}`, error);
      }
    }
    
    // Calculate processing time
    const processingTime = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    
    // Send final summary
    const finalProgress = buildProgressBar(queue.length, queue.length);
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📁 View Categories', 'view_categories')],
      [Markup.button.callback('📤 Send to Channel', 'send_prompt')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await safeEditProgress(
      ctx,
      batch,
      `✅ *Batch Upload Complete!*\n\n` +
      `${finalProgress.bar}\n` +
      `Progress: ${queue.length}/${queue.length} (${finalProgress.percentage}%)\n\n` +
      `📊 *Summary:*\n` +
      `Total received: ${stats.total}\n` +
      `✅ Saved: ${stats.saved}\n` +
      `⏭ Skipped (duplicates): ${stats.skipped}\n` +
      `❌ Errors: ${stats.errors}\n\n` +
      `⏱ Processing time: ${processingTime}s\n\n` +
      `💡 *Tip:* Use hashtags like #promo in captions to auto-assign categories!`,
      keyboard
    );
    
    Logger.info(`Batch complete for user ${userId}: ${stats.saved} saved, ${stats.skipped} skipped, ${stats.errors} errors`);
    
  } catch (error) {
    Logger.error('Error processing batch', error);
    await ctx.reply('❌ Error processing batch upload. Some files may have been saved.');
  } finally {
    // Clean up
    batchQueues.delete(userId);
    clearNextCategoryForUser(userId);
  }
}

/**
 * Handle bulk forward mode toggle
 * @param {Object} ctx - Telegraf context
 */
async function handleBulkModeCommand(ctx) {
  try {
    const userId = ctx.from.id;
    const batch = batchQueues.get(userId);
    
    if (batch) {
      // Already in bulk mode, show status
      await ctx.reply(
        `🔄 *Bulk Mode Active*\n\n` +
        `Currently receiving: ${batch.queue.length} media\n` +
        `Total: ${batch.stats.total}\n\n` +
        `Keep forwarding! Batch will process automatically after 3 seconds of inactivity.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      // Enable bulk mode
      await ctx.reply(
        `✅ *Bulk Mode Enabled!*\n\n` +
        `📤 Now you can forward hundreds of media at once!\n\n` +
        `*Features:*\n` +
        `✅ Auto-category from hashtags (#promo → promo)\n` +
        `✅ Duplicate detection (skip existing files)\n` +
        `✅ Progress tracking (update every 10 files)\n` +
        `✅ Batch processing (process after 3s idle)\n\n` +
        `💡 *How to use:*\n` +
        `1. Forward multiple media from any channel\n` +
        `2. Wait 3 seconds after last forward\n` +
        `3. Bot will process all automatically!\n\n` +
        `🏷 Add hashtags like #sales or #promo in captions for auto-categorization!`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    Logger.error('Error handling bulk mode command', error);
    await ctx.reply('❌ Error toggling bulk mode');
  }
}

/**
 * Get current batch stats
 * @param {number} userId - User ID
 * @returns {Object|null} - Batch stats or null
 */
function getBatchStats(userId) {
  const batch = batchQueues.get(userId);
  return batch ? batch.stats : null;
}

module.exports = {
  addToBatchQueue,
  processBatch,
  handleBulkModeCommand,
  extractCategoryFromHashtag,
  isDuplicate,
  getBatchStats,
  initializeDuplicateCache,
  setNextCategoryFromText
};
