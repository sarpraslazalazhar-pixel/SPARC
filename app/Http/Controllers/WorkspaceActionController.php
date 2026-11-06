<?php

namespace App\Http\Controllers;

use App\Models\HaloApuTicket;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class WorkspaceActionController extends Controller
{
    /**
     * Store a newly created content item in the workspace session and flash a notification.
     */
    public function storePlannerItem(Request $request): RedirectResponse
    {
        $validated = $request->validate(
            [
                'title' => ['required', 'string', 'min:3', 'max:160'],
                'platform' => ['required', 'string', 'in:instagram,youtube,tiktok,facebook,x'],
                'format' => ['nullable', 'string', 'max:50'],
                'pillar' => ['nullable', 'string', 'max:50'],
                'publish_date' => ['nullable', 'date'],
                'caption' => ['nullable', 'string', 'max:2000'],
                'status' => ['nullable', 'string', 'in:inbox,todo,in_progress,ready_to_publish,published,incoming'],
                'redirect_to' => ['nullable', 'string', 'in:planner,stay'],
            ],
            [
                'title.required' => 'Judul konten wajib diisi.',
                'title.min' => 'Judul konten minimal terdiri dari 3 karakter.',
                'title.max' => 'Judul konten maksimal 160 karakter.',
                'platform.required' => 'Pilih salah satu platform tujuan.',
                'platform.in' => 'Platform yang dipilih tidak valid.',
                'publish_date.date' => 'Format tanggal tayang tidak valid.',
                'caption.max' => 'Draft caption maksimal 2000 karakter.',
            ]
        );

        /** @var array<int, array<string, mixed>> $items */
        $items = $request->session()->get('sparc.planner_items', []);

        $newItem = [
            'id' => 'p-'.Str::lower(Str::random(6)),
            'title' => $validated['title'],
            'status' => $validated['status'] ?? 'todo',
            'platform' => $validated['platform'],
            'format' => $validated['format'] ?? 'reels_shorts',
            'pillar' => $validated['pillar'] ?? 'edukasi',
            'picName' => 'Aldwin',
            'picAvatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
            'publishDate' => $validated['publish_date'] ?: now()->addDays(3)->toDateString(),
            'caption' => $validated['caption'] ?? '',
        ];

        array_unshift($items, $newItem);
        $request->session()->put('sparc.planner_items', $items);

        $this->flashToast(
            $request,
            'success',
            'Konten Berhasil Dibuat',
            sprintf('"%s" telah ditambahkan ke alur perencanaan SPARC.', $validated['title'])
        );

        if (($validated['redirect_to'] ?? 'stay') === 'planner') {
            return to_route('planner.index');
        }

        return back();
    }

    /**
     * Update an existing content item's details.
     */
    public function updatePlannerItem(Request $request, string $id): RedirectResponse
    {
        $validated = $request->validate(
            [
                'title' => ['required', 'string', 'min:3', 'max:160'],
                'platform' => ['required', 'string', 'in:instagram,youtube,tiktok,facebook,x'],
                'pillar' => ['nullable', 'string', 'max:50'],
                'publish_date' => ['nullable', 'date'],
                'caption' => ['nullable', 'string', 'max:2000'],
                'published_url' => ['nullable', 'url', 'max:500'],
                'status' => ['nullable', 'string', 'in:inbox,todo,in_progress,ready_to_publish,published,incoming'],
            ],
            [
                'title.required' => 'Judul konten wajib diisi.',
                'title.min' => 'Judul konten minimal 3 karakter.',
                'publish_date.date' => 'Format tanggal tayang tidak valid.',
                'published_url.url' => 'Masukkan URL postingan yang valid (contoh: https://instagram.com/...).',
            ]
        );

        /** @var array<string, array<string, mixed>> $updates */
        $updates = $request->session()->get('sparc.planner_updates', []);
        $updates[$id] = array_filter([
            'title' => $validated['title'],
            'platform' => $validated['platform'],
            'pillar' => $validated['pillar'] ?? null,
            'publishDate' => $validated['publish_date'] ?? null,
            'caption' => $validated['caption'] ?? '',
            'publishedUrl' => $validated['published_url'] ?? '',
            'status' => $validated['status'] ?? null,
        ], fn (mixed $v): bool => $v !== null);
        $request->session()->put('sparc.planner_updates', $updates);

        /** @var array<int, array<string, mixed>> $customItems */
        $customItems = $request->session()->get('sparc.planner_items', []);
        foreach ($customItems as $index => $item) {
            if (($item['id'] ?? '') === $id) {
                $customItems[$index] = array_merge($item, $updates[$id]);
            }
        }
        $request->session()->put('sparc.planner_items', $customItems);

        $this->flashToast(
            $request,
            'success',
            'Konten Berhasil Diperbarui',
            sprintf('Perubahan pada "%s" telah disimpan.', $validated['title'])
        );

        return back();
    }

    /**
     * Update the workflow status of a content item.
     */
    public function updatePlannerStatus(Request $request, string $id): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:inbox,todo,in_progress,ready_to_publish,published,incoming'],
            'title' => ['nullable', 'string', 'max:160'],
        ]);

        /** @var array<string, array<string, mixed>> $updates */
        $updates = $request->session()->get('sparc.planner_updates', []);
        $updates[$id] = array_merge($updates[$id] ?? [], ['status' => $validated['status']]);
        $request->session()->put('sparc.planner_updates', $updates);

        /** @var array<int, array<string, mixed>> $customItems */
        $customItems = $request->session()->get('sparc.planner_items', []);
        foreach ($customItems as $index => $item) {
            if (($item['id'] ?? '') === $id) {
                $customItems[$index]['status'] = $validated['status'];
            }
        }
        $request->session()->put('sparc.planner_items', $customItems);

        $statusLabels = [
            'incoming' => 'Incoming Ticket API',
            'inbox' => 'Inbox Request',
            'todo' => 'To Do (Ideation)',
            'in_progress' => 'In Progress',
            'ready_to_publish' => 'Ready to Publish',
            'published' => 'Published',
        ];

        $label = $statusLabels[$validated['status']] ?? $validated['status'];

        if ($validated['status'] === 'published') {
            $this->flashToast(
                $request,
                'success',
                'Konten Berhasil Dipublikasikan',
                'Konten telah tayang dan siap dipantau pada modul Analytics & Report.'
            );
        } else {
            $this->flashToast(
                $request,
                'info',
                'Status Konten Diperbarui',
                sprintf('Status berhasil dipindahkan ke kolom "%s".', $label)
            );
        }

        return back();
    }

    /**
     * Soft-delete a content item into the session trash list.
     */
    public function destroyPlannerItem(Request $request, string $id): RedirectResponse
    {
        $title = (string) $request->input('title', 'Item Konten');

        /** @var array<int, string> $deletedIds */
        $deletedIds = $request->session()->get('sparc.deleted_planner_ids', []);
        if (! in_array($id, $deletedIds, true)) {
            $deletedIds[] = $id;
            $request->session()->put('sparc.deleted_planner_ids', $deletedIds);
        }

        /** @var array<int, array<string, mixed>> $trashItems */
        $trashItems = $request->session()->get('sparc.trash_items', []);
        array_unshift($trashItems, [
            'id' => 'trash-'.Str::lower(Str::random(6)),
            'sourceId' => $id,
            'type' => 'creative_project',
            'title' => $title,
            'deletedAt' => 'Baru saja',
            'deletedBy' => 'Aldwin (Lead Planner)',
            'details' => 'Dipindahkan dari papan Content Planner',
        ]);
        $request->session()->put('sparc.trash_items', $trashItems);

        $this->flashToast(
            $request,
            'warning',
            'Konten Dipindahkan ke Trash',
            sprintf('"%s" dapat dipulihkan dari menu Trash & Recovery.', $title)
        );

        return back();
    }

    /**
     * Store a scheduled post in the calendar.
     */
    public function storeCalendarEvent(Request $request): RedirectResponse
    {
        $validated = $request->validate(
            [
                'title' => ['required', 'string', 'min:3', 'max:160'],
                'platform' => ['required', 'string', 'in:instagram,youtube,tiktok,facebook'],
                'format' => ['nullable', 'string', 'in:reels,carousel,single,video'],
                'day' => ['required', 'integer', 'min:1', 'max:31'],
                'time' => ['required', 'date_format:H:i'],
                'caption' => ['nullable', 'string', 'max:1000'],
            ],
            [
                'title.required' => 'Judul jadwal konten wajib diisi.',
                'title.min' => 'Judul jadwal konten minimal 3 karakter.',
                'platform.required' => 'Pilih platform media sosial.',
                'day.required' => 'Tanggal publikasi wajib dipilih.',
                'time.required' => 'Jam tayang wajib diisi.',
                'time.date_format' => 'Format jam tayang harus HH:MM (contoh: 10:00).',
            ]
        );

        /** @var array<int, array<string, mixed>> $events */
        $events = $request->session()->get('sparc.calendar_events', []);
        $events[] = [
            'id' => 'e-'.Str::lower(Str::random(6)),
            'day' => (int) $validated['day'],
            'time' => $validated['time'],
            'title' => $validated['title'],
            'platform' => $validated['platform'],
            'format' => $validated['format'] ?? 'reels',
            'status' => 'scheduled',
            'picName' => 'Aldwin',
            'caption' => $validated['caption'] ?? '',
        ];
        $request->session()->put('sparc.calendar_events', $events);

        $this->flashToast(
            $request,
            'success',
            'Jadwal Berhasil Disimpan',
            sprintf('"%s" dijadwalkan tayang tanggal %d pukul %s WIB.', $validated['title'], (int) $validated['day'], $validated['time'])
        );

        return back();
    }

    /**
     * Convert an incoming HaloAPU ticket into a Content Planner item.
     */
    public function convertIncomingTicket(Request $request, string $id): RedirectResponse
    {
        $validated = $request->validate(
            [
                'title' => ['required', 'string', 'min:3', 'max:160'],
                'ticket_code' => ['nullable', 'string', 'max:50'],
                'format' => ['required', 'string', 'in:reels_shorts,carousel_feed,single_feed'],
                'pillar' => ['required', 'string'],
                'pic_name' => ['required', 'string', 'max:100'],
                'target_date' => ['required', 'date'],
            ],
            [
                'title.required' => 'Judul proyek konten wajib diisi.',
                'title.min' => 'Judul proyek minimal 3 karakter.',
                'target_date.required' => 'Target tanggal tayang wajib diisi.',
                'target_date.date' => 'Format tanggal tayang tidak valid.',
            ]
        );

        /** @var array<string, string> $overrides */
        $overrides = $request->session()->get('sparc.ticket_overrides', []);
        $overrides[$id] = 'converted';
        $request->session()->put('sparc.ticket_overrides', $overrides);

        if (Schema::hasTable('haloapu_tickets')) {
            HaloApuTicket::where('id', $id)
                ->orWhere('haloapu_ticket_id', $id)
                ->orWhere('haloapu_ticket_id', $validated['ticket_code'] ?? '')
                ->update([
                    'sync_status' => 'converted',
                    'haloapu_status' => 'on_proses',
                ]);
        }

        $mappedFormat = match ($validated['format']) {
            'carousel_feed' => 'carousel',
            'single_feed' => 'single_image',
            default => 'reels_shorts',
        };

        $mappedPillar = match ($validated['pillar']) {
            'event_liputan' => 'event',
            'sosialisasi_prestasi' => 'promosi',
            'human_touch' => 'hiburan',
            'pengumuman' => 'pengumuman',
            default => 'edukasi',
        };

        /** @var array<int, array<string, mixed>> $items */
        $items = $request->session()->get('sparc.planner_items', []);
        array_unshift($items, [
            'id' => 'p-'.Str::lower(Str::random(6)),
            'ticketId' => $validated['ticket_code'] ? '#'.$validated['ticket_code'] : null,
            'title' => $validated['title'],
            'status' => 'inbox',
            'platform' => 'instagram',
            'format' => $mappedFormat,
            'pillar' => $mappedPillar,
            'picName' => $validated['pic_name'],
            'picAvatar' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
            'publishDate' => $validated['target_date'],
            'caption' => 'Dikonversi dari pengajuan tiket HaloAPU.',
        ]);
        $request->session()->put('sparc.planner_items', $items);

        $this->flashToast(
            $request,
            'success',
            'Tiket Berhasil Dikonversi',
            sprintf('"%s" telah masuk ke kolom Inbox Request di Content Planner.', $validated['title'])
        );

        return to_route('planner.index');
    }

    /**
     * Store manual social media performance metrics.
     */
    public function storeAnalyticsMetric(Request $request): RedirectResponse
    {
        $validated = $request->validate(
            [
                'title' => ['required', 'string', 'min:3', 'max:160'],
                'platform' => ['required', 'string', 'in:instagram,youtube,tiktok'],
                'published_url' => ['required', 'url', 'max:500'],
                'views' => ['required', 'integer', 'min:1'],
                'reach' => ['required', 'integer', 'min:1'],
                'likes' => ['nullable', 'integer', 'min:0'],
                'comments' => ['nullable', 'integer', 'min:0'],
                'shares' => ['nullable', 'integer', 'min:0'],
                'saves' => ['nullable', 'integer', 'min:0'],
            ],
            [
                'title.required' => 'Judul postingan wajib diisi.',
                'title.min' => 'Judul postingan minimal 3 karakter.',
                'published_url.required' => 'Tautan postingan wajib diisi.',
                'published_url.url' => 'Masukkan URL postingan yang valid (diawali https://).',
                'views.required' => 'Jumlah views wajib diisi.',
                'views.min' => 'Jumlah views harus lebih dari 0.',
                'reach.required' => 'Jumlah reach wajib diisi.',
                'reach.min' => 'Jumlah reach harus lebih dari 0.',
            ]
        );

        $likes = (int) ($validated['likes'] ?? 0);
        $comments = (int) ($validated['comments'] ?? 0);
        $shares = (int) ($validated['shares'] ?? 0);
        $saves = (int) ($validated['saves'] ?? 0);
        $reach = max(1, (int) $validated['reach']);
        $er = round((($likes + $comments + $shares + $saves) / $reach) * 100, 1);

        /** @var array<int, array<string, mixed>> $metrics */
        $metrics = $request->session()->get('sparc.analytics_posts', []);
        array_unshift($metrics, [
            'id' => 'm-'.Str::lower(Str::random(6)),
            'title' => $validated['title'],
            'platform' => $validated['platform'],
            'date' => now()->format('j M Y'),
            'views' => (int) $validated['views'],
            'reach' => $reach,
            'likes' => $likes,
            'comments' => $comments,
            'shares' => $shares,
            'saves' => $saves,
            'er' => $er,
        ]);
        $request->session()->put('sparc.analytics_posts', $metrics);

        $this->flashToast(
            $request,
            'success',
            'Metrik Berhasil Disimpan',
            sprintf('Data performa "%s" (ER %s%%) telah diperbarui.', $validated['title'], (string) $er)
        );

        return back();
    }

    /**
     * Store a new creative script project in Studio.
     */
    public function storeStudioProject(Request $request): RedirectResponse
    {
        $validated = $request->validate(
            [
                'title' => ['required', 'string', 'min:3', 'max:160'],
                'format' => ['required', 'string', 'in:reels_shorts,carousel_feed,single_feed'],
                'pillar' => ['required', 'string'],
                'pic_name' => ['required', 'string', 'max:100'],
                'target_date' => ['nullable', 'date'],
            ],
            [
                'title.required' => 'Judul proyek naskah wajib diisi.',
                'title.min' => 'Judul proyek minimal 3 karakter.',
                'target_date.date' => 'Format tanggal tayang tidak valid.',
            ]
        );

        $newId = 'proj-'.Str::lower(Str::random(6));

        /** @var array<int, array<string, mixed>> $projects */
        $projects = $request->session()->get('sparc.studio_projects', []);
        array_unshift($projects, [
            'id' => $newId,
            'title' => $validated['title'],
            'format' => $validated['format'],
            'pillar' => $validated['pillar'],
            'status' => 'drafting',
            'picName' => $validated['pic_name'],
            'targetDate' => $validated['target_date'] ?: null,
            'updatedAt' => 'Baru saja',
        ]);
        $request->session()->put('sparc.studio_projects', $projects);

        $this->flashToast(
            $request,
            'success',
            'Proyek Naskah Berhasil Dibuat',
            sprintf('Membuka ruang kerja Studio untuk "%s".', $validated['title'])
        );

        return to_route('studio.show', ['id' => $newId]);
    }

    /**
     * Helper to push a structured single-source toast notification into the Laravel session.
     */
    protected function flashToast(Request $request, string $type, string $title, ?string $message = null): void
    {
        $request->session()->flash('toast', [
            'id' => (string) Str::uuid(),
            'type' => $type,
            'title' => $title,
            'message' => $message,
        ]);
    }
}
