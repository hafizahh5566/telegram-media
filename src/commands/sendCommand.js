/**
 * Send Command
 * Send media to a chat using stored file_id
 */

const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');

/**
 * Validate chat ID format
 * @param {string} chatId - Chat ID to validate
 * @returns {boolean} - True if valid
 */
function isValidChatId(chatId) {
  // Chat ID can be a number or start with @ for username
  return /^-?\d+$/.test(chatId) || /^@\w+$/.test(chatId);
}

/**
 * Send media based on type
 * @param {Object} ctx - Telegraf context
 * @param {string} chatId - Target chat ID
 * @param {Object} media - Media object from database
 * @param {number} [threadId] - Optional message thread ID for topics
 */
async function sendMediaToChat(ctx, chatId, media, threadId = null) {
  const options = {};
  if (media.caption) {
    options.caption = media.caption;
  }
  if (threadId) {
    options.message_thread_id = threadId;
  }
  
  switch (media.media_type) {
    case 'video':
      await ctx.telegram.sendVideo(chatId, media.file_id, options);
      break;
    case 'photo':
      await ctx.telegram.sendPhoto(chatId, media.file_id, options);
      break;
    case 'document':
      await ctx.telegram.sendDocument(chatId, media.file_id, options);
      break;
    case 'animation':
      await ctx.telegram.sendAnimation(chatId, media.file_id, options);
      break;
    default:
      throw new Error(`Unsupported media type: ${media.media_type}`);
  }
}

/**
 * Handle /send command
 * @param {Object} ctx - Telegraf context
 */
async function handleSendCommand(ctx) {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 2) {
      await ctx.reply('❌ Usage: /send <media_name> <chat_id> [topic_id]\n\nExamples:\n/send promo_video -1001234567890\n/send banner_sale -1001234567890 123 (to topic)');
      return;
    }
    
    const mediaName = args[0];
    const chatId = args[1];
    const topicId = args.length >= 3 ? parseInt(args[2], 10) : null;
    
    // Validate chat ID
    if (!isValidChatId(chatId)) {
      await ctx.reply('❌ Invalid chat ID format');
      return;
    }
    
    // Validate topic ID if provided
    if (topicId !== null && (isNaN(topicId) || topicId <= 0)) {
      await ctx.reply('❌ Invalid topic ID. Must be a positive number.');
      return;
    }
    
    Logger.info(`Sending media ${mediaName} to ${chatId}${topicId ? ` (topic ${topicId})` : ''}`);
    
    // Get media from database
    const media = MediaService.getMediaByName(mediaName);
    
    if (!media) {
      await ctx.reply(`❌ Media "${mediaName}" not found`);
      return;
    }
    
    // Send media to target chat (with optional topic)
    await sendMediaToChat(ctx, chatId, media, topicId);
    
    const successMsg = topicId 
      ? `✅ Media "${mediaName}" sent to ${chatId} topic ${topicId}`
      : `✅ Media "${mediaName}" sent to ${chatId}`;
    await ctx.reply(successMsg);
    Logger.info(`Media ${mediaName} sent to ${chatId}${topicId ? ` topic ${topicId}` : ''}`);
    
  } catch (error) {
    Logger.error('Error in send command', error);
    
    if (error.message.includes('chat not found')) {
      await ctx.reply('❌ Chat not found. Make sure the chat ID is correct and the bot is a member of the chat.');
    } else if (error.message.includes('not enough rights')) {
      await ctx.reply('❌ Bot does not have permission to send messages to this chat.');
    } else {
      await ctx.reply('❌ An error occurred while sending media');
    }
  }
}

module.exports = handleSendCommand;
