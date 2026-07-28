/**
 * Keyboards Utility
 * Provides reusable inline keyboard buttons for the bot
 */

const { Markup } = require('telegraf');

/**
 * Main menu keyboard with all primary actions
 * @returns {Object} - Telegraf inline keyboard markup
 */
function getMainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📁 Categories', 'view_categories'),
      Markup.button.callback('📊 Count', 'count')
    ],
    [
      Markup.button.callback('📨 Send Media', 'send_prompt'),
      Markup.button.callback('🗑 Delete Media', 'delete_prompt')
    ],
    [
      Markup.button.callback('📤 Bulk Send', 'bulk_send_menu')
    ],
    [
      Markup.button.callback('❓ Help', 'help')
    ]
  ]);
}

/**
 * Help menu keyboard with command examples
 * @returns {Object} - Telegraf inline keyboard markup
 */
function getHelpKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📋 List Media', 'list'),
      Markup.button.callback('📊 Count', 'count')
    ],
    [
      Markup.button.callback('🔙 Back to Menu', 'main_menu')
    ]
  ]);
}

/**
 * Back to main menu keyboard
 * @returns {Object} - Telegraf inline keyboard markup
 */
function getBackToMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Back to Menu', 'main_menu')]
  ]);
}

/**
 * Quick action keyboard for after media upload
 * @param {number} mediaId - ID of the uploaded media
 * @returns {Object} - Telegraf inline keyboard markup
 */
function getMediaUploadedKeyboard(mediaId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📨 Send This Media', `quick_send_${mediaId}`),
      Markup.button.callback('📋 List All', 'list')
    ],
    [
      Markup.button.callback('🔙 Main Menu', 'main_menu')
    ]
  ]);
}

/**
 * Confirmation keyboard for delete action
 * @param {number} mediaId - ID of media to delete
 * @returns {Object} - Telegraf inline keyboard markup
 */
function getDeleteConfirmKeyboard(mediaId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Yes, Delete', `confirm_delete_${mediaId}`),
      Markup.button.callback('❌ Cancel', 'main_menu')
    ]
  ]);
}

module.exports = {
  getMainMenuKeyboard,
  getHelpKeyboard,
  getBackToMenuKeyboard,
  getMediaUploadedKeyboard,
  getDeleteConfirmKeyboard,
};
