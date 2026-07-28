# 🔒 User Access Control

Bot ini mendukung **user whitelist** untuk membatasi akses hanya untuk user tertentu.

## 📋 Status Default

**By default, bot adalah PUBLIC** - siapa saja bisa menggunakan bot.

## 🔐 Cara Mengaktifkan Access Control

### Langkah 1: Dapatkan User ID

Chat dengan [@userinfobot](https://t.me/userinfobot) di Telegram untuk mendapatkan User ID Anda.

Contoh output:
```
Id: 123456789
First name: John
Username: @johndoe
```

User ID Anda adalah: `123456789`

### Langkah 2: Update File .env

Edit file `.env` di VPS atau local:

```bash
nano .env
```

Tambahkan atau update baris `ALLOWED_USER_IDS`:

**Untuk 1 user:**
```env
ALLOWED_USER_IDS=123456789
```

**Untuk beberapa user** (pisahkan dengan koma):
```env
ALLOWED_USER_IDS=123456789,987654321,555666777
```

**Untuk disable access control** (public bot):
```env
ALLOWED_USER_IDS=
```

### Langkah 3: Restart Bot

```bash
# Jika menggunakan npm
pkill -f "node.*bot.js"
npm start

# Jika menggunakan PM2
pm2 restart telegram-bot
```

## ✅ Verifikasi

Setelah restart, cek log bot:

**Access control AKTIF:**
```
🔒 Access control enabled for 3 user(s)
```

**Bot PUBLIC:**
```
🌐 Bot is public - anyone can use it
```

## 🚫 Pesan untuk User yang Tidak Diizinkan

User yang tidak ada di whitelist akan melihat:

```
🔒 Access Denied

This bot is private and restricted to authorized users only.

💡 If you need access, please contact the bot owner.
```

## 📝 Tips

1. **Tidak perlu edit code** - semua setting di `.env`
2. **Restart bot** setiap kali update whitelist
3. **Simpan user ID** di tempat aman
4. **Test dulu** dengan user ID sendiri sebelum deploy

## 🔄 Menambah User Baru di VPS

```bash
# 1. Edit .env
nano .env

# 2. Tambahkan user ID baru (pisahkan dengan koma)
ALLOWED_USER_IDS=123456789,999888777

# 3. Save (Ctrl+O, Enter, Ctrl+X)

# 4. Restart bot
pm2 restart telegram-bot

# 5. Cek log
pm2 logs telegram-bot
```

## ❓ FAQ

**Q: Bisa tambah user tanpa restart bot?**  
A: Tidak, harus restart bot agar perubahan .env diterapkan.

**Q: Kalau lupa user ID gimana?**  
A: Chat dengan @userinfobot lagi atau cek log bot saat user chat.

**Q: Bisa whitelist berdasarkan username?**  
A: Tidak, hanya berdasarkan user ID karena lebih aman (username bisa diganti).

**Q: Owner bisa lihat user ID yang mencoba akses?**  
A: Ya, cek log bot: `Access denied for user: 123456789`
