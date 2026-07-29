/**
 * Whitelist Handler
 * Handles whitelist management for channels/groups
 */

const { Markup } = require('telegraf');
const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');

// Store pending whitelist additions
const pendingWhitelistAdd = new Map();

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
 * Handle add to whitelist button
 * @param {Object} ctx - Telegraf context
 */
async function handleAddToWhitelist(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    pendingWhitelistAdd.set(userId, { awaiting: 'name' });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Cancel', 'send_prompt')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    try {
      await ctx.editMessageText(
        `➕ *Add Channel/Group to Whitelist*\n\n` +
        `Step 1 of 2: Please type a name for this channel/group.\n\n` +
        `Example: \`My Channel\` or \`Promo Group\``,
        {
          parse_mode: 'Markdown',
          ...keyboard
        }
      );
    } catch (editError) {
      // Ignore "message is not modified" error
      if (!editError.message.includes('message is not modified')) {
        throw editError;
      }
    }
    
    Logger.info(`User ${userId} initiated whitelist addition`);
  } catch (error) {
    Logger.error('Error handling add to whitelist', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle whitelist name/chat_id input
 * @param {Object} ctx - Telegraf context
 * @returns {boolean} - True if handled
 */
async function handleWhitelistInput(ctx) {
  const userId = ctx.from.id;
  const state = pendingWhitelistAdd.get(userId);
  
  if (!state) {
    return false;
  }
  
  try {
    const input = ctx.message.text.trim();
    
    if (state.awaiting === 'name') {
      // Validate name
      if (input.length < 2) {
        await ctx.reply('❌ Name too short. Please provide at least 2 characters:');
        return true;
      }
      
      // Save name and ask for chat_id or forward
      state.name = input;
      state.awaiting = 'chat_id';
      pendingWhitelistAdd.set(userId, state);
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Cancel', 'send_prompt')],
        [Markup.button.callback('🏠 Main Menu', 'main_menu')]
      ]);
      
      await ctx.reply(
        `✅ Name saved: *${escapeMarkdown(input)}*\n\n` +
        `Step 2 of 2: Choose one option:\n\n` +
        `📲 *Option 1:* Forward a message from that channel/group to me\n` +
        `   (Bot will auto-extract the chat ID)\n\n` +
        `⌨️ *Option 2:* Type the chat ID manually\n` +
        `   Format: \`-1001234567890\`\n\n` +
        `💡 Get chat ID using @userinfobot`,
        {
          parse_mode: 'Markdown',
          ...keyboard
        }
      );
      
      return true;
      
    } else if (state.awaiting === 'chat_id') {
      // Validate chat_id
      if (!/^-?\d+$/.test(input)) {
        await ctx.reply('❌ Invalid chat ID format. Please enter a valid number.\n\nExample: `-1001234567890`');
        return true;
      }
      
      // Save chat_id and ask for topic_id
      state.chat_id = input;
      state.awaiting = 'topic_id';
      pendingWhitelistAdd.set(userId, state);
      
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⏭️ Skip (No Topic)', 'skip_topic')],
        [Markup.button.callback('🔙 Cancel', 'send_prompt')]
      ]);
      
      await ctx.reply(
        `✅ Chat ID saved: \`${input}\`\n\n` +
        `Step 3 (Optional): Does this group have topics/forums enabled?\n\n` +
        `If yes, type the topic ID where you want to send media.\n` +
        `If no, click "Skip" button below.\n\n` +
        `💡 Topic ID is the message thread ID in forum groups.`,
        {
          parse_mode: 'Markdown',
          ...keyboard
        }
      );
      
      return true;
      
    } else if (state.awaiting === 'topic_id') {
      // Validate topic_id
      if (!/^-?\d+$/.test(input)) {
        await ctx.reply('❌ Invalid topic ID format. Please enter a valid number or click Skip.');
        return true;
      }
      
      // Save to whitelist with topic_id
      try {
        MediaService.addToWhitelist(state.name, state.chat_id, input);
        
        await ctx.reply(
          `✅ *Successfully Added to Whitelist!*\n\n` +
          `Name: ${escapeMarkdown(state.name)}\n` +
          `Chat ID: \`${state.chat_id}\`\n` +
          `Topic ID: \`${input}\`\n\n` +
          `You can now use this for sending media to this specific topic.`,
          { parse_mode: 'Markdown' }
        );
        
        pendingWhitelistAdd.delete(userId);
        Logger.info(`User ${userId} added ${state.name} (${state.chat_id}, topic: ${input}) to whitelist`);
        
      } catch (error) {
        if (error.message.includes('already exists')) {
          await ctx.reply(`❌ ${error.message}\n\nPlease try again with a different name or chat ID.`);
          pendingWhitelistAdd.delete(userId);
        } else {
          throw error;
        }
      }
      
      return true;
    }
    
  } catch (error) {
    Logger.error('Error handling whitelist input', error);
    await ctx.reply('❌ An error occurred. Please try again.');
    pendingWhitelistAdd.delete(userId);
    return true;
  }
  
  return false;
}

/**
 * Handle send category with whitelist selection
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category to send
 * @param {number} whitelistId - Whitelist ID
 */
async function handleSendCategoryWithWhitelist(ctx, category, whitelistId) {
  try {
    await ctx.answerCbQuery();
    
    // Get whitelist entry
    const whitelist = MediaService.getWhitelist();
    const entry = whitelist.find(w => w.id === parseInt(whitelistId));
    
    if (!entry) {
      await ctx.editMessageText('❌ Channel/Group not found in whitelist.');
      return;
    }
    
    // Get media in category
    const mediaList = MediaService.getMediaByCategory(category, 1000).filter(m => m.media_type !== 'placeholder');
    
    if (mediaList.length === 0) {
      await ctx.editMessageText(`❌ No media found in category "${category}".`);
      return;
    }
    
    await ctx.editMessageText(`📤 Sending ${mediaList.length} media from category "${category}" to ${entry.name}...\n\nPlease wait...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const media of mediaList) {
      try {
        // Send media without caption (no sender info)
        // Prepare send options
        const sendOptions = {};
        if (entry.topic_id) {
          sendOptions.message_thread_id = parseInt(entry.topic_id);
        }
        
        if (media.media_type === 'video') {
          await ctx.telegram.sendVideo(entry.chat_id, media.file_id, sendOptions);
        } else if (media.media_type === 'photo') {
          await ctx.telegram.sendPhoto(entry.chat_id, media.file_id, sendOptions);
        } else if (media.media_type === 'document') {
          await ctx.telegram.sendDocument(entry.chat_id, media.file_id, sendOptions);
        } else if (media.media_type === 'animation') {
          await ctx.telegram.sendAnimation(entry.chat_id, media.file_id, sendOptions);
        }
        
        successCount++;
        
        // Show loading animation every 10 files
        if (successCount % 10 === 0) {
          await ctx.telegram.sendChatAction(entry.chat_id, 'upload_document');
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
      } catch (sendError) {
        Logger.error(`Error sending media ${media.name}`, sendError);
        errorCount++;
      }
    }
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📤 Send Another Category', 'send_prompt')],
      [Markup.button.callback('📁 View Categories', 'view_categories')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await ctx.reply(
      `✅ *Sending Complete!*\n\n` +
      `Category: ${escapeMarkdown(category)}\n` +
      `Destination: ${escapeMarkdown(entry.name)}\n` +
      `Success: ${successCount}\n` +
      `Failed: ${errorCount}`,
      { parse_mode: 'Markdown', ...keyboard }
    );
    
    Logger.info(`User ${ctx.from.id} sent category ${category} to ${entry.name}: ${successCount} success, ${errorCount} failed`);
    
  } catch (error) {
    Logger.error('Error sending category with whitelist', error);
    await ctx.reply(`❌ Error sending media: ${escapeMarkdown(error.message)}`, { parse_mode: 'Markdown' });
  }
}

/**
 * Handle manual send category (type chat_id manually)
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category to send
 */
async function handleManualSendCategory(ctx, category) {
  try {
    await ctx.answerCbQuery();
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back', `send_category_${category}`)],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await ctx.editMessageText(
      `📤 *Send Category: ${escapeMarkdown(category)}*\n\n` +
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
    
    // Set user state to await chat_id for this category
    const { pendingCategoryUpload } = require('./mediaHandler');
    const userId = ctx.from.id;
    pendingCategoryUpload.set(userId, { sendingCategory: category });
    
    Logger.info(`User ${userId} preparing to send category manually: ${category}`);
  } catch (error) {
    Logger.error('Error handling manual send category', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle forwarded message to extract chat_id
 * @param {Object} ctx - Telegraf context
 * @returns {boolean} - True if handled
 */
async function handleForwardedMessage(ctx) {
  const userId = ctx.from.id;
  const state = pendingWhitelistAdd.get(userId);
  
  // Check if user is awaiting chat_id and this is a forwarded message
  if (!state || state.awaiting !== 'chat_id') {
    return false;
  }
  
  // Check if message is forwarded
  if (!ctx.message.forward_from_chat && !ctx.message.forward_from) {
    return false; // Not a forwarded message
  }
  
  try {
    let chatId;
    let chatType;
    
    // Extract chat_id from forwarded message
    if (ctx.message.forward_from_chat) {
      // Forwarded from channel or group
      chatId = ctx.message.forward_from_chat.id.toString();
      chatType = ctx.message.forward_from_chat.type;
    } else if (ctx.message.forward_from) {
      // Forwarded from user (not useful for whitelist, but handle gracefully)
      await ctx.reply('❌ This is a forwarded message from a user, not a channel/group.\n\nPlease forward a message from a channel or group instead.');
      return true;
    }
    
    if (!chatId) {
      await ctx.reply('❌ Could not extract chat ID from forwarded message.\n\nPlease try typing the chat ID manually.');
      return true;
    }
    
    // Save to whitelist
    try {
      MediaService.addToWhitelist(state.name, chatId);
      
      await ctx.reply(
        `✅ *Successfully Added to Whitelist!*\n\n` +
        `Name: ${escapeMarkdown(state.name)}\n` +
        `Chat ID: \`${chatId}\`\n` +
        `Type: ${escapeMarkdown(chatType)}\n\n` +
        `You can now use this for sending media.`,
        { parse_mode: 'Markdown' }
      );
      
      pendingWhitelistAdd.delete(userId);
      Logger.info(`User ${userId} added ${state.name} (${chatId}) to whitelist via forward`);
      
    } catch (error) {
      if (error.message.includes('already exists')) {
        await ctx.reply(`❌ ${error.message}\n\nPlease try again with a different name.`);
        pendingWhitelistAdd.delete(userId);
      } else {
        throw error;
      }
    }
    
    return true;
    
  } catch (error) {
    Logger.error('Error handling forwarded message', error);
    await ctx.reply('❌ An error occurred. Please try again.');
    pendingWhitelistAdd.delete(userId);
    return true;
  }
}

module.exports = {
  handleAddToWhitelist,
  handleWhitelistInput,
  handleSendCategoryWithWhitelist,
  handleManualSendCategory,
  handleForwardedMessage,
  pendingWhitelistAdd,
};
