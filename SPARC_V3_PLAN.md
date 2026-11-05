# PRD: SPARC v3 — Platform Manajemen Konten HUMAS Terpadu

| Atribut | Detail |
|---|---|
| **Nama Produk** | SPARC (Social Media Production, Asset & Resource Center) v3 |
| **Versi** | 3.0 — 27 Oktober 2026 |
| **Status** | Draft PRD — Decision-Complete |
| **Stack** | Laravel 13, PHP 8.3, Inertia.js v3, React 19, TypeScript, Tailwind CSS v4, MySQL 8 |
| **Codebase** | Perluasan repo SPARC yang sudah ada (`C:/Users/IT Dev/Documents/SPARC`) |
| **Integrasi** | HALO APU (REST API dua arah), Meta API Suite (Instagram Graph API, Marketing API, WhatsApp Business Cloud API, Meta Catalog API) |
| **Akses Pengguna** | Role-based: Admin, Manager/Kepala HUMAS, Content Planner, Creator/Designer, Publisher, Viewer |
| **Deploy** | cPanel Shared Hosting, queue driver `database`, cron scheduler, short-polling 30 detik |

---

## Context

Tim HUMAS membutuhkan satu platform yang menyatukan seluruh siklus konten — dari permintaan masuk (HALO APU), perencanaan, produksi, publikasi, sampai laporan performa — dalam satu identitas pekerjaan tunggal. Saat ini data tersebar di spreadsheet terpisah sehingga tim menginput ulang data yang sama di kalender, content plan, dan laporan.

SPARC v3 adalah perluasan langsung dari codebase SPARC yang sudah ada (Laravel 13 + Inertia React + Tailwind v4) — bukan aplikasi baru. Modul SPARC yang sudah berjalan (Script Studio, Grid Drafting, Resource Library, Incoming HALO APU) dipertahankan dan dilengkapi dengan 7 modul baru: Dashboard HUMAS, Calendar, Content Plan, Production Board (Kanban), Publishing & Optimization, Performance Report, Team & Integration, dan Katalog Aset Visual. Satu `content_item` memiliki satu ID, satu riwayat status, dan data performa — tidak perlu input ulang di modul berbeda.

---

## Approach

### Langkah 1 — Database: Skema Relasional Inti

Buat migrasi Laravel berikut (urutan sesuai dependensi FK):

#### 1a. Tabel `roles`
```
id BIGINT UNSIGNED PK
name VARCHAR(50) UNIQUE  -- admin, manager, planner, creator, publisher, viewer
label VARCHAR(100)
created_at, updated_at
```

#### 1b. Tabel `user_roles` (pivot)
```
user_id FK users(id) ON DELETE CASCADE
role_id FK roles(id) ON DELETE CASCADE
PRIMARY KEY (user_id, role_id)
```

#### 1c. Tabel `activities` (kalender kegiatan lembaga)
```
id BIGINT UNSIGNED PK
title VARCHAR(255) NOT NULL
description TEXT NULL
activity_date DATE NOT NULL          -- tanggal kegiatan/momentum
end_date DATE NULL                   -- opsional, untuk kegiatan multi-hari
type ENUM('agenda','event','hari_besar','kampanye','momentum') NOT NULL
campaign_id BIGINT UNSIGNED NULL FK campaigns(id) ON DELETE SET NULL
is_recurring BOOLEAN DEFAULT FALSE
recurring_pattern JSON NULL          -- {frequency: 'weekly'|'monthly', until: 'YYYY-MM-DD'}
created_by FK users(id) ON DELETE SET NULL
created_at, updated_at, deleted_at
INDEX (activity_date), INDEX (campaign_id)
```

#### 1d. Tabel `campaigns`
```
id BIGINT UNSIGNED PK
title VARCHAR(255) NOT NULL
description TEXT NULL
start_date DATE NULL
end_date DATE NULL
created_by FK users(id) ON DELETE SET NULL
created_at, updated_at, deleted_at
```

#### 1e. Tabel `content_items` — EKSTENSI dari tabel existing SPARC
Tabel `content_items` yang sudah ada di SPARC diperluas dengan kolom berikut (migration `alter`):
```
-- Kolom baru yang ditambahkan:
content_id VARCHAR(20) UNIQUE NOT NULL  -- format: SPARC-2026-0001, generated on create
activity_id BIGINT UNSIGNED NULL FK activities(id) ON DELETE SET NULL
campaign_id BIGINT UNSIGNED NULL FK campaigns(id) ON DELETE SET NULL
pilar ENUM('edukasi','program','fundraising','inspirasi','kelembagaan') NULL
tujuan ENUM('awareness','engagement','traffic','conversion','edukasi') NULL
target_audiens VARCHAR(255) NULL
prioritas ENUM('critical','tinggi','normal','rendah') DEFAULT 'normal'
production_deadline DATE NULL          -- tenggat produksi (berbeda dari publish_datetime)
brief TEXT NULL
referensi_links JSON NULL              -- [{label, url}]
target_kpi JSON NULL                   -- [{metric, target_value}]
checklist_pra_publikasi JSON NULL      -- [{item, checked: bool}]
published_actual_at DATETIME NULL      -- waktu tayang aktual (beda dari jadwal)
haloapu_ticket_id BIGINT UNSIGNED NULL -- referensi ke HALO APU (nullable, tiket manual tidak punya)

-- Kolom yang sudah ada di SPARC (tidak diubah):
-- id, incoming_ticket_id, title, caption, platform, format, pillar (rename → sparc_pillar, atau hapus jika duplikat),
-- status, pic_user_id, publish_datetime, published_url, asset_links, haloapu_push_failed, position, deleted_at
```

**Catatan migrasi:** Cek kolom `pillar` di `content_items` SPARC — jika ada, rename ke `sparc_pillar` untuk menghindari konflik; kolom `pilar` SPARC v3 adalah ENUM berbeda.

#### 1f. Tabel `tasks` (pekerjaan produksi turunan dari content_item)
```
id BIGINT UNSIGNED PK
content_item_id BIGINT UNSIGNED NOT NULL FK content_items(id) ON DELETE CASCADE
title VARCHAR(255) NOT NULL
description TEXT NULL
task_type ENUM('scripting','design','video','review','approval','distribution','other') DEFAULT 'other'
status ENUM('todo','in_progress','in_review','done','blocked') DEFAULT 'todo'
prioritas ENUM('critical','tinggi','normal','rendah') DEFAULT 'normal'
assigned_to FK users(id) ON DELETE SET NULL NULL
start_date DATE NULL
due_date DATE NULL
completed_at DATETIME NULL
effort_estimate TINYINT UNSIGNED NULL  -- dalam jam, 1-99
obstacle_notes TEXT NULL
created_by FK users(id) ON DELETE SET NULL
created_at, updated_at, deleted_at
INDEX (content_item_id, status), INDEX (due_date)
```

#### 1g. Tabel `task_collaborators` (pivot)
```
task_id FK tasks(id) ON DELETE CASCADE
user_id FK users(id) ON DELETE CASCADE
PRIMARY KEY (task_id, user_id)
```

#### 1h. Tabel `task_checklists`
```
id BIGINT UNSIGNED PK
task_id FK tasks(id) ON DELETE CASCADE
item VARCHAR(255) NOT NULL
is_done BOOLEAN DEFAULT FALSE
order_index TINYINT UNSIGNED DEFAULT 0
created_at, updated_at
```

#### 1i. Tabel `task_comments`
```
id BIGINT UNSIGNED PK
task_id FK tasks(id) ON DELETE CASCADE
user_id FK users(id) ON DELETE SET NULL
comment TEXT NOT NULL
is_revision_note BOOLEAN DEFAULT FALSE
created_at, updated_at, deleted_at
```

#### 1j. Tabel `workflow_history` (audit trail status)
```
id BIGINT UNSIGNED PK
entity_type ENUM('content_item','task') NOT NULL
entity_id BIGINT UNSIGNED NOT NULL
user_id FK users(id) ON DELETE SET NULL NULL
from_status VARCHAR(50) NULL
to_status VARCHAR(50) NOT NULL
notes TEXT NULL
created_at TIMESTAMP NOT NULL
INDEX (entity_type, entity_id)
```

#### 1k. Tabel `publications` (satu konten → banyak publikasi kanal)
```
id BIGINT UNSIGNED PK
content_item_id FK content_items(id) ON DELETE CASCADE
platform ENUM('instagram','tiktok','youtube','website','whatsapp','facebook','x','other') NOT NULL
published_url VARCHAR(500) NULL
meta_media_id VARCHAR(100) NULL        -- ID media/container dari Instagram Graph API
meta_ad_id VARCHAR(100) NULL           -- ID campaign/ad dari Meta Marketing API (jika dipromosikan)
meta_catalog_item_id VARCHAR(100) NULL -- ID materi/dokumen ter-tag dari Meta Catalog API
wa_broadcast_id VARCHAR(100) NULL      -- ID broadcast rilis dari WhatsApp Cloud API
scheduled_at DATETIME NULL            -- jadwal publikasi
published_actual_at DATETIME NULL     -- waktu tayang aktual
checklist_done JSON NULL              -- {caption:true, cta:true, hashtag:true, thumbnail:true, link:true}
needs_redistribution BOOLEAN DEFAULT FALSE
created_at, updated_at
INDEX (content_item_id), INDEX (scheduled_at)
```

#### 1l. Tabel `performance_metrics`
```
id BIGINT UNSIGNED PK
publication_id FK publications(id) ON DELETE CASCADE
reach INT UNSIGNED NULL
impressions INT UNSIGNED NULL
views INT UNSIGNED NULL
likes INT UNSIGNED NULL
comments INT UNSIGNED NULL
shares INT UNSIGNED NULL
saves INT UNSIGNED NULL
clicks INT UNSIGNED NULL
conversions INT UNSIGNED NULL
paid_reach INT UNSIGNED NULL          -- Jangkauan berbayar dari Meta Marketing API
paid_impressions INT UNSIGNED NULL    -- Impresi iklan dari Meta Marketing API
ad_spend DECIMAL(12,2) UNSIGNED NULL  -- Biaya iklan/boost yang dikeluarkan
currency VARCHAR(3) DEFAULT 'IDR'
source ENUM('manual','csv','api') DEFAULT 'manual'
recorded_by FK users(id) ON DELETE SET NULL NULL
recorded_at DATETIME NOT NULL
notes TEXT NULL
created_at, updated_at
INDEX (publication_id, recorded_at)
```
Aturan: angka NULL ≠ 0. Jangan auto-fill 0 jika data tidak tersedia.

#### 1m. Tabel `visual_assets` (Katalog Aset Visual — modul baru)
```
id BIGINT UNSIGNED PK
title VARCHAR(255) NOT NULL
category ENUM('foto','video','ilustrasi','template_desain','infografis','audio','dokumen') NOT NULL
tags JSON NULL                         -- ["array", "of", "tags"]
file_path VARCHAR(500) NULL            -- path lokal storage/app/public
external_url VARCHAR(500) NULL         -- link Canva/Figma/Drive
thumbnail_path VARCHAR(500) NULL
content_item_id BIGINT UNSIGNED NULL FK content_items(id) ON DELETE SET NULL
uploaded_by FK users(id) ON DELETE SET NULL NULL
created_at, updated_at, deleted_at
INDEX (category), FULLTEXT INDEX ft_title_tags (title) -- MySQL FULLTEXT untuk search
```

#### 1n. Tabel `haloapu_ticket_links` (relasi tiket ↔ pekerjaan)
```
id BIGINT UNSIGNED PK
haloapu_ticket_id BIGINT UNSIGNED NOT NULL
content_item_id FK content_items(id) ON DELETE CASCADE
linked_by FK users(id) ON DELETE SET NULL
created_at TIMESTAMP
UNIQUE (haloapu_ticket_id, content_item_id)
```

#### 1o. Tabel `system_settings` (konfigurasi tanpa deploy ulang)
```
id BIGINT UNSIGNED PK
key VARCHAR(100) UNIQUE NOT NULL       -- 'content_pilars', 'channels', 'priority_levels', 'meta_api_credentials' (app_id, secret, token, ig_id, ad_account_id, waba_id, catalog_id)
value JSON NOT NULL
updated_by FK users(id) ON DELETE SET NULL NULL
updated_at TIMESTAMP
```

#### 1p. Tabel `invitations` — sudah ada di SPARC, tambah kolom `role_id FK roles(id)`

#### 1q. Tabel `notifications` — Laravel default database notifications, sudah ada
#### 1r. Tabel `whatsapp_broadcast_logs` (distribusi siaran pers & rilis media)
```
id BIGINT UNSIGNED PK
publication_id BIGINT UNSIGNED NULL FK publications(id) ON DELETE SET NULL
recipient_phone VARCHAR(30) NOT NULL
recipient_name VARCHAR(100) NULL
recipient_group ENUM('media_partner','wartawan','internal','stakeholder') DEFAULT 'media_partner'
template_name VARCHAR(100) NOT NULL
message_status ENUM('pending','sent','delivered','read','failed') DEFAULT 'pending'
meta_message_id VARCHAR(100) NULL
sent_at TIMESTAMP NULL
created_at, updated_at
INDEX (publication_id), INDEX (message_status)
```


---

### Langkah 2 — Model & Relasi Eloquent

Buat model baru dengan `php artisan make:model` untuk setiap tabel baru di Langkah 1:
`Activity`, `Campaign`, `Task`, `TaskCollaborator`, `TaskChecklist`, `TaskComment`, `WorkflowHistory`, `Publication`, `PerformanceMetric`, `VisualAsset`, `HaloapuTicketLink`, `SystemSetting`, `Role`, `WhatsappBroadcastLog`.

Model yang diperbarui: `User` (tambah relasi `roles()`, `tasks()`, `assignedTasks()`), `ContentItem` (tambah relasi `activity()`, `campaign()`, `tasks()`, `publications()`, `haloapuTicketLinks()`, `visualAssets()`).

Relasi kunci:
- `ContentItem hasMany Task`, `Task belongsTo ContentItem`
- `ContentItem hasMany Publication`, `Publication hasMany PerformanceMetric`
- `Activity hasMany ContentItem`, `Campaign hasMany ContentItem`, `Campaign hasMany Activity`
- `ContentItem belongsToMany HaloapuTicket via haloapu_ticket_links`
- `User belongsToMany Role via user_roles`

Trait `SoftDeletes` pada: `Activity`, `Campaign`, `ContentItem`, `Task`, `TaskComment`, `VisualAsset`.

---

### Langkah 3 — Role & Middleware Authorization

Buat `App\Http\Middleware\CheckRole` yang membaca `user_roles` dan menolak 403 jika role tidak cukup. Daftar kemampuan per role:

| Aksi | admin | manager | planner | creator | publisher | viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Manajemen pengguna/role | ✓ | | | | | |
| Approve konten final | ✓ | ✓ | | | | |
| Ubah prioritas lintas tim | ✓ | ✓ | | | | |
| Buat/edit activity & campaign | ✓ | ✓ | ✓ | | | |
| Buat/edit content_item | ✓ | ✓ | ✓ | ✓ | | |
| Update task yang ditugaskan padanya | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Kelola checklist publikasi & input metrics | ✓ | ✓ | ✓ | | ✓ | |
| Update katalog aset visual | ✓ | ✓ | ✓ | ✓ | | |
| Lihat dashboard & laporan | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Middleware diregistrasi di `bootstrap/app.php` sebagai named middleware `role`. Penggunaan: `Route::middleware(['auth', 'role:admin,manager'])`.

---

### Langkah 4 — Authentication: Extend Invite-Only ke Role-Based

SPARC sudah punya invite-only auth. Perluasan:
- Tabel `invitations` tambah kolom `role_id FK roles(id)` — saat mengundang, pengirim memilih role penerima.
- `RegisteredUserController@store` (route `POST /register/{token}`): setelah user dibuat, tambahkan pivot `user_roles` sesuai `invitation.role_id`.
- Satu user boleh punya multiple role: form undangan multi-select checkbox role; insert satu baris per role ke `user_roles`.
- Halaman `/team` (route `GET /team`, middleware `auth`): daftar anggota, role, beban kerja aktif. Hanya `admin` dan `manager` yang bisa mengundang atau mengubah role.

---

### Langkah 5 — Dashboard HUMAS

Route: `GET /` dan `GET /dashboard` (sudah ada, sudah dirender ke `Dashboard/Index`).

Ganti props yang dikirim dari session ke Eloquent queries:

**Props untuk staf (semua role):**
```php
'myOpenTasks'      => Task pendek yang assigned_to = auth()->id(), status != 'done', due_date <= +7 hari, limit 10
'overdueItems'     => ContentItem status != 'published' dan production_deadline < today(), limit 10
'upcomingPublish'  => Publication scheduled_at antara now dan +7 hari, order by scheduled_at, limit 10
'myActivities'     => Activity activity_date antara today dan +7 hari, limit 5
```

**Props tambahan untuk manager/admin:**
```php
'teamWorkload'     => User dengan count tasks aktif per orang (LEFT JOIN tasks WHERE status != 'done')
'contentSummary'   => ContentItem counts grouped by status untuk periode bulan ini
'contentVsTarget'  => Total content_items published bulan ini vs target dari system_settings key 'monthly_content_target'
'channelPerformance' => SUM metrics per platform untuk bulan ini
```

Dashboard staf: tampilkan grid `myOpenTasks`, `overdueItems`, `upcomingPublish`. Dashboard manager: tambahkan `teamWorkload` workload bar, `contentSummary` donut chart (gunakan `react-chartjs-2` — harus install via `npm install chart.js react-chartjs-2`).

Notifikasi: gunakan endpoint polling `/poll/updates?since=` yang sudah ada di SPARC, tambah key `unread_notification_count` dan `new_halo_apu_tickets` ke response JSON-nya.

---

### Langkah 6 — Modul Calendar

Route: `GET /calendar` sudah ada. Ganti props dari `sessionEvents` ke Eloquent:

```php
'activities' => Activity::withTrashed(false)->whereBetween('activity_date', [$startOfMonth, $endOfMonth])->get()
'contentItems' => ContentItem::with('publications')->whereBetween('publish_datetime', ...)->orWhereBetween('production_deadline', ...)->get()
```

**Frontend `Calendar/Index.tsx`:** Install `npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction`. Tampilkan dua layer event:
1. **Activity events** (warna sesuai `type`: agenda=biru, event=ungu, hari_besar=hijau, kampanye=merah, momentum=kuning).
2. **Content events**: dua tanggal terpisah — `production_deadline` (badge abu/oranye) dan `publish_datetime` (badge warna platform).

Filter sidebar: kanal, jenis kegiatan, PIC, status. State filter di query string (`?platform=instagram&status=in_progress`).

Klik event activity → slide-over detail: daftar content_item turunan, progres, PIC.
Klik event konten → slide-over detail: brief, status, PIC, tasks.

Drag-and-drop reschedule: `@fullcalendar/interaction` event drop → `PATCH /calendar/events/{type}/{id}/reschedule` dengan body `{date}`. Untuk content_item: update `publish_datetime`. Untuk activity: update `activity_date`. Konfirmasi dialog sebelum simpan.

Warning (tidak blok): tampilkan badge merah di event konten jika `production_deadline < activity_date` atau `publication.scheduled_at` sudah dekat tapi task belum ada yang `done`.

Recurring activity: saat menampilkan kalender, generate event virtual dari `recurring_pattern` di frontend (tidak di-expand ke DB). Simpan pattern di kolom JSON; implementasi expand hanya untuk UI render.

---

### Langkah 7 — Modul Content Plan

Route: `GET /planner` sudah ada. Ganti seluruh session-based logic ke Eloquent.

**Route tambahan:**
```
GET  /content                           → Content/Index (table view)
GET  /content/create                    → Content/Create
POST /content                           → ContentController@store
GET  /content/{id}                      → ContentController@show (detail + tasks + publications)
PATCH /content/{id}                     → ContentController@update
DELETE /content/{id}                    → ContentController@destroy (soft delete)
POST /content/{id}/duplicate            → ContentController@duplicate
```

**`content_items` yang disimpan lewat `ContentController@store`:** semua field dari tabel 1e termasuk `content_id` (auto-generate: `SPARC-{YYYY}-{seq padded 4}` berdasarkan `SELECT MAX(content_id)` per tahun), `activity_id`, `campaign_id`, `pilar`, `tujuan`, `target_audiens`, `prioritas`, `production_deadline`, `brief`, `referensi_links`, `target_kpi`.

**Table view `Content/Index.tsx`:** Kolom: Content ID, Judul, Pilar, Format, Kanal, PIC, Tanggal Kegiatan, Tanggal Produksi, Tanggal Publikasi, Prioritas, Status. Filter: kanal, pilar, format, status, PIC (dropdown dari users), rentang tanggal publikasi, campaign. Search: `LIKE` pada title + content_id. State filter di query string.

Bulk action: ubah status, assign PIC, ubah prioritas — hanya untuk role `manager` dan `admin`.

Inline edit: klik sel Status, PIC, Prioritas, Tanggal Publikasi langsung di tabel (tanpa buka modal) via `PATCH /content/{id}` dengan partial payload.

Duplikasi (`POST /content/{id}/duplicate`): salin semua field kecuali `content_id` (generate baru), `status` (reset ke `inbox`), `published_url`, `published_actual_at`, `haloapu_push_failed`. Task dan publications tidak ikut duplikat.

---

### Langkah 8 — Modul Production Board (Kanban)

Route: `/planner` → Kanban view, dapat di-switch dari `/content` (table view) menggunakan toggle di header yang sudah ada di SPARC.

Kanban ditampilkan pada `Planner/Index.tsx` yang sudah ada, tapi ganti data source dari session ke API:

**Kolom Kanban untuk `content_items`:**
1. Inbox Request
2. Briefing & Ideasi
3. Produksi (Desain/Naskah)
4. Review & Approval
5. Ready to Publish
6. Published

**Route baru untuk Kanban:**
```
PATCH /content/{id}/status              → ContentController@updateStatus (ubah kolom + log ke workflow_history)
```
Drag bebas antar kolom (termasuk mundur) menggunakan `@dnd-kit/core` yang sudah terinstall. Setelah drop: POST ke backend untuk persist.

**Detail card Kanban**: Klik card → slide-over kanan menampilkan:
- Detail content_item (brief, PIC, deadline, kanal, pilar)
- Daftar tasks dengan checklist, status, assigned_to, due_date
- Tombol "Tambah Task" → inline form create task
- Komentar tim (`task_comments`)
- Attachment/referensi links
- Riwayat status perubahan dari `workflow_history`

**Task management dalam slide-over:**
- `POST /tasks` → TaskController@store (buat task baru, wajib `content_item_id`)
- `PATCH /tasks/{id}` → TaskController@update
- `PATCH /tasks/{id}/status` → TaskController@updateStatus (log ke `workflow_history`)
- `DELETE /tasks/{id}` → TaskController@destroy (soft delete)
- `POST /tasks/{id}/checklists` → TaskChecklistController@store
- `PATCH /tasks/{id}/checklists/{cid}` → TaskChecklistController@update (toggle done)

**Aturan bisnis status:**
- `content_item.status = 'published'` TIDAK auto-set saat semua task done. Publisher harus set manual lewat modul Publishing & Optimization.
- Status `ready_to_publish` bisa di-set oleh role `manager`, `planner`, atau `admin` saja.
- Status approval: konten tidak bisa berubah dari `review_approval` → `ready_to_publish` kecuali dilakukan oleh role `manager` atau `admin`. Implementasi: `ContentController@updateStatus` cek role sebelum allow transisi tersebut.

---

### Langkah 9 — Modul Publishing & Optimization

Route baru:
```
GET  /publishing                        → Publishing/Index
GET  /publishing/{content_id}           → Publishing/Show
POST /publications                      → PublicationController@store
PATCH /publications/{id}                → PublicationController@update
DELETE /publications/{id}               → PublicationController@destroy
POST /publications/{id}/publish-meta    → PublicationController@publishToMeta (direct publish Instagram)
POST /publications/{id}/broadcast-wa    → PublicationController@broadcastWhatsApp (siaran pers media partner)
```

**`Publishing/Index.tsx`:** Daftar konten berstatus `ready_to_publish`, diurutkan by `publications.scheduled_at` ASC. Filter: kanal, tanggal. Tampilkan badge merah untuk konten yang `scheduled_at` ≤ hari ini tapi belum `published_actual_at`.

**Checklist pra-publikasi per kanal:** Saat `Publication` dibuat, field `checklist_done` diisi template JSON default sesuai platform:
- Instagram: `{caption, hashtag, cta, thumbnail, tag_lokasi, mention}`
- TikTok: `{caption, hashtag, cta, thumbnail, sound}`
- YouTube: `{judul, deskripsi, thumbnail, tag, kategori, playlist}`
- Website: `{judul_artikel, meta_description, featured_image, kategori, internal_link}`
- WhatsApp: `{pesan, link_preview, target_grup}`

Publisher mencentang item satu per satu. Semua item centang → tombol "Tandai Tayang" aktif.

**Tandai Tayang:** `PATCH /publications/{id}` dengan `{published_actual_at: now, published_url}` → sistem otomatis kirim notifikasi ke creator dan planner bahwa konten sudah tayang. Jika semua `publications` dari `content_item` sudah punya `published_actual_at`, maka `content_item.status` diubah ke `published` dan `published_actual_at` content_item diisi `now()`.

**Callback HALO APU:** Jika `content_item.haloapu_push_failed = false` dan semua publikasi sudah tayang → dispatch job `PushHaloApuStatus` dengan status `solve`.

**Reminder performa:** Scheduler harian jam 09:00 WIB: cek `publications` yang `published_actual_at` ≤ 3 hari lalu dan belum ada record di `performance_metrics` → kirim notifikasi ke publisher + planner: "Mohon input data performa konten {title}".


**Integrasi Meta Publishing & Distribusi:**
- **Instagram Graph API (Direct Publishing):** Mendukung auto-publish single image, video Reels, dan carousel. Alur: Buat media container di Meta (`POST /{ig_user_id}/media`), polling status container hingga `FINISHED`, lalu publish (`POST /{ig_user_id}/media_publish`). Nilai ID disimpan di `publications.meta_media_id` dan permalink di `published_url`.
- **Meta Catalog API (Tagging Materi Publik):** Opsi tagging produk/dokumen digital pada postingan Instagram untuk menyematkan link unduh booklet panduan, e-book regulasi, atau laporan tahunan instansi.
- **WhatsApp Business Cloud API (Distribusi Siaran Pers):** Modul rilis pers Humas untuk mengirim siaran pers resmi ke kontak wartawan dan media mitra via pesan template approved Meta. Seluruh riwayat pengiriman dan status baca dicatat di tabel `whatsapp_broadcast_logs`.
---

### Langkah 10 — Modul Performance Report

Route baru:
```
GET  /report                            → Report/Index (filter: periode, kanal, campaign, PIC)
POST /report/metrics                    → MetricController@store (input manual satu konten)
POST /report/metrics/import-csv         → MetricController@importCsv
POST /report/metrics/sync-meta          → MetricController@syncMetaMetrics (tarik Insights & Marketing API)
GET  /report/export                     → ReportController@export (PDF/Excel)
```

**Tiga lapisan laporan ditampilkan di `Report/Index.tsx`:**

**Lapisan 1 — Operational Report:**
- Total content_items per status untuk periode yang dipilih
- Jumlah yang terlambat (production_deadline terlewat saat belum published)
- Rata-rata waktu penyelesaian task (completed_at - created_at in hours)
- Jumlah revisi (task_comments.is_revision_note = true)
Data: query langsung ke `content_items`, `tasks`, `task_comments` dengan filter periode `created_at`.

**Lapisan 2 — Content Performance Report:**
- Per `publication`: reach, impressions, views, engagement (likes+comments+shares+saves), klik, pertumbuhan audiens jika tersedia.
- Metrik tampil = record `performance_metrics` terbaru berdasarkan `recorded_at` per `publication_id`.
- NULL ditampilkan sebagai "-" bukan 0.
- Engagement Rate = `(likes+comments+shares+saves) / reach * 100` jika `reach > 0`, else "-".
- Chart: bar per kanal (react-chartjs-2 yang diinstall di Langkah 5).
- **Sinkronisasi Meta Graph & Marketing API:**
  - Instagram Insights: Otomatis mengisi `reach`, `impressions`, `views`, `likes`, `comments`, `shares`, `saves`.
  - Meta Marketing API: Jika konten dipromosikan (boost post/ads), otomatis menarik `paid_reach`, `paid_impressions`, dan `ad_spend`.
  - Analisis Efisiensi: Menampilkan komparasi *Organic vs Paid Reach* serta rasio biaya per interaksi (*Cost per Engagement* = `ad_spend / total_interactions`).

**Lapisan 3 — Team Performance Report:**
- Per user: jumlah task selesai, ketepatan waktu (completed_at <= due_date), rata-rata effort, jumlah task blocked.
- Waktu tunggu approval: rata-rata durasi workflow_history dari `in_review` → `ready_to_publish` per periode.
- Hambatan: content_items dengan `obstacle_notes` tidak kosong.

**Import CSV:**
Template CSV: `content_id,platform,reach,impressions,views,likes,comments,shares,saves,clicks,recorded_at`. Match by `content_id` + `platform`. Baris tidak cocok di-skip dengan warning. Semua angka integer ≥ 0. NULL dibiarkan NULL jika kolom kosong.

**Export:** PDF via `barryvdh/laravel-dompdf` (harus tambahkan ke `composer.json`), Excel via `maatwebsite/excel` (harus tambahkan ke `composer.json`). Kedua package ini belum ada di SPARC, wajib `composer require`.

---

### Langkah 11 — Modul Katalog Aset Visual

Route baru:
```
GET  /assets                            → Assets/Index (grid view dengan filter)
POST /assets                            → AssetController@store (upload atau link eksternal)
PATCH /assets/{id}                      → AssetController@update
DELETE /assets/{id}                     → AssetController@destroy (soft delete)
GET  /assets/{id}                       → AssetController@show (detail + konten terkait)
```

**Upload:** Gunakan `Storage::disk('public')` untuk file yang diupload. Max size per file: 20MB (set di `php.ini` dan validasi Laravel). Thumbnail auto-generate untuk gambar menggunakan `Intervention Image` (`composer require intervention/image`) — resize ke 300x300 untuk preview grid.

**Jika tidak upload (link eksternal):** Kolom `external_url` diisi, `file_path` null.

**`Assets/Index.tsx`:** Grid 3-4 kolom responsive. Filter: kategori, tags, content_item terkait. Search: FULLTEXT MySQL pada `title`. Setiap card: thumbnail, title, kategori, badge tags. Klik → detail panel: semua metadata + tombol download (jika file lokal) atau tombol buka link eksternal.

Role yang bisa upload/edit: `admin`, `manager`, `planner`, `creator`. Viewer hanya bisa lihat dan download.

---

### Langkah 12 — Modul Team & Integration (Settings + User Management)

Route baru:
```
GET  /team                              → Team/Index (daftar anggota, beban kerja)
GET  /team/{id}                         → Team/Show (profil + aktivitas user)
GET  /settings                          → Settings/Index (hanya admin)
PATCH /settings                         → SettingsController@update (update system_settings)
GET  /settings/haloapu                  → Settings/HaloapuStatus (log sync, retry token)
```

**`Team/Index.tsx`:** Tabel anggota: nama, role, jumlah task aktif, task jatuh tempo minggu ini, task overdue. Filter: role. Tombol "Undang Anggota" (modal, hanya admin/manager) → form email + pilih role(s).

**Workload view:** Per anggota, tampilkan bar progres task aktif vs kapasitas (jika `effort_estimate` diisi, gunakan sum effort; jika tidak, gunakan count task). Hanya bisa dilihat oleh `manager` dan `admin`.

**`Settings/Index.tsx`:** Form untuk mengedit `system_settings`:
- `monthly_content_target`: integer (target konten per bulan untuk Dashboard KPI)
- `content_pilars`: JSON array of {key, label} — pilar konten yang bisa dipilih
- `platforms`: JSON array of {key, label} — kanal yang aktif
- `default_checklist_instagram`, `default_checklist_tiktok`, dst: JSON array of {item} — template checklist publikasi per kanal
- `working_hours_start`, `working_hours_end`: string format "HH:MM" untuk perhitungan waktu kerja

**HALO APU status:** Tampilkan log 50 terbaru dari `haloapu_sync_logs`, status token (uji dengan GET /ping atau endpoint cek sederhana ke HALO APU), waktu sync terakhir sukses. Tombol "Sync Sekarang" → POST `/haloapu/sync-now` yang sudah ada di SPARC. Tombol "Perbarui Token" → form input token baru, simpan ke `.env` via `Artisan::call('haloapu:update-token', ['token' => $value])` (buat custom command).

**Meta Integration Settings:**
Tab pengaturan kredensial Meta Suite:
- Form input: Meta App ID, App Secret, System User Token (Long-Lived), Instagram Business Account ID, Meta Ad Account ID, WABA ID & Phone Number ID, Catalog ID.
- Indikator status koneksi, masa aktif token, dan cakupan permission aktif (`instagram_content_publish`, `instagram_manage_insights`, `whatsapp_business_messaging`, `ads_read`).
- Tombol "Test Koneksi Meta API" untuk ping status integrasi.

---

### Langkah 13 — Notifikasi & Polling

Endpoint polling yang sudah ada di SPARC (`GET /poll/updates?since=`) diperluas response JSON-nya:

```json
{
  "unread_notification_count": 3,
  "new_halo_apu_tickets": 1,
  "overdue_content_count": 2,
  "upcoming_publish_today": 1
}
```

**Trigger notifikasi baru (tambahan dari SPARC):**
- Task baru ditugaskan ke user → notifikasi ke assignee
- Task di-comment (terutama `is_revision_note = true`) → notifikasi ke task creator dan pic
- Konten berubah ke status `review_approval` → notifikasi ke role `manager` dan `admin`
- Konten di-approve (`ready_to_publish`) → notifikasi ke PIC konten
- Konten sudah tayang (`published_actual_at` diisi) → notifikasi ke creator dan planner
- Reminder input performa 3 hari setelah tayang (Langkah 9)
- Deadline task ≤ 1 hari, belum selesai → notifikasi ke assignee (scheduler harian jam 08:00)

Notifikasi disimpan ke tabel `notifications` (Laravel database driver). Bell icon + badge di sidebar. Drawer 50 terbaru, tombol "Tandai Semua Dibaca".

---

### Langkah 14 — Soft Delete & Trash

Halaman `/trash` yang sudah ada di SPARC diperluas untuk menampilkan semua entitas dengan `deleted_at`:
- `content_items`
- `tasks`
- `task_comments`
- `activities`
- `campaigns`
- `visual_assets`

Route tambahan:
```
POST /trash/{type}/{id}/restore         → TrashController@restore (type: content|task|activity|campaign|asset)
DELETE /trash/{type}/{id}/purge         → TrashController@purge (hapus permanen)
```

Auto-purge via scheduler harian: hapus records dengan `deleted_at < now() - 30 hari`.

---

### Langkah 15 — Navigation & Sidebar Update

`resources/js/Layouts/` — implementer harus `glob resources/js/Layouts/` terlebih dahulu untuk menemukan file layout yang tepat (kemungkinan `AuthenticatedLayout.tsx` atau `AppLayout.tsx`), lalu update sidebar navigation:

Tambah menu item baru ke sidebar:
```
/dashboard          Dashboard HUMAS
/content            Content Plan (table default)
/planner            Production Board (kanban)
/calendar           Kalender
/publishing         Publishing & Optimization
/report             Performance Report
/assets             Katalog Aset Visual
/team               Tim & Integrasi
--- existing SPARC ---
/incoming           Incoming HALO APU
/studio             Script Studio
/grid               Grid Drafting
/resources          Resource Library
/trash              Trash
```

---

## Critical Files & Anchors

| File | Simbol / Region | Alasan |
|---|---|---|
| `app/Http/Controllers/WorkspaceActionController.php` | Semua method | Ganti dari session-based ke Eloquent; jangan hapus sampai semua route dialihkan ke controller baru |
| `routes/web.php` | Seluruh file | Tambahkan semua route baru di sini; gunakan route groups dengan middleware `auth` dan `role` |
| `resources/js/Pages/Planner/Index.tsx` | Kanban board logic | Base untuk Production Board; extend jangan rewrite |
| `resources/js/Pages/Calendar/Index.tsx` | Calendar render | Ganti data source dari `sessionEvents` ke Inertia props dari Eloquent |
| `database/migrations/` | `0001_*` files | Jangan ubah; buat migration baru untuk setiap tabel tambahan |

---

## Verification

### Smoke test alur lengkap (end-to-end):

**1. Setup database & seeder:**
```bash
php artisan migrate --step
php artisan db:seed --class=RoleSeeder    # insert 6 roles
php artisan db:seed --class=SystemSettingSeeder  # insert default settings
```
Ekspektasi: semua migration sukses tanpa error foreign key.

**2. Test auth & role:**
```bash
php artisan tinker --execute '
$admin = \App\Models\User::first();
$adminRole = \App\Models\Role::where("name","admin")->first();
$admin->roles()->attach($adminRole);
echo $admin->roles->pluck("name");
'
```
Ekspektasi: output `["admin"]`.

**3. Test alur konten:**
- Buka `/content/create` sebagai planner → isi semua field termasuk `activity_id`, `pilar`, `production_deadline` → simpan → pastikan `content_id` tergenerate format `SPARC-2026-0001`.
- Buka `/planner` → pastikan card muncul di kolom "Inbox Request" → drag ke "Produksi" → refresh → pastikan status persist di DB.
- Buka `/calendar` → pastikan konten muncul pada tanggal `production_deadline` (badge oranye) dan `publish_datetime` (badge platform).

**4. Test Publishing:**
- Set content_item status ke `ready_to_publish` sebagai manager → buka `/publishing` → pastikan muncul di daftar → buat `Publication` untuk platform Instagram → centang semua checklist → klik "Tandai Tayang" → input `published_url` → simpan.
- Verifikasi: `content_item.status` = `published`, `published_actual_at` terisi, notifikasi muncul di bell icon.

**5. Test Performance Report:**
- Buka `/report` → pilih periode bulan ini → pastikan 3 lapisan tampil (Operational, Content Performance, Team).
- Input metrik manual untuk konten yang baru dipublish → pastikan engagement rate terhitung: `(likes+comments+shares+saves)/reach*100`.
- Test import CSV dengan file contoh: `SPARC-2026-0001,instagram,1000,2000,1500,50,10,20,30,5,2026-10-27 10:00:00` → pastikan data tersimpan dan muncul di report.

**6. Test Katalog Aset:**
- Upload gambar ke `/assets` sebagai creator → pastikan thumbnail terbuat di `storage/app/public/assets/thumbnails/`.
- Search by keyword → pastikan FULLTEXT search berjalan.

**7. Test role restriction:**
- Login sebagai role `viewer` → akses `POST /content` → ekspektasi: 403.
- Login sebagai role `creator` → akses `PATCH /content/{id}/status` untuk set ke `ready_to_publish` → ekspektasi: 403 (hanya manager/admin yang boleh).

---

## Assumptions & Contingencies

- **Tabel `content_items` SPARC belum di-migrate ke MySQL** (masih session-based saat ini). Implementasi dimulai dari membuat tabel baru via migration, bukan alter dari tabel yang ada. Jika ternyata ada tabel `content_items` di DB: rename ke `content_items_sparc_backup` sebelum buat migration baru.

- **`@fullcalendar/*` belum terinstall.** Wajib `npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction` sebelum implement Calendar.

- **`chart.js` + `react-chartjs-2` belum terinstall.** Wajib `npm install chart.js react-chartjs-2` sebelum implement Dashboard charts.

- **`barryvdh/laravel-dompdf` dan `maatwebsite/excel` belum ada.** Wajib `composer require barryvdh/laravel-dompdf maatwebsite/excel` sebelum implement Report export.

- **`intervention/image` untuk thumbnail.** Wajib `composer require intervention/image` sebelum implement Katalog Aset upload. Jika server PHP tidak support GD/Imagick, skip auto-thumbnail: simpan file asli saja, tampilkan ikon placeholder di grid.

- **File layout/sidebar SPARC:** Nama file layout belum diverifikasi. Implementer harus `glob resources/js/Layouts/` terlebih dahulu sebelum mengedit sidebar.

- **HALO APU integrasi:** SPARC v3 menggunakan integrasi HALO APU yang sudah dibangun di SPARC v2 (polling, callback). Tidak dibangun ulang. Hanya diperluas dengan `haloapu_ticket_links` untuk relasi tiket → banyak content_item.

- **Jika `php.ini` shared hosting tidak allow 20MB upload:** Turunkan max upload ke 5MB untuk Katalog Aset dan dokumentasikan di halaman `/assets` sebagai batas.

- **Pilar konten SPARC v3 vs SPARC v2:** SPARC v2 menggunakan ENUM `pillar` dengan nilai `(edukasi, promosi, event, pengumuman, hiburan)`. SPARC v3 menggunakan ENUM `pilar` dengan nilai berbeda `(edukasi, program, fundraising, inspirasi, kelembagaan)`. Keduanya adalah kolom berbeda di tabel `content_items`. Tidak ada konflik nama karena nama kolom berbeda (`pillar` SPARC v2 vs `pilar` SPARC v3). Jika ingin konsolidasi: migrasi data lama ke skema baru dan hapus kolom `pillar` SPARC v2 — keputusan ini serahkan ke tim.
