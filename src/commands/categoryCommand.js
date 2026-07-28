/**
 * Category Command
 * Manage media categories
 */

const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');
const config = require('../config');
const { Markup } = require('telegraf');

/**
 * Handle /categories command - List all categories
 * @param {Object} ctx - Telegraf context
 */
async function handleCategoriesCommand(ctx) {
  try {
    Logger.info('Categories command received');
    
    const categories = MediaService.getCategories().filter(cat => cat !== 'uncategorized');
    
    if (categories.length === 0) {
      await ctx.reply('📂 No categories found');
      return;
    }
    
    let message = `📂 *Available Categories*\n\n`;
    
    categories.forEach((category, index) => {
      const count = MediaService.getMediaByCategory(category).length;
      message += `${index + 1}. *${category}* (${count} media)\n`;
    });
    
    message += `\nUse /listcat <category> to see media in a category`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    Logger.error('Error in categories command', error);
    await ctx.reply('❌ An error occurred while fetching categories');
  }
}

/**
 * Handle /listcat command - List media by category
 * @param {Object} ctx - Telegraf context
 */
async function handleListCategoryCommand(ctx) {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length === 0) {
      await ctx.reply('❌ Usage: /listcat <category>\n\nExample:\n/listcat video_ads');
      return;
    }
    
    const category = args.join(' ');
    Logger.info(`List category command received: ${category}`);
    
    const mediaList = MediaService.getMediaByCategory(category, config.maxListResults);
    
    if (mediaList.length === 0) {
      await ctx.reply(`📭 No media found in category "${category}"`);
      return;
    }
    
    let message = `📂 *Category: ${category}*\n`;
    message += `Found ${mediaList.length} media:\n\n`;
    
    mediaList.forEach((media) => {
      message += `*Name:* \`${media.name}\`\n`;
      message += `*ID:* ${media.id}\n`;
      message += `*Type:* ${media.media_type}\n`;
      if (media.caption) {
        message += `*Caption:* ${media.caption}\n`;
      }
      message += `\n`;
    });

    message += `\nTo delete a media from this category:\n\`/deletecat ${category} <media_name>\``;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    Logger.error('Error in listcat command', error);
    await ctx.reply('❌ An error occurred while fetching media');
  }
}

/**
 * Handle /deletecat command - Delete media from a specific category by name
 * @param {Object} ctx - Telegraf context
 */
async function handleDeleteFromCategoryCommand(ctx) {
  try {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length < 2) {
      await ctx.reply(
        '❌ Usage: /deletecat <category> <media_name>\n\nExample:\n/deletecat video_ads promo_video'
      );
      return;
    }

    const category = args[0];
    const mediaName = args[1];

    Logger.info(`Delete from category command received: "${mediaName}" from "${category}"`);

    // Verify the media exists
    const media = MediaService.getMediaByName(mediaName);

    if (!media) {
      await ctx.reply(`❌ Media "${mediaName}" not found`);
      return;
    }

    // Verify the media belongs to the given category
    if (media.category !== category) {
      await ctx.reply(
        `❌ Media "${mediaName}" does not belong to category "${category}"\n` +
        `It is in category: *${media.category}*`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Delete media from category
    const deleted = MediaService.deleteMediaFromCategory(mediaName, category);

    if (deleted) {
      await ctx.reply(`✅ Media "${mediaName}" deleted from category "${category}"`);
    } else {
      await ctx.reply('❌ Failed to delete media');
    }

  } catch (error) {
    Logger.error('Error in deletecat command', error);
    await ctx.reply('❌ An error occurred while deleting media from category');
  }
}

/**
 * Handle /setcat command - Set category for media
 * @param {Object} ctx - Telegraf context
 */
async function handleSetCategoryCommand(ctx) {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 2) {
      await ctx.reply('❌ Usage: /setcat <media_id> <category>\n\nExample:\n/setcat 15 video_ads');
      return;
    }
    
    const mediaId = parseInt(args[0], 10);
    const category = args.slice(1).join(' ');
    
    if (isNaN(mediaId) || mediaId <= 0) {
      await ctx.reply('❌ Invalid media ID. Must be a positive number.');
      return;
    }
    
    Logger.info(`Set category command received: ${mediaId} -> ${category}`);
    
    // Check if media exists
    const media = MediaService.getMediaById(mediaId);
    
    if (!media) {
      await ctx.reply(`❌ Media ID ${mediaId} not found`);
      return;
    }
    
    // Update category
    const updated = MediaService.updateMediaCategory(mediaId, category);
    
    if (updated) {
      await ctx.reply(`✅ Media ${mediaId} moved to category "${category}"`);
    } else {
      await ctx.reply('❌ Failed to update category');
    }
    
  } catch (error) {
    Logger.error('Error in setcat command', error);
    await ctx.reply('❌ An error occurred while updating category');
  }
}

module.exports = {
  handleCategoriesCommand,
  handleListCategoryCommand,
  handleSetCategoryCommand,
  handleDeleteFromCategoryCommand,
};
