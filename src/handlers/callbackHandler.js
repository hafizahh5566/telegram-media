/**
 * Callback Query Handler
 * Handles all inline keyboard button callbacks
 */

const { Markup } = require('telegraf');
const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');
const config = require('../config');
const {
  getMainMenuKeyboard,
  getHelpKeyboard,
  getBackToMenuKeyboard,
  getDeleteConfirmKeyboard,
} = require('../utils/keyboards');

// Import command handlers
const handleListCommand = require('../commands/listCommand');
const handleCountCommand = require('../commands/countCommand');
const handleDeleteCommand = require('../commands/deleteCommand');

// Import whitelist handlers
const {
  handleAddToWhitelist,
  handleSendCategoryWithWhitelist,
  handleManualSendCategory,
} = require('./whitelistHandler');

// Import forum handlers
const { handleForumInteractive } = require('../commands/forumCommand');

// Import bulk send handlers
const {
  handleBulkSendMenu,
  handleBulkSendCategory,
  handleBulkCategorySelect,
  handleBulkSendAll,
  handleConfirmBulkSend,
} = require('../commands/bulksendCommand');

// Track media messages sent inside category views, keyed by userId
const categoryViewMessages = new Map();

/**
 * Escape Telegram Markdown special characters in dynamic text.
 * @param {string} text - Text to escape
 * @returns {string}
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Parse category-selection callback data.
 * New format: set_cat::<mediaName>::<category>
 * Legacy format: set_cat_<mediaName>_<category>
 * @param {string} data - Callback data
 * @param {Object|null} mediaData - Pending media data for safer legacy parsing
 * @returns {{mediaName: string, category: string}|null}
 */
function parseSetCategoryCallback(data, mediaData = null) {
  if (data.startsWith('set_cat::')) {
    const payload = data.replace('set_cat::', '');
    const separatorIndex = payload.indexOf('::');

    if (separatorIndex === -1) {
      return null;
    }

    return {
      mediaName: payload.slice(0, separatorIndex),
      category: payload.slice(separatorIndex + 2)
    };
  }

  if (!data.startsWith('set_cat_')) {
    return null;
  }

  const payload = data.replace('set_cat_', '');

  // Safer legacy parsing: use the pending media name as prefix when available,
  // because media/category names commonly contain underscores.
  if (mediaData?.name && payload.startsWith(`${mediaData.name}_`)) {
    return {
      mediaName: mediaData.name,
      category: payload.slice(mediaData.name.length + 1)
    };
  }

  const parts = payload.split('_');
  return {
    mediaName: parts[0],
    category: parts.slice(1).join('_')
  };
}

/**
 * Delete tracked category media messages for a user (cleanup when leaving a category)
 * @param {Object} ctx - Telegraf context
 */
/**
 * Delete tracked category media messages for a user and the bottom nav message.
 * Returns the originalMessageId (the header message) so callers can re-edit it.
 * @param {Object} ctx - Telegraf context
 * @returns {number|null} originalMessageId or null if not in a category view
 */
async function cleanupCategoryMessages(ctx) {
  const userId = ctx.from.id;
  const tracked = categoryViewMessages.get(userId);
  if (!tracked) return null;

  // Delete the media messages
  for (const msgId of tracked.mediaMessageIds) {
    try {
      await ctx.telegram.deleteMessage(tracked.chatId, msgId);
    } catch (e) {
      // Ignore — message may already be deleted
    }
  }

  // Delete the bottom nav message (the one the button was on)
  if (ctx.callbackQuery) {
    try {
      await ctx.deleteMessage();
    } catch (e) {
      // Ignore
    }
  }

  categoryViewMessages.delete(userId);
  return tracked.originalMessageId;
}

/**
 * Show main menu
 * @param {Object} ctx - Telegraf context
 */
async function showMainMenu(ctx) {
  try {
    const originalMessageId = await cleanupCategoryMessages(ctx);

    const message = `
🤖 *Telegram Media Storage Bot*

Choose an action from the menu below:

📤 Upload media by sending it directly to me
📋 View your stored media
🔍 Search media by caption
📨 Send media to channels/groups
📦 Send multiple media at once
🗑 Delete media from storage
📊 See total media count
`;

    const opts = { parse_mode: 'Markdown', ...getMainMenuKeyboard() };

    if (originalMessageId) {
      // Re-edit the original header message that's still in the chat
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, originalMessageId, undefined, message, opts);
      } catch (editErr) {
        // Header message may have been deleted — send a fresh one
        await ctx.reply(message, opts);
      }
    } else if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(message, opts);
      } catch (editErr) {
        // Current message may have been deleted — send a fresh one
        await ctx.reply(message, opts);
      }
    } else {
      await ctx.reply(message, opts);
    }
  } catch (error) {
    Logger.error('Error showing main menu', error);
    await ctx.answerCbQuery('❌ Error loading menu');
  }
}

/**
 * Show help information
 * @param {Object} ctx - Telegraf context
 */
async function showHelp(ctx) {
  try {
    const helpMessage = `
📚 *Help & Instructions*

*📤 Upload Media*
Simply send me any video, photo, document, or animation. I'll save it and give you an ID.

*📋 List Media*
Shows your latest 20 stored media with their IDs.

*🔍 Search Media*
Format: Just type your search keyword
Example: Type "funny cat" to search

*📨 Send Media*
Format: \`<media_name> <chat_id>\`
Example: \`promo_video -1001234567890\`

*� Bulk Send (NEW!)*
Kirim media ke banyak grup/channel sekaligus (5+ destinations)

Cara pakai:
1. Klik "📤 Bulk Send" di menu
2. Pilih kategori atau semua media
3. Masukkan daftar Chat ID (pisahkan dengan koma)
   
Format: \`-1001234567890, -1009876543210, -1001111222333\`

✅ Bisa kirim ke unlimited grup sekaligus
✅ Laporan detail per destination
✅ Lebih cepat dari send satu-satu

*🗑 Delete Media*
Format: \`<media_name>\`
Example: \`promo_video\`

*💡 Tips*
• Get chat ID using @userinfobot
• Bot must be admin in target chat
• Supports video, photo, document, GIF
`;

    if (ctx.callbackQuery) {
      await ctx.editMessageText(helpMessage, {
        parse_mode: 'Markdown',
        ...getHelpKeyboard()
      });
    } else {
      await ctx.reply(helpMessage, {
        parse_mode: 'Markdown',
        ...getHelpKeyboard()
      });
    }
    
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
  } catch (error) {
    Logger.error('Error showing help', error);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Error loading help');
    }
  }
}

/**
 * Handle list button
 * @param {Object} ctx - Telegraf context
 */
async function handleListButton(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const mediaList = MediaService.getLatestMedia(config.maxListResults);
    
    if (mediaList.length === 0) {
      await ctx.editMessageText('📭 No media found', getBackToMenuKeyboard());
      return;
    }
    
    let message = `📋 *Latest ${mediaList.length} Media*\n\n`;
    
    mediaList.forEach((media) => {
      message += `*ID:* ${media.id}\n`;
      message += `*Type:* ${media.media_type}\n`;
      if (media.caption) {
        // Escape markdown special characters in caption
        const escapedCaption = media.caption.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
        message += `*Caption:* ${escapedCaption}\n`;
      }
      message += `\n`;
    });
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...getBackToMenuKeyboard()
    });
  } catch (error) {
    Logger.error('Error in list button', error);
    await ctx.answerCbQuery('❌ Error fetching media list');
  }
}

/**
 * Handle count button
 * @param {Object} ctx - Telegraf context
 */
async function handleCountButton(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const count = MediaService.getMediaCount();
    
    await ctx.editMessageText(
      `📊 *Total Media Count*\n\nYou have *${count}* media stored.`,
      {
        parse_mode: 'Markdown',
        ...getBackToMenuKeyboard()
      }
    );
  } catch (error) {
    Logger.error('Error in count button', error);
    await ctx.answerCbQuery('❌ Error getting count');
  }
}

/**
 * Handle search prompt
 * @param {Object} ctx - Telegraf context
 */
async function handleSearchPrompt(ctx) {
  try {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      `🔍 *Search Media*\n\nPlease type your search keyword.\n\nExample: \`funny cat\``,
      {
        parse_mode: 'Markdown',
        ...getBackToMenuKeyboard()
      }
    );
    
    // Set user state to expect search input
    ctx.session = ctx.session || {};
    ctx.session.awaitingSearchInput = true;
  } catch (error) {
    Logger.error('Error in search prompt', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle send prompt - show category selection
 * @param {Object} ctx - Telegraf context
 */
async function handleSendPrompt(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const categories = MediaService.getCategories();
    
    if (categories.length === 0) {
      await ctx.editMessageText(
        '📨 *Send Media*\n\nNo categories found. Please upload media or create categories first.',
        getBackToMenuKeyboard()
      );
      return;
    }
    
    // Build category buttons (2 per row)
    const buttons = [];
    
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(`📁 ${categories[i]}`, `send_category_${categories[i]}`));
      if (i + 1 < categories.length) {
        row.push(Markup.button.callback(`📁 ${categories[i + 1]}`, `send_category_${categories[i + 1]}`));
      }
      buttons.push(row);
    }
    
    // Add "Send All Categories" button
    buttons.push([Markup.button.callback('📤 Send All Categories', 'send_all_categories')]);
    
    // Add back button
    buttons.push([Markup.button.callback('🔙 Back to Menu', 'main_menu')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    try {
      await ctx.editMessageText(
        `📨 *Send Media*\n\n` +
        `Select a category to send all its media,\n` +
        `or send all categories at once:`,
        {
          parse_mode: 'Markdown',
          ...keyboard
        }
      );
    } catch (editError) {
      // Ignore "message is not modified" error - happens when user clicks same button twice
      if (!editError.message.includes('message is not modified')) {
        throw editError;
      }
    }
  } catch (error) {
    Logger.error('Error in send prompt', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle bulk send prompt
 * @param {Object} ctx - Telegraf context
 */
async function handleBulkSendPrompt(ctx) {
  try {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      `📦 *Bulk Send Media*\n\nFormat: \`<media_names> <chat_id> [topic_id]\`\n\nExamples:\n\`video1,video2,video3 -1001234567890\`\n\`promo banner intro -1001234567890 123\``,
      {
        parse_mode: 'Markdown',
        ...getBackToMenuKeyboard()
      }
    );
  } catch (error) {
    Logger.error('Error in bulk send prompt', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle delete prompt - show category selection
 * @param {Object} ctx - Telegraf context
 */
async function handleDeletePrompt(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const categories = MediaService.getCategories();
    
    if (categories.length === 0) {
      await ctx.editMessageText(
        '🗑 *Delete Media*\n\nNo categories found.',
        getBackToMenuKeyboard()
      );
      return;
    }
    
    // Build category buttons (2 per row)
    const buttons = [];
    
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(`📁 ${categories[i]}`, `delete_category_${categories[i]}`));
      if (i + 1 < categories.length) {
        row.push(Markup.button.callback(`📁 ${categories[i + 1]}`, `delete_category_${categories[i + 1]}`));
      }
      buttons.push(row);
    }
    
    // Add back button
    buttons.push([Markup.button.callback('🔙 Back to Menu', 'main_menu')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    await ctx.editMessageText(
      `🗑 *Delete Media*\n\n` +
      `Select a category to view and delete its media:`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } catch (error) {
    Logger.error('Error in delete prompt', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle delete category media list - show all media in category with delete buttons
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleDeleteCategoryList(ctx, category) {
  try {
    // Answer callback query immediately to avoid timeout
    ctx.answerCbQuery().catch(() => {});
    
    Logger.info(`handleDeleteCategoryList called for category: ${category}`);
    
    const mediaList = MediaService.getMediaByCategory(category, 100).filter(m => m.media_type !== 'placeholder');
    Logger.info(`Found ${mediaList.length} media items in category ${category}`);
    
    if (mediaList.length === 0) {
      // Even if no media, allow deleting the empty category
      await ctx.editMessageText(
        `📁 *Category: ${escapeMarkdown(category)}*\n\n` +
        `No media found in this category.\n\n` +
        `You can still delete the empty category if you want.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🗑️ Delete Empty Category', `delete_whole_category_${category}`)],
            [Markup.button.callback(' Back to Delete Menu', 'delete_prompt')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ])
        }
      );
      return;
    }
    
    let message = `🗑 *Delete Media from: ${escapeMarkdown(category)}*\n\n`;
    message += `Total: ${mediaList.length} item(s)\n\n`;
    message += `Select media to delete:\n\n`;
    
    // Build keyboard with delete buttons for each media
    const buttons = [];
    
    // Limit to first 10 items to avoid telegram button limits
    const displayLimit = Math.min(mediaList.length, 10);
    
    for (let index = 0; index < displayLimit; index++) {
      const media = mediaList[index];
      message += `${index + 1}. *${escapeMarkdown(media.name)}*\n`;
      message += `   Type: ${media.media_type}`;
      if (media.caption) {
        const shortCaption = media.caption.length > 30 
          ? media.caption.substring(0, 30) + '...' 
          : media.caption;
        message += `\n   Caption: ${escapeMarkdown(shortCaption)}`;
      }
      message += `\n\n`;
      
      // Add delete button for each media
      buttons.push([Markup.button.callback(`🗑 ${media.name}`, `delete_media_${category}_${media.name}`)]);
    }
    
    if (mediaList.length > displayLimit) {
      message += `\n⚠️ Showing delete buttons for first ${displayLimit} items only.`;
    }
    
    Logger.info(`Created ${buttons.length} individual media buttons`);
    
    // Add "Delete All Media" and "Delete Entire Category" buttons
    // These buttons should ALWAYS appear when there are media in the category
    buttons.push([Markup.button.callback('⚠️ Delete All Media', `delete_all_${category}`)]);
    Logger.info(`Added Delete All Media button, total buttons now: ${buttons.length}`);
    
    buttons.push([Markup.button.callback('🗑️ Delete Entire Category', `delete_whole_category_${category}`)]);
    Logger.info(`Added Delete Entire Category button, total buttons now: ${buttons.length}`);
    
    // Add back buttons
    buttons.push([Markup.button.callback('🔙 Back', 'delete_prompt')]);
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);
    
    Logger.info(`Final button count: ${buttons.length} for category ${category}`);
    Logger.info(`Button structure: ${JSON.stringify(buttons.map(row => row.map(btn => btn.text)))}`);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
    Logger.info(`Successfully sent delete list for category: ${category}`);
  } catch (error) {
    Logger.error('Error handling delete category list', error);
    Logger.error('Error stack:', error.stack);
    await ctx.answerCbQuery('❌ Error loading media list');
  }
}

/**
 * Handle delete individual media from category
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 * @param {string} mediaName - Media name to delete
 */
async function handleDeleteMedia(ctx, category, mediaName) {
  try {
    // Answer callback query immediately to avoid timeout
    ctx.answerCbQuery().catch(() => {});
    
    // Verify media exists
    const media = MediaService.getMediaByName(mediaName);
    if (!media || media.category !== category) {
      await ctx.editMessageText(
        '❌ Media not found or does not belong to this category.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', `delete_category_${category}`)],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ])
        }
      );
      return;
    }
    
    // Show confirmation
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Yes, Delete', `confirm_delete_${category}_${mediaName}`),
        Markup.button.callback('❌ Cancel', `delete_category_${category}`)
      ]
    ]);
    
    // Escape special markdown characters in caption
    const escapeMarkdown = (text) => {
      if (!text) return '';
      return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    };
    
    const captionText = media.caption ? `*Caption:* ${escapeMarkdown(media.caption)}\n` : '';
    
    await ctx.editMessageText(
      `⚠️ *Confirm Deletion*\n\n` +
      `Are you sure you want to delete this media?\n\n` +
      `*Name:* ${escapeMarkdown(mediaName)}\n` +
      `*Category:* ${escapeMarkdown(category)}\n` +
      `*Type:* ${media.media_type}\n` +
      captionText +
      `\n⚠️ This action cannot be undone!`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
    Logger.info(`User ${ctx.from.id} confirming deletion of: ${mediaName}`);
  } catch (error) {
    Logger.error('Error handling delete media', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle confirm delete media
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 * @param {string} mediaName - Media name to delete
 */
async function handleConfirmDelete(ctx, category, mediaName) {
  try {
    // Answer callback query immediately to avoid timeout
    ctx.answerCbQuery().catch(() => {});
    
    Logger.info(`[SINGLE DELETE] Attempting to delete: ${mediaName} from category: ${category}`);
    const deleted = MediaService.deleteMediaFromCategory(mediaName, category);
    Logger.info(`[SINGLE DELETE] Delete result: ${deleted}`);
    
    if (deleted) {
      // Escape markdown special characters
      const escapeMarkdown = (text) => {
        if (!text) return '';
        return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
      };
      
      await ctx.editMessageText(
        `✅ *Deleted Successfully*\n\n` +
        `Deleted: ${escapeMarkdown(mediaName)}\n` +
        `From: ${escapeMarkdown(category)}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Category', `delete_category_${category}`)],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ])
        }
      );
      
      Logger.info(`User ${ctx.from.id} deleted media: ${mediaName}`);
    } else {
      Logger.warn(`[SINGLE DELETE] Failed to delete ${mediaName} from ${category} - returned false`);
      await ctx.editMessageText('❌ Failed to delete media.');
    }
  } catch (error) {
    Logger.error('[SINGLE DELETE] Error confirming delete:', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle delete all media in category
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleDeleteAllCategory(ctx, category) {
  try {
    // Answer callback query immediately to avoid timeout
    ctx.answerCbQuery().catch(() => {});
    
    const mediaList = MediaService.getMediaByCategory(category, 1000).filter(m => m.media_type !== 'placeholder');
    
    if (mediaList.length === 0) {
      await ctx.editMessageText(
        `📁 *Category: ${escapeMarkdown(category)}*\n\nNo media found.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'delete_prompt')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ])
        }
      );
      return;
    }
    
    // Show confirmation
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Yes, Delete All', `confirm_delete_all_${category}`),
        Markup.button.callback('❌ Cancel', `delete_category_${category}`)
      ]
    ]);
    
    await ctx.editMessageText(
      `⚠️ *Confirm Mass Deletion*\n\n` +
      `Delete ALL media in this category?\n\n` +
      `*Category:* ${escapeMarkdown(category)}\n` +
      `*Total:* ${mediaList.length} items\n\n` +
      `⚠️ Cannot be undone!`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
    Logger.info(`User ${ctx.from.id} confirming delete all: ${category}`);
  } catch (error) {
    Logger.error('Error handling delete all', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle confirm delete all media in category
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleConfirmDeleteAll(ctx, category) {
  try {
    // Answer callback query immediately to avoid timeout
    ctx.answerCbQuery().catch(() => {});
    
    Logger.info(`Starting delete all media for category: ${category}`);
    const mediaList = MediaService.getMediaByCategory(category, 1000).filter(m => m.media_type !== 'placeholder');
    Logger.info(`Found ${mediaList.length} media items to delete`);
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const media of mediaList) {
      try {
        Logger.info(`Attempting to delete: ${media.name} from category: ${category}`);
        const deleted = MediaService.deleteMediaFromCategory(media.name, category);
        if (deleted) {
          deletedCount++;
          Logger.info(`Successfully deleted: ${media.name}`);
        } else {
          errorCount++;
          Logger.warn(`Failed to delete media (returned false): ${media.name}`);
        }
      } catch (deleteError) {
        errorCount++;
        Logger.error(`Error deleting media ${media.name}:`, deleteError);
      }
    }
    
    Logger.info(`Delete all complete. Deleted: ${deletedCount}, Errors: ${errorCount}`);
    
    // Escape markdown special characters
    const escapeMarkdown = (text) => {
      if (!text) return '';
      return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    };
    
    // Build success message with detailed feedback
    let successMessage = `✅ *Deletion Complete*\n\n`;
    successMessage += `Category: ${escapeMarkdown(category)}\n`;
    successMessage += `Successfully deleted: ${deletedCount} item(s)\n`;
    
    if (errorCount > 0) {
      successMessage += `Failed to delete: ${errorCount} item(s)\n`;
      successMessage += `\n⚠️ Some items could not be deleted. Check logs for details.`;
    } else {
      successMessage += `\n✅ All media in this category has been deleted successfully!`;
    }
    
    await ctx.editMessageText(
      successMessage,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🗑 Delete More', 'delete_prompt')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      }
    );
    
    Logger.info(`User ${ctx.from.id} deleted all media (${deletedCount}) from: ${category}`);
  } catch (error) {
    Logger.error('Error confirming delete all', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle delete whole category confirmation
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleDeleteWholeCategory(ctx, category) {
  try {
    // Answer callback query immediately to avoid timeout
    ctx.answerCbQuery().catch(() => {});
    
    const mediaList = MediaService.getMediaByCategory(category, 1000).filter(m => m.media_type !== 'placeholder');
    const escapedCategory = escapeMarkdown(category);
    
    // Show confirmation for both empty and non-empty categories
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Yes, Delete Category', `confirm_delete_whole_category_${category}`),
        Markup.button.callback('❌ Cancel', `delete_category_${category}`)
      ]
    ]);
    
    const confirmMessage = mediaList.length === 0
      ? `🗑️ *Confirm Empty Category Deletion*\n\n` +
        `Delete this empty category?\n\n` +
        `*Category:* ${escapedCategory}\n` +
        `*Total Media:* 0 items\n\n` +
        `⚠️ This action CANNOT be undone!`
      : `🗑️ *Confirm Category Deletion*\n\n` +
        `Delete the ENTIRE category including ALL its media?\n\n` +
        `*Category:* ${escapedCategory}\n` +
        `*Total Media:* ${mediaList.length} items\n\n` +
        `⚠️ This will permanently delete:\n` +
        `• All ${mediaList.length} media files\n` +
        `• The category itself\n\n` +
        `⚠️ This action CANNOT be undone!`;
    
    await ctx.editMessageText(confirmMessage, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
    Logger.info(`User ${ctx.from.id} confirming delete whole category: ${category} (${mediaList.length} media)`);
  } catch (error) {
    Logger.error('Error handling delete whole category', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle confirm delete whole category
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleConfirmDeleteWholeCategory(ctx, category) {
  try {
    // Answer callback query immediately to avoid timeout
    ctx.answerCbQuery().catch(() => {});
    
    const deletedCount = MediaService.deleteCategory(category);
    
    // Escape markdown special characters
    const escapeMarkdown = (text) => {
      if (!text) return '';
      return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
    };
    
    await ctx.editMessageText(
      `✅ *Category Deleted Successfully*\n\n` +
      `Deleted category: ${escapeMarkdown(category)}\n` +
      `Total media removed: ${deletedCount} items\n\n` +
      `The category and all its media have been permanently deleted.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🗑 Delete More', 'delete_prompt')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      }
    );
    
    Logger.info(`User ${ctx.from.id} deleted entire category "${category}" with ${deletedCount} media`);
  } catch (error) {
    Logger.error('Error confirming delete whole category', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle "Keep Only" button
 * @param {Object} ctx - Telegraf context
 */
async function handleKeepOnly(ctx) {
  try {
    await ctx.answerCbQuery('✅ Media saved successfully!');
    await ctx.editMessageText(
      '✅ *Media Saved!*\n\nYour media has been stored and is ready to use.',
      { parse_mode: 'Markdown' }
    );
    Logger.info('User chose to keep media only');
  } catch (error) {
    Logger.error('Error handling keep only', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle "Send Now" button - shows category selection
 * @param {Object} ctx - Telegraf context
 * @param {string} mediaName - Name of the media to send
 */
async function handleSendNow(ctx, mediaName) {
  try {
    await ctx.answerCbQuery();
    
    // Verify media exists
    const media = MediaService.getMediaByName(mediaName);
    if (!media) {
      await ctx.editMessageText('❌ Media not found. It may have been deleted.');
      return;
    }
    
    // Get all categories
    const categories = MediaService.getCategories();
    
    if (categories.length === 0) {
      await ctx.editMessageText(
        '❌ No categories found. Please create categories first by uploading media.',
        getBackToMenuKeyboard()
      );
      return;
    }
    
    // Build category selection keyboard (2 buttons per row)
    const buttons = [];
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(`� ${categories[i]}`, `send_to_cat_${mediaName}_${categories[i]}`));
      if (i + 1 < categories.length) {
        row.push(Markup.button.callback(`📁 ${categories[i + 1]}`, `send_to_cat_${mediaName}_${categories[i + 1]}`));
      }
      buttons.push(row);
    }
    
    // Add back button
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    await ctx.editMessageText(
      `📤 *Send Media Now*\n\n` +
      `*Media:* ${escapeMarkdown(mediaName)}\n` +
      `*Type:* ${media.media_type}\n\n` +
      `Select the category where you want to send this media:`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
    Logger.info(`User selecting category to send media: ${mediaName}`);
  } catch (error) {
    Logger.error('Error handling send now', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle sending media to a category - shows media list from that category
 * @param {Object} ctx - Telegraf context
 * @param {string} mediaName - Name of the media to send
 * @param {string} category - Category to send to
 */
async function handleSendToCategory(ctx, mediaName, category) {
  try {
    await ctx.answerCbQuery();
    
    // Verify media exists
    const media = MediaService.getMediaByName(mediaName);
    if (!media) {
      await ctx.editMessageText('❌ Media not found. It may have been deleted.');
      return;
    }
    
    // Get all media in the selected category
    const categoryMedia = MediaService.getMediaByCategory(category, 100);
    
    if (categoryMedia.length === 0) {
      await ctx.editMessageText(
        `❌ No media found in category "${category}".`,
        getBackToMenuKeyboard()
      );
      return;
    }
    
    let message = `� *Send to Category: ${escapeMarkdown(category)}*\n\n`;
    message += `*Media to send:* ${escapeMarkdown(mediaName)}\n`;
    message += `*Type:* ${media.media_type}\n\n`;
    message += `📋 *Media in this category (${categoryMedia.length}):*\n\n`;
    
    categoryMedia.forEach((m, index) => {
      if (index < 10) { // Show first 10 for brevity
        message += `${index + 1}. ${escapeMarkdown(m.name)} (${m.media_type})\n`;
      }
    });
    
    if (categoryMedia.length > 10) {
      message += `\n... and ${categoryMedia.length - 10} more\n`;
    }
    
    message += `\n💡 To send this media, use the command:\n`;
    message += `\`/send ${escapeMarkdown(mediaName)} <chat_id>\``;
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...getBackToMenuKeyboard()
    });
    
    Logger.info(`Showed category ${category} for media ${mediaName}`);
  } catch (error) {
    Logger.error('Error handling send to category', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle "View Categories" button - shows all categories with inline buttons
 * @param {Object} ctx - Telegraf context
 */
async function handleViewCategories(ctx) {
  try {
    await ctx.answerCbQuery();

    const originalMessageId = await cleanupCategoryMessages(ctx);

    const allCategories = MediaService.getCategories();
    Logger.info(`All categories from DB: ${JSON.stringify(allCategories)}`);
    
    // Keep all categories including uncategorized so users can manage unorganized media
    const categories = allCategories;
    Logger.info(`All categories to display: ${JSON.stringify(categories)}`);
    
    // Build category buttons (2 per row)
    const buttons = [];
    
    if (categories.length > 0) {
      for (let i = 0; i < categories.length; i += 2) {
        const row = [];
        row.push(Markup.button.callback(`📁 ${categories[i]}`, `show_cat_${categories[i]}`));
        if (i + 1 < categories.length) {
          row.push(Markup.button.callback(`📁 ${categories[i + 1]}`, `show_cat_${categories[i + 1]}`));
        }
        buttons.push(row);
      }
    }
    
    // Add "Add New Category" button
    buttons.push([Markup.button.callback('➕ Add New Category', 'add_new_category')]);
    
    // Add back button
    buttons.push([Markup.button.callback('� Back to Menu', 'main_menu')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    const message = categories.length > 0
      ? `� *Categories* (${categories.length})\n\nSelect a category to view its media, or add a new one:`
      : `� *Categories*\n\nNo categories found yet. Create your first category!`;

    const opts = { parse_mode: 'Markdown', ...keyboard };

    if (originalMessageId) {
      // Re-edit the original header message back to categories list
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, originalMessageId, undefined, message, opts);
      } catch (editErr) {
        // Header message may have been deleted — send a fresh one
        await ctx.reply(message, opts);
      }
    } else {
      try {
        await ctx.editMessageText(message, opts);
      } catch (editErr) {
        // Current message may have been deleted — send a fresh one
        await ctx.reply(message, opts);
      }
    }
    
    Logger.info('User viewed categories');
  } catch (error) {
    Logger.error('Error viewing categories', error);
    await ctx.answerCbQuery('❌ Error loading categories');
  }
}

/**
 * Handle showing media in a specific category
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleShowCategory(ctx, category) {
  try {
    await ctx.answerCbQuery();

    const categoryMediaLimit = 10;
    const mediaList = MediaService.getMediaByCategory(category, categoryMediaLimit);

    // Filter out placeholder media
    const realMedia = mediaList.filter(m => m.media_type !== 'placeholder');

    // Navigation keyboard that will appear at the BOTTOM after all media
    const navKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📤 Upload to This Category', `upload_to_${category}`)],
      [Markup.button.callback('🔙 Back to Categories', 'view_categories')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);

    if (realMedia.length === 0) {
      await ctx.editMessageText(
        `📁 *Category: ${escapeMarkdown(category)}*\n\n` +
        `No media found in this category yet.\n\n` +
        `Upload media and assign it to this category to see it here!`,
        {
          parse_mode: 'Markdown',
          ...navKeyboard
        }
      );
      return;
    }

    // Track the original message ID (current categories list message) before editing it
    const originalMessageId = ctx.callbackQuery.message.message_id;

    // Edit header message — no buttons here, just info
    await ctx.editMessageText(
      `📁 *Category: ${escapeMarkdown(category)}*\n\n` +
      `Showing up to ${categoryMediaLimit} item(s) — sending below...`,
      { parse_mode: 'Markdown' }
    );

    // Send each media file and collect their message IDs for later cleanup
    const mediaToSend = realMedia;
    const mediaMessageIds = [];

    for (const media of mediaToSend) {
      try {
        // Send media without caption (no sender info)
        let sentMsg;
        if (media.media_type === 'video') {
          sentMsg = await ctx.telegram.sendVideo(ctx.chat.id, media.file_id);
        } else if (media.media_type === 'photo') {
          sentMsg = await ctx.telegram.sendPhoto(ctx.chat.id, media.file_id);
        } else if (media.media_type === 'document') {
          sentMsg = await ctx.telegram.sendDocument(ctx.chat.id, media.file_id);
        } else if (media.media_type === 'animation') {
          sentMsg = await ctx.telegram.sendAnimation(ctx.chat.id, media.file_id);
        }

        if (sentMsg) mediaMessageIds.push(sentMsg.message_id);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (sendError) {
        Logger.error(`Error sending media ${media.name}`, sendError);
      }
    }

    // Send bottom nav message — this is what the user sees at the bottom
    let bottomText = `📁 *${escapeMarkdown(category)}* — showing ${realMedia.length} item(s)`;

    await ctx.reply(bottomText, {
      parse_mode: 'Markdown',
      ...navKeyboard
    });

    // Track media messages + the original header message ID so we can restore it on back-navigation
    categoryViewMessages.set(ctx.from.id, {
      chatId: ctx.chat.id,
      originalMessageId,
      mediaMessageIds
    });

    Logger.info(`User viewed category: ${category}`);
  } catch (error) {
    Logger.error('Error showing category', error);
    await ctx.answerCbQuery('❌ Error loading category');
  }
}

/**
 * Handle "Add New Category" button
 * @param {Object} ctx - Telegraf context
 */
async function handleAddNewCategory(ctx) {
  try {
    await ctx.answerCbQuery();
    
    // Import pendingCategoryCreation from mediaHandler
    const { pendingCategoryCreation } = require('./mediaHandler');
    
    // Set user state to awaiting category name
    const userId = ctx.from.id;
    pendingCategoryCreation.set(userId, { awaiting: true });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back to Categories', 'view_categories')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await ctx.editMessageText(
      `➕ *Create New Category*\n\n` +
      `Please type the name for your new category.\n\n` +
      `Rules:\n` +
      `• Use only letters, numbers, underscore (_), or dash (-)\n` +
      `• No spaces allowed\n` +
      `• Example: promo_2024 or sales-banner`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
    Logger.info('User initiated new category creation');
  } catch (error) {
    Logger.error('Error handling add new category', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle "Upload to This Category" button
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleUploadToCategory(ctx, category) {
  try {
    await ctx.answerCbQuery();
    
    // Import pendingCategoryUpload from mediaHandler
    const { pendingCategoryUpload } = require('./mediaHandler');
    
    // Set user state to upload to specific category
    const userId = ctx.from.id;
    pendingCategoryUpload.set(userId, { category: category });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back to Category', `show_cat_${category}`)],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await ctx.editMessageText(
      `📤 *Upload to Category: ${escapeMarkdown(category)}*\n\n` +
      `Please send the media you want to upload to this category.\n\n` +
      `Supported formats:\n` +
      `• 📹 Video\n` +
      `• 🖼 Photo\n` +
      `• 📄 Document\n` +
      `• 🎞 Animation (GIF)`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
    Logger.info(`User ${userId} set to upload to category: ${category}`);
  } catch (error) {
    Logger.error('Error handling upload to category', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle "View All Media" button
 * @param {Object} ctx - Telegraf context
 */
async function handleViewAllMedia(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const mediaList = MediaService.getLatestMedia(config.maxListResults);
    
    if (mediaList.length === 0) {
      await ctx.editMessageText('📭 No media found', getBackToMenuKeyboard());
      return;
    }
    
    let message = `📋 *Your Media Library*\n\n`;
    message += `Total: ${mediaList.length} items\n\n`;
    
    mediaList.forEach((media, index) => {
      message += `${index + 1}. *${escapeMarkdown(media.name)}*\n`;
      message += `   Type: ${media.media_type}`;
      if (media.category) {
        message += ` | Category: ${escapeMarkdown(media.category)}`;
      }
      if (media.caption) {
        const shortCaption = media.caption.length > 30 
          ? media.caption.substring(0, 30) + '...' 
          : media.caption;
        // Escape markdown special characters in caption
        const escapedCaption = shortCaption.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
        message += `\n   Caption: ${escapedCaption}`;
      }
      message += `\n\n`;
    });
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...getBackToMenuKeyboard()
    });
    
    Logger.info('User viewed all media');
  } catch (error) {
    Logger.error('Error viewing all media', error);
    await ctx.answerCbQuery('❌ Error loading media list');
  }
}

/**
 * Main callback query router
 * @param {Object} ctx - Telegraf context
 */
async function handleCallbackQuery(ctx) {
  const data = ctx.callbackQuery.data;
  
  Logger.info(`Callback query received: ${data}`);
  
  try {
    // Category selection handlers
    if (data.startsWith('set_cat_') || data.startsWith('set_cat::')) {
      const { pendingMedia } = require('./mediaHandler');
      const parsed = parseSetCategoryCallback(data, pendingMedia.get(ctx.from.id));

      if (!parsed) {
        await ctx.answerCbQuery('❌ Invalid category selection');
        return;
      }

      await handleCategorySelection(ctx, parsed.mediaName, parsed.category);
    } else if (data.startsWith('skip_cat_')) {
      const mediaName = data.replace('skip_cat_', '');
      await handleCategorySelection(ctx, mediaName, 'uncategorized');
    } else if (data.startsWith('new_cat_')) {
      const mediaName = data.replace('new_cat_', '');
      await ctx.answerCbQuery();

      const { pendingCategoryCreation } = require('./mediaHandler');
      pendingCategoryCreation.set(ctx.from.id, { awaiting: true, mediaName });

      await ctx.editMessageText(
        `➕ *Create New Category*\n\n` +
        `Type the new category name for this media.\n\n` +
        `Rules:\n` +
        `• Use only letters, numbers, underscore (_), or dash (-)\n` +
        `• No spaces allowed\n` +
        `• Example: promo_2024 or sales-banner`,
        { parse_mode: 'Markdown' }
      );
    }
    // Send to category handler
    else if (data.startsWith('send_to_cat_')) {
      const parts = data.replace('send_to_cat_', '').split('_');
      const mediaName = parts[0];
      const category = parts.slice(1).join('_');
      await handleSendToCategory(ctx, mediaName, category);
    }
    // Action buttons after media save
    else if (data === 'keep_only') {
      await handleKeepOnly(ctx);
    } else if (data.startsWith('send_now_')) {
      const mediaName = data.replace('send_now_', '');
      await handleSendNow(ctx, mediaName);
    } else if (data === 'view_all_media') {
      await handleViewAllMedia(ctx);
    }
    // Category viewing handlers
    else if (data === 'view_categories') {
      await handleViewCategories(ctx);
    } else if (data.startsWith('show_cat_')) {
      const category = data.replace('show_cat_', '');
      await handleShowCategory(ctx, category);
    } else if (data === 'add_new_category') {
      await handleAddNewCategory(ctx);
    } else if (data.startsWith('upload_to_')) {
      const category = data.replace('upload_to_', '');
      await handleUploadToCategory(ctx, category);
    }
    // Delete category handlers
    else if (data.startsWith('delete_category_')) {
      const category = data.replace('delete_category_', '');
      await handleDeleteCategoryList(ctx, category);
    } else if (data.startsWith('delete_media_')) {
      const parts = data.replace('delete_media_', '').split('_');
      const category = parts[0];
      const mediaName = parts.slice(1).join('_');
      await handleDeleteMedia(ctx, category, mediaName);
    } else if (data.startsWith('confirm_delete_whole_category_')) {
      const category = data.replace('confirm_delete_whole_category_', '');
      await handleConfirmDeleteWholeCategory(ctx, category);
    } else if (data.startsWith('delete_whole_category_')) {
      const category = data.replace('delete_whole_category_', '');
      await handleDeleteWholeCategory(ctx, category);
    } else if (data.startsWith('delete_all_')) {
      const category = data.replace('delete_all_', '');
      await handleDeleteAllCategory(ctx, category);
    } else if (data.startsWith('confirm_delete_all_')) {
      const category = data.replace('confirm_delete_all_', '');
      await handleConfirmDeleteAll(ctx, category);
    } else if (data.startsWith('confirm_delete_')) {
      const parts = data.replace('confirm_delete_', '').split('_');
      const category = parts[0];
      const mediaName = parts.slice(1).join('_');
      await handleConfirmDelete(ctx, category, mediaName);
    }
    // Send category handlers
    else if (data.startsWith('send_category_')) {
      const category = data.replace('send_category_', '');
      await handleSendCategoryPrompt(ctx, category);
    } else if (data === 'send_all_categories') {
      await handleSendAllCategoriesPrompt(ctx);
    }
    // Whitelist handlers
    else if (data === 'add_to_whitelist') {
      await handleAddToWhitelist(ctx);
    } else if (data === 'manage_whitelist') {
      await handleManageWhitelist(ctx);
    } else if (data.startsWith('delete_wl_')) {
      const whitelistId = data.replace('delete_wl_', '');
      await handleDeleteWhitelist(ctx, whitelistId);
    } else if (data === 'skip_topic') {
      await handleSkipTopic(ctx);
    } else if (data.startsWith('send_cat_wl_')) {
      const parts = data.replace('send_cat_wl_', '').split('_');
      const category = parts[0];
      const whitelistId = parts[1];
      await handleSendCategoryWithWhitelist(ctx, category, whitelistId);
    } else if (data.startsWith('manual_send_cat_')) {
      const category = data.replace('manual_send_cat_', '');
      await handleManualSendCategory(ctx, category);
    }
    // Forum handlers
    else if (data === 'forum_prompt') {
      await handleForumInteractive(ctx);
    }
    // Bulk send handlers
    else if (data === 'bulk_send_menu') {
      await handleBulkSendMenu(ctx);
    } else if (data === 'bulk_send_category') {
      await handleBulkSendCategory(ctx);
    } else if (data.startsWith('bulk_cat_')) {
      const category = data.replace('bulk_cat_', '');
      await handleBulkCategorySelect(ctx, category);
    } else if (data === 'bulk_send_all') {
      await handleBulkSendAll(ctx);
    } else if (data === 'bulk_confirm_send') {
      await handleConfirmBulkSend(ctx);
    }
    // Main menu actions
    else if (data === 'main_menu') {

      await showMainMenu(ctx);
    } else if (data === 'help') {
      await showHelp(ctx);
    } else if (data === 'list') {
      await handleListButton(ctx);
    } else if (data === 'count') {
      await handleCountButton(ctx);
    } else if (data === 'search_prompt') {
      await handleSearchPrompt(ctx);
    } else if (data === 'send_prompt') {
      await handleSendPrompt(ctx);
    } else if (data === 'bulksend_prompt') {
      await handleBulkSendPrompt(ctx);
    } else if (data === 'delete_prompt') {
      await handleDeletePrompt(ctx);
    } else {
      // Unknown callback
      await ctx.answerCbQuery('❓ Unknown action');
    }
  } catch (error) {
    Logger.error('Error handling callback query', error);
    await ctx.answerCbQuery('❌ An error occurred');
  }
}

/**
 * Handle category selection for media
 * @param {Object} ctx - Telegraf context
 * @param {string} mediaName - Media name
 * @param {string} category - Selected category
 */
async function handleCategorySelection(ctx, mediaName, category) {
  try {
    await ctx.answerCbQuery();
    
    // Get pending media from mediaHandler
    const { handleMedia, pendingMedia } = require('./mediaHandler');
    const userId = ctx.from.id;
    const mediaData = pendingMedia.get(userId);
    
    if (!mediaData || mediaData.name !== mediaName) {
      await ctx.editMessageText('❌ Media data not found. Please upload again.');
      return;
    }
    
    // Get next counter for this category
    const counter = MediaService.getNextCounterForCategory(category);
    const finalName = `${category}_${counter}`;
    
    // Set category and final name, then save
    mediaData.category = category;
    mediaData.name = finalName;
    const savedName = MediaService.saveMedia(mediaData);
    
    // Clear pending media
    pendingMedia.delete(userId);
    
    // Send success message with action buttons
    const actionButtons = Markup.inlineKeyboard([
      [
        Markup.button.callback('💾 Keep Only', 'keep_only'),
        Markup.button.callback('📤 Send Now', `send_now_${savedName}`)
      ],
      [
        Markup.button.callback('📋 View All Media', 'view_all_media')
      ]
    ]);
    
    await ctx.editMessageText(
      `✅ *Media Saved!*\n\n` +
      `*Category:* ${escapeMarkdown(category)}\n` +
      `*Type:* ${mediaData.media_type}\n\n` +
      `What would you like to do?`,
      { 
        parse_mode: 'Markdown',
        ...actionButtons
      }
    );
    
    Logger.info(`Media ${savedName} saved in category ${category}`);
    
  } catch (error) {
    Logger.error('Error handling category selection', error);
    await ctx.editMessageText('❌ Failed to save media. Please try again.');
  }
}

/**
 * Handle send category prompt - ask for chat_id
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category to send
 */
async function handleSendCategoryPrompt(ctx, category) {
  try {
    await ctx.answerCbQuery();
    
    // Get media count in category
    const mediaList = MediaService.getMediaByCategory(category, 1000).filter(m => m.media_type !== 'placeholder');
    
    if (mediaList.length === 0) {
      await ctx.editMessageText(
        `❌ No media found in category "${category}".`,
        getBackToMenuKeyboard()
      );
      return;
    }
    
    // Get whitelist
    const whitelist = MediaService.getWhitelist();
    
    // Build keyboard with whitelist buttons
    const buttons = [];
    
    if (whitelist.length > 0) {
      // Add whitelist buttons (2 per row)
      for (let i = 0; i < whitelist.length; i += 2) {
        const row = [];
        row.push(Markup.button.callback(`📢 ${whitelist[i].name}`, `send_cat_wl_${category}_${whitelist[i].id}`));
        if (i + 1 < whitelist.length) {
          row.push(Markup.button.callback(`📢 ${whitelist[i + 1].name}`, `send_cat_wl_${category}_${whitelist[i + 1].id}`));
        }
        buttons.push(row);
      }
    }
    
    // Add management buttons
    buttons.push([Markup.button.callback('➕ Add Channel/Group', 'add_to_whitelist')]);
    buttons.push([Markup.button.callback('🗑 Manage Whitelist', 'manage_whitelist')]);
    buttons.push([Markup.button.callback('✏️ Type Chat ID Manually', `manual_send_cat_${category}`)]);
    buttons.push([Markup.button.callback('🔙 Back', 'send_prompt')]);
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    const message = whitelist.length > 0
      ? `📤 *Send Category: ${escapeMarkdown(category)}*\n\nTotal media: ${mediaList.length} items\n\nSelect a channel/group or add new one:`
      : `📤 *Send Category: ${escapeMarkdown(category)}*\n\nTotal media: ${mediaList.length} items\n\nNo channels/groups in whitelist yet. Add one or type chat ID manually.`;
    
    try {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } catch (editError) {
      // Ignore "message is not modified" error
      if (!editError.message.includes('message is not modified')) {
        throw editError;
      }
    }
    
    Logger.info(`User ${ctx.from.id} selecting destination for category: ${category}`);
  } catch (error) {
    Logger.error('Error handling send category prompt', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle skip topic button - save whitelist without topic
 * @param {Object} ctx - Telegraf context
 */
async function handleSkipTopic(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const { pendingWhitelistAdd } = require('./whitelistHandler');
    const userId = ctx.from.id;
    const state = pendingWhitelistAdd.get(userId);
    
    if (!state || !state.chat_id) {
      await ctx.editMessageText('❌ Session expired. Please start again.');
      return;
    }
    
    // Save to whitelist without topic_id
    try {
      MediaService.addToWhitelist(state.name, state.chat_id, null);
      
      await ctx.editMessageText(
        `✅ *Successfully Added to Whitelist!*\n\n` +
        `Name: ${state.name}\n` +
        `Chat ID: \`${state.chat_id}\`\n` +
        `Topic: None\n\n` +
        `You can now use this for sending media.`,
        { parse_mode: 'Markdown' }
      );
      
      pendingWhitelistAdd.delete(userId);
      Logger.info(`User ${userId} added ${state.name} (${state.chat_id}) to whitelist without topic`);
      
    } catch (error) {
      if (error.message.includes('already exists')) {
        await ctx.reply(`❌ ${error.message}\n\nPlease try again with a different name or chat ID.`);
        pendingWhitelistAdd.delete(userId);
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    Logger.error('Error handling skip topic', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle send all categories prompt - ask for chat_id
 * @param {Object} ctx - Telegraf context
 */
async function handleSendAllCategoriesPrompt(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const categories = MediaService.getCategories();
    
    if (categories.length === 0) {
      await ctx.editMessageText(
        '❌ No categories found.',
        getBackToMenuKeyboard()
      );
      return;
    }
    
    // Count total media across all categories
    let totalMedia = 0;
    for (const cat of categories) {
      const mediaList = MediaService.getMediaByCategory(cat, 1000).filter(m => m.media_type !== 'placeholder');
      totalMedia += mediaList.length;
    }
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back', 'send_prompt')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await ctx.editMessageText(
      `📤 *Send All Categories*\n\n` +
      `Categories: ${categories.length}\n` +
      `Total media: ${totalMedia} items\n\n` +
      `Please type the chat ID (and optional topic ID).\n\n` +
      `*Format:*\n` +
      `• For regular chat: \`-1001234567890\`\n` +
      `• For topic/forum: \`-1001234567890 20\`\n\n` +
      `💡 Get chat ID using @userinfobot`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
    // Set user state to await chat_id for all categories
    const { pendingCategoryUpload } = require('./mediaHandler');
    const userId = ctx.from.id;
    pendingCategoryUpload.set(userId, { sendingAllCategories: true });
    
    Logger.info(`User ${userId} preparing to send all categories`);
  } catch (error) {
    Logger.error('Error handling send all categories prompt', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle manage whitelist - show all whitelist entries with delete buttons
 * @param {Object} ctx - Telegraf context
 */
async function handleManageWhitelist(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const whitelist = MediaService.getWhitelist();
    
    if (whitelist.length === 0) {
      await ctx.editMessageText(
        '🗑 *Manage Whitelist*\n\nNo channels/groups in whitelist yet.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'send_prompt')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ])
        }
      );
      return;
    }
    
    let message = `🗑 *Manage Whitelist*\n\nTotal: ${whitelist.length} entries\n\n`;
    
    // Build keyboard with delete buttons
    const buttons = [];
    
    whitelist.forEach((entry, index) => {
      message += `${index + 1}. *${entry.name}*\n`;
      message += `   Chat ID: \`${entry.chat_id}\`\n`;
      if (entry.topic_id) {
        message += `   Topic ID: \`${entry.topic_id}\`\n`;
      }
      message += `\n`;
      
      // Add delete button for this entry
      buttons.push([Markup.button.callback(`🗑 Delete: ${entry.name}`, `delete_wl_${entry.id}`)]);
    });
    
    // Add back buttons
    buttons.push([Markup.button.callback('🔙 Back', 'send_prompt')]);
    buttons.push([Markup.button.callback('🏠 Main Menu', 'main_menu')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
    
    Logger.info(`User ${ctx.from.id} viewing whitelist management`);
  } catch (error) {
    Logger.error('Error handling manage whitelist', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle delete whitelist entry
 * @param {Object} ctx - Telegraf context
 * @param {string} whitelistId - Whitelist entry ID to delete
 */
async function handleDeleteWhitelist(ctx, whitelistId) {
  try {
    await ctx.answerCbQuery();
    
    // Get whitelist entry
    const whitelist = MediaService.getWhitelist();
    const entry = whitelist.find(w => w.id === parseInt(whitelistId));
    
    if (!entry) {
      await ctx.editMessageText('❌ Entry not found. It may have been deleted already.');
      return;
    }
    
    // Delete from whitelist
    const deleted = MediaService.deleteFromWhitelist(entry.name);
    
    if (deleted) {
      await ctx.editMessageText(
        `✅ *Deleted from Whitelist*\n\n` +
        `Name: ${entry.name}\n` +
        `Chat ID: \`${entry.chat_id}\`\n\n` +
        `This channel/group has been removed from the whitelist.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🗑 Manage Whitelist', 'manage_whitelist')],
            [Markup.button.callback('🔙 Back', 'send_prompt')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ])
        }
      );
      
      Logger.info(`User ${ctx.from.id} deleted whitelist entry: ${entry.name}`);
    } else {
      await ctx.editMessageText('❌ Failed to delete entry. Please try again.');
    }
    
  } catch (error) {
    Logger.error('Error handling delete whitelist', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

module.exports = {
  handleCallbackQuery,
  showMainMenu,
  showHelp,
};
