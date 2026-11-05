# PRODUCT REQUIREMENTS DOCUMENT (PRD)
## SPARC — Social Media Planner, Analytics & Report Content

| Atribut Dokumen | Detail Spesifikasi |
| :--- | :--- |
| **Nama Produk** | SPARC (Social Media Planner, Analytics & Report Content) |
| **Versi & Tanggal Dokumen** | Versi 1.0 — 27 Oktober 2026 |
| **Referensi Desain Kerja** | Trello (Kanban Board), Notion (Database Table), Linear (API Ticketing Intake) |
| **Arsitektur Akses Pengguna** | *Flat Collaborative Workspace* (Tanpa pembatasan *role* berlapis; seluruh anggota tim memiliki akses setara) |
| **Integrasi Eksternal Utama** | REST API Aplikasi Ticketing Pengajuan Tim Komunikasi & Hybrid Social Media Analytics (API + Manual/CSV) |

## 1. Ringkasan Eksekutif & Latar Belakang Produk

**SPARC (Social Media Planner, Analytics & Report Content)** adalah platform manajemen perencanaan, penjadwalan, dan pelaporan konten media sosial terpadu yang dirancang untuk menjembatani alur permintaan konten dari Tim Komunikasi hingga evaluasi performa pasca-tayang. Sebelum adanya SPARC, proses pengajuan permintaan publikasi dari Tim Komunikasi, penyusunan jadwal produksi konten, dan rekapitulasi laporan performa sering kali tersebar di berbagai perangkat terpisah sehingga menyulitkan pelacakan status secara *real-time*.

SPARC menyatukan empat pilar utama operasional media sosial ke dalam satu ruang kerja:
1. **Sinkronisasi Tiket API Otomatis** dari aplikasi pengajuan Tim Komunikasi.
2. **Ruang Kerja Content Plan** bergaya Kanban (seperti Trello) dan Tabel Database (seperti Notion).
3. **Kalender Konten Interaktif** untuk memetakan jadwal tayang harian, mingguan, dan bulanan.
4. **Modul Laporan & Analitik Hibrida** yang mendukung penarikan data otomatis via API maupun input manual/CSV.

### 1.1 Tujuan Utama Produk (Product Objectives)

* **Otomatisasi Alur Pengajuan (Zero-Manual Copy-Paste):** Menghubungkan aplikasi *ticketing* pengajuan Tim Komunikasi langsung ke dalam SPARC melalui API sehingga setiap tiket baru otomatis tercatat sebagai antrean perencanaan konten.
* **Transparansi Progres Produksi:** Menyediakan visibilitas penuh bagi seluruh anggota tim mengenai status setiap konten—mulai dari tahap antrean tiket, penulisan naskah/desain, siap tayang, hingga selesai dipublikasikan.
* **Fleksibilitas Pelaporan Performa (Hybrid Reporting):** Memastikan seluruh konten yang telah tayang dapat diukur efektivitasnya, baik melalui integrasi API platform media sosial maupun melalui pengisian manual atau unggah berkas CSV.
* **Kemudahan Kolaborasi Tanpa Birokrasi Role:** Menerapkan akses setara (tanpa sekat *role/permission* yang mengunci fitur) agar setiap anggota tim sosial media dapat langsung memperbarui jadwal, memindahkan kartu, dan mencatat laporan dengan cepat.

## 2. Arsitektur Alur Kerja Terpadu (End-to-End Workflow)

Alur kerja di dalam SPARC dirancang mengalir secara berkesinambungan dari hulu (tiket pengajuan) ke hilir (laporan analitik) melalui empat tahapan terstruktur:

| Tahapan | Komponen Sistem | Mekanisme & Alur Data |
| :--- | :--- | :--- |
| **Tahap 1: Intake Tiket** | API Bridge & Modul Incoming Requests | Aplikasi *ticketing* Tim Komunikasi mengirim *payload* pengajuan (ID tiket, judul, *brief*, target tanggal, pemohon, dan tautan lampiran) via *endpoint* API SPARC. Tiket tampil di daftar antrean dan mengirim status balikan otomatis ke aplikasi asal. |
| **Tahap 2: Produksi Konten** | Modul Content Planner (Kanban & Tabel) | Tim mengubah tiket menjadi *Content Card* dengan satu klik, lalu melengkapi atribut produksi (Platform, Format, *Content Pillar*, *Caption*, tautan aset desain Canva/Figma/Drive) serta menggeser status pengerjaan di papan Kanban. |
| **Tahap 3: Penjadwalan** | Modul Interactive Content Calendar | Setiap *Content Card* yang telah memiliki tanggal dan jam tayang (*Publish Date*) otomatis muncul pada kalender visual. Perubahan jadwal dapat dilakukan dengan *drag-and-drop* langsung pada tanggal kalender. |
| **Tahap 4: Evaluasi & Report** | Modul Hybrid Analytics & Report | Setelah kartu berstatus *Published*, modul Report merekam metrik performa konten (*Views, Reach, Likes, Comments, Shares, Saves*) baik melalui sinkronisasi API menggunakan tautan postingan maupun input angka manual. |

## 3. Spesifikasi Kebutuhan Fungsional (Functional Requirements)

Seluruh fitur SPARC diorganisasikan ke dalam 5 menu navigasi utama yang dapat diakses langsung oleh seluruh pengguna dari bilah samping (*sidebar*):

### 3.1 Modul 1: Dashboard Operasional

Halaman pembuka yang menyajikan ringkasan beban kerja dan performa konten secara instan dalam satu layar:
* **Empat Kartu KPI Utama (Top Summary Cards):** Menampilkan jumlah *API Requests Pending* (tiket baru dari Tim Komunikasi yang belum dikonversi), *Content In Production* (konten yang sedang dikerjakan), *Scheduled This Week* (konten siap tayang minggu ini), dan *Total Engagement* bulan berjalan.
* **Panel Antrean Prioritas Harian:** Daftar konten yang terjadwal tayang hari ini dan besok, dilengkapi penanda peringatan untuk tiket yang mendekati tenggat waktu (*deadline*).
* **Ringkasan Tren Performa & Distribusi Platform:** Grafik ringkas yang memperlihatkan proporsi konten berdasarkan platform (Instagram, TikTok, YouTube, X/LinkedIn) dan tren pertumbuhan interaksi mingguan.

### 3.2 Modul 2: Incoming Requests (Integrasi API Tim Komunikasi)

Gerbang khusus yang menampung seluruh pengajuan publikasi yang dikirimkan dari aplikasi *ticketing* Tim Komunikasi:
* **Tabel Antrean Tiket API:** Menampilkan Nomor Referensi Tiket (contoh: `#API-204`), Judul Pengajuan, Nama/Divisi Pemohon dari Tim Komunikasi, Tanggal Permintaan Tayang, Waktu Masuk, dan Status Sinkronisasi.
* **Panel Detail Brief & Lampiran:** Menampilkan rincian pesan pengajuan, dokumen pendukung, atau foto kegiatan yang dilampirkan oleh Tim Komunikasi pada aplikasi *ticketing*.
* **Konversi Satu Klik (Convert to Content Plan):** Tombol aksi untuk mengubah satu tiket menjadi satu atau beberapa kartu konten (misalnya 1 tiket acara diubah menjadi 1 konten Instagram Reels dan 1 konten Instagram Carousel) dengan tetap menyimpan relasi `ticket_id`.
* **Sinkronisasi Status Dua Arah (Two-Way Status Sync):** Saat status kartu konten berubah di SPARC (misalnya menjadi *In Progress* atau *Published* beserta URL tayang), SPARC otomatis mengirim *webhook* ke aplikasi *ticketing* agar Tim Komunikasi mengetahui progresnya.

### 3.3 Modul 3: Content Planner Workspace (Kanban Board & Table View)

Ruang kerja utama tim sosial media yang mengadaptasi kemudahan visual Trello dan struktur data Notion:
* **Dual View Switcher (Kanban & Tabel):** Pengguna dapat berpindah tampilan antara *Kanban Board* (berdasarkan kolom status pengerjaan) dan *Table Database View* (untuk penyortiran, pengelompokan, dan pengeditan massal).
* **Lima Kolom Status Standar:**
  1. **Inbox Request:** Tiket yang baru dikonversi dari API dan menunggu pembagian tugas.
  2. **To Do (Ideation & Brief):** Konten yang sudah masuk jadwal perencanaan dan siap dibuatkan naskah/konsep.
  3. **In Progress (Design & Copy):** Tahap pembuatan visual/video dan penulisan *caption*.
  4. **Ready to Publish:** Konten yang aset visual dan *caption*-nya sudah final serta siap dijadwalkan/diunggah.
  5. **Published:** Konten yang sudah tayang di media sosial dan siap dipantau di modul Report.
* **Atribut Lengkap Kartu Konten (Content Card Attributes):**
  * Judul Konten (`title`)
  * ID Tiket Asal (`ticket_id` — terisi otomatis jika berasal dari API)
  * Platform Tujuan (`Instagram`, `TikTok`, `YouTube`, `Facebook`, `X`, `LinkedIn`)
  * Format Konten (`Reels/Shorts`, `Carousel`, `Single Image`, `Story`, `Video Long-form`)
  * Label *Content Pillar* (`Edukasi`, `Promosi`, `Event`, `Pengumuman`, `Hiburan`)
  * PIC / Pembuat Konten (`pic_name`)
  * Tanggal & Jam Tayang (`publish_datetime`)
  * Draft *Caption & Hashtags* (`caption_text`)
  * Tautan Aset Produksi (`asset_url` — Google Drive / Figma / Canva)
  * Tautan Postingan Tayang (`published_url`)
  * Kolom Catatan & Diskusi Tim (`notes`)

### 3.4 Modul 4: Interactive Content Calendar

Kalender visual untuk memantau kepadatan distribusi konten dan mencegah tabrakan jadwal tayang:
* **Tampilan Bulanan & Mingguan:** Memetakan seluruh konten berdasarkan tanggal dan jam tayang dengan kode warna sesuai *Content Pillar* atau ikon platform media sosial.
* **Penjadwalan Drag-and-Drop:** Memungkinkan pengguna menggeser kartu konten dari satu tanggal ke tanggal lain secara langsung di atas kalender jika terjadi perubahan jadwal mendadak.
* **Filter Cepat Multi-Dimensi:** Menyaring tampilan kalender berdasarkan Platform tertentu, Status Kesiapan (misalnya hanya menampilkan konten yang sudah *Ready to Publish*), atau asal tiket API.

### 3.5 Modul 5: Hybrid Analytics & Performance Report

Modul pemantauan dan evaluasi konten yang sudah berstatus *Published* dengan dukungan pengumpulan data ganda (otomatis dan manual):
* **Metode Pengambilan Data Hibrida:**
  * **Mode Sinkronisasi API Otomatis:** Menarik data performa berkala dari API resmi platform (seperti Instagram Graph API, TikTok Display API, YouTube Data API) berdasarkan *Post ID* atau *Published URL* yang tercantum pada kartu konten.
  * **Mode Input Manual & Impor CSV:** Menyediakan form input cepat langsung pada baris laporan serta fitur unggah berkas CSV/Excel bagi platform atau akun yang belum dihubungkan ke API otomatis.
* **Metrik Standar yang Dipantau:** Mencakup *Views / Plays*, *Reach / Impressions*, *Likes*, *Comments*, *Shares*, *Saves*, serta kalkulasi otomatis *Total Interactions* dan *Engagement Rate (%)*.
* **Analisis Komparatif & Ekspor Laporan:** Menampilkan peringkat konten terbaik (*Top Performing Content*), perbandingan rata-rata interaksi antar *Content Pillar*, serta fitur unduh laporan dalam format PDF dan Excel/CSV untuk pelaporan berkala.

## 4. Sistem Desain Antarmuka (UI/UX Guidelines & Brand Identity)

Desain visual SPARC dibangun menggunakan pendekatan *clean light workspace* agar nyaman digunakan dalam durasi kerja panjang, dengan mengadopsi empat warna identitas dari logo resmi SPARC sebagai penanda semantik di seluruh komponen antarmuka:

| Token Warna Brand | Kode Hex | Fungsi Semantik pada Antarmuka SPARC |
| :--- | :--- | :--- |
| **SPARC Royal Blue** | `#1546D8` | Warna aksen utama untuk menu navigasi aktif pada *sidebar*, tombol tindakan primer (*Create Content / Sync API*), dan penanda tiket masuk dari API. |
| **SPARC Emerald Green** | `#00A870` | Penanda status selesai (*Ready to Publish / Published*), indikator pertumbuhan metrik analitik positif, serta label *Content Pillar* Edukasi. |
| **SPARC Crimson Red** | `#D61F45` | Penanda tiket prioritas mendesak (*High Priority Request*), peringatan tenggat waktu dekat (*Overdue Alert*), serta label kampanye utama. |
| **SPARC Golden Spark** | `#F59E0B` | Penanda status konten yang sedang dikerjakan (*In Progress Design/Copy*), antrean *review*, dan penanda sorotan jadwal tayang hari ini. |

### 4.1 Tata Letak Ruang Kerja Utama (Unified Workspace Layout)

* **Bilah Samping Kiri (Left Sidebar Navigation):** Menampilkan logo SPARC di sudut kiri atas diikuti 5 menu utama (*Dashboard, Incoming Requests API, Content Planner, Calendar, Analytics & Report*) serta indikator status koneksi API.
* **Area Kerja Tengah (Main Workspace Canvas):** Menampilkan baris kartu KPI di bagian atas dan papan Kanban atau Tabel Database di bagian tengah dengan kartu konten yang memuat kode tiket (`#API-204`), ikon platform, dan label pilar konten.
* **Panel Kontekstual Kanan (Right Utility Panel):** Menyediakan kalender interaktif ringkas untuk mengecek kepadatan tanggal tayang sekaligus grafik mini *Performance Report* tanpa harus berpindah halaman.

## 5. Spesifikasi Teknis Integrasi API & Struktur Database

Karena aplikasi *ticketing* pengajuan Tim Komunikasi sudah tersedia, SPARC menyediakan kontrak REST API yang sederhana dan standar menggunakan autentikasi `API Key / Bearer Token`.

### 5.1 Kontrak Endpoint Integrasi Aplikasi Ticketing

| Method | Endpoint URL | Arah Integrasi | Fungsi & Payload Utama |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/tickets/intake` | Aplikasi Ticketing → SPARC | Menerima tiket baru dari Tim Komunikasi. Payload: `external_ticket_id`, `title`, `requester_name`, `division`, `brief_description`, `target_publish_date`, `attachment_urls[]`. |
| **PUT** | `/api/v1/tickets/{external_id}` | Aplikasi Ticketing → SPARC | Memperbarui isi *brief*, lampiran, atau perubahan tanggal target apabila ada revisi dari Tim Komunikasi pada tiket yang sudah dikirim. |
| **PATCH** | `Webhook Callback URL` | SPARC → Aplikasi Ticketing | Mengirim pembaruan status otomatis ke aplikasi *ticketing* saat kartu konten diproses. Payload: `external_ticket_id`, `sparc_status` (*Received, In Production, Scheduled, Published*), `published_post_url`. |

### 5.2 Contoh Payload JSON (`POST /api/v1/tickets/intake`)

```json
{
  "external_ticket_id": "API-204",
  "title": "Publikasi Peluncuran Program Layanan Digital Baru",
  "requester_name": "Budi Santoso",
  "division": "Tim Komunikasi Internal",
  "brief_description": "Mohon dibuatkan konten pengumuman peluncuran fitur baru untuk Instagram Reels dan Carousel.",
  "target_publish_date": "2026-11-05T10:00:00+07:00",
  "attachment_urls": [
    "https://storage.internal/assets/brief-peluncuran.pdf",
    "https://storage.internal/assets/foto-kegiatan.jpg"
  ]
}
```

### 5.3 Skema Tabel Database Inti (Core Data Schema)

| Nama Tabel | Kolom Atribut Utama | Deskripsi & Relasi Data |
| :--- | :--- | :--- |
| `incoming_tickets` | `id`, `external_ticket_id`, `title`, `requester_name`, `division`, `brief`, `target_date`, `attachments_json`, `sync_status`, `created_at` | Menyimpan seluruh data mentah pengajuan dari API aplikasi *ticketing* Tim Komunikasi. Satu tiket dapat direlasikan ke satu atau banyak baris di tabel `content_items`. |
| `content_items` | `id`, `ticket_id` (nullable FK), `title`, `platform`, `format_type`, `pillar_tag`, `status`, `publish_datetime`, `caption_text`, `asset_url`, `published_url`, `pic_name` | Tabel inti untuk *Content Planner* dan *Calendar*. Nilai `ticket_id` berisi referensi jika konten berasal dari tiket Tim Komunikasi, atau bernilai `null` jika dibuat mandiri oleh tim sosmed. |
| `content_metrics` | `id`, `content_id` (FK), `data_source` (`API` / `MANUAL`), `views`, `reach`, `likes`, `comments`, `shares`, `saves`, `engagement_rate`, `recorded_at` | Menyimpan riwayat metrik performa setiap konten yang sudah tayang (*Published*). Mendukung pembaruan nilai baik dari penarikan otomatis API maupun form input manual. |

## 6. Kebutuhan Non-Fungsional & Peta Jalan Implementasi (Roadmap)

### 6.1 Kebutuhan Non-Fungsional (Non-Functional Requirements)

* **Keandalan Sinkronisasi API (API Resilience):** Endpoint penerimaan tiket dilengkapi pencatatan *request log* dan mekanisme *idempotency key* berdasarkan `external_ticket_id` agar pengiriman ulang dari aplikasi *ticketing* tidak menghasilkan duplikasi tiket.
* **Kecepatan Antarmuka (Responsiveness):** Perpindahan tampilan antara *Kanban Board*, *Table View*, dan *Calendar* berlangsung instan di sisi peramban (*client-side state*) tanpa memuat ulang seluruh halaman.
* **Keamanan Akses Ruang Kerja:** Meskipun tidak menerapkan pembagian *role* bertingkat di dalam aplikasi, akses masuk tetap dilindungi autentikasi akun tim internal (*Single Sign-On* atau *Email/Password* tim) serta validasi `API Secret Key` untuk koneksi antar-aplikasi.

### 6.2 Tahapan Pengembangan (Development Roadmap)

| Fase Rilis | Fokus Pengembangan | Deliverables & Fitur Utama |
| :--- | :--- | :--- |
| **Fase 1 (MVP)** | Fondasi Content Planner & Integrasi API Tiket | Autentikasi dasar ruang kerja, Endpoint REST API `/tickets/intake`, halaman *Incoming Requests*, konversi tiket ke *Content Card*, serta *Content Planner* (Kanban Board & Table View). |
| **Fase 2** | Kalender Interaktif, Dashboard & Report Manual/CSV | Kalender visual bulanan/mingguan dengan fitur *drag-and-drop*, halaman *Dashboard Operasional*, modul *Report* dengan input metrik manual & unggah CSV, serta ekspor laporan PDF/Excel. |
| **Fase 3** | Otomatisasi API Media Sosial & Webhook Dua Arah | Integrasi langsung ke Instagram Graph API, TikTok API, dan YouTube Data API untuk penarikan metrik otomatis pada modul *Report*, ditambah pengiriman *webhook* status tayang kembali ke aplikasi *ticketing*. |
