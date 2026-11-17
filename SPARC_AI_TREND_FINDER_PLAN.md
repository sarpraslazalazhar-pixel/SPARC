# Rencana Final — TRACE APU + Trend Finder SPARC

> Disusun: 2026-11-16. Status: dieksekusi ulang sebagai TRACE APU (Phase A/B/C tergabung).
> Stack terverifikasi: Laravel 13.38.0, PHP 8.3, Inertia 3.5.2, React 19, TypeScript, Tailwind v4, MySQL 8, deploy cPanel shared hosting.

## Prinsip arsitektur
- Semua AI lewat `prism-php/prism` (Gemini). Tren pakai **dua tahap**: grounded `Prism::text()` (Google Search grounding) → `Prism::structured()` untuk normalisasi JSON.
- Proses async: queue `database` (tabel `jobs` sudah ada) + polling UI. Tanpa WebSocket/SSE/headless browser.
- Metadata/ide hasil AI = usulan untuk review manual, bukan auto-save.
- Model default `gemini-2.5-flash` (env-overridable).

---

## Revisi 2026-11-16 — TRACE APU (agen konten)

Permintaan agen ber-tool + memori menggantikan analisis per-konten satu tembakan dengan satu loop agen:

- **Satu jalur**: `POST /trace-apu/chat` (NDJSON stream) menjalankan `Prism::text()` dengan `withTools()` + `withMaxSteps(5)`. Event `tool` dipancarkan per panggilan tool, `done` membawa jawaban.
- **Tool**: `search_content`, `get_content`, `content_performance`, `find_trends` (grounded Google Search → `trend_insights`), `build_hook_bank`, `suggest_caption`. `TraceApuToolRegistry`.
- **Analisis nyata**: agen membaca caption/brief asli lewat `get_content` (`ContentAnalysisService::describe`), menghitung angka performa via `content_performance` (`TraceApuCorpusService::portfolio` + `topPerforming`), lalu mengusulkan caption final lewat `suggest_caption`. Usulan dikirim di event `done.suggestions`; UI menampilkan tombol "Terapkan caption ini" (Studio: langsung update caption; Sheet konten: isi field caption).
- **Konteks fokus**: tool call + `content_ref` per turn disimpan di riwayat, transkrip dibangun ulang dengan `AssistantMessage(toolCalls)` + `ToolResultMessage`, jadi pertanyaan lanjutan ("perbaiki lagi") menunjuk konten yang sama.
- **Memori**: riwayat percakapan per `scope` (`global`, `studio:<id>`) per pengguna di cache; steering ("persona" + aturan per baris) disimpan per scope. Endpoint `GET /trace-apu/panel`, `PUT /trace-apu/instructions`, `DELETE /trace-apu/history`.
- **Retrieval**: `TraceApuCorpusService` — `content_items` di-rank kosinus terhadap embedding query (`gemini-embedding-001`, 256 dim) + tren aktif diinjeksi ke system prompt. Tanpa vector index (lihat `ponytail:` di service).
- **Tren**: `TrendFinderService` dua tahap (grounded text → structured) karena Gemini menolak `responseSchema` + `google_search` bersamaan; hasil disimpan dengan `embedding` + `usage`.
- **UI**: `TraceApuChat` (stream, chip tren, steering, hapus riwayat) dipakai di Studio (scope `studio:<id>`) dan Sheet detail konten; `Trends/Index.tsx` (filter kategori, kartu tren + sumber `target=_blank`, Hook Bank aktif), item sidebar "Tren Konten".
- **Sidebar**: item `/trends` "Tren Konten" di `navGroups`.
- **Hook Bank Studio**: prop `trendHooks` dari `TrendFinderService::hookIdeas()` digabung ke `SAMPLE_HOOKS`.
- **Dihapus**: `AiAnalysisController`, `ai_analyses` job flow (`AnalyzeContentJob`), `AiAnalysisPanel` — digantikan jalur agen.

## Konfigurasi AI (admin)

- Tabel `ai_settings` (singleton id=1): `provider`, `base_url`, `api_key` (cast `encrypted`), `model`, `embedding_model`.
- `AppServiceProvider::boot()` → `AiSetting::apply()` menimpa `prism.providers.gemini.api_key`/`url` + `services.gemini.model`/`embedding_model`. Kosong = pakai `.env`.
- Endpoint: `PUT /trace-apu/provider` (simpan; `api_key` kosong = pertahankan yang tersimpan), `GET /trace-apu/provider/models` (probe `{base_url}/models` dengan `x-goog-api-key`, kategorikan `generateContent` vs `embedContent`).
- UI: `AiProviderCard` di halaman Settings — URL, API key, model analisis, model embedding, tombol "Cek Model Tersedia" (daftar model + limit token, klik untuk memilih).

## Phase A — AI Assistant Analisis Konten

1. **Dependensi & config**
   - `composer require prism-php/prism`, publish `config/prism.php` (api_key `GEMINI_API_KEY`).
   - `config/services.php`: blok `gemini` (`model`, `timeout`) mengikuti pola blok `instagram` (line 38).
   - `.env` / `.env.example`: `GEMINI_API_KEY`, `GEMINI_MODEL`.
2. **Skema** — migrasi `create_ai_analyses_table`:
   - Kolom: `analyzable_type/id` (polymorphic index), `type`, `input_snapshot` JSON, `result` JSON nullable, `status` (queued/running/completed/failed), `model`, `error` nullable, timestamps.
   - Model `AiAnalysis` + factory.
3. **`app/Services/ContentAnalysisService.php`** — pola `HaloApuClientService`:
   - `isConfigured(): bool`, `analyze(AiAnalysis): array`.
   - Output schema: `summary`, `strengths[]`, `improvements[]`, `hook_ideas[]`, `hashtags[]`, `engagement_tips[]`, `readability_score` (1–10), `risk_flags[]`, `trend_context` nullable.
4. **`app/Jobs/AnalyzeContentJob.php`** — `ShouldQueue`, timeout 120, `tries=2`, transisi status + simpan `error` saat gagal.
5. **Endpoint** (`routes/web.php`, pola route existing):
   - `POST /ai/analyze` — validasi type/id + `include_trends` bool, `throttle:20,1`, buat record, dispatch job, kembalikan id/status.
   - `GET /ai/analyze/{aiAnalysis}` — JSON status + result (untuk polling).
   - Controller: `app/Http/Controllers/AiAnalysisController.php`.
6. **UI**
   - `resources/js/Components/AiAnalysisPanel.tsx` — panel reusable: skeleton saat queued/running (poll 3 detik, berhenti saat selesai/gagal), render hasil, tombol "Pakai hook ini", daftar `risk_flags` menonjol.
   - `resources/js/Pages/Studio/Show.tsx`: tombol "Analisis AI" + checkbox "Sertakan tren terkini" (default off, hanya kirim `include_trends=true` bila dicentang — hemat kuota); wire ke `handleApplyHook` (line 192).
   - `resources/js/Components/ContentDetailSheet.tsx`: tombol yang sama memakai `AiAnalysisPanel`.
7. **Test** — `AiAnalysisTest` (PHPUnit, `Prism::fake()` + `Queue::fake()`): POST membuat record + dispatch, GET mengembalikan result, job mengisi status/result, validasi input.

---

## Phase B — Trend Finder (`/trends`)

1. **Skema** — migrasi `create_trend_insights_table`:
   - Kolom: `title`, `title_hash` (unique untuk dedupe), `summary`, `category` (format/topic/hashtag/audio/news), `momentum` (rising/steady/declining), `relevance_score`, `hook_ideas` JSON, `content_ideas` JSON, `sources` JSON (citations URL+title), `raw` nullable, `refreshed_at`, `expires_at`.
   - Index `(category,momentum)`, `expires_at`. Model scope `active()`.
   - Prune >14 hari, TTL 7 hari.
2. **`app/Services/TrendFinderService.php`**:
   - `isConfigured()`, `fetchAndStore(): int` (grounded prompt tren konten kreator/humas Indonesia → normalisasi structured, maks 15 tren, upsert by hash, citations dari `additionalContent['citations']`), `latest(int $limit)`.
3. **`app/Jobs/RefreshTrendsJob.php`** — `ShouldQueue`, timeout 120, retry 2, guard `isConfigured`.
4. **Command & scheduler** — `trends:refresh` mengikuti pola inline di `routes/console.php`; `Schedule::command('trends:refresh')->dailyAt('05:00')`.
5. **Route**:
   - `GET /trends` (Inertia props: trends, configured, lastRefreshed).
   - `POST /trends/refresh` (dispatch job).
   - `GET /trends/data` (JSON polling).
6. **UI** — `resources/js/Pages/Trends/Index.tsx`:
   - Kartu tren (badge momentum berwarna, skor relevansi, chip kategori), filter kategori, tombol "Cari tren sekarang", skeleton + poll 3 detik selama refresh, empty state bila `configured=false` (instruksi isi `GEMINI_API_KEY`).
   - Sumber wajib tampil dengan link `target=_blank` (kepatuhan Google grounding).
7. **Sidebar** — tambah item `/trends` di `navGroups` `resources/js/Layouts/AppLayout.tsx` (line 489).
8. **Test** — `TrendFinderTest`: parsing grounded response dengan `Prism::fake([...])`, dedupe/upsert, prune, command dispatch, route Inertia.

---

## Phase C — Integrasi Hook Bank

1. Props `trendHooks` (flatten `hook_ideas` dari `TrendInsight` aktif, maks 10) dikirim dari controller Studio → `resources/js/Pages/Studio/Show.tsx`.
2. Section "Tren Terbaru" di modal Hook Bank (line 736), tombol "Pakai" memakai `handleApplyHook`; empty state mengarah ke `/trends`.

---

## Ops & deployment (cPanel)
- Pastikan queue worker cron aktif: `php artisan queue:work --stop-when-empty --max-time=50` tiap menit. **Tanpa ini job AI/tren tidak akan jalan** — prasyarat Phase A.
- Scheduler cron existing (`schedule:run`) sudah dibutuhkan untuk `trends:refresh`.
- `npm run build` setelah perubahan frontend.

## Verifikasi eksekusi
- `php artisan test --compact --filter='AiAnalysis|TrendFinder'`
- `vendor/bin/pint --dirty --format agent`
- `php artisan route:list --path=trends` dan `--path=ai`
- Manual: `/studio` → analisis; `/trends` → refresh; cek citations tampil.

## Default yang diambil (bisa dikoreksi)
- Model `gemini-2.5-flash`; retensi tren 14 hari, TTL 7 hari, maks 15 tren/fetch.
- `include_trends` default **off**; throttle analisis 20/menit.
- Analisis di-scope ke objek konten (polymorphic), tanpa scoping project baru.
- Timeout job 120 detik (job berjalan via CLI, aman di shared hosting).

## Batasan yang disepakati
- Tidak scraping IG/TikTok (ToS/fragile); Instagram Graph API tidak punya endpoint tren.
- Tanpa headless browser di server.
- Grounding condong ke berita/web/Google Trends; konten IG/TikTok login-wall jarang terindeks.
- Kewajiban Google: tampilkan citations/sumber di UI + tombol "Buka sumber" (`target=_blank`).

## File referensi utama
- `composer.json` — tambah `prism-php/prism`.
- `config/services.php` — blok `gemini`.
- `routes/web.php`, `routes/console.php` — endpoint & scheduler.
- `app/Services/` — pola `HaloApuClientService`, `InstagramGraphService`.
- `app/Http/Controllers/WorkspaceV3Controller.php`, `WorkspaceActionController.php` — pola controller.
- `database/migrations/` — pola timestamp (terbaru `2026_11_11_120000`); tabel `jobs` sudah ada.
- `resources/js/Layouts/AppLayout.tsx` — nav sidebar (`navGroups` line 489).
- `resources/js/Pages/Studio/Show.tsx` — Hook Bank (`SAMPLE_HOOKS` line 67, `handleApplyHook` line 192, modal line 736).
- `resources/js/Components/ContentDetailSheet.tsx` — sheet detail konten.
- `resources/js/Pages/Assets/Index.tsx` — UI resource library aktual.
