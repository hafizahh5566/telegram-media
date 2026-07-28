/**
 * Start Command
 * Welcome message when user starts the bot
 */

const Logger = require('../utils/logger');
const { getMainMenuKeyboard } = require('../utils/keyboards');

/**
 * Handle /start command
 * @param {Object} ctx - Telegraf context
 */
async function handleStartCommand(ctx) {
  try {
    Logger.info('Start command received');
    
    const welcomeMessage = `🚀 *Welcome to Media Storage Bot\\!*

Your personal cloud storage for Telegram media\\! 📦✨

🎯 *What I Can Do:*
━━━━━━━━━━━━━━━━━━━━
📤 Store unlimited media \\(videos, photos, documents, GIFs\\)
📁 Organize with smart categories
🔍 Search media instantly by caption
📨 Bulk send to channels/groups
🗑 Easy media management
🔐 Secure file\\_id storage

⚡ *Quick Start Guide:*
━━━━━━━━━━━━━━━━━━━━
1️⃣ Send me any media file
2️⃣ Choose a category to organize
3️⃣ Access anytime from the menu\\!

💡 *Pro Tip:* Use categories to organize your media like folders\\!

👇 *Choose an action to get started:*`;
    
    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      ...getMainMenuKeyboard()
    });
  } catch (error) {
    Logger.error('Error in start command', error);
    await ctx.reply('❌ An error occurred while starting');
  }
}

module.exports = handleStartCommand;
