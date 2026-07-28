# Telegram Media Storage Bot

A production-ready Telegram bot that stores and manages media using Telegram's `file_id`. Upload media once, store the file ID, and resend to any chat or channel without re-uploading.

## Features

✅ **Automatic Media Detection** - Automatically saves video, photo, document, and animation files  
✅ **Smart Storage** - Stores only `file_id` in SQLite, not the actual files  
✅ **Quick Resend** - Send stored media to any chat/channel instantly  
✅ **Search & List** - Search by caption or list recent media  
✅ **Clean Architecture** - Modular, maintainable, production-ready code  
✅ **Error Handling** - Comprehensive error handling and logging  
✅ **No Re-Upload** - Leverage Telegram's storage to save bandwidth

## Supported Media Types

- 🎥 Video
- 📷 Photo
- 📄 Document
- 🎞️ Animation (GIF)

## Prerequisites

- Node.js (v18 or higher recommended)
- A Telegram account
- Basic knowledge of command line

## Installation

### 1. Create Your Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow the instructions:
   - Choose a name for your bot (e.g., "My Media Storage Bot")
   - Choose a username ending in "bot" (e.g., "my_media_storage_bot")
4. BotFather will give you a **BOT_TOKEN** - save this!

Example token format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### 2. Clone or Download This Project

```bash
cd ~/Desktop
# If you have the project folder already, cd into it
cd telegram-media-storage
```

### 3. Install Dependencies

```bash
npm install
```

This will install:
- `telegraf` - Telegram Bot framework
- `better-sqlite3` - Fast SQLite database
- `dotenv` - Environment variable management

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit the `.env` file and add your bot token:

```env
BOT_TOKEN=your_bot_token_here
```

Replace `your_bot_token_here` with the token from BotFather.

### 5. Run the Bot

```bash
npm start
```

You should see:

```
[INFO] Database initialized successfully
[INFO] Creating bot instance...
[INFO] Starting bot...
[INFO] ✅ Bot is running!
[INFO] Press Ctrl+C to stop
```

## Usage Guide

### Uploading Media

Simply send any video, photo, document, or animation to the bot. It will automatically save it and reply with:

```
✅ Saved successfully

ID: 12
Type: video
```

### Commands

#### `/start`
Welcome message and quick introduction

#### `/help`
Display all available commands and usage examples

#### `/list`
Show the latest 20 stored media

Example output:
```
📋 Latest 20 media:

ID: 15
Type: video
Caption: Funny Cat

ID: 14
Type: photo
Caption: Sunset Beach

...
```

#### `/search <keyword>`
Search media by caption

Example:
```
/search funny
```

Output:
```
🔍 Found 3 result(s) for "funny":

ID: 15
Type: video
Caption: Funny Cat

ID: 12
Type: photo
Caption: Funny Dog
```

#### `/send <media_id> <chat_id>`
Send stored media to a specific chat or channel

Example:
```
/send 15 -1001234567890
```

**How to get Chat ID:**
- For your own chat: Use [@userinfobot](https://t.me/userinfobot)
- For groups/channels: 
  1. Add [@userinfobot](https://t.me/userinfobot) to the group/channel
  2. It will show the chat ID
  3. For channels, the ID looks like: `-1001234567890`
  4. For groups, the ID looks like: `-987654321`

**Important:** The bot must be a member of the target group/channel and have permission to post messages.

#### `/bulksend <media_ids> <chat_id>`
Send multiple media at once to a specific chat or channel

This command is perfect for sending many videos/photos at once without having to type multiple `/send` commands.

**Supported formats:**
- Comma-separated: `1,2,3`
- Space-separated: `1 2 3`
- Range: `1-5` (sends media IDs 1, 2, 3, 4, 5)
- Combined: `1,3,5-8,10` (sends media IDs 1, 3, 5, 6, 7, 8, 10)

**Examples:**
```bash
# Send media 1, 2, and 3
/bulksend 1,2,3 -1001234567890

# Send media 1 through 5
/bulksend 1-5 -1001234567890

# Send specific media with ranges
/bulksend 1,3,5-8,10 -1001234567890

# Space-separated format
/bulksend 1 2 3 -1001234567890
```

**Features:**
- ✅ Sends up to 50 media at once
- ✅ Shows progress summary after completion
- ✅ Reports failed and not-found media
- ✅ Automatically adds delay between sends to avoid rate limits
- ✅ Supports all format combinations

**Output example:**
```
📊 Bulk Send Summary

✅ Successfully sent: 5/5
📍 Target: -1001234567890
```

#### `/forum <category> <group_id>`
Send an entire category to a Telegram Forum Group (with topics)

This command is designed for **Telegram Forum Groups** (groups with topics enabled). It automatically creates a topic for each category and sends all media from that category to the topic.

**Requirements:**
- Target group must have **Topics/Forums enabled**
- Bot must be an **admin** in the group
- Bot needs **"Manage Topics"** and **"Send Messages"** permissions

**How it works:**
1. Bot checks if the group is a forum
2. Creates a topic named "📁 CategoryName" (or uses existing cached topic)
3. Sends all media from that category to the topic
4. Caches the topic ID for future use

**Examples:**
```bash
# Send all media from "Movies" category to a forum group
/forum Movies -1001234567890

# Send all media from "video_ads" category
/forum video_ads -1001234567890
```

**Output example:**
```
✅ Successfully Sent to Forum!

📁 Category: Movies
🎯 Topic ID: 12345
✔️ Sent: 25
❌ Failed: 0

All media has been sent to the forum topic!
```

**Enabling Topics in Telegram:**
1. Open your group in Telegram
2. Go to **Group Settings** → **Group Type**
3. Enable **"Topics"** feature
4. Make sure the bot is an admin with proper permissions

**Benefits:**
- Organizes media by category into separate topics
- Perfect for content distribution channels
- Automatic topic creation and management
- Topic IDs are cached for better performance

#### `/delete <media_id>`
Delete a media record from the database

Example:
```
/delete 15
```

**Note:** This only deletes the record from your database, not from Telegram's servers.

#### `/count`
Show total number of stored media

Example output:
```
📊 Total stored media: 42
```

## Project Structure

```
telegram-media-storage/
├── src/
│   ├── bot.js                    # Main bot entry point
│   ├── config.js                 # Configuration management
│   ├── database.js               # Database initialization
│   ├── commands/                 # Command handlers
│   │   ├── countCommand.js
│   │   ├── deleteCommand.js
│   │   ├── helpCommand.js
│   │   ├── listCommand.js
│   │   ├── searchCommand.js
│   │   ├── sendCommand.js
│   │   └── startCommand.js
│   ├── handlers/                 # Message handlers
│   │   └── mediaHandler.js       # Media message handler
│   ├── services/                 # Business logic
│   │   └── mediaService.js       # Media database operations
│   └── utils/                    # Utilities
│       └── logger.js             # Logging utility
├── database.db                   # SQLite database (auto-created)
├── .env                         # Environment variables (create this)
├── .env.example                 # Example environment file
├── package.json                 # Node.js dependencies
└── README.md                    # This file
```

## Database Schema

The bot uses SQLite with the following schema:

```sql
CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL,
  file_unique_id TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL,
  caption TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Troubleshooting

### Bot doesn't respond

1. Check if the bot is running
2. Verify your `BOT_TOKEN` in `.env` is correct
3. Make sure you started a chat with the bot (send `/start`)

### "Chat not found" error

1. Verify the chat ID is correct
2. Make sure the bot is a member of the target chat
3. Check if the bot has permission to send messages

### Database errors

1. Delete `database.db` and restart the bot (will recreate the database)
2. Check file permissions in the project directory

### Installation errors

1. Make sure you have Node.js v18+ installed: `node --version`
2. Try deleting `node_modules` and running `npm install` again
3. On some systems, you may need build tools for `better-sqlite3`:
   - **Windows:** Install [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools)
   - **macOS:** Install Xcode Command Line Tools: `xcode-select --install`
   - **Linux:** Install build-essential: `sudo apt-get install build-essential`

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses Node.js watch mode to automatically restart on file changes.

### Logs

The bot logs all operations to the console with timestamps:

```
[2026-07-15T02:16:01.234Z] [INFO] Bot is running!
[2026-07-15T02:16:15.567Z] [INFO] Saved media ID 12
[2026-07-15T02:16:30.890Z] [INFO] Sending media 12 to -1001234567890
```

## Production Deployment

### Run with systemd on a VPS

Use `systemd` so the bot keeps running after you close the terminal/SSH session and automatically starts again after a VPS reboot.

#### 1. Prepare the project on your VPS

Example path used below: `/opt/telegram-media-storage`.

```bash
sudo mkdir -p /opt/telegram-media-storage
sudo chown -R $USER:$USER /opt/telegram-media-storage

# Put/clone this project into /opt/telegram-media-storage, then:
cd /opt/telegram-media-storage
npm install --omit=dev
cp .env.example .env
nano .env
```

Make sure `.env` contains your real `BOT_TOKEN` and any other required settings.

#### 2. Create a dedicated service user, optional but recommended

```bash
sudo useradd --system --home /opt/telegram-media-storage --shell /usr/sbin/nologin telegrambot
sudo chown -R telegrambot:telegrambot /opt/telegram-media-storage
```

If you want to run the service as your current VPS user instead, edit `deploy/telegram-media-storage.service` and change:

```ini
User=telegrambot
Group=telegrambot
```

to your Linux username/group.

#### 3. Adjust the systemd service file

Open the service template:

```bash
nano deploy/telegram-media-storage.service
```

Check these values:

```ini
User=telegrambot
Group=telegrambot
WorkingDirectory=/opt/telegram-media-storage
ExecStart=/usr/bin/node src/bot.js
```

If Node.js is installed somewhere else, check with:

```bash
which node
```

Then replace `/usr/bin/node` in `ExecStart` with the output from `which node`.

#### 4. Install and start the service

```bash
sudo cp deploy/telegram-media-storage.service /etc/systemd/system/telegram-media-storage.service
sudo systemctl daemon-reload
sudo systemctl enable telegram-media-storage
sudo systemctl start telegram-media-storage
```

#### 5. Check status and logs

```bash
sudo systemctl status telegram-media-storage
journalctl -u telegram-media-storage -f
```

Useful commands:

```bash
# Restart after code or .env changes
sudo systemctl restart telegram-media-storage

# Stop the bot
sudo systemctl stop telegram-media-storage

# Disable auto-start on boot
sudo systemctl disable telegram-media-storage
```

### Other production considerations

For production deployment, also consider:

1. **Database Backups:** Regularly backup `database.db`
   ```bash
   cp database.db database.backup.db
   ```

2. **Monitoring:** Set up monitoring and alerts

3. **Security:** Keep your `.env` file secure and never commit it to version control

## License

MIT License - feel free to use this bot for your projects!

## Support

If you encounter any issues or have questions:

1. Check the Troubleshooting section
2. Review the logs for error messages
3. Verify all configuration settings

---

**Happy Bot Building! 🚀**
