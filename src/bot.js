/**
 * Main Bot Module
 * Telegram Media Storage Bot
 */

const { Telegraf } = require('telegraf');
const config = require('./config');
const { initDatabase, closeDatabase } = require('./database');
const Logger = require('./utils/logger');

// Import command handlers
const handleStartCommand = require('./commands/startCommand');
const handleHelpCommand = require('./commands/helpCommand');
const handleListCommand = require('./commands/listCommand');
const handleSearchCommand = require('./commands/searchCommand');
const handleSendCommand = require('./commands/sendCommand');
const handleBulkSendCommand = require('./commands/bulksendCommand');
const handleDeleteCommand = require('./commands/deleteCommand');
const handleCountCommand = require('./commands/countCommand');
const {
  handleCategoriesCommand,
  handleListCategoryCommand,
  handleSetCategoryCommand,
  handleDeleteFromCategoryCommand,
} = require('./commands/categoryCommand');
const { handleBulkModeCommand } = require('./handlers/bulkForwardHandler');
const { handleForumCommand } = require('./commands/forumCommand');

// Import media handler
const { handleMedia, handleTextForMediaName } = require('./handlers/mediaHandler');
const { handleCallbackQuery } = require('./handlers/callbackHandler');

// Import middleware
const accessControl = require('./middleware/accessControl');

/**
 * Initialize and start the bot
 */
async function startBot() {
  try {
    // Initialize database
    Logger.info('Initializing database...');
    initDatabase();
    
    // Create bot instance
    Logger.info('Creating bot instance...');
    const bot = new Telegraf(config.botToken);
    
    // Register middleware
    bot.use(accessControl);
    
    // Log access control status
    if (config.allowedUserIds && config.allowedUserIds.length > 0) {
      Logger.info(`🔒 Access control enabled for ${config.allowedUserIds.length} user(s)`);
    } else {
      Logger.info('🌐 Bot is public - anyone can use it');
    }
    
    // Register command handlers
    bot.command('start', handleStartCommand);
    bot.command('help', handleHelpCommand);
    bot.command('list', handleListCommand);
    bot.command('search', handleSearchCommand);
    bot.command('send', handleSendCommand);
    bot.command('bulksend', handleBulkSendCommand);
    bot.command('delete', handleDeleteCommand);
    bot.command('count', handleCountCommand);
    bot.command('categories', handleCategoriesCommand);
    bot.command('listcat', handleListCategoryCommand);
    bot.command('setcat', handleSetCategoryCommand);
    bot.command('deletecat', handleDeleteFromCategoryCommand);
    bot.command('bulkmode', handleBulkModeCommand);
    bot.command('forum', handleForumCommand);
    
    // Register media handlers
    bot.on('video', handleMedia);
    bot.on('photo', handleMedia);
    bot.on('document', handleMedia);
    bot.on('animation', handleMedia);
    
    // Register text handler (for media naming and other text input)
    bot.on('text', handleTextForMediaName);
    
    // Register callback query handler (for inline buttons)
    bot.on('callback_query', handleCallbackQuery);
    
    // Global error handler
    bot.catch((err, ctx) => {
      Logger.error(`Bot error for ${ctx.updateType}`, err);
      ctx.reply('❌ An unexpected error occurred. Please try again later.').catch(() => {});
    });
    
    // Graceful shutdown handlers
    const gracefulShutdown = async (signal) => {
      Logger.info(`Received ${signal}. Shutting down gracefully...`);
      
      try {
        await bot.stop(signal);
        closeDatabase();
        Logger.info('Bot stopped successfully');
        process.exit(0);
      } catch (error) {
        Logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };
    
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      Logger.error('Uncaught Exception', error);
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      Logger.error('Unhandled Rejection at:', promise);
      Logger.error('Reason:', reason);
    });
    
    // Start bot
    Logger.info('Starting bot...');
    await bot.launch();
    
    Logger.info('✅ Bot is running!');
    Logger.info('Press Ctrl+C to stop');
    
  } catch (error) {
    Logger.error('Failed to start bot', error);
    process.exit(1);
  }
}

// Start the bot
startBot();
