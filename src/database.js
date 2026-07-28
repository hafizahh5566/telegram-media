/**
 * Database Module
 * Initializes SQLite database and creates tables
 */

const Database = require('better-sqlite3');
const config = require('./config');
const Logger = require('./utils/logger');

let db = null;

/**
 * Initialize database connection and create tables
 * @returns {Database} - Database instance
 */
function initDatabase() {
  try {
    db = new Database(config.databasePath);
    
    // Enable WAL mode for better concurrent access
    db.pragma('journal_mode = WAL');
    
    // Create media table with name as primary key
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS media (
        name TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        file_unique_id TEXT NOT NULL UNIQUE,
        media_type TEXT NOT NULL,
        caption TEXT,
        category TEXT DEFAULT 'uncategorized',
        message_id INTEGER,
        chat_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    db.exec(createTableSQL);
    
    // Add category column if it doesn't exist (for existing databases)
    try {
      db.exec('ALTER TABLE media ADD COLUMN category TEXT DEFAULT \'uncategorized\'');
      Logger.info('Added category column to existing database');
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Add message_id column if it doesn't exist (for existing databases)
    try {
      db.exec('ALTER TABLE media ADD COLUMN message_id INTEGER');
      Logger.info('Added message_id column to existing database');
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Add chat_id column if it doesn't exist (for existing databases)
    try {
      db.exec('ALTER TABLE media ADD COLUMN chat_id TEXT');
      Logger.info('Added chat_id column to existing database');
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Create index on file_unique_id for faster lookups
    db.exec('CREATE INDEX IF NOT EXISTS idx_file_unique_id ON media(file_unique_id)');
    
    // Create index on media_type for faster filtering
    db.exec('CREATE INDEX IF NOT EXISTS idx_media_type ON media(media_type)');
    
    // Create index on category for faster filtering
    db.exec('CREATE INDEX IF NOT EXISTS idx_category ON media(category)');
    
    // Create whitelist table for channels/groups
    const createWhitelistTableSQL = `
      CREATE TABLE IF NOT EXISTS whitelist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        chat_id TEXT NOT NULL,
        topic_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(chat_id, topic_id)
      )
    `;
    
    db.exec(createWhitelistTableSQL);
    
    // Add topic_id column if it doesn't exist (for existing databases)
    try {
      db.exec('ALTER TABLE whitelist ADD COLUMN topic_id TEXT');
      Logger.info('Added topic_id column to existing whitelist table');
    } catch (error) {
      // Column already exists, ignore error
    }
    
    // Create index on chat_id for faster lookups
    db.exec('CREATE INDEX IF NOT EXISTS idx_whitelist_chat_id ON whitelist(chat_id)');
    
    // Create unique index for chat_id + topic_id combination
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_whitelist_chat_topic ON whitelist(chat_id, topic_id)');
    
    // Create backup_config table for backup channel settings
    const createBackupConfigTableSQL = `
      CREATE TABLE IF NOT EXISTS backup_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        backup_channel_id TEXT,
        auto_backup_enabled INTEGER DEFAULT 0,
        last_backup_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    db.exec(createBackupConfigTableSQL);
    
    // Insert default config if not exists
    db.exec(`
      INSERT OR IGNORE INTO backup_config (id, auto_backup_enabled) 
      VALUES (1, 0)
    `);
    
    // Create forum_topics table for caching forum topic IDs
    const createForumTopicsTableSQL = `
      CREATE TABLE IF NOT EXISTS forum_topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL UNIQUE,
        topic_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    db.exec(createForumTopicsTableSQL);
    
    // Create index on category for faster lookups
    db.exec('CREATE INDEX IF NOT EXISTS idx_forum_topics_category ON forum_topics(category)');
    
    // Create backup_bot_config table for backup bot settings
    const createBackupBotConfigTableSQL = `
      CREATE TABLE IF NOT EXISTS backup_bot_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        bot_token TEXT,
        bot_username TEXT,
        backup_chat_id TEXT,
        last_backup_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    db.exec(createBackupBotConfigTableSQL);
    
    // Add backup_chat_id column if it doesn't exist (for existing databases)
    try {
      db.exec('ALTER TABLE backup_bot_config ADD COLUMN backup_chat_id TEXT');
      Logger.info('Added backup_chat_id column to existing backup_bot_config table');
    } catch (error) {
      // Column already exists, ignore error
    }
    
    Logger.info('Database initialized successfully');
    
    return db;
  } catch (error) {
    Logger.error('Failed to initialize database', error);
    process.exit(1);
  }
}

/**
 * Get database instance
 * @returns {Database} - Database instance
 */
function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    Logger.info('Database connection closed');
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase,
};
