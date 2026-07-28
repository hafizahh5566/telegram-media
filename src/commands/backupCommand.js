/**
 * Backup Command Handler
 * Handles backup settings and manual backup operations
 */

const { Markup } = require('telegraf');
const BackupService = require('../services/backupService');
const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');

// Store pending backup channel setup by userId
const pendingBackupChannelSetup = new Map();

/**
 * Show backup settings menu
 * @param {Object} ctx - Telegraf context
 */
async function handleBackupSettings(ctx) {
  try {
    const config = BackupService.getBackupConfig();
    
    const statusEmoji = config.backup_channel_id ? '✅' : '❌';
    const autoBackupEmoji = config.auto_backup_enabled ? '🟢' : '🔴';
    
    const channelInfo = config.backup_channel_id 
      ? `\n📍 Channel ID: \`${config.backup_channel_id}\``
      : '\n⚠️ No backup channel configured';
    
    const lastBackup = config.last_backup_at
      ? `\n🕐 Last backup: ${new Date(config.last_backup_at).toLocaleString('id-ID')}`
      : '\n🕐 Last backup: Never';
    
    const message = `
⚙️ *Backup Settings*

${statusEmoji} Backup Channel: ${config.backup_channel_id ? 'Configured' : 'Not configured'}${channelInfo}

${autoBackupEmoji} Auto-backup: ${config.auto_backup_enabled ? 'Enabled' : 'Disabled'}${lastBackup}

💡 *How it works:*
• Upload media → Auto forward to backup channel
• If bot gets banned → Media still in channel
• Channel = Your permanent storage

📝 *Setup Instructions:*
1. Create a private Telegram channel
2. Add this bot as admin to the channel
3. Click "Set Backup Channel" below
4. Send channel ID (use @userinfobot in channel)
`;

    const buttons = [];
    
    if (!config.backup_channel_id) {
      buttons.push([Markup.button.callback('➕ Set Backup Channel', 'backup_set_channel')]);
    } else {
      buttons.push([
        Markup.button.callback(
          config.auto_backup_enabled ? '🔴 Disable Auto-backup' : '🟢 Enable Auto-backup',
          'backup_toggle_auto'
        )
      ]);
      buttons.push([Markup.button.callback('📦 Manual Backup All', 'backup_manual_all')]);
      buttons.push([Markup.button.callback('🔄 Change Channel', 'backup_set_channel')]);
      buttons.push([Markup.button.callback('🗑️ Remove Backup Config', 'backup_clear')]);
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
    Logger.error('Error showing backup settings', error);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Error loading settings');
    }
  }
}

/**
 * Handle set backup channel button
 * @param {Object} ctx - Telegraf context
 */
async function handleSetBackupChannel(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const userId = ctx.from.id;
    pendingBackupChannelSetup.set(userId, { awaiting: true });
    
    const message = `
📍 *Set Backup Channel*

Please send the Channel ID of your backup channel.

*Steps:*
1. Create a private channel (or use existing)
2. Add this bot as admin with "Post Messages" permission
3. Forward any message from the channel to @userinfobot
4. Copy the channel ID and send it here

*Format:* \`-1001234567890\`

⚠️ Must start with \`-100\` for channels
`;

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'backup_settings')]
      ])
    });
  } catch (error) {
    Logger.error('Error handling set backup channel', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Process backup channel ID from user input
 * @param {Object} ctx - Telegraf context
 * @param {string} channelId - Channel ID
 */
async function processBackupChannelId(ctx, channelId) {
  try {
    const userId = ctx.from.id;
    const pending = pendingBackupChannelSetup.get(userId);
    
    if (!pending || !pending.awaiting) {
      return false;
    }
    
    // Validate channel ID format
    if (!channelId.startsWith('-100')) {
      await ctx.reply('❌ Invalid channel ID. Must start with `-100`\n\nPlease try again or click /backup to cancel.');
      return true;
    }
    
    // Test if bot can send to channel
    try {
      const testMsg = await ctx.telegram.sendMessage(
        channelId,
        '✅ Backup channel connected successfully!\n\nThis channel is now your media backup storage.'
      );
      
      // Delete test message
      try {
        await ctx.telegram.deleteMessage(channelId, testMsg.message_id);
      } catch (e) {
        // Ignore if can't delete
      }
      
      // Save to database
      BackupService.setBackupChannel(channelId);
      
      pendingBackupChannelSetup.delete(userId);
      
      await ctx.reply(
        '✅ *Backup Channel Configured!*\n\n' +
        `Channel ID: \`${channelId}\`\n\n` +
        'You can now enable auto-backup in settings.',
        { parse_mode: 'Markdown' }
      );
      
      // Show settings menu
      await handleBackupSettings(ctx);
      
      Logger.info(`User ${userId} configured backup channel: ${channelId}`);
      return true;
      
    } catch (error) {
      await ctx.reply(
        '❌ *Failed to connect to channel*\n\n' +
        'Please make sure:\n' +
        '1. Channel ID is correct\n' +
        '2. Bot is added as admin to the channel\n' +
        '3. Bot has "Post Messages" permission\n\n' +
        'Try again or /backup to cancel.',
        { parse_mode: 'Markdown' }
      );
      Logger.error(`Failed to connect to backup channel ${channelId}`, error);
      return true;
    }
  } catch (error) {
    Logger.error('Error processing backup channel ID', error);
    await ctx.reply('❌ An error occurred. Please try again with /backup');
    return true;
  }
}

/**
 * Toggle auto-backup
 * @param {Object} ctx - Telegraf context
 */
async function handleToggleAutoBackup(ctx) {
  try {
    await ctx.answerCbQuery();
    
    const config = BackupService.getBackupConfig();
    const newStatus = !config.auto_backup_enabled;
    
    BackupService.setAutoBackup(newStatus);
    
    await ctx.answerCbQuery(
      newStatus ? '✅ Auto-backup enabled' : '🔴 Auto-backup disabled'
    );
    
    // Refresh settings menu
    await handleBackupSettings(ctx);
    
    Logger.info(`User ${ctx.from.id} ${newStatus ? 'enabled' : 'disabled'} auto-backup`);
  } catch (error) {
    Logger.error('Error toggling auto-backup', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle manual backup all
 * @param {Object} ctx - Telegraf context
 */
async function handleManualBackupAll(ctx) {
  try {
    await ctx.answerCbQuery('🔄 Starting backup...');
    
    const config = BackupService.getBackupConfig();
    
    if (!config.backup_channel_id) {
      await ctx.editMessageText('❌ No backup channel configured!');
      return;
    }
    
    const mediaList = MediaService.getAllMedia();
    
    if (mediaList.length === 0) {
      await ctx.editMessageText('📭 No media to backup.');
      return;
    }
    
    await ctx.editMessageText(
      `⏳ *Backing up ${mediaList.length} media...*\n\nThis may take a while. Please wait...`,
      { parse_mode: 'Markdown' }
    );
    
    const result = await BackupService.backupAllMedia(
      ctx.telegram,
      config.backup_channel_id,
      mediaList
    );
    
    await ctx.editMessageText(
      `✅ *Backup Complete!*\n\n` +
      `✅ Success: ${result.success}\n` +
      `❌ Failed: ${result.failed}\n` +
      `📊 Total: ${result.success + result.failed}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⚙️ Backup Settings', 'backup_settings')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      }
    );
    
    Logger.info(`User ${ctx.from.id} completed manual backup: ${result.success} success, ${result.failed} failed`);
  } catch (error) {
    Logger.error('Error during manual backup', error);
    await ctx.editMessageText('❌ Error during backup. Please try again.');
  }
}

/**
 * Clear backup configuration
 * @param {Object} ctx - Telegraf context
 */
async function handleClearBackup(ctx) {
  try {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText(
      '⚠️ *Confirm Removal*\n\n' +
      'This will remove the backup channel configuration.\n' +
      'The channel and its media will not be deleted.\n\n' +
      'Are you sure?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Yes, Remove', 'backup_confirm_clear'),
            Markup.button.callback('❌ Cancel', 'backup_settings')
          ]
        ])
      }
    );
  } catch (error) {
    Logger.error('Error handling clear backup', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Confirm clear backup
 * @param {Object} ctx - Telegraf context
 */
async function handleConfirmClearBackup(ctx) {
  try {
    await ctx.answerCbQuery();
    
    BackupService.clearBackupChannel();
    
    await ctx.editMessageText(
      '✅ *Backup Configuration Removed*\n\n' +
      'Your backup channel and its content are still intact.\n' +
      'You can reconfigure anytime.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⚙️ Configure Again', 'backup_settings')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      }
    );
    
    Logger.info(`User ${ctx.from.id} cleared backup configuration`);
  } catch (error) {
    Logger.error('Error confirming clear backup', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

module.exports = {
  handleBackupSettings,
  handleSetBackupChannel,
  processBackupChannelId,
  handleToggleAutoBackup,
  handleManualBackupAll,
  handleClearBackup,
  handleConfirmClearBackup,
  pendingBackupChannelSetup
};
