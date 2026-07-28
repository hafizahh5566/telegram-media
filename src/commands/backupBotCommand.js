/**
 * Backup Bot Command Handler
 * Handles backup to another bot instance
 */

const { Markup } = require('telegraf');
const BackupBotService = require('../services/backupBotService');
const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');

// Store pending backup bot setup state
const pendingBackupBotSetup = new Map();

/**
 * Handle backup bot settings menu
 * @param {Object} ctx - Telegraf context
 */
async function handleBackupBotSettings(ctx) {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const config = BackupBotService.getBackupBotConfig();
    
    let message = `🤖 *Backup Bot Settings*\n\n`;
    
    if (config && config.bot_token) {
      message += `✅ Backup Bot: @${config.bot_username}\n`;
      if (config.backup_chat_id) {
        message += `📍 Backup Chat ID: \`${config.backup_chat_id}\`\n`;
      } else {
        message += `⚠️ Backup Chat ID: Not configured\n`;
      }
      if (config.last_backup_at) {
        message += `📅 Last Backup: ${new Date(config.last_backup_at).toLocaleString('id-ID')}\n`;
      }
      message += `\nBackup bot sudah dikonfigurasi. Media akan di-duplicate ke bot backup.\n`;
    } else {
      message += `❌ Backup bot belum dikonfigurasi\n\n`;
      message += `Untuk menggunakan fitur ini:\n`;
      message += `1. Buat bot baru di @BotFather\n`;
      message += `2. Dapatkan token bot baru\n`;
      message += `3. Siapkan Chat ID untuk backup\n`;
      message += `4. Klik "Set Backup Bot" di bawah\n`;
    }

    const buttons = [];
    
    if (config && config.bot_token) {
      buttons.push([Markup.button.callback('🔄 Backup All Media', 'backupbot_backup_all')]);
      buttons.push([Markup.button.callback('📁 Backup by Category', 'backupbot_backup_category')]);
      buttons.push([Markup.button.callback('🗑 Remove Backup Bot', 'backupbot_remove')]);
    } else {
      buttons.push([Markup.button.callback('➕ Set Backup Bot', 'backupbot_set')]);
    }
    
    buttons.push([Markup.button.callback('🔙 Back to Menu', 'main_menu')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...keyboard
      });
    }
  } catch (error) {
    Logger.error('Error handling backup bot settings', error);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Error');
    } else {
      await ctx.reply('❌ An error occurred');
    }
  }
}

/**
 * Handle set backup bot token
 * @param {Object} ctx - Telegraf context
 */
async function handleSetBackupBot(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    pendingBackupBotSetup.set(userId, { awaiting: 'token' });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Cancel', 'backupbot_settings')]
    ]);
    
    await ctx.editMessageText(
      `🤖 *Setup Backup Bot*\n\n` +
      `Please send me the bot token from @BotFather.\n\n` +
      `Format: \`1234567890:ABCdefGHIjklMNOpqrsTUVwxyz\`\n\n` +
      `⚠️ Keep your token secure and don't share it with anyone!`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } catch (error) {
    Logger.error('Error handling set backup bot', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle backup bot token input
 * @param {Object} ctx - Telegraf context
 * @returns {boolean} - True if handled
 */
async function handleBackupBotTokenInput(ctx) {
  const userId = ctx.from.id;
  const state = pendingBackupBotSetup.get(userId);
  
  if (!state) {
    return false;
  }
  
  try {
    // Handle token input
    if (state.awaiting === 'token') {
      const token = ctx.message.text.trim();
      
      // Test the token
      await ctx.reply('🔄 Testing backup bot connection...');
      
      try {
        const botInfo = await BackupBotService.testBackupBot(token);
        
        // Save bot info and ask for chat ID
        pendingBackupBotSetup.set(userId, {
          awaiting: 'chat_id',
          token: token,
          botInfo: botInfo
        });
        
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Cancel', 'backupbot_settings')]
        ]);
        
        await ctx.reply(
          `✅ *Bot Connected: @${botInfo.username}*\n\n` +
          `Now, please send the Chat ID where backups should be sent.\n\n` +
          `💡 *Tips:*\n` +
          `• For a channel: Make the backup bot an admin, then use the channel ID (e.g., \`-1001234567890\`)\n` +
          `• For a group: Add the backup bot to the group and use the group ID\n` +
          `• For your personal chat with the bot: Start a chat with @${botInfo.username} and use your own user ID (${userId})\n\n` +
          `⚠️ The backup bot must have permission to send messages to this chat!`,
          {
            parse_mode: 'Markdown',
            ...keyboard
          }
        );
        
        return true;
      } catch (testError) {
        await ctx.reply(
          `❌ *Failed to Connect*\n\n` +
          `${testError.message}\n\n` +
          `Please check your token and try again.`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🔙 Back', 'backupbot_settings')]
            ])
          }
        );
        pendingBackupBotSetup.delete(userId);
        return true;
      }
    }
    
    // Handle chat ID input
    if (state.awaiting === 'chat_id') {
      const chatId = ctx.message.text.trim();
      
      // Validate chat ID format (should be numeric or start with -)
      if (!/^-?\d+$/.test(chatId)) {
        await ctx.reply(
          `❌ *Invalid Chat ID*\n\n` +
          `Chat ID must be a number (e.g., -1001234567890 or ${userId}).\n\n` +
          `Please send a valid chat ID.`,
          { parse_mode: 'Markdown' }
        );
        return true;
      }
      
      // Test if bot can access the chat
      await ctx.reply('🔄 Memeriksa akses ke chat...');
      
      try {
        const chatInfo = await BackupBotService.testChatAccess(state.token, chatId);
        
        // Save configuration
        BackupBotService.saveBackupBotToken(state.token, state.botInfo.username, chatId);
        
        // Clear state
        pendingBackupBotSetup.delete(userId);
        
        // Show success
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Backup All Media', 'backupbot_backup_all')],
          [Markup.button.callback('🔙 Back to Settings', 'backupbot_settings')]
        ]);
        
        const chatName = chatInfo.title || chatInfo.first_name || 'Chat';
        
        await ctx.reply(
          `✅ *Backup Bot Configured!*\n\n` +
          `Bot: @${state.botInfo.username}\n` +
          `Backup Chat: ${chatName}\n` +
          `Chat ID: \`${chatId}\`\n\n` +
          `✅ Bot berhasil mengakses chat!\n` +
          `Sekarang Anda bisa backup semua media ke chat ini.`,
          {
            parse_mode: 'Markdown',
            ...keyboard
          }
        );
        
        Logger.info(`User ${userId} configured backup bot: @${state.botInfo.username} with chat ID: ${chatId}`);
        return true;
      } catch (testError) {
        await ctx.reply(
          `❌ *Gagal Mengakses Chat*\n\n` +
          `${testError.message}\n\n` +
          `*Langkah Perbaikan:*\n` +
          `1. Untuk channel: Tambahkan @${state.botInfo.username} sebagai admin channel\n` +
          `2. Untuk grup: Tambahkan @${state.botInfo.username} ke grup sebagai member\n` +
          `3. Untuk chat pribadi: Mulai percakapan dengan @${state.botInfo.username} terlebih dahulu\n\n` +
          `Setelah itu, kirim ulang Chat ID yang benar.`,
          { parse_mode: 'Markdown' }
        );
        return true;
      }
    }
    
    return false;
  } catch (error) {
    Logger.error('Error handling backup bot token input', error);
    await ctx.reply('❌ An error occurred. Please try again.');
    pendingBackupBotSetup.delete(userId);
    return true;
  }
}

/**
 * Handle backup all media
 * @param {Object} ctx - Telegraf context
 */
async function handleBackupAllMedia(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const totalMedia = MediaService.getMediaCount();
    
    if (totalMedia === 0) {
      await ctx.editMessageText(
        '📭 *No Media to Backup*\n\nDatabase kosong.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'backupbot_settings')]
          ])
        }
      );
      return;
    }
    
    // Show confirmation
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Yes, Backup All', 'backupbot_confirm_all'),
        Markup.button.callback('❌ Cancel', 'backupbot_settings')
      ]
    ]);
    
    await ctx.editMessageText(
      `🔄 *Confirm Backup*\n\n` +
      `Total media: ${totalMedia} items\n\n` +
      `This will duplicate all media to your backup bot. Continue?`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } catch (error) {
    Logger.error('Error handling backup all media', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle confirm backup all
 * @param {Object} ctx - Telegraf context
 */
async function handleConfirmBackupAll(ctx) {
  try {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      '🔄 *Backup in Progress*\n\n' +
      'Please wait while backing up all media...\n\n' +
      'This may take a few minutes depending on the number of media.',
      { parse_mode: 'Markdown' }
    );
    
    let lastUpdate = Date.now();
    const result = await BackupBotService.backupAllMedia(ctx.telegram, async (current, total, sent, failed) => {
      // Update every 3 seconds
      if (Date.now() - lastUpdate > 3000) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            ctx.callbackQuery.message.message_id,
            undefined,
            `🔄 *Backup in Progress*\n\n` +
            `Progress: ${current}/${total}\n` +
            `✅ Sent: ${sent}\n` +
            `❌ Failed: ${failed}`,
            { parse_mode: 'Markdown' }
          );
          lastUpdate = Date.now();
        } catch (e) {
          // Ignore update errors
        }
      }
    });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back to Settings', 'backupbot_settings')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
      undefined,
      `✅ *Backup Complete!*\n\n` +
      `Backup Bot: @${result.botUsername}\n` +
      `Total: ${result.total} media\n` +
      `✅ Sent: ${result.sent}\n` +
      `❌ Failed: ${result.failed}\n\n` +
      `Semua media telah di-backup ke bot backup Anda!`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
    Logger.info(`User ${ctx.from.id} completed backup: ${result.sent}/${result.total}`);
  } catch (error) {
    Logger.error('Error confirming backup all', error);
    await ctx.editMessageText(
      `❌ *Backup Failed*\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'backupbot_settings')]
        ])
      }
    );
  }
}

/**
 * Handle backup by category
 * @param {Object} ctx - Telegraf context
 */
async function handleBackupByCategory(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const categories = MediaService.getCategories().filter(c => c !== 'uncategorized');
    
    if (categories.length === 0) {
      await ctx.editMessageText(
        '📁 *No Categories*\n\nBelum ada kategori.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'backupbot_settings')]
          ])
        }
      );
      return;
    }
    
    // Build category buttons
    const buttons = [];
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(`📁 ${categories[i]}`, `backupbot_cat_${categories[i]}`));
      if (i + 1 < categories.length) {
        row.push(Markup.button.callback(`📁 ${categories[i + 1]}`, `backupbot_cat_${categories[i + 1]}`));
      }
      buttons.push(row);
    }
    buttons.push([Markup.button.callback('🔙 Back', 'backupbot_settings')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    await ctx.editMessageText(
      `📁 *Select Category to Backup*\n\nPilih kategori yang ingin di-backup:`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } catch (error) {
    Logger.error('Error handling backup by category', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle backup specific category (when user clicks a category)
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleBackupCategory(ctx, category) {
  try {
    await ctx.answerCbQuery();
    
    const BackupBotService = require('../services/backupBotService');
    const mediaList = MediaService.getMediaByCategory(category, 10000)
      .filter(m => m.media_type !== 'placeholder');
    
    if (mediaList.length === 0) {
      await ctx.editMessageText(
        `📁 *Category: ${category}*\n\n❌ Tidak ada media dalam kategori ini.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'backupbot_backup_category')]
          ])
        }
      );
      return;
    }
    
    // Show confirmation
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Yes, Backup', `backupbot_confirm_cat_${category}`),
        Markup.button.callback('❌ Cancel', 'backupbot_backup_category')
      ]
    ]);
    
    await ctx.editMessageText(
      `🔄 *Backup Category*\n\n` +
      `Category: ${category}\n` +
      `Total media: ${mediaList.length} items\n\n` +
      `Backup kategori ini ke backup bot?`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } catch (error) {
    Logger.error('Error handling backup category', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle confirm backup category
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleConfirmBackupCategory(ctx, category) {
  try {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      `🔄 *Backup in Progress*\n\n` +
      `Category: ${category}\n\n` +
      `Please wait...`,
      { parse_mode: 'Markdown' }
    );
    
    const BackupBotService = require('../services/backupBotService');
    let lastUpdate = Date.now();
    
    const result = await BackupBotService.backupCategory(ctx.telegram, category, async (current, total, sent, failed) => {
      if (Date.now() - lastUpdate > 3000) {
        try {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            ctx.callbackQuery.message.message_id,
            undefined,
            `🔄 *Backup in Progress*\n\n` +
            `Category: ${category}\n` +
            `Progress: ${current}/${total}\n` +
            `✅ Sent: ${sent}\n` +
            `❌ Failed: ${failed}`,
            { parse_mode: 'Markdown' }
          );
          lastUpdate = Date.now();
        } catch (e) {
          // Ignore
        }
      }
    });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back to Categories', 'backupbot_backup_category')],
      [Markup.button.callback('🏠 Main Menu', 'main_menu')]
    ]);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
      undefined,
      `✅ *Backup Complete!*\n\n` +
      `Category: ${category}\n` +
      `Total: ${result.total} media\n` +
      `✅ Sent: ${result.sent}\n` +
      `❌ Failed: ${result.failed}`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
    
    Logger.info(`User ${ctx.from.id} backed up category ${category}: ${result.sent}/${result.total}`);
  } catch (error) {
    Logger.error('Error confirming backup category', error);
    await ctx.editMessageText(
      `❌ *Backup Failed*\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'backupbot_backup_category')]
        ])
      }
    );
  }
}

/**
 * Handle remove backup bot
 * @param {Object} ctx - Telegraf context
 */
async function handleRemoveBackupBot(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Yes, Remove', 'backupbot_confirm_remove'),
        Markup.button.callback('❌ Cancel', 'backupbot_settings')
      ]
    ]);
    
    await ctx.editMessageText(
      `⚠️ *Confirm Removal*\n\n` +
      `Are you sure you want to remove the backup bot configuration?\n\n` +
      `This will only remove the configuration, not the backed up media.`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } catch (error) {
    Logger.error('Error handling remove backup bot', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle confirm remove backup bot
 * @param {Object} ctx - Telegraf context
 */
async function handleConfirmRemoveBackupBot(ctx) {
  try {
    await ctx.answerCbQuery();
    
    BackupBotService.clearBackupBot();
    
    await ctx.editMessageText(
      `✅ *Backup Bot Removed*\n\nKonfigurasi backup bot telah dihapus.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back to Settings', 'backupbot_settings')]
        ])
      }
    );
    
    Logger.info(`User ${ctx.from.id} removed backup bot configuration`);
  } catch (error) {
    Logger.error('Error confirming remove backup bot', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

module.exports = {
  handleBackupBotSettings,
  handleSetBackupBot,
  handleBackupBotTokenInput,
  handleBackupAllMedia,
  handleConfirmBackupAll,
  handleBackupByCategory,
  handleBackupCategory,
  handleConfirmBackupCategory,
  handleRemoveBackupBot,
  handleConfirmRemoveBackupBot,
  pendingBackupBotSetup,
};
