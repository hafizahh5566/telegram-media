/**
 * Configuration Module
 * Loads environment variables and provides app configuration
 */

require('dotenv').config();

const config = {
  // Bot configuration
  botToken: process.env.BOT_TOKEN,
  
  // Database configuration
  databasePath: './database.db',
  
  // App configuration
  maxListResults: 20,
  
  // User access control (optional)
  // Parse comma-separated user IDs from .env
  // If empty or not set, bot is public (anyone can use)
  allowedUserIds: process.env.ALLOWED_USER_IDS 
    ? process.env.ALLOWED_USER_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
    : null,
};

// Validate required configuration
if (!config.botToken) {
  console.error('[ERROR] BOT_TOKEN is not set in .env file');
  process.exit(1);
}

module.exports = config;
