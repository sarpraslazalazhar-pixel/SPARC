<?php

namespace App\Http\Controllers;

use App\Models\ContentPillar;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CRUD pilar komunikasi untuk administrator (`/settings/pilars`).
 */
class ContentPillarController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $this->authorizeManager($request, 'menambah pilar komunikasi');

        $validated = $request->validate([
            'label' => ['required', 'string', 'max:60'],
            'accent' => ['required', Rule::in(ContentPillar::ACCENTS)],
        ]);

        ContentPillar::create([
            'key' => $this->uniqueKey($validated['label']),
            'label' => $validated['label'],
            'accent' => $validated['accent'],
            'sort_order' => (int) ContentPillar::query()->max('sort_order') + 10,
            'is_active' => true,
        ]);

        WorkspaceV3Controller::flashToast($request, 'success', 'Pilar Ditambahkan', sprintf('"%s" kini tersedia di seluruh modul.', $validated['label']));

        ContentPillar::flushCache();

        return back();
    }

    public function update(Request $request, ContentPillar $contentPillar): RedirectResponse
    {
        $this->authorizeManager($request, 'mengubah pilar komunikasi');

        $validated = $request->validate([
            'label' => ['required', 'string', 'max:60'],
            'accent' => ['required', Rule::in(ContentPillar::ACCENTS)],
            'is_active' => ['required', 'boolean'],
        ]);

        $contentPillar->update($validated);

        WorkspaceV3Controller::flashToast($request, 'success', 'Pilar Diperbarui', sprintf('"%s" tersimpan.', $validated['label']));

        ContentPillar::flushCache();

        return back();
    }

    public function destroy(Request $request, ContentPillar $contentPillar): RedirectResponse
    {
        $this->authorizeManager($request, 'menghapus pilar komunikasi');

        $inUse = WorkspaceV3Controller::countContentItemsByPillar($contentPillar->key);

        if ($inUse > 0) {
            throw ValidationException::withMessages([
                'pillar' => "Pilar \"{$contentPillar->label}\" masih dipakai {$inUse} konten. Nonaktifkan saja, atau pindahkan kontennya dulu.",
            ]);
        }

        $contentPillar->delete();

        WorkspaceV3Controller::flashToast($request, 'success', 'Pilar Dihapus', sprintf('"%s" dihapus dari daftar.', $contentPillar->label));

        ContentPillar::flushCache();

        return back();
    }

    /**
     * Validasi langsung terhadap peran login, bukan peran sesi yang bisa dialihkan dari UI.
     */
    private function authorizeManager(Request $request, string $action): void
    {
        $role = (string) ($request->user()->role ?: $request->user()->primary_role ?: 'viewer');

        if ($role !== 'admin') {
            abort(403, "Hanya Administrator yang memiliki izin {$action}.");
        }
    }

    private function uniqueKey(string $label): string
    {
        do {
            $key = Str::slug($label, '_').'_'.Str::lower(Str::random(4));
        } while (ContentPillar::query()->where('key', $key)->exists());

        return $key;
    }
}
