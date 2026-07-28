# 🤖 Telegram Bot Generator Prompt

Template ini untuk generate Telegram bot baru dengan struktur seperti **telegram-media-storage** bot.

---

## 📋 PROMPT UNTUK AI (Copy paste ini)

```
Saya ingin membuat Telegram bot dengan struktur dan arsitektur seperti bot telegram-media-storage yang sudah saya punya.

### Bot Details:
- **Nama Bot**: [ISI NAMA BOT, contoh: telegram-payment-bot]
- **Fungsi Utama**: [ISI FUNGSI, contoh: Handle payment subscription dan invoice]
- **Database**: SQLite dengan better-sqlite3
- **Features yang Dibutuhkan**:
  1. [Feature 1, contoh: Create invoice]
  2. [Feature 2, contoh: Check payment status]
  3. [Feature 3, contoh: Handle webhook]
  4. [dst...]

### Struktur yang Harus Diikuti:

```
project-root/
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── database.db
└── src/
    ├── bot.js                 # Main bot entry point
    ├── config.js              # Load .env configuration
    ├── database.js            # Database initialization
    ├── commands/              # Bot commands (/start, /help, dll)
    │   ├── startCommand.js
    │   ├── helpCommand.js
    │   └── [custom commands].js
    ├── handlers/              # Event handlers (callback, text, dll)
    │   ├── callbackHandler.js
    │   └── [custom handlers].js
    ├── middleware/            # Bot middleware
    │   └── accessControl.js   # User whitelist
    ├── services/              # Business logic
    │   └── [service].js
    └── utils/                 # Helper functions
        ├── keyboards.js       # Inline keyboards
        └── logger.js          # Logging utility
```

### Requirements:

1. **Technology Stack**:
   - Node.js dengan Telegraf framework
   - SQLite (better-sqlite3)
   - dotenv untuk environment variables
   - Logging system dengan timestamps

2. **Must-Have Features**:
   - ✅ User access control via .env (ALLOWED_USER_IDS)
   - ✅ Inline keyboard navigation
   - ✅ Error handling & logging
   - ✅ Graceful shutdown (SIGINT, SIGTERM)
   - ✅ Database connection management
   - ✅ Modular code structure

3. **Code Style**:
   - JSDoc comments untuk setiap function
   - Consistent error handling dengan try-catch
   - Logger.info, Logger.warn, Logger.error
   - Async/await pattern
   - Descriptive variable & function names

4. **Environment Variables** (.env):
   ```
   BOT_TOKEN=
   ALLOWED_USER_IDS=
   [tambahkan sesuai kebutuhan]
   ```

5. **Package.json Scripts**:
   ```json
   {
     "start": "node src/bot.js",
     "dev": "nodemon src/bot.js"
   }
   ```

### Output yang Diharapkan:

Generate semua files dengan:
1. Complete code implementation
2. Inline comments yang jelas
3. README.md dengan setup instructions
4. .env.example template
5. Database schema yang sesuai
6. Error handling di semua async functions

Tolong generate project lengkap dengan struktur seperti di atas!
```

---

## 🎯 CONTOH PENGGUNAAN

### Contoh 1: Payment Bot

**Nama Bot**: telegram-payment-bot
**Fungsi Utama**: Handle payment subscription, invoice, dan webhook dari payment gateway
**Features**:
1. Create invoice dengan Midtrans/Xendit
2. Check payment status
3. Handle webhook notification
4. Subscription management
5. Payment history per user
6. Auto expire unpaid invoice

**Database Tables**:
- invoices (id, user_id, amount, status, payment_url, created_at)
- subscriptions (id, user_id, plan, start_date, end_date, status)
- transactions (id, invoice_id, payment_method, paid_at)

---

### Contoh 2: Auto Join Channel Bot

**Nama Bot**: telegram-autojoin-bot
**Fungsi Utama**: Automatically join users to multiple channels/groups with approval system
**Features**:
1. Request to join channel
2. Admin approval system
3. Bulk add users to channels
4. Track join history
5. Auto remove after X days
6. Channel whitelist management

**Database Tables**:
- join_requests (id, user_id, channel_id, status, requested_at)
- channels (id, channel_id, channel_name, auto_approve)
- user_channels (id, user_id, channel_id, joined_at, expires_at)

---

### Contoh 3: Giveaway Bot

**Nama Bot**: telegram-giveaway-bot
**Fungsi Utama**: Manage giveaways, random winner selection, dan prize distribution
**Features**:
1. Create giveaway campaign
2. User registration for giveaway
3. Random winner selection
4. Announce winners
5. Prize claim system
6. Giveaway statistics

**Database Tables**:
- giveaways (id, title, description, prize, max_participants, end_date, status)
- participants (id, giveaway_id, user_id, registered_at)
- winners (id, giveaway_id, user_id, claimed, selected_at)

---

### Contoh 4: Survey/Poll Bot

**Nama Bot**: telegram-survey-bot
**Fungsi Utama**: Create surveys, collect responses, dan generate reports
**Features**:
1. Create multi-question survey
2. Collect user responses
3. Generate statistics
4. Export to CSV
5. Anonymous/identified responses
6. Survey scheduling

**Database Tables**:
- surveys (id, title, description, created_by, status, created_at)
- questions (id, survey_id, question_text, question_type, options)
- responses (id, survey_id, user_id, answers, submitted_at)

---

## 📝 CARA PAKAI:

1. **Copy prompt template** di atas
2. **Isi Bot Details** sesuai kebutuhan Anda
3. **Paste ke AI** (Claude, ChatGPT, dll)
4. **Generate & Deploy!**

## 💡 TIPS:

- Start dengan features minimal dulu (MVP)
- Test di local sebelum deploy ke VPS
- Gunakan .env untuk semua config
- Backup database secara berkala
- Monitor logs untuk debugging

## 🔗 Base Reference:

Project ini (telegram-media-storage) adalah base template yang bagus untuk:
- ✅ Clean code structure
- ✅ Modular architecture
- ✅ Proper error handling
- ✅ User access control
- ✅ Database management
- ✅ Logging system

Semua bot baru akan inherit pattern & best practices yang sama!
