/**
 * Count Command
 * Show total number of stored media
 */

const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');

/**
 * Handle /count command
 * @param {Object} ctx - Telegraf context
 */
async function handleCountCommand(ctx) {
  try {
    Logger.info('Count command received');
    
    const count = MediaService.getMediaCount();
    
    await ctx.reply(`📊 Total stored media: ${count}`);
  } catch (error) {
    Logger.error('Error in count command', error);
    await ctx.reply('❌ An error occurred while counting media');
  }
}

module.exports = handleCountCommand;
