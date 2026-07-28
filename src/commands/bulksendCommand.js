/**
 * Bulk Send Command
 * Send media to multiple groups/channels at once
 */

const { Markup } = require('telegraf');
const MediaService = require('../services/mediaService');
const Logger = require('../utils/logger');

// Store bulk send state
const bulkSendState = new Map();

/**
 * Handle bulk send menu
 * @param {Object} ctx - Telegraf context
 */
async function handleBulkSendMenu(ctx) {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📁 Send by Category', 'bulk_send_category')],
      [Markup.button.callback('📤 Send All Media', 'bulk_send_all')],
      [Markup.button.callback('🔙 Back to Menu', 'main_menu')]
    ]);

    const message = 
      `📤 *Bulk Send Menu*\n\n` +
      `Kirim media ke banyak grup/channel sekaligus.\n\n` +
      `Pilih opsi di bawah:`;

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
    Logger.error('Error handling bulk send menu', error);
    await ctx.reply('❌ Terjadi kesalahan');
  }
}

/**
 * Handle bulk send by category
 * @param {Object} ctx - Telegraf context
 */
async function handleBulkSendCategory(ctx) {
  try {
    await ctx.answerCbQuery();

    const categories = MediaService.getCategories().filter(c => c !== 'uncategorized');

    if (categories.length === 0) {
      await ctx.editMessageText(
        '📁 *No Categories*\n\nBelum ada kategori.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back', 'bulk_send_menu')]
          ])
        }
      );
      return;
    }

    const buttons = [];
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback(`📁 ${categories[i]}`, `bulk_cat_${categories[i]}`));
      if (i + 1 < categories.length) {
        row.push(Markup.button.callback(`📁 ${categories[i + 1]}`, `bulk_cat_${categories[i + 1]}`));
      }
      buttons.push(row);
    }
    buttons.push([Markup.button.callback('🔙 Back', 'bulk_send_menu')]);

    await ctx.editMessageText(
      `📁 *Pilih Kategori*\n\nKategori mana yang ingin dikirim?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      }
    );
  } catch (error) {
    Logger.error('Error handling bulk send category', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle category selection for bulk send
 * @param {Object} ctx - Telegraf context
 * @param {string} category - Category name
 */
async function handleBulkCategorySelect(ctx, category) {
  try {
    await ctx.answerCbQuery();

    const userId = ctx.from.id;
    bulkSendState.set(userId, {
      type: 'category',
      category: category,
      awaitingChatIds: true
    });

    await ctx.editMessageText(
      `📤 *Bulk Send: ${category}*\n\n` +
      `Kirim daftar Chat ID yang dipisahkan dengan koma.\n\n` +
      `*Format:*\n` +
      `\`-1001234567890, -1009876543210, -1001111222333\`\n\n` +
      `💡 Tips:\n` +
      `• Bot harus sudah menjadi member/admin di semua grup/channel\n` +
      `• Bisa kirim ke 5+ grup sekaligus\n` +
      `• Pisahkan dengan koma`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'bulk_send_menu')]
        ])
      }
    );
  } catch (error) {
    Logger.error('Error handling bulk category select', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle bulk send all media
 * @param {Object} ctx - Telegraf context
 */
async function handleBulkSendAll(ctx) {
  try {
    await ctx.answerCbQuery();

    const userId = ctx.from.id;
    bulkSendState.set(userId, {
      type: 'all',
      awaitingChatIds: true
    });

    await ctx.editMessageText(
      `📤 *Bulk Send: Semua Media*\n\n` +
      `Kirim daftar Chat ID yang dipisahkan dengan koma.\n\n` +
      `*Format:*\n` +
      `\`-1001234567890, -1009876543210, -1001111222333\`\n\n` +
      `💡 Tips:\n` +
      `• Bot harus sudah menjadi member/admin di semua grup/channel\n` +
      `• Bisa kirim ke 5+ grup sekaligus\n` +
      `• Pisahkan dengan koma`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancel', 'bulk_send_menu')]
        ])
      }
    );
  } catch (error) {
    Logger.error('Error handling bulk send all', error);
    await ctx.answerCbQuery('❌ Error');
  }
}

/**
 * Handle chat IDs input for bulk send
 * @param {Object} ctx - Telegraf context
 * @returns {boolean} - True if handled
 */
async function handleBulkSendChatIds(ctx) {
  const userId = ctx.from.id;
  const state = bulkSendState.get(userId);

  if (!state || !state.awaitingChatIds) {
    return false;
  }

  try {
    const input = ctx.message.text.trim();
    
    // Parse chat IDs from comma-separated list
    const chatIds = input.split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    // Validate chat IDs
    const invalidIds = chatIds.filter(id => !/^-?\d+$/.test(id));
    if (invalidIds.length > 0) {
      await ctx.reply(
        `❌ *Chat ID tidak valid:*\n\`${invalidIds.join(', ')}\`\n\n` +
        `Format harus berupa angka (contoh: -1001234567890)`,
        { parse_mode: 'Markdown' }
      );
      return true;
    }

    if (chatIds.length === 0) {
      await ctx.reply('❌ Tidak ada Chat ID yang valid. Silakan coba lagi.');
      return true;
    }

    // Show confirmation
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Kirim Sekarang', 'bulk_confirm_send'),
        Markup.button.callback('❌ Batal', 'bulk_send_menu')
      ]
    ]);

    bulkSendState.set(userId, {
      ...state,
      chatIds: chatIds,
      awaitingChatIds: false
    });

    let mediaCount = 0;
    if (state.type === 'category') {
      const mediaList = MediaService.getMediaByCategory(state.category, 10000)
        .filter(m => m.media_type !== 'placeholder');
      mediaCount = mediaList.length;
    } else {
      mediaCount = MediaService.getMediaCount();
    }

    await ctx.reply(
      `📤 *Konfirmasi Bulk Send*\n\n` +
      `Type: ${state.type === 'category' ? `Kategori "${state.category}"` : 'Semua Media'}\n` +
      `Media: ${mediaCount} items\n` +
      `Target: ${chatIds.length} grup/channel\n\n` +
      `Chat IDs:\n${chatIds.map(id => `• \`${id}\``).join('\n')}\n\n` +
      `Total pengiriman: ${mediaCount * chatIds.length} pesan\n\n` +
      `Lanjutkan?`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );

    return true;
  } catch (error) {
    Logger.error('Error handling bulk send chat IDs', error);
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
    bulkSendState.delete(userId);
    return true;
  }
}

/**
 * Handle confirm bulk send
 * @param {Object} ctx - Telegraf context
 */
async function handleConfirmBulkSend(ctx) {
  try {
    await ctx.answerCbQuery();

    const userId = ctx.from.id;
    const state = bulkSendState.get(userId);

    if (!state || !state.chatIds) {
      await ctx.editMessageText('❌ Session expired. Silakan mulai lagi.');
      return;
    }

    const initialMsg = await ctx.editMessageText(
      '📤 *Mengirim Media...*\n\n⏳ Memulai...\n\n🔄 0%',
      { parse_mode: 'Markdown' }
    );

    let mediaList = [];
    if (state.type === 'category') {
      mediaList = MediaService.getMediaByCategory(state.category, 10000)
        .filter(m => m.media_type !== 'placeholder');
    } else {
      mediaList = MediaService.getAllMedia()
        .filter(m => m.media_type !== 'placeholder');
    }

    const totalItems = mediaList.length * state.chatIds.length;
    let totalSent = 0;
    let totalFailed = 0;
    const results = [];
    let processedItems = 0;
    let lastUpdateTime = Date.now();

    // Progress bar generator
    const getProgressBar = (percentage) => {
      const filledBlocks = Math.floor(percentage / 10);
      const emptyBlocks = 10 - filledBlocks;
      return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
    };

    // Update progress message
    const updateProgress = async (force = false) => {
      const now = Date.now();
      const percentage = Math.floor((processedItems / totalItems) * 100);
      
      // Update every 2 seconds or when forced
      if (force || now - lastUpdateTime > 2000) {
        try {
          const progressBar = getProgressBar(percentage);
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            initialMsg.message_id,
            undefined,
            `📤 *Mengirim Media...*\n\n` +
            `${progressBar}\n\n` +
            `🔄 ${percentage}%\n\n` +
            `✅ Berhasil: ${totalSent}\n` +
            `❌ Gagal: ${totalFailed}\n` +
            `📊 Progress: ${processedItems}/${totalItems}`,
            { parse_mode: 'Markdown' }
          );
          lastUpdateTime = now;
        } catch (e) {
          // Ignore rate limit errors
        }
      }
    };

    for (const chatId of state.chatIds) {
      let chatSent = 0;
      let chatFailed = 0;

      for (const media of mediaList) {
        try {
          const sendOptions = {};
          
          if (media.media_type === 'video') {
            await ctx.telegram.sendVideo(chatId, media.file_id, sendOptions);
          } else if (media.media_type === 'photo') {
            await ctx.telegram.sendPhoto(chatId, media.file_id, sendOptions);
          } else if (media.media_type === 'document') {
            await ctx.telegram.sendDocument(chatId, media.file_id, sendOptions);
          } else if (media.media_type === 'animation') {
            await ctx.telegram.sendAnimation(chatId, media.file_id, sendOptions);
          }

          chatSent++;
          totalSent++;
          await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
        } catch (error) {
          Logger.error(`Error sending to ${chatId}:`, error);
          chatFailed++;
          totalFailed++;
        }

        processedItems++;
        await updateProgress();
      }

      results.push({
        chatId,
        sent: chatSent,
        failed: chatFailed
      });
    }

    // Final update
    await updateProgress(true);

    // Build result message
    let resultMsg = `✅ *Bulk Send Selesai!*\n\n`;
    resultMsg += `██████████ 100%\n\n`;
    resultMsg += `Total: ${totalSent + totalFailed} pengiriman\n`;
    resultMsg += `✅ Berhasil: ${totalSent}\n`;
    resultMsg += `❌ Gagal: ${totalFailed}\n\n`;
    resultMsg += `*Detail per Chat:*\n`;
    
    for (const result of results) {
      resultMsg += `• \`${result.chatId}\`: ${result.sent}✅ ${result.failed}❌\n`;
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      initialMsg.message_id,
      undefined,
      resultMsg,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      }
    );

    bulkSendState.delete(userId);
    Logger.info(`User ${userId} bulk sent to ${state.chatIds.length} chats: ${totalSent} success, ${totalFailed} failed`);
  } catch (error) {
    Logger.error('Error confirming bulk send', error);
    await ctx.editMessageText(
      `❌ *Bulk Send Gagal*\n\n${error.message}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Back', 'bulk_send_menu')]
        ])
      }
    );
    bulkSendState.delete(ctx.from.id);
  }
}

module.exports = {
  handleBulkSendMenu,
  handleBulkSendCategory,
  handleBulkCategorySelect,
  handleBulkSendAll,
  handleBulkSendChatIds,
  handleConfirmBulkSend,
  bulkSendState,
};
