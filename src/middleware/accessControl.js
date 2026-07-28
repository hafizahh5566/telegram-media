/**
 * Access Control Middleware
 * Restricts bot access to whitelisted users if configured
 */

const Logger = require('../utils/logger');
const config = require('../config');

/**
 * Check if user is allowed to use the bot
 * @param {Object} ctx - Telegraf context
 * @param {Function} next - Next middleware
 */
async function accessControl(ctx, next) {
  // If no whitelist configured, allow everyone (public bot)
  if (!config.allowedUserIds || config.allowedUserIds.length === 0) {
    return next();
  }
  
  const userId = ctx.from?.id;
  
  // Check if user is in whitelist
  if (config.allowedUserIds.includes(userId)) {
    Logger.info(`Access granted to user: ${userId}`);
    return next();
  }
  
  // User not authorized
  Logger.warn(`Access denied for user: ${userId}`);
  
  await ctx.reply(
    '🔒 *Access Denied*\n\n' +
    'This bot is private and restricted to authorized users only.\n\n' +
    '💡 If you need access, please contact the bot owner.',
    { parse_mode: 'Markdown' }
  );
}

module.exports = accessControl;
