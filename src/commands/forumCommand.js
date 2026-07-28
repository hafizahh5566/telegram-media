/**
 * Forum Command Handler
 * Handles sending categories to Telegram Forum Groups
 */

const { Markup } = require('telegraf');
const ForumService = require('../services/forumService');
const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');

/**
 * Handle /forum command - Send category to forum group
 * Usage: /forum <category> <group_id>
 * @param {Object} ctx - Telegraf context
 */
async function handleForumCommand(ctx) {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 2) {
      await ctx.reply(
        `📋 *Forum Command Help*\n\n` +
        `Send a category to a Telegram Forum Group (with topics).\n\n` +
        `*Usage:*\n` +
        `\`/forum <category> <group_id>\`\n\n` +
        `*Example:*\n` +
        `\`/forum Movies -1001234567890\`\n\n` +
        `This will:\n` +
        `1. Check if the group is a forum\n` +
        `2. Create a topic named "📁 Movies" (or use existing)\n` +
        `3. Send all media from "Movies" category to that topic\n\n` +
        `💡 *Requirements:*\n` +
        `• Bot must be admin in the group\n` +
        `• Group must have topics enabled\n` +
        `• Get group ID using @userinfobot`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const category = args[0];
    const groupId = args[1];
    
    // Validate group ID format
    if (!/^-?\d+$/.test(groupId)) {
      await ctx.reply('❌ Invalid group ID format. Must be a number (e.g., -1001234567890)');
      return;
    }
    
    // Check if category exists
    const categories = MediaService.getCategories();
    const categoryExists = categories.some(c => c.category === category);
    
    if (!categoryExists) {
      await ctx.reply(
        `❌ Category "${category}" not found.\n\n` +
        `Available categories:\n` +
        categories.map(c => `• ${c.category} (${c.count} items)`).join('\n')
      );
      return;
    }
    
    // Send processing message
    const processingMsg = await ctx.reply(
      `⏳ Processing...\n\n` +
      `• Checking if group is a forum...\n` +
      `• Creating/finding topic for "${category}"...\n` +
      `• Preparing media...`
    );
    
    try {
      // Send category to forum
      const result = await ForumService.sendCategoryToForum(
        ctx.telegram,
        parseInt(groupId),
        category,
        ctx.chat.id
      );
      
      // Delete processing message
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        // Ignore delete errors
      }
      
      // Send success message
      await ctx.reply(
        `✅ *Successfully Sent to Forum!*\n\n` +
        `📁 Category: ${category}\n` +
        `🎯 Topic ID: ${result.topicId}\n` +
        `✔️ Sent: ${result.sent}\n` +
        `❌ Failed: ${result.failed}\n\n` +
        `All media has been sent to the forum topic!`,
        { parse_mode: 'Markdown' }
      );
      
      Logger.info(`User ${ctx.from.id} sent category ${category} to forum ${groupId}: ${result.sent} sent, ${result.failed} failed`);
      
    } catch (error) {
      // Delete processing message
      try {
        await ctx.deleteMessage(processingMsg.message_id);
      } catch (e) {
        // Ignore delete errors
      }
      
      Logger.error('Error in forum command:', error);
      
      let errorMessage = '❌ Error sending to forum:\n\n';
      
      if (error.message.includes('not a forum')) {
        errorMessage += `The target group is not a forum.\n\n` +
          `*How to enable topics:*\n` +
          `1. Open the group in Telegram\n` +
          `2. Go to Group Settings\n` +
          `3. Enable "Topics" feature`;
      } else if (error.message.includes('No media found')) {
        errorMessage += `No media found in category "${category}"`;
      } else if (error.message.includes('rights')) {
        errorMessage += `Bot doesn't have permission.\n\n` +
          `Make sure the bot is an admin in the group with:\n` +
          `• Manage Topics permission\n` +
          `• Send Messages permission`;
      } else {
        errorMessage += error.message;
      }
      
      await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
    }
    
  } catch (error) {
    Logger.error('Error handling forum command', error);
    await ctx.reply('❌ An unexpected error occurred. Please try again.');
  }
}

/**
 * Handle interactive forum category selection
 * @param {Object} ctx - Telegraf context
 */
async function handleForumInteractive(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const categories = MediaService.getCategories();
    
    if (categories.length === 0) {
      await ctx.editMessageText('❌ No categories found. Please create some categories first.');
      return;
    }
    
    // Create category selection buttons
    const buttons = categories
      .slice(0, 10) // Limit to 10 for UI
      .map(cat => [
        Markup.button.callback(
          `📁 ${cat.category} (${cat.count})`,
          `forum_select_${cat.category}`
        )
      ]);
    
    buttons.push([Markup.button.callback('🔙 Back', 'main_menu')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    await ctx.editMessageText(
      `📋 *Select Category for Forum*\n\n` +
      `Choose a category to send to a forum group:\n\n` +
      `After selection, you'll need to provide the forum group ID.`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
  } catch (error) {
    Logger.error('Error handling forum interactive', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

module.exports = {
  handleForumCommand,
  handleForumInteractive,
};
