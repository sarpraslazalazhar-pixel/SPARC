# Panduan Integrasi Maksimal Instagram Graph API ke SPARC v3

Panduan teknis dan operasional untuk menghubungkan serta memaksimalkan kapabilitas akun Instagram Bisnis instansi di dalam ekosistem **SPARC v3** — mencakup **Analitik Lintas-Modul & Jam Tayang Terbaik (WIB)**, **Direct Publishing & Auto-Schedule (Feed, Carousel, Reels)**, **Moderasi Komentar Publik & Konversi Ide Konten**, serta **Visual Grid 3x3 Autentik**.

---

## 1. Arsitektur Relasi Akun Meta

Meta mewajibkan struktur hierarki 3 tingkat untuk membaca data analitik, menerbitkan konten, dan memoderasi komentar Instagram secara resmi:

```text
[Akun Facebook Pribadi] (Sebagai Admin)
        │
        ▼ mengelola
[Halaman Facebook / Facebook Page] (Misal: "Humas Instansi")
        │
        ▼ ditautkan ke
[Akun Instagram Profesional / Bisnis] (Misal: "@humas_instansi")
```

> **Penting:** Anda tidak login menggunakan username/password Instagram di dialog otorisasi, melainkan login menggunakan **Akun Facebook** yang bertindak sebagai Admin dari Halaman Facebook penampung Instagram tersebut.

---

## 2. Tiga Syarat Wajib Sebelum Menghubungkan

1. **Akun Instagram Wajib "Profesional / Bisnis"**:
   Buka aplikasi Instagram di ponsel &rarr; **Pengaturan dan Privasi** &rarr; **Jenis dan alat akun** &rarr; **Beralih ke akun profesional** &rarr; pilih tipe **Bisnis** *(Gratis)*.
2. **Instagram Ditautkan ke Halaman Facebook (Facebook Page)**:
   Di profil Instagram, klik **Edit Profil** &rarr; **Halaman** (*Page*) &rarr; hubungkan atau buat Halaman Facebook instansi.
3. **Akun Facebook Berstatus Admin**:
   Akun Facebook yang digunakan login memiliki **Akses Penuh / Admin** pada Halaman Facebook tersebut.

---

## 3. Konfigurasi 1x di Meta for Developers & Izin (OAuth Scopes)

1. Buka [developers.facebook.com](https://developers.facebook.com/) dan buat/buka aplikasi bertipe **Business**.
2. Salin **App ID** dan **App Secret** ke `.env` SPARC (`META_APP_ID` & `META_APP_SECRET`) atau melalui halaman **Pengaturan &rarr; Integrasi** di SPARC.
3. Pada **Facebook Login for Business &rarr; Pengaturan**, tambahkan **URI Pengalihan OAuth yang Valid**:
   ```text
   http://localhost:8000/settings/instagram/oauth/callback
   ```
   *(Sesuaikan dengan domain HTTPS produksi apabila sudah diunggah ke server).*
4. **Daftar 6 Scope OAuth Maksimal di SPARC v3**:
   Di halaman `/settings`, Administrator dapat mengatur cakupan izin (*Smart Scope Selector*) sebelum klik **Hubungkan dengan Facebook**:
   - `instagram_basic` — Membaca profil (`@username`, bio, foto profil, pengikut) dan daftar media.
   - `pages_show_list` — Menemukan Facebook Page yang menautkan akun Instagram Bisnis.
   - `pages_read_engagement` — Membaca metrik interaksi dasar pada Page & IG.
   - `instagram_manage_insights` — Menarik metrik murni (`reach`, `views`, `saved`, `shares`), wawasan akun 28 hari, dan distribusi jam audiens aktif (`online_followers`).
   - `instagram_content_publish` — Mengaktifkan **Direct Publish** & **Auto-Publish Terjadwal** langsung dari SPARC ke Instagram.
   - `instagram_manage_comments` — Menarik komentar masyarakat, mengirim balasan resmi, menyembunyikan komentar spam (`hide`), dan menghapus komentar.

---

## 4. Empat Pilar Kapabilitas Instagram di SPARC v3

### A. Analitik Murni, Wawasan Akun 28 Hari & Jam Tayang Terbaik (WIB)
- **Unifikasi Lintas Modul**: Begitu postingan Instagram disinkronkan atau dipublikasikan, datanya otomatis menyatu ke **Dashboard** (`/dashboard`), **Content Plan** (`/content`), **Publishing** (`/publishing`), **Laporan Performa** (`/report`), dan **Visual Grid** (`/grid`).
- **Metrik Murni (`NULL !== 0`)**: SPARC menarik `reach`, `views`, `likes`, `comments`, `shares`, dan `saves` secara murni menggunakan *Concurrent Batch Request* (`Http::batch`) tanpa rumus estimasi buatan.
- **Rekomendasi Jam Tayang Terbaik (WIB)**: SPARC mengonversi data `online_followers` Meta (zona waktu `UTC-8` Pasifik) menjadi **Top 3 Jam Aktif Audiens dalam WIB (`UTC+7`)**, dan menampilkannya di Dashboard, Laporan, Visual Grid, serta pemilih jadwal Auto-Publish.

### B. Direct Publishing & Auto-Publish Terjadwal (`/publishing`)
Pada kartu publikasi berkanal **Instagram** yang seluruh *Pre-Publish Checklist*-nya telah tercentang **100%**, klik tombol **"Publish / Jadwalkan ke IG"**:
- **Format yang Didukung**:
  - `Feed Foto (IMAGE)` — 1 gambar rasio `1:1` atau `4:5`.
  - `Carousel (CAROUSEL)` — 2 hingga 10 slide foto/video.
  - `Reels (REELS)` — Video vertikal `9:16` lengkap dengan opsi `share_to_feed` dan cover URL.
- **Sumber Media Hybrid**:
  - **Reels Video Lokal (Bekerja di `localhost` & Server Publik)**: Menggunakan protokol **Meta Resumable Binary Upload** (`rupload.facebook.com`), sehingga file `.mp4`/`.mov` dari komputer dapat langsung dikirim ke server Meta meskipun SPARC dijalankan di `localhost`.
  - **Tautan Media HTTPS Publik**: Tempel URL publik langsung ke file `.jpg`/`.mp4` (wajib untuk Foto/Carousel apabila server SPARC masih berjalan di `localhost` tanpa tunnel publik).
- **Mode Eksekusi**:
  - **Publish Sekarang ke IG**: Langsung menerbitkan detik itu juga dan mencatat *permalink* resmi ke laporan.
  - **Aktifkan Auto-Publish Terjadwal**: Masuk ke tabel antrean `instagram_schedules` dan diterbitkan otomatis tepat saat `scheduled_at` tiba.

### C. Kotak Masuk & Moderasi Komentar Publik (`/instagram/comments`)
- Pantau seluruh komentar masyarakat pada menu sidebar **IG Comments** (dilengkapi lencana jumlah komentar yang belum dibalas) maupun langsung dari tab **Komentar IG** di dalam panel detail konten.
- **Tindakan Resmi**:
  - **Balas (`Reply`)**: Mengirim balasan publik resmi atas nama akun instansi (tersedia tombol *Quick Template* HUMAS).
  - **Sembunyikan / Tampilkan (`Hide / Unhide`)**: Menyembunyikan komentar spam/kurang pantas dari publik tanpa menghapus jejak audit.
  - **Hapus Permanen (`Delete`)**: Menghapus komentar dari server Instagram.
  - **Jadikan Ide Konten**: Mengubah pertanyaan/aspirasi audiens menjadi kartu rencana konten baru berstatus `inbox` di Content Plan dalam 1 klik.

### D. Hybrid Visual Grid 3x3 (`/grid`)
- **Header Profil Asli**: Menampilkan foto profil, `@username`, nama resmi, bio, tautan situs, jumlah kiriman, dan jumlah pengikut asli dari Meta Graph API.
- **Zona Atas (Rencana & Draft Visual)**: Kartu rencana konten Instagram yang belum tayang dan slot draft kustom yang dapat digeser (*drag-and-drop*) secara persisten di database (`PATCH /grid/reorder`).
- **Zona Bawah (Feed Instagram Aktif)**: Menampilkan postingan riil yang telah tayang di akun Instagram menggunakan *thumbnail/media URL* asli dan terkunci sesuai urutan kronologis Instagram.

---

## 5. Penjadwalan Latar Belakang (Scheduler) & Perpanjangan Token Otomatis

SPARC dilengkapi 3 perintah Artisan terjadwal (didaftarkan di `routes/console.php`) sekaligus mekanisme *fallback* ringan tanpa blokir (`afterResponse`) saat aplikasi diakses di browser:

| Perintah Artisan | Jadwal Otomatis | Fungsi |
|---|---|---|
| `php artisan instagram:process-scheduled` | Setiap menit | Mengeksekusi antrean **Auto-Publish Terjadwal** yang sudah jatuh tempo serta menyelesaikan container video Reels yang sedang diproses Meta. |
| `php artisan instagram:sync-metrics` | Setiap 30 menit | Menyinkronkan postingan terbaru, metrik batch murni, profil bisnis, wawasan 28 hari, dan komentar publik terbaru. |
| `php artisan instagram:refresh-token` | Setiap hari (02:00 WIB) | Memeriksa masa berlaku *Long-Lived Token* (60 hari) dan memperpanjangnya secara otomatis apabila sisa masa aktif `< 14` hari. |

Untuk menjalankan penjadwal secara terus-menerus di lingkungan pengembangan lokal, jalankan:
```bash
php artisan schedule:work
```
Pada server produksi Linux, tambahkan 1 baris cron standar Laravel:
```cron
* * * * * cd /path-ke-sparc && php artisan schedule:run >> /dev/null 2>&1
```

---

## 6. Telemetri Kuota & Diagnostik (`/settings`)

Pada halaman **Pengaturan &rarr; Integrasi**, Administrator dapat memantau secara langsung:
- **Kapabilitas Token Aktif (`/me/permissions`)**: Indikator hijau untuk *Profil & Media*, *Insights 28h*, *Direct Publish*, dan *Moderasi Komentar*.
- **Meteran Kuota Meta Graph API (`X-App-Usage`)**: Persentase pemakaian *Call*, *CPU*, dan *Total Time* agar selalu aman di bawah batas *rate-limit* Meta.
- **Riwayat Log Meta Graph API**: Catatan waktu, titik pemicu, dan status keberhasilan 10 aktivitas sinkronisasi/publikasi terakhir.
