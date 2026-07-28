/**
 * Delete Command
 * Delete media record from database
 */

const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');

/**
 * Handle /delete command
 * @param {Object} ctx - Telegraf context
 */
async function handleDeleteCommand(ctx) {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length === 0) {
      await ctx.reply('❌ Usage: /delete <media_name>\n\nExample:\n/delete promo_video');
      return;
    }
    
    const mediaName = args[0];
    
    Logger.info(`Delete command received: ${mediaName}`);
    
    // Check if media exists
    const media = MediaService.getMediaByName(mediaName);
    
    if (!media) {
      await ctx.reply(`❌ Media "${mediaName}" not found`);
      return;
    }
    
    // Delete media
    const deleted = MediaService.deleteMedia(mediaName);
    
    if (deleted) {
      await ctx.reply(`✅ Media "${mediaName}" deleted successfully`);
    } else {
      await ctx.reply('❌ Failed to delete media');
    }
    
  } catch (error) {
    Logger.error('Error in delete command', error);
    await ctx.reply('❌ An error occurred while deleting media');
  }
}

module.exports = handleDeleteCommand;
