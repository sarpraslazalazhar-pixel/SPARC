# Plan: PRD Lengkap SPARC (terintegrasi HaloAPU)

## Context

Hasil akhir: satu file `C:/Users/IT Dev/Documents/SPARC/SPARC-PRD.md` (Bahasa Indonesia) yang menggantikan draft `Stack awal.md` sebagai PRD final, decision-complete. SPARC = planner/kalender/report konten sosmed tim Humas. Sumber tiket = aplikasi HaloAPU (`C:/Users/IT Dev/Documents/HaloAPU-main`), **hanya** dua jenis tiket unit Humas:
1. Sub-unit **"Editing & Produksi Video"** dengan field `Jenis Video` = `Reels`
2. Sub-unit **"Pengajuan Desain Grafis"** dengan field `Jenis Produksi Desain` = `Feed Instagram / Meme`

Semua tiket HaloAPU lain diabaikan SPARC. Integrasi memakai REST API HaloAPU yang sudah ada — **tanpa mengubah kode HaloAPU**. `Stack awal.md` tidak diedit/dihapus.

## Fakta HaloAPU yang jadi dasar PRD (sudah diverifikasi dari kode)

- Stack HaloAPU: Laravel `^13.8`, PHP `^8.3`, `inertiajs/inertia-laravel ^3.1`, Sanctum `^4.0`, shadcn (`components.json`), sudah jalan di cPanel (`Doc/DEPLOY-cPanel.md`).
- `config/sanctum.php`: `'expiration' => null` → token tidak pernah expire.
- `POST /api/login` body `{email, password, is_admin: true}` → `data.token`. Device lock hanya berlaku jika `device_id` dikirim → SPARC **tidak** mengirim `device_id`.
- `GET /api/tickets` (auth:sanctum): filter hanya `search`, `status` (comma list), `date_from`, `date_to`, `per_page`, `page`. **Tidak ada filter `sub_unit_id`.** Admin di-scope `Ticket::scopeAccessibleBy` (koordinator → semua tiket `unit_id` miliknya). Response `data[]` dari `formatTicket()`: `id` (format `XXX-XXX-XXX`), `title`, `description` (JSON string map **label → nilai** form_data), `category` (= `sub_units.nama_layanan`), `status`, `createdAt`, `requesterName`, `assignedTo`; plus `meta.{current_page,last_page,per_page,total}`.
- `GET /api/tickets/{id}`: tambahan `formFields`, `formData` (key = form_field DB id), `attachments[]` `{id, fieldId, fileName, mimeType, fileSize, path, url}`, `logs`.
- `POST /api/tickets/{id}/status` (admin only, harus `isAccessibleBy`): body `{status: in open,on_proses,solve,reject,dibatalkan,pending; catatan?: max 1000}`. Status sama → `422 "Status sudah ..."`. Tidak ada validasi transisi di API. Memicu notifikasi ke pemohon.
- Status HaloAPU: `open, on_proses, pending, need_revision, solve, reject, dibatalkan`. Setelah `solve`, pemohon bisa accept atau minta revisi (`need_revision`).
- Form field label (seeder): Video → `Judul/Tema Video`, `Durasi Estimasi`, `Ukuran Video`, `Deadline Tayang` (YYYY-MM-DD), `Link Referensi`, `Jenis Video`, `Brief Video`, `Brief Dokumen / Referensi`, `Keterangan Tambahan`. Desain → `Jenis Desain`, `Ukuran (px/cm)`, `Jenis Produksi Desain`, `Tujuan Penggunaan`, `Brief Materi`, `Brief Dokumen`, `Jumlah Produksi`, `Distribusi`, `Deadline` (YYYY-MM-DD), `Keterangan Tambahan`.

## Approach

### Langkah 1 — Tulis `SPARC-PRD.md` dengan struktur bagian berikut (urut)

Salin prosa fungsional dari `Stack awal.md` bila bagian berkata "pertahankan"; semua keputusan di bawah wajib tertulis eksplisit di PRD.

#### 1. Header & Ringkasan Eksekutif
- Tabel atribut dokumen: Nama, Versi `2.0 — 27 Oktober 2026`, Referensi desain (Trello/Notion), Akses `Single workspace, flat access`, Integrasi utama `HaloAPU (Humas: Video Reels & Desain Feed Instagram/Meme)` + `Analytics hibrida (manual/CSV, API sosmed Fase 3)`, Stack `Laravel 13 + Inertia + React + MySQL`, Deploy `cPanel shared hosting`.
- Ringkasan & tujuan produk: pertahankan draft §1/§1.1, ganti semua "aplikasi ticketing Tim Komunikasi" → "HaloAPU (unit Humas)".

#### 2. Alur Kerja End-to-End
Tabel 4 tahap dari draft §2, Tahap 1 diganti: "SPARC menarik tiket HaloAPU tiap 15 menit; hanya Reels & Feed Instagram/Meme yang masuk antrean Incoming Requests". Tambah diagram mermaid:
`HaloAPU tiket → SPARC sync → Incoming → Convert → Kanban → Calendar → Published → status solve ke HaloAPU → Report`.

#### 3. Arsitektur Teknis & Constraint cPanel
- Stack: Laravel 13 / PHP 8.3 (sama dengan HaloAPU, hosting sudah terbukti mendukung), Inertia.js + React 19 + TypeScript, Tailwind CSS 4 + shadcn/ui + `lucide-react` (sama dengan HaloAPU `package.json`), MySQL 8, Vite. Scaffold: `laravel new sparc --react` (starter kit React resmi; sudah berisi auth, Inertia, shadcn). Registrasi publik dimatikan setelah scaffold (route `register` dihapus, diganti alur undangan).
- Constraint cPanel (tulis persis):
  1. Queue driver `database`; cron cPanel `* * * * * cd ~/sparc && php artisan schedule:run >> /dev/null 2>&1`; scheduler memanggil `queue:work --stop-when-empty` tiap menit.
  2. Tanpa WebSocket: frontend polling 30 detik ke `GET /poll/updates?since=<ISO8601>`.
  3. Session/cache driver `file`. Storage `public` disk lokal hanya untuk avatar & file PDF export.
  4. Deploy: subdomain terpisah (mis. `sparc.<domain>`), Git pull manual.
- HTTP client ke HaloAPU: Laravel `Http` facade, timeout 15 detik, header `Authorization: Bearer {HALOAPU_API_TOKEN}`, `Accept: application/json`.

#### 4. Integrasi HaloAPU (bagian baru, inti update)
- **Akun integrasi:** Admin HaloAPU baru `sparc-bot` dibuat lewat panel admin HaloAPU, role **Koordinator**, unit **Humas**. Alasan: `scopeAccessibleBy` + `isAccessibleBy` memberi akses list & ubah status semua tiket unit Humas. Tidak perlu ubah kode HaloAPU.
- **Token:** diambil sekali: `curl -X POST {HALOAPU_API_URL}/login -H "Accept: application/json" -d "email=...&password=...&is_admin=1"` → simpan `data.token` ke `.env` SPARC `HALOAPU_API_TOKEN`. Token tidak expire (`sanctum.expiration = null`). Env lain: `HALOAPU_API_URL` (contoh `https://haloapu.example/api`), `HALOAPU_WEB_URL` (contoh `https://haloapu.example`). Jika API balas 401: sync berhenti, tulis `haloapu_sync_logs` status `failed`, notifikasi in-app "Token HaloAPU tidak valid — perbarui HALOAPU_API_TOKEN". Tidak ada auto-relogin.
- **Command `haloapu:sync`** (scheduler `everyFifteenMinutes()`, `withoutOverlapping()`; juga dipicu tombol "Sync Now" via queue job):
  1. Loop `GET /tickets?status=open,on_proses,pending,need_revision&per_page=100&page=N` sampai `meta.last_page`.
  2. Filter: `category === "Editing & Produksi Video"` dan `json_decode(description)["Jenis Video"] === "Reels"` → `source_type = video_reels`; `category === "Pengajuan Desain Grafis"` dan `["Jenis Produksi Desain"] === "Feed Instagram / Meme"` → `source_type = desain_feed`. Selain itu dilewati. Perbandingan string persis (trim).
  3. Untuk tiket lolos filter yang baru atau `content_hash` berubah (`sha256(description . status)`): `GET /tickets/{id}` untuk ambil `attachments`, lalu upsert `incoming_tickets` by `haloapu_ticket_id` (id 9 digit tanpa tanda `-`).
  4. Tiket SPARC yang `haloapu_status` masih aktif tapi tidak muncul di list (sudah `solve`/`reject`/`dibatalkan`): `GET /tickets/{id}` untuk refresh `haloapu_status`. Jika `reject`/`dibatalkan` → notifikasi "Tiket {id} dibatalkan/ditolak di HaloAPU" dan badge merah di card terkait; card tidak diubah.
  5. Jika tiket berstatus `converted` berubah isi → insert `ticket_update_logs` (diff per label) + notifikasi + badge "Brief HaloAPU diperbarui" di card. Card tidak diubah otomatis.
  6. `haloapu_status` berubah ke `need_revision` → notifikasi "Pemohon minta revisi tiket {id}" + badge kuning di card.
  7. Error jaringan/5xx: log `failed`, coba lagi siklus berikutnya. Tidak ada retry dalam siklus.
- **Mapping field → `incoming_tickets`:**
  | Kolom SPARC | video_reels | desain_feed |
  |---|---|---|
  | `title` | `Judul/Tema Video` | `"Feed IG/Meme — " + Str::limit(Brief Materi, 80)` |
  | `brief` | `Brief Video` | `Brief Materi` + "\n\nTujuan: " + `Tujuan Penggunaan` |
  | `target_date` | `Deadline Tayang` | `Deadline` |
  | `requester_name` | list `requesterName` | sama |
  | `form_snapshot` | seluruh map label→nilai (`description`) | sama |
  | `attachments_json` | `attachments[]` → `[{fileName, url}]` | sama |
- **Callback status SPARC → HaloAPU** (queue job `PushHaloApuStatus`, `tries = 3`, `backoff = [60, 300, 900]` detik karena queue jalan per menit via cron):
  - Card pertama dari tiket masuk `in_progress` dan `haloapu_status ∈ {open, pending}` → `POST /tickets/{id}/status` `{"status":"on_proses","catatan":"Sedang diproduksi tim sosmed (SPARC)."}`.
  - **Semua** card dari tiket berstatus `published` dan masing-masing punya `published_url` → `POST /tickets/{id}/status` `{"status":"solve","catatan":"Konten sudah tayang:\n- {platform}: {published_url}\n..."}` (potong ke 1000 karakter). Satu panggilan; tidak memakai endpoint `/reply` (ditolak untuk tiket selesai dan redundan karena `catatan` sudah dikirim ke pemohon).
  - Card dipindah mundur dari `published`: tidak ada callback (HaloAPU tidak punya status balik dari `solve` via admin API yang bermakna); tulis catatan di PRD.
  - Respons `422 "Status sudah ..."` dianggap sukses. Gagal setelah 3 percobaan → `haloapu_sync_logs` `failed` + notifikasi + ikon peringatan di card + tombol "Kirim ulang".
- **Ruang lingkup:** tiket HaloAPU jenis lain tidak pernah disimpan; card tanpa tiket tetap bisa dibuat manual di SPARC.

#### 5. Autentikasi & User
Pertahankan: email+password, closed registration via undangan (`invitations`), flat access tanpa role, timezone default `Asia/Jakarta`. User SPARC terpisah dari user HaloAPU (tanpa SSO).

#### 6. Modul Fungsional
- **Dashboard:** 4 KPI (`HaloAPU Requests Pending` = `incoming_tickets.sync_status='pending'`; Content In Production = status `inbox,todo,in_progress`; Scheduled This Week = `ready_to_publish` minggu ini; Total Engagement bulan berjalan = SUM likes+comments+shares+saves). Panel prioritas hari ini/besok, badge merah lewat jadwal. Chart.js (npm `chart.js` + `react-chartjs-2`) pie platform & line engagement mingguan. Tambah widget "Status Sinkron HaloAPU" (waktu sync terakhir sukses, jumlah gagal 24 jam).
- **Incoming Requests:** tabel kolom ID (`XXX-XXX-XXX`), Jenis (`Reels` / `Feed IG/Meme`), Judul, Pemohon, Deadline, Status HaloAPU, Status SPARC (`pending|converted|ignored`). Filter tab Jenis. Slide-over detail: render `form_snapshot` label:nilai, lampiran sebagai link `url` buka tab baru (file di `storage/` publik HaloAPU; tidak ada proxy), tombol "Buka di HaloAPU" → `{HALOAPU_WEB_URL}/admin/tiket/{haloapu_ticket_id}` (route `admin.tiket.show`, butuh login admin HaloAPU). Aksi:
  - **Convert:** modal, jumlah card 1–5. Default per jenis: video_reels → platform `instagram`, format `reels_shorts`; desain_feed → platform `instagram`, format `single_image`. Title & `publish_datetime` (= `target_date` jam 09:00 WIB; kosong jika `target_date` null) terisi otomatis, bisa diedit sebelum simpan. Hasil: N `content_items` dengan `incoming_ticket_id`, tiket → `converted`. Tiket `converted` tidak bisa di-convert ulang; card tambahan dibuat manual dengan memilih tiket di form card.
  - **Ignore / Undo ignore.**
- **Content Planner, Calendar, Report, Notifikasi, Soft Delete/Trash:** pertahankan keputusan berikut:
  - Kanban 5 kolom (`inbox, todo, in_progress, ready_to_publish, published`), drag bebas termasuk mundur (`@dnd-kit/core`), audit `content_status_logs`. Table view sortable, inline edit, bulk status. Search `LIKE` di title/caption/pic/ID tiket + filter platform/format/pillar/status/PIC/rentang tanggal, state di query string. Card menampilkan badge jenis HaloAPU (Reels/Feed IG) dan ID tiket.
  - Calendar FullCalendar month/week, warna per pillar (Edukasi `#1546D8`, Promosi `#D61F45`, Event `#F59E0B`, Pengumuman `#00A870`, Hiburan `#8B5CF6`), drag reschedule dengan dialog konfirmasi, warning (tidak blok) jika ≥2 konten platform sama dalam ±1 jam.
  - Report: hanya `published`; input manual, CSV template (`published_url,views,reach,likes,comments,shares,saves`, match by `published_url`, baris tak cocok di-skip + warning, angka integer ≥0), ER = `(likes+comments+shares+saves)/reach×100`, reach 0 → "-". Metrik append (riwayat), nilai tampil = record `recorded_at` terbaru. Export PDF (`barryvdh/laravel-dompdf`, sama dengan HaloAPU) & Excel (`maatwebsite/excel`). Sync API sosmed = tombol manual, Fase 3.
  - Notifikasi in-app (Laravel database notifications, bell + polling 30 dtk). Trigger: tiket baru lolos filter, brief berubah, `need_revision`, reject/dibatalkan, konten tayang besok (scheduler 08:00 WIB), callback HaloAPU gagal, token 401.
  - Soft delete semua entitas utama, halaman Trash, purge harian > 30 hari.

#### 7. Skema Database
Tulis tabel penuh (tipe, null, default, index) di PRD. Semua tabel `id` BIGINT UNSIGNED PK, `created_at`/`updated_at`.
- `incoming_tickets`: `id`, `haloapu_ticket_id` BIGINT UNSIGNED UNIQUE, `source_type` ENUM(`video_reels`,`desain_feed`), `title` VARCHAR(500), `brief` TEXT, `requester_name` VARCHAR(255), `target_date` DATE NULL, `haloapu_status` VARCHAR(30), `form_snapshot` JSON, `attachments_json` JSON NULL, `content_hash` CHAR(64), `sync_status` ENUM(`pending`,`converted`,`ignored`) DEFAULT `pending`, `last_synced_at` TIMESTAMP, timestamps, `deleted_at`. Index `sync_status`, `source_type`.
- `ticket_update_logs`: `id`, `incoming_ticket_id` FK, `changed_fields` JSON `{label:{old,new}}`, `seen_at` TIMESTAMP NULL, timestamps.
- `haloapu_sync_logs` (ganti `webhook_logs` + `api_request_logs`): `id`, `direction` ENUM(`pull`,`push`), `incoming_ticket_id` FK NULL, `endpoint` VARCHAR(255), `request_body` JSON NULL, `response_status` SMALLINT NULL, `response_body` TEXT NULL, `status` ENUM(`success`,`failed`), `attempt` TINYINT DEFAULT 1, timestamps. Index (`direction`,`status`,`created_at`).
- `users`: `name`, `email` UNIQUE, `password`, `avatar_path` NULL, `timezone` DEFAULT `Asia/Jakarta`, `remember_token`, `deleted_at`.
- `invitations`: `email`, `token` CHAR(64) UNIQUE, `invited_by` FK users, `expires_at` (7 hari), `accepted_at` NULL.
- `content_items`: `incoming_ticket_id` FK NULL (`nullOnDelete`), `title` VARCHAR(255), `caption` TEXT NULL, `platform` ENUM(`instagram`,`tiktok`,`youtube`,`facebook`,`x`), `format` ENUM(`single_image`,`carousel`,`reels_shorts`,`story`,`long_video`), `pillar` ENUM(`edukasi`,`promosi`,`event`,`pengumuman`,`hiburan`) NULL, `status` ENUM(`inbox`,`todo`,`in_progress`,`ready_to_publish`,`published`) DEFAULT `inbox`, `pic_user_id` FK users NULL, `publish_datetime` DATETIME NULL, `published_url` VARCHAR(500) NULL, `asset_links` JSON NULL (`[{label,url}]`), `haloapu_push_failed` BOOLEAN DEFAULT false, `position` INT (urutan kanban), `deleted_at`. Index (`status`,`position`), `publish_datetime`, `platform`, FULLTEXT tidak dipakai (search `LIKE`).
- `content_status_logs`: `content_item_id` FK, `user_id` FK, `from_status` NULL, `to_status`.
- `content_metrics`: `content_item_id` FK, `views`, `reach`, `likes`, `comments`, `shares`, `saves` (INT UNSIGNED DEFAULT 0), `source` ENUM(`manual`,`csv`,`api`), `recorded_by` FK users NULL, `recorded_at` DATETIME. Index (`content_item_id`,`recorded_at`).
- Bawaan Laravel: `notifications`, `jobs`, `job_batches`, `failed_jobs`, `cache`, `cache_locks`, `sessions`, `password_reset_tokens` (session/cache driver tetap `file`; tabelnya dibiarkan dari migrasi default).
- Tidak ada di PRD: `external_ticket_id`, endpoint intake, `X-API-Key`, `TICKETING_*` env, `webhook_logs`, `api_request_logs`.

#### 8. Endpoint
- Tidak ada endpoint publik masuk. Halaman via Inertia routes. JSON internal (session auth): `GET /poll/updates?since=`, `GET /notifications/unread-count`, `POST /haloapu/sync` (dispatch job, throttle 1/menit), `POST /content/{id}/haloapu-retry`.
- Tabel endpoint HaloAPU yang dikonsumsi: `POST /api/login` (sekali), `GET /api/tickets`, `GET /api/tickets/{id}`, `POST /api/tickets/{id}/status`.

#### 9. UI/UX
Pertahankan brand color & layout draft §4/§4.1 (menu "Incoming Requests API" → "Incoming HaloAPU"; indikator sidebar = status sync terakhir hijau/kuning/merah). Komponen shadcn/ui, ikon `lucide-react`, font Inter, light mode saja. Responsive: <768px sidebar hamburger, Kanban 1 kolom scroll horizontal, kalender default week; 768–1024px sidebar ikon; >1280px panel kanan.

#### 10. Roadmap
- **Fase 1 (MVP):** setup, auth+undangan, migrasi, akun `sparc-bot` + `haloapu:sync` + Incoming HaloAPU + Convert/Ignore, Content Planner (Kanban+Table+search/filter), Trash, polling, deploy.
- **Fase 2:** callback status ke HaloAPU (`on_proses`/`solve`) + retry, Calendar, Dashboard, Report manual/CSV, export, notifikasi.
- **Fase 3:** API Instagram/TikTok/YouTube (sync manual), halaman Settings (status token HaloAPU, log sync), analisis per pillar.

#### 11. Kebutuhan Non-Fungsional
Idempotensi via `haloapu_ticket_id` UNIQUE; sync `withoutOverlapping`; token HaloAPU hanya di `.env` (tidak pernah dikirim ke frontend); semua panggilan HaloAPU tercatat di `haloapu_sync_logs`; log dihapus > 90 hari (scheduler harian).

## Critical Files & Anchors

| File | Alasan |
|---|---|
| `Stack awal.md` | Sumber prosa draft yang dipertahankan |
| `HaloAPU-main/app/Http/Controllers/Api/TicketController.php` `index` (24), `changeStatus` (720), `formatTicket` (814) | Kontrak payload yang dikonsumsi SPARC |
| `HaloAPU-main/app/Models/Ticket.php` `scopeAccessibleBy`/`isAccessibleBy` (217–268) | Dasar role Koordinator untuk `sparc-bot` |
| `HaloAPU-main/database/seeders/FormFieldSeeder.php` | Label field & nilai opsi persis untuk filter |
| `HaloAPU-main/app/Http/Controllers/Api/AuthController.php` `login` (24) | Login admin tanpa `device_id` |

## Verification

1. `SPARC-PRD.md` ada di `C:/Users/IT Dev/Documents/SPARC/` dan memuat 11 bagian di atas berurutan.
2. `grep -n "external_ticket_id\|X-API-Key\|TICKETING_\|/tickets/intake\|webhook_logs" SPARC-PRD.md` → 0 hasil.
3. `grep -n "TODO\|TBD\|unverified" SPARC-PRD.md` → 0 hasil.
4. Cek string filter persis ada: `"Editing & Produksi Video"`, `"Reels"`, `"Pengajuan Desain Grafis"`, `"Feed Instagram / Meme"`, `"Jenis Video"`, `"Jenis Produksi Desain"`.
5. Contoh skenario tertulis di PRD dan konsisten: tiket video `Jenis Video = Motion Graphic` → tidak masuk SPARC; tiket desain `Feed Instagram / Meme` dengan 2 card, satu `published` → HaloAPU tetap `on_proses`; kedua `published` → satu panggilan `solve` berisi 2 URL.

## Assumptions & Contingencies

- Akun HaloAPU `sparc-bot` boleh dibuat dengan role Koordinator unit Humas. Jika admin HaloAPU menolak role Koordinator: pakai role Operator yang ditugaskan ke sub-unit "Editing & Produksi Video" dan "Pengajuan Desain Grafis" (`admin_sub_unit`) — `applyIncoming` tetap mencakup kedua sub-unit.
- Nama sub-unit/label field di DB produksi sama dengan seeder. Jika berbeda (sudah diubah via Form Builder): nilai filter dibuat konfigurabel di `config/haloapu.php` (`categories`, `field_labels`, `match_values`) dengan default nilai seeder.
- SPARC & HaloAPU di hosting yang bisa saling akses via HTTPS. Jika HaloAPU hanya bisa diakses jaringan internal dan SPARC di luar: deploy SPARC di server/cPanel yang sama dengan HaloAPU.
