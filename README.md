# ⚡ Clash of Class — Real-Time Academic Game Show

**Clash of Class** adalah platform pembelajaran kompetitif real-time bertema *game show* akademik (terinspirasi dari *Clash of Champions* & *Jeopardy*). Guru membuat room kuis, dan siswa/kelompok saling berebut membuka serta mengunci soal selama 60 detik sebelum dicuri lawan!

---

## 🚀 Fitur Utama

- **Dual-Mode Engine:** Otomatis berjalan dalam **Local Demo Mode** (tanpa database eksternal) atau **Supabase Cloud Mode** (PostgreSQL & Realtime Broadcast).
- **Atomic Question Locking:** Siapa cepat dia dapat! Soal yang dibuka terkunci selama 60 detik khusus untuk kelompok/siswa pengunci.
- **Steal Window & Cooldown:** Jika waktu habis atau jawaban salah, soal kembali terbuka bebas untuk diperebutkan oleh kelompok lain.
- **Team Sync View:** Banner koordinasi cerdas di layar rekan satu tim saat anggotanya sedang mengerjakan soal.
- **Bank Soal Kustom:** Buat soal sendiri, gunakan preset siap pakai, serta Import & Export paket soal dalam format `.json`.
- **Game Master Projector View:** Tampilan arena untuk proyektor kelas dengan leaderboard interaktif, Force Unlock darurat, dan **Download Rekap Nilai (CSV / Excel)**.
- **Zero-Asset Web Audio Synthesizer:** Efek suara autentik (buzzer, chime kemenangan, countdown tick) tanpa dependensi aset audio eksternal.

---

## 🐳 Menjalankan dengan Docker (Rekomendasi Laptop Lain / 0-Setup)

Anda dapat langsung menjalankan aplikasi ini di laptop mana pun (Windows, Mac, Linux) tanpa perlu menginstal Node.js, npm, atau dependensi apa pun secara manual. Cukup pastikan **Docker Desktop** sudah terpasang.

### Opsi A: Mode Produksi (Cepat & Ringan)
Jalankan perintah berikut di terminal / PowerShell:
```bash
docker compose up --build
```
Aplikasi akan langsung aktif di: **[http://localhost:3000](http://localhost:3000)**

*(Untuk menghentikan: tekan `Ctrl + C` atau jalankan `docker compose down`)*

### Opsi B: Mode Pengembangan / Live Coding (Hot-Reload)
Jika Anda ingin mengedit kode di laptop baru dan perubahannya langsung terlihat seketika:
```bash
docker compose -f docker-compose.dev.yml up
```

---

## 💻 Menjalankan Secara Native (Tanpa Docker)

Jika Anda memiliki Node.js (v18 ke atas) di laptop Anda:

1. **Instal Dependensi:**
   ```bash
   npm install
   ```
2. **Jalankan Server Development:**
   ```bash
   npm run dev
   ```
3. Buka browser di **[http://localhost:3000](http://localhost:3000)**

---

## 📦 Cara Membagikan & Push ke GitHub

Jika Anda ingin mengunggah proyek ini ke akun GitHub Anda:

1. **Buat Repository Baru di GitHub:**
   - Masuk ke [github.com/new](https://github.com/new)
   - Beri nama repository, misalnya: `clash-of-class`
   - Pilih **Public** atau **Private**, lalu klik **Create repository** (jangan centang Add README).

2. **Hubungkan & Push dari Terminal Laptop Ini:**
   ```bash
   git remote add origin https://github.com/<USERNAME-ANDA>/clash-of-class.git
   git branch -M main
   git push -u origin main
   ```

---

## 💻 Cara Membuka di Laptop Lain (Windows)

1. Pastikan **Docker Desktop** sudah berjalan di laptop kedua Anda.
2. Buka terminal (PowerShell atau CMD), lalu clone repository:
   ```bash
   git clone https://github.com/<USERNAME-ANDA>/clash-of-class.git
   cd clash-of-class
   ```
3. Langsung jalankan tanpa instal apa pun:
   ```bash
   docker compose up --build
   ```
4. Buka browser di **[http://localhost:3000](http://localhost:3000)**. Selamat bertanding! 🎉

---

## ⚙️ Variabel Lingkungan (Opsional)

Jika ingin menghubungkan ke database Supabase Cloud, salin file acuan:
```bash
cp .env.example .env.local
```
Lalu isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` Anda. Jika dibiarkan kosong, aplikasi tetap berjalan 100% normal menggunakan **Local Demo Mode** bawaan.
