/**
 * Media Handler
 * Handles incoming media messages
 */

const MediaService = require('../services/mediaService');
const BackupService = require('../services/backupService');
const Logger = require('../utils/logger');
const { getMediaUploadedKeyboard } = require('../utils/keyboards');
const { Markup } = require('telegraf');
const BulkForwardHandler = require('./bulkForwardHandler');

/**
 * Extract media data from message
 * @param {Object} ctx - Telegraf context
 * @returns {Object|null} - Media data or null
 */
function extractMediaData(ctx) {
  const message = ctx.message;
  
  // Check for video
  if (message.video) {
    return {
      file_id: message.video.file_id,
      file_unique_id: message.video.file_unique_id,
      media_type: 'video',
      caption: message.caption || null,
      message_id: message.message_id,
      chat_id: String(ctx.chat.id),
    };
  }
  
  // Check for photo (get highest resolution)
  if (message.photo && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1];
    return {
      file_id: photo.file_id,
      file_unique_id: photo.file_unique_id,
      media_type: 'photo',
      caption: message.caption || null,
      message_id: message.message_id,
      chat_id: String(ctx.chat.id),
    };
  }
  
  // Check for document
  if (message.document) {
    return {
      file_id: message.document.file_id,
      file_unique_id: message.document.file_unique_id,
      media_type: 'document',
      caption: message.caption || null,
      message_id: message.message_id,
      chat_id: String(ctx.chat.id),
    };
  }
  
  // Check for animation (GIF)
  if (message.animation) {
    return {
      file_id: message.animation.file_id,
      file_unique_id: message.animation.file_unique_id,
      media_type: 'animation',
      caption: message.caption || null,
      message_id: message.message_id,
      chat_id: String(ctx.chat.id),
    };
  }
  
  return null;
}

// Store pending media temporarily (in-memory, simple approach)
const pendingMedia = new Map();

// Store users waiting to create new category
const pendingCategoryCreation = new Map();

// Store users who want to upload to a specific category
const pendingCategoryUpload = new Map();

// Batch processing system for bulk forwards
const batchProcessing = new Map(); // userId -> { queue: [], processing: false, stats: {} }
const BATCH_TIMEOUT = 3000; // 3 seconds to collect batch
const BATCH_SIZE = 50; // Process 50 files at a time
const PROGRESS_INTERVAL = 25; // Report every 25 files

// Duplicate detection cache (file_unique_id -> media_name)
const duplicateCache = new Map();

/**
 * Handle media messages
 * @param {Object} ctx - Telegraf context
 */
async function handleMedia(ctx) {
  try {
    const mediaData = extractMediaData(ctx);
    
    if (!mediaData) {
      return; // Not a supported media type
    }
    
    const userId = ctx.from.id;
    
    // BULK MODE: Detect forwarded messages and use batch processing
    if (ctx.message.forward_date || ctx.message.forward_from || ctx.message.forward_from_chat) {
      // This is a forwarded message - use bulk processing
      BulkForwardHandler.addToBatchQueue(userId, mediaData, ctx);
      return; // Batch handler will process this
    }
    
    // Auto-generate unique name based on media type
    const timestamp = Date.now();
    const autoName = `${mediaData.media_type}_${timestamp}`;
    mediaData.name = autoName;
    
    // Store media data temporarily
    pendingMedia.set(userId, mediaData);
    
    // Check if user wants to upload to a specific category
    const categoryUploadState = pendingCategoryUpload.get(userId);
    if (categoryUploadState && categoryUploadState.category) {
      const targetCategory = categoryUploadState.category;
      
      // Get next counter for this category
      const counter = MediaService.getNextCounterForCategory(targetCategory);
      const finalName = `${targetCategory}_${counter}`;
      
      // Automatically assign the category and final name, then save
      mediaData.category = targetCategory;
      mediaData.name = finalName;
      mediaData.message_id = ctx.message.message_id;
      mediaData.chat_id = String(ctx.chat.id);
      const savedName = MediaService.saveMedia(mediaData);
      
      // Auto-backup if enabled
      try {
        const backupStatus = BackupService.isAutoBackupReady();
        if (backupStatus.enabled && backupStatus.channelId) {
          await BackupService.backupMediaToChannel(ctx.telegram, backupStatus.channelId, mediaData);
          Logger.info(`Auto-backed up media ${savedName} to channel ${backupStatus.channelId}`);
        }
      } catch (backupError) {
        Logger.error(`Auto-backup failed for ${savedName}`, backupError);
        // Don't fail the whole operation if backup fails
      }
      
      // Clear states
      pendingMedia.delete(userId);
      pendingCategoryUpload.delete(userId);
      
      // Send success message with action buttons
      const actionButtons = Markup.inlineKeyboard([
        [
          Markup.button.callback('📤 Upload Another', `upload_to_${targetCategory}`),
          Markup.button.callback('📁 View Category', `show_cat_${targetCategory}`)
        ],
        [
          Markup.button.callback('🏠 Main Menu', 'main_menu')
        ]
      ]);
      
      await ctx.reply(
        `✅ *Media Saved to Category: ${targetCategory}*\n\n` +
        `*Name:* \`${savedName}\`\n` +
        `*Type:* ${mediaData.media_type}\n\n` +
        `What would you like to do?`,
        { 
          parse_mode: 'Markdown',
          ...actionButtons,
          reply_to_message_id: ctx.message.message_id
        }
      );
      
      Logger.info(`Media ${savedName} saved to category ${targetCategory}`);
      return;
    }
    
    // Get existing categories
    const categories = MediaService.getCategories();
    
    // Build category selection keyboard
    const buttons = [];
    
    // Add existing categories (2 per row)
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(`📁 ${categories[i]}`, `set_cat_${autoName}_${categories[i]}`));
      if (i + 1 < categories.length) {
        row.push(Markup.button.callback(`📁 ${categories[i + 1]}`, `set_cat_${autoName}_${categories[i + 1]}`));
      }
      buttons.push(row);
    }
    
    // Add "Create New Category" and "Skip" buttons
    buttons.push([
      Markup.button.callback('➕ New Category', `new_cat_${autoName}`),
      Markup.button.callback('⏭ Skip (uncategorized)', `skip_cat_${autoName}`)
    ]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    // Ask for category selection immediately
    await ctx.reply(
      `✅ ${mediaData.media_type.toUpperCase()} received!\n\n📂 Select a category:`,
      {
        ...keyboard,
        reply_to_message_id: ctx.message.message_id
      }
    );
    
    Logger.info(`Media ${autoName} pending category selection by user ${userId}`);
    
  } catch (error) {
    Logger.error('Error handling media', error);
    await ctx.reply('❌ An error occurred while processing media');
  }
}

/**
 * Handle new category name input
 * @param {Object} ctx - Telegraf context
 * @returns {boolean} - True if handled, false otherwise
 */
async function handleCategoryNameInput(ctx) {
  const userId = ctx.from.id;
  const categoryState = pendingCategoryCreation.get(userId);
  
  if (!categoryState || !categoryState.awaiting) {
    return false; // Not waiting for category name
  }
  
  try {
    const categoryName = ctx.message.text.trim();
    
    // Validate category name format
    if (!/^[a-zA-Z0-9_-]+$/.test(categoryName)) {
      await ctx.reply('❌ Invalid category name format. Use only letters, numbers, underscore (_), or dash (-). Please try again:');
      return true;
    }
    
    // Check if category already exists
    const categories = MediaService.getCategories();
    if (categories.includes(categoryName)) {
      await ctx.reply(`❌ Category "${categoryName}" already exists. Please choose a different name:`);
      return true;
    }
    
    // Create a placeholder media to register the new category in database
    // This ensures the category appears in the list even without media
    try {
      MediaService.saveMedia({
        name: `_category_placeholder_${categoryName}_${Date.now()}`,
        file_id: 'placeholder',
        file_unique_id: `placeholder_${categoryName}_${Date.now()}`,
        media_type: 'placeholder',
        caption: `Category placeholder for ${categoryName}`,
        category: categoryName
      });
    } catch (error) {
      // If placeholder already exists, it's okay
      Logger.warn(`Placeholder for category ${categoryName} may already exist`);
    }
    
    // Clear state
    pendingCategoryCreation.delete(userId);
    
    // Build updated category list with new category
    const updatedCategories = [...categories, categoryName].filter(cat => cat !== 'uncategorized');
    const buttons = [];
    
    for (let i = 0; i < updatedCategories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(`📁 ${updatedCategories[i]}`, `show_cat_${updatedCategories[i]}`));
      if (i + 1 < updatedCategories.length) {
        row.push(Markup.button.callback(`📁 ${updatedCategories[i + 1]}`, `show_cat_${updatedCategories[i + 1]}`));
      }
      buttons.push(row);
    }
    
    // Add "Add New Category" button
    buttons.push([Markup.button.callback('➕ Add New Category', 'add_new_category')]);
    
    // Add back button
    buttons.push([Markup.button.callback('🔙 Back to Menu', 'main_menu')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    // Success message with updated category list
    await ctx.reply(
      `✅ Category "${categoryName}" created successfully!\n\n` +
      `📁 *Categories* (${updatedCategories.length})\n\n` +
      `Select a category to view its media, or add a new one:`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
    Logger.info(`New category "${categoryName}" created by user ${userId}`);
    return true;
    
  } catch (error) {
    Logger.error('Error handling category name input', error);
    await ctx.reply('❌ An error occurred while creating category');
    pendingCategoryCreation.delete(userId);
    return true;
  }
}

/**
 * Handle text messages (for media naming)
 * @param {Object} ctx - Telegraf context
 */
async function handleTextForMediaName(ctx) {
  const userId = ctx.from.id;
  
  // Check if text contains hashtag for category setting
  const text = ctx.message.text;
  if (text && text.includes('#')) {
    const BulkForwardHandler = require('./bulkForwardHandler');
    const category = BulkForwardHandler.setNextCategoryFromText(userId, text);
    if (category) {
      await ctx.reply(
        `✅ *Category Set!*\n\n` +
        `Next media you forward will be saved to category: *${category}*\n\n` +
        `💡 Forward your media now (within 15 minutes)`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
  }
  
  // First check if user is creating a new category
  if (await handleCategoryNameInput(ctx)) {
    return; // Category name was handled
  }
  
  // Check if user is adding to whitelist
  const { handleWhitelistInput, handleForwardedMessage } = require('./whitelistHandler');
  const { handleBulkSendChatIds } = require('../commands/bulkSendCommand');
  
  // Check if it's a forwarded message for whitelist
  if (ctx.message.forward_from_chat || ctx.message.forward_from) {
    if (await handleForwardedMessage(ctx)) {
      return; // Forwarded message was handled
    }
  }
  
  // Check whitelist text input
  if (await handleWhitelistInput(ctx)) {
    return; // Whitelist input was handled
  }
  
  // Check bulk send chat IDs input
  if (await handleBulkSendChatIds(ctx)) {
    return; // Bulk send input was handled
  }
  
  // Check if user is sending a chat_id for category send
  const uploadState = pendingCategoryUpload.get(userId);
  if (uploadState && (uploadState.sendingCategory || uploadState.sendingAllCategories)) {
    await handleChatIdForSending(ctx, uploadState);
    return;
  }
  
  const pendingMediaData = pendingMedia.get(userId);
  
  if (!pendingMediaData) {
    return; // No pending media for this user
  }
  
  try {
    const mediaName = ctx.message.text.trim();
    
    // Validate name format
    if (!/^[a-zA-Z0-9_-]+$/.test(mediaName)) {
      await ctx.reply('❌ Invalid name format. Use only letters, numbers, underscore (_), or dash (-). Please try again:');
      return;
    }
    
    // Add name to media data (but don't save yet)
    pendingMediaData.name = mediaName;
    
    // Get existing categories
    const categories = MediaService.getCategories();
    
    // Build category selection keyboard
    const buttons = [];
    
    // Add existing categories (2 per row)
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(`📁 ${categories[i]}`, `set_cat_${mediaName}_${categories[i]}`));
      if (i + 1 < categories.length) {
        row.push(Markup.button.callback(`📁 ${categories[i + 1]}`, `set_cat_${mediaName}_${categories[i + 1]}`));
      }
      buttons.push(row);
    }
    
    // Add "Create New Category" and "Skip" buttons
    buttons.push([
      Markup.button.callback('➕ New Category', `new_cat_${mediaName}`),
      Markup.button.callback('⏭ Skip (uncategorized)', `skip_cat_${mediaName}`)
    ]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    // Ask for category selection
    await ctx.reply(
      `✅ Name "${mediaName}" accepted!\n\n📂 Select a category:`,
      keyboard
    );
    
    Logger.info(`Media name set: ${mediaName} by user ${userId}, awaiting category`);
    
  } catch (error) {
    Logger.error('Error saving media with name', error);
    
    if (error.message.includes('already exists')) {
      await ctx.reply(`❌ ${error.message}\n\nPlease choose a different name:`);
    } else {
      await ctx.reply('❌ An error occurred while saving media');
      pendingMedia.delete(userId);
    }
  }
}

/**
 * Handle chat_id input for sending category/categories
 * @param {Object} ctx - Telegraf context
 * @param {Object} uploadState - State with sendingCategory or sendingAllCategories
 */
async function handleChatIdForSending(ctx, uploadState) {
  const userId = ctx.from.id;
  const input = ctx.message.text.trim();
  
  // Parse input: can be "chat_id" or "chat_id topic_id"
  const parts = input.split(/\s+/);
  let chatId = parts[0];
  const topicId = parts[1] || null;
  
  // Validate chat_id format (should be a number, possibly negative)
  if (!/^-?\d+$/.test(chatId)) {
    await ctx.reply('❌ Invalid chat ID format. Please enter a valid number.\n\nExample: `-1001234567890` or `-1001234567890 20`');
    return;
  }
  
  // Auto-correct: if user enters chat_id without -100 prefix (e.g., 4427870777 instead of -1004427870777)
  // Add -100 prefix for supergroup/channel format
  if (chatId.length >= 10 && !chatId.startsWith('-')) {
    chatId = `-100${chatId}`;
    await ctx.reply(`💡 Auto-corrected chat ID to: \`${chatId}\`\n\nProceeding with send...`, { parse_mode: 'Markdown' });
  }
  
  // Validate topic_id if provided
  if (topicId && !/^-?\d+$/.test(topicId)) {
    await ctx.reply('❌ Invalid topic ID format. Please enter a valid number.\n\nExample: `-1001234567890 20`');
    return;
  }
  
  try {
    if (uploadState.sendingCategory) {
      // Send single category
      const category = uploadState.sendingCategory;
      const mediaList = MediaService.getMediaByCategory(category, 1000).filter(m => m.media_type !== 'placeholder');
      
      if (mediaList.length === 0) {
        await ctx.reply(`❌ No media found in category "${category}".`);
        pendingCategoryUpload.delete(userId);
        return;
      }
      
      const progressMsg = await ctx.reply(
        `📤 *Sending: ${category}*\n\n⏳ Memulai...\n\n🔄 0%`,
        { parse_mode: 'Markdown' }
      );
      
      let successCount = 0;
      let errorCount = 0;
      let lastUpdateTime = Date.now();
      
      // Progress bar generator
      const getProgressBar = (percentage) => {
        const filledBlocks = Math.floor(percentage / 10);
        const emptyBlocks = 10 - filledBlocks;
        return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
      };
      
      // Update progress message
      const updateProgress = async (current, total, force = false) => {
        const now = Date.now();
        const percentage = Math.floor((current / total) * 100);
        
        // Update every 2 seconds or when forced
        if (force || now - lastUpdateTime > 2000) {
          try {
            const progressBar = getProgressBar(percentage);
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              progressMsg.message_id,
              undefined,
              `📤 *Sending: ${category}*\n\n` +
              `${progressBar}\n\n` +
              `🔄 ${percentage}%\n\n` +
              `✅ Berhasil: ${successCount}\n` +
              `❌ Gagal: ${errorCount}\n` +
              `📊 Progress: ${current}/${total}`,
              { parse_mode: 'Markdown' }
            );
            lastUpdateTime = now;
          } catch (e) {
            // Ignore rate limit errors
          }
        }
      };
      
      for (let i = 0; i < mediaList.length; i++) {
        const media = mediaList[i];
        try {
          // Send media without caption (no sender info)
          // Prepare send options with topic_id if provided
          const sendOptions = {};
          if (topicId) {
            sendOptions.message_thread_id = parseInt(topicId);
          }
          
          // Add protect_content and disable sender name
          sendOptions.protect_content = false;
          
          if (media.media_type === 'video') {
            await ctx.telegram.sendVideo(chatId, media.file_id, sendOptions);
          } else if (media.media_type === 'photo') {
            await ctx.telegram.sendPhoto(chatId, media.file_id, sendOptions);
          } else if (media.media_type === 'document') {
            await ctx.telegram.sendDocument(chatId, media.file_id, sendOptions);
          } else if (media.media_type === 'animation') {
            await ctx.telegram.sendAnimation(chatId, media.file_id, sendOptions);
          }
          
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
        } catch (sendError) {
          Logger.error(`Error sending media ${media.name}`, sendError);
          errorCount++;
        }
        
        await updateProgress(i + 1, mediaList.length);
      }
      
      // Final progress update
      await updateProgress(mediaList.length, mediaList.length, true);
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📤 Send Another Category', 'send_prompt')],
        [Markup.button.callback('📁 View Categories', 'view_categories')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ]);
      
      await ctx.reply(
        `✅ *Sending Complete!*\n\n` +
        `Category: ${category}\n` +
        `Chat ID: \`${chatId}\`\n` +
        (topicId ? `Topic ID: \`${topicId}\`\n` : '') +
        `Success: ${successCount}\n` +
        `Failed: ${errorCount}`,
        { parse_mode: 'Markdown', ...keyboard }
      );
      
      Logger.info(`User ${userId} sent category ${category} to ${chatId}${topicId ? ` (topic: ${topicId})` : ''}: ${successCount} success, ${errorCount} failed`);
      
    } else if (uploadState.sendingAllCategories) {
      // Send all categories
      const categories = MediaService.getCategories().filter(cat => cat !== 'uncategorized');
      
      // Calculate total media count
      let totalMediaCount = 0;
      for (const category of categories) {
        const mediaList = MediaService.getMediaByCategory(category, 1000).filter(m => m.media_type !== 'placeholder');
        totalMediaCount += mediaList.length;
      }
      
      const progressMsg = await ctx.reply(
        `📤 *Sending: All Categories*\n\n⏳ Memulai...\n\n🔄 0%`,
        { parse_mode: 'Markdown' }
      );
      
      let totalSuccess = 0;
      let totalFailed = 0;
      let processedCount = 0;
      let lastUpdateTime = Date.now();
      
      // Progress bar generator
      const getProgressBar = (percentage) => {
        const filledBlocks = Math.floor(percentage / 10);
        const emptyBlocks = 10 - filledBlocks;
        return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
      };
      
      // Update progress message
      const updateProgress = async (force = false) => {
        const now = Date.now();
        const percentage = Math.floor((processedCount / totalMediaCount) * 100);
        
        // Update every 2 seconds or when forced
        if (force || now - lastUpdateTime > 2000) {
          try {
            const progressBar = getProgressBar(percentage);
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              progressMsg.message_id,
              undefined,
              `📤 *Sending: All Categories*\n\n` +
              `${progressBar}\n\n` +
              `🔄 ${percentage}%\n\n` +
              `✅ Berhasil: ${totalSuccess}\n` +
              `❌ Gagal: ${totalFailed}\n` +
              `📊 Progress: ${processedCount}/${totalMediaCount}`,
              { parse_mode: 'Markdown' }
            );
            lastUpdateTime = now;
          } catch (e) {
            // Ignore rate limit errors
          }
        }
      };
      
      for (const category of categories) {
        const mediaList = MediaService.getMediaByCategory(category, 1000).filter(m => m.media_type !== 'placeholder');
        
        if (mediaList.length === 0) continue;
        
        // Send category header
        const headerOptions = { parse_mode: 'Markdown' };
        if (topicId) {
          headerOptions.message_thread_id = parseInt(topicId);
        }
        await ctx.telegram.sendMessage(chatId, `━━━━━━━━━━━━━━━━\n📁 *${category.toUpperCase()}*\n━━━━━━━━━━━━━━━━`, headerOptions);
        
        for (const media of mediaList) {
          try {
            // Send media without caption (no sender info)
            // Prepare send options with topic_id if provided
            const sendOptions = {};
            if (topicId) {
              sendOptions.message_thread_id = parseInt(topicId);
            }
            
            if (media.media_type === 'video') {
              await ctx.telegram.sendVideo(chatId, media.file_id, sendOptions);
            } else if (media.media_type === 'photo') {
              await ctx.telegram.sendPhoto(chatId, media.file_id, sendOptions);
            } else if (media.media_type === 'document') {
              await ctx.telegram.sendDocument(chatId, media.file_id, sendOptions);
            } else if (media.media_type === 'animation') {
              await ctx.telegram.sendAnimation(chatId, media.file_id, sendOptions);
            }
            
            totalSuccess++;
            await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
          } catch (sendError) {
            Logger.error(`Error sending media ${media.name}`, sendError);
            totalFailed++;
          }
          
          processedCount++;
          await updateProgress();
        }
      }
      
      // Final progress update
      await updateProgress(true);
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📤 Send Again', 'send_all_categories')],
        [Markup.button.callback('📁 View Categories', 'view_categories')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ]);
      
      await ctx.reply(
        `✅ *All Categories Sent!*\n\n` +
        `Categories: ${categories.length}\n` +
        `Chat ID: \`${chatId}\`\n` +
        (topicId ? `Topic ID: \`${topicId}\`\n` : '') +
        `Total Success: ${totalSuccess}\n` +
        `Total Failed: ${totalFailed}`,
        { parse_mode: 'Markdown', ...keyboard }
      );
      
      Logger.info(`User ${userId} sent all categories to ${chatId}${topicId ? ` (topic: ${topicId})` : ''}: ${totalSuccess} success, ${totalFailed} failed`);
    }
    
    // Clear state
    pendingCategoryUpload.delete(userId);
    
  } catch (error) {
    Logger.error('Error handling chat_id for sending', error);
    await ctx.reply(`❌ Error sending media: ${error.message}\n\nMake sure the bot is a member/admin of the target chat.`);
    pendingCategoryUpload.delete(userId);
  }
}

module.exports = {
  handleMedia,
  handleTextForMediaName,
  extractMediaData,
  pendingMedia, // Export for callbackHandler
  pendingCategoryCreation, // Export for callbackHandler
  pendingCategoryUpload, // Export for callbackHandler
};
