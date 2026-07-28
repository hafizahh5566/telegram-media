/**
 * List Command
 * Shows latest media from database by sending actual media
 */

const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');
const config = require('../config');

/**
 * Send media based on type
 * @param {Object} ctx - Telegraf context
 * @param {Object} media - Media object from database
 */
async function sendMediaItem(ctx, media) {
  const caption = `*Name:* ${media.name}\n*Type:* ${media.media_type}${media.category ? `\n*Category:* ${media.category}` : ''}${media.caption ? `\n*Caption:* ${media.caption}` : ''}`;
  
  const options = {
    caption: caption,
    parse_mode: 'Markdown'
  };
  
  try {
    switch (media.media_type) {
      case 'video':
        await ctx.telegram.sendVideo(ctx.chat.id, media.file_id, options);
        break;
      case 'photo':
        await ctx.telegram.sendPhoto(ctx.chat.id, media.file_id, options);
        break;
      case 'document':
        await ctx.telegram.sendDocument(ctx.chat.id, media.file_id, options);
        break;
      case 'animation':
        await ctx.telegram.sendAnimation(ctx.chat.id, media.file_id, options);
        break;
      default:
        await ctx.reply(`❌ Unsupported media type: ${media.media_type}`);
    }
  } catch (error) {
    Logger.error(`Error sending media ${media.name}`, error);
    await ctx.reply(`❌ Failed to send media: ${media.name}`);
  }
}

/**
 * Handle /list command
 * @param {Object} ctx - Telegraf context
 */
async function handleListCommand(ctx) {
  try {
    Logger.info('List command received');
    
    const mediaList = MediaService.getLatestMedia(config.maxListResults);
    
    if (mediaList.length === 0) {
      await ctx.reply('📭 No media found');
      return;
    }
    
    // Send header message
    await ctx.reply(`📋 *Latest ${mediaList.length} Media*\n\nSending media files...`, { parse_mode: 'Markdown' });
    
    // Send each media item
    for (const media of mediaList) {
      await sendMediaItem(ctx, media);
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    await ctx.reply(`✅ Sent ${mediaList.length} media files`);
    
  } catch (error) {
    Logger.error('Error in list command', error);
    await ctx.reply('❌ An error occurred while fetching media list');
  }
}

module.exports = handleListCommand;
