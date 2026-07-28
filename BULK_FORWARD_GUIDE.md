# 📤 Bulk Forward Guide - Telegram Media Storage Bot

## ✨ Fitur Baru: Bulk Forward Mode

Bot sekarang **otomatis mendeteksi forwarded messages** dan memproses ribuan file secara batch dengan fitur-fitur canggih!

---

## 🚀 Cara Menggunakan

### **Metode 1: Auto Bulk Mode (RECOMMENDED)**

Bot **otomatis aktif** saat Anda forward message dari channel:

1. **Buka channel source** (channel yang berisi ribuan media)
2. **Select multiple messages** (Telegram Desktop: Ctrl+Click, Mobile: Long press)
3. **Forward ke bot** Anda
4. **Bot otomatis detect** dan masuk bulk mode!
5. **Tunggu 3 detik** setelah forward terakhir
6. **Bot proses semua** secara otomatis!

### **Metode 2: Manual Bulk Mode**

Gunakan command `/bulkmode` untuk info dan status:

```
/bulkmode
```

**Output:**
```
✅ Bulk Mode Enabled!

📤 Now you can forward hundreds of media at once!

Features:
✅ Auto-category from hashtags (#promo → promo)
✅ Duplicate detection (skip existing files)
✅ Progress tracking (update every 50 files)
✅ Batch processing (process after 3s idle)

💡 How to use:
1. Forward multiple media from any channel
2. Wait 3 seconds after last forward
3. Bot will process all automatically!

🏷 Add hashtags like #sales or #promo in captions for auto-categorization!
```

---

## 🎯 Fitur Utama

### 1. **Auto-Category dari Hashtag**
Bot otomatis assign category berdasarkan hashtag di caption:

**Contoh:**
- Caption: `"Video promosi #promo"` → Masuk ke category **promo**
- Caption: `"#sales Product demo"` → Masuk ke category **sales**
- Caption: `"Banner #marketing campaign"` → Masuk ke category **marketing**

**Format hashtag:**
- `#namaCategory` (huruf, angka, underscore, dash)
- Hashtag pertama yang di-detect akan jadi category
- Jika tidak ada hashtag → masuk category **bulk_import**

### 2. **Duplicate Detection** 
Bot skip file yang sudah pernah di-upload:

- **Berdasarkan `file_unique_id`** dari Telegram
- **Tidak menyimpan file duplikat** (hemat storage)
- **Otomatis skip** dan lanjut ke file berikutnya
- **Laporan jumlah skipped** di summary

### 3. **Progress Tracking**
Update real-time setiap 50 file:

```
🔄 Processing Batch Upload

Progress: 150/1000 (15%)
✅ Saved: 140
⏭ Skipped (duplicates): 10
❌ Errors: 0
```

### 4. **Batch Processing**
Sistem queue pintar:

- **Collect**: Tunggu 3 detik setelah forward terakhir
- **Process**: Proses semua file dalam batch
- **Report**: Kirim summary lengkap

---

## 📊 Summary Report

Setelah selesai, bot kirim laporan lengkap:

```
✅ Batch Upload Complete!

📊 Summary:
Total received: 1000
✅ Saved: 950
⏭ Skipped (duplicates): 45
❌ Errors: 5

⏱ Processing time: 125.3s

💡 Tip: Use hashtags like #promo in captions to auto-assign categories!
```

---

## 💡 Tips & Best Practices

### **1. Gunakan Hashtag untuk Auto-Category**
```
Caption: "Video promo Q4 #promo"
Caption: "Sales banner #sales"
Caption: "#marketing Campaign material"
```

### **2. Forward dalam Batch Besar**
- **Telegram Desktop**: Select hingga 100 message sekaligus
- **Telegram Mobile**: Select multiple dan forward
- **Ulangi**: Untuk ribuan file, lakukan beberapa kali

### **3. Struktur Caption yang Baik**
```
✅ GOOD:
"Product demo video #products"
"#sales Banner design 2024"

❌ BAD:
"video" (terlalu singkat, tidak ada hashtag)
```

### **4. Monitoring Progress**
- Bot update setiap 50 file
- Lihat progress real-time
- Cek log untuk detail

---

## 🔧 Troubleshooting

### **Q: Bot tidak detect forward saya?**
**A:** Pastikan message adalah **forwarded message**, bukan re-upload. Bot detect dari `forward_date` metadata.

### **Q: Semua masuk ke category "bulk_import"?**
**A:** Tambahkan **hashtag** di caption. Contoh: `#promo` atau `#sales`

### **Q: Bot skip banyak file?**
**A:** File tersebut **sudah ada** di database. Duplicate detection bekerja!

### **Q: Ada error saat processing?**
**A:** Check log bot. Biasanya karena:
- File rusak/corrupt
- Telegram rate limit
- Network issue

### **Q: Processing lambat?**
**A:** Telegram ada rate limit. Bot sudah optimized dengan:
- Batch processing
- Progress update minimal
- Auto rate limiting

---

## 🎓 Contoh Use Case

### **Use Case 1: Import Channel Marketing**
```
1. Forward 500 media dari channel marketing
2. Semua pakai caption "#marketing"
3. Bot proses → 500 file masuk category "marketing"
4. Selesai dalam 1-2 menit
```

### **Use Case 2: Multiple Category**
```
1. Forward 100 promo → caption "#promo"
2. Forward 100 sales → caption "#sales"  
3. Forward 100 products → caption "#products"
4. Bot auto-assign ke category masing-masing
```

### **Use Case 3: Backup Channel**
```
1. Forward ALL media dari channel lama (ribuan file)
2. Bot skip duplikat otomatis
3. Hanya save yang belum ada
4. Hemat waktu dan storage!
```

---

## 📈 Performance

**Kecepatan Processing:**
- ~50-100 files/minute (tergantung ukuran)
- ~3000-6000 files/hour
- Ribuan file bisa selesai dalam 30-60 menit

**Optimizations:**
- ✅ Batch processing (efisien)
- ✅ Duplicate detection (hemat waktu)
- ✅ Progress update (minimal network)
- ✅ Auto rate limiting (avoid ban)

---

## 🚦 Status & Commands

### **Check Status**
```
/bulkmode
```

### **View Categories**
```
/categories
```

### **Backup Settings**
```
/backup
```

---

## 🆘 Support

Jika ada masalah atau pertanyaan:

1. Check log bot untuk error details
2. Pastikan bot punya akses ke media
3. Verify hashtag format correct
4. Test dengan jumlah kecil dulu (10-20 files)

---

## 🎉 Happy Bulk Forwarding!

Dengan fitur ini, Anda bisa import **ribuan media dalam hitungan menit** instead of hours!

**Key Features:**
- ✅ Auto-detect forwarded messages
- ✅ Auto-category from hashtags
- ✅ Duplicate detection
- ✅ Progress tracking
- ✅ Batch processing

**No manual work needed!** Just forward dan tunggu bot proses semua! 🚀
