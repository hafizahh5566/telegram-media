/**
 * Search Command
 * Search media by caption keyword
 */

const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');
const config = require('../config');

/**
 * Format search results for display
 * @param {Array} results - Array of media objects
 * @param {string} keyword - Search keyword
 * @returns {string} - Formatted message
 */
function formatSearchResults(results, keyword) {
  if (results.length === 0) {
    return `🔍 No results found for "${keyword}"`;
  }
  
  let message = `🔍 Found ${results.length} result(s) for "${keyword}":\n\n`;
  
  results.forEach((media) => {
    message += `ID: ${media.id}\n`;
    message += `Type: ${media.media_type}\n`;
    if (media.caption) {
      message += `Caption: ${media.caption}\n`;
    }
    message += `\n`;
  });
  
  return message;
}

/**
 * Handle /search command
 * @param {Object} ctx - Telegraf context
 */
async function handleSearchCommand(ctx) {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length === 0) {
      await ctx.reply('❌ Usage: /search <keyword>');
      return;
    }
    
    const keyword = args.join(' ');
    Logger.info(`Search command received: ${keyword}`);
    
    const results = MediaService.searchMedia(keyword, config.maxListResults);
    const message = formatSearchResults(results, keyword);
    
    await ctx.reply(message);
  } catch (error) {
    Logger.error('Error in search command', error);
    await ctx.reply('❌ An error occurred while searching media');
  }
}

module.exports = handleSearchCommand;
