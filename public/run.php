<?php

use App\Models\InstagramConnection;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;

/**
 * SPARC v3 — Web Artisan Runner for cPanel (No SSH/Terminal)
 * PENTING: Hapus berkas ini setelah selesai melakukan setup/migrasi di hosting!
 */

// Keamanan: Tetapkan PIN akses sementara (bisa Anda ubah di sini)
define('ACCESS_PIN', 'sparc2026');

session_start();

$isAuthenticated = isset($_SESSION['sparc_runner_auth']) && $_SESSION['sparc_runner_auth'] === true;

// Handle login PIN
if (isset($_POST['pin'])) {
    if ($_POST['pin'] === ACCESS_PIN) {
        $_SESSION['sparc_runner_auth'] = true;
        header('Location: run.php');
        exit;
    } else {
        $loginError = 'PIN keamanan salah!';
    }
}

// Handle Logout
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    unset($_SESSION['sparc_runner_auth']);
    session_destroy();
    header('Location: run.php');
    exit;
}

// Handle Self-Delete
if ($isAuthenticated && isset($_POST['action']) && $_POST['action'] === 'self_delete') {
    unlink(__FILE__);
    echo '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Berkas run.php berhasil dihapus dari server!</h2><p><a href="/">Kembali ke Website</a></p></body></html>';
    exit;
}

$output = '';
$executedCmd = '';

if ($isAuthenticated && isset($_POST['command'])) {
    if (function_exists('ignore_user_abort')) {
        @ignore_user_abort(true);
    }
    if (function_exists('set_time_limit')) {
        @set_time_limit(180);
    }
    $executedCmd = trim($_POST['command']);

    // Bootstrap Laravel
    $autoloadPath = __DIR__.'/../vendor/autoload.php';
    $appPath = __DIR__.'/../bootstrap/app.php';

    if (! file_exists($autoloadPath) || ! file_exists($appPath)) {
        // Fallback jika diletakkan di public_html dengan core di ../sparc
        $autoloadPath = __DIR__.'/../sparc/vendor/autoload.php';
        $appPath = __DIR__.'/../sparc/bootstrap/app.php';
    }

    if (! file_exists($autoloadPath)) {
        $output = "ERROR: File vendor/autoload.php tidak ditemukan!\nPastikan folder vendor sudah diunggah ke server.";
    } else {
        try {
            require $autoloadPath;
            /** @var Application $app */
            $app = require_once $appPath;
            $kernel = $app->make(Kernel::class);
            $kernel->bootstrap();

            if ($executedCmd === 'sparc:fix-env') {
                $envFile = base_path('.env');
                if (file_exists($envFile)) {
                    $content = file_get_contents($envFile);
                    $content = preg_replace('/^APP_URL=.*$/m', 'APP_URL=https://sparc.apudev.id', $content);
                    $content = preg_replace('/^META_REDIRECT_URI=.*$/m', 'META_REDIRECT_URI=https://sparc.apudev.id/settings/instagram/oauth/callback', $content);
                    file_put_contents($envFile, $content);
                    Artisan::call('optimize:clear');
                    $output = "Berhasil memperbaiki .env:\n- APP_URL=https://sparc.apudev.id\n- META_REDIRECT_URI=https://sparc.apudev.id/settings/instagram/oauth/callback\n- Cache konfigurasi berhasil dibersihkan (optimize:clear).\n\nSilakan coba klik lagi tombol login Meta di SPARC.";
                } else {
                    $output = 'File .env tidak ditemukan di '.$envFile;
                }
            } elseif ($executedCmd === 'sparc:reset-instagram') {
                if (Schema::hasTable('instagram_connections')) {
                    $conn = InstagramConnection::current();
                    $conn->update([
                        'account_id' => null,
                        'username' => null,
                        'name' => null,
                        'page_id' => null,
                        'page_name' => null,
                        'access_token' => null,
                        'user_access_token' => null,
                        'candidate_accounts' => null,
                        'token_expires_at' => null,
                        'connected' => false,
                    ]);
                    $output = "Koneksi Instagram berhasil diputus & akun dibersihkan total dari database.\nStatus koneksi sekarang: Belum Terhubung.";
                } else {
                    $output = 'Tabel instagram_connections belum tersedia.';
                }
            } elseif ($executedCmd === 'storage:link') {
                try {
                    Artisan::call('storage:link');
                    $output = Artisan::output();
                } catch (Throwable $e) {
                    $target = storage_path('app/public');
                    $link = public_path('storage');
                    if (file_exists($link)) {
                        $output = "Folder/symlink 'storage' sudah ada di public.\n";
                    } elseif (@symlink($target, $link)) {
                        $output = "Symlink manual via PHP berhasil dibuat: {$link} -> {$target}\n";
                    } else {
                        $output = "PERINGATAN: Fungsi symlink dinonaktifkan di hosting ini.\n".$e->getMessage();
                    }
                }
            } elseif ($executedCmd === 'migrate:fresh --force') {
                Artisan::call('migrate:fresh', ['--force' => true]);
                $output = Artisan::output();
            } elseif ($executedCmd === 'migrate:fresh --seed --force') {
                Artisan::call('migrate:fresh', ['--force' => true, '--seed' => true]);
                $output = Artisan::output();
            } else {
                Artisan::call($executedCmd);
                $output = Artisan::output();
            }

            if (empty(trim($output))) {
                $output = "Perintah '{$executedCmd}' berhasil dijalankan (tanpa pesan keluaran).";
            }
        } catch (Throwable $e) {
            $output = "ERROR EXCEPTION:\n".$e->getMessage()."\n\nStack Trace:\n".$e->getTraceAsString();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SPARC v3 — Web Artisan Runner</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f1f5f9; padding: 24px; line-height: 1.5; }
        .container { max-width: 860px; margin: 0 auto; }
        .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
        h1 { font-size: 20px; font-weight: 700; color: #38bdf8; margin-bottom: 6px; }
        .alert-warning { background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; padding: 12px 16px; border-radius: 10px; font-size: 13px; margin-bottom: 20px; }
        .btn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px; }
        button, .btn { padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 13px; border: none; cursor: pointer; transition: all 0.15s ease; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-primary { background: #0284c7; color: white; }
        .btn-primary:hover { background: #0369a1; }
        .btn-success { background: #059669; color: white; }
        .btn-success:hover { background: #047857; }
        .btn-amber { background: #d97706; color: white; }
        .btn-amber:hover { background: #b45309; }
        .btn-danger { background: #dc2626; color: white; }
        .btn-danger:hover { background: #b91c1c; }
        .btn-secondary { background: #334155; color: #f8fafc; }
        .btn-secondary:hover { background: #475569; }
        .terminal { background: #030712; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; color: #4ade80; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; margin-top: 14px; }
        input[type="text"], input[type="password"] { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid #334155; background: #0f172a; color: white; font-size: 13px; margin-bottom: 12px; }
        .custom-form { display: flex; gap: 10px; }
        .custom-form input { margin-bottom: 0; }
        .status-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 12px; color: #94a3b8; }
    </style>
</head>
<body>
<div class="container">
    <div class="alert-warning">
        <strong>PENTING:</strong> Berkas ini hanya untuk mempermudah menjalankan Artisan di cPanel tanpa terminal. <strong>Wajib klik tombol "Hapus run.php Ini" di bagian bawah</strong> setelah Anda selesai setup.
    </div>

    <?php if (! $isAuthenticated) { ?>
        <div class="card" style="max-width: 400px; margin: 40px auto;">
            <h1>Keamanan Runner</h1>
            <p style="font-size: 12px; color: #94a3b8; margin-bottom: 16px;">Masukkan PIN keamanan untuk mengakses runner.</p>
            <?php if (isset($loginError)) { ?>
                <div style="color: #f87171; font-size: 12px; margin-bottom: 10px;"><?= htmlspecialchars($loginError) ?></div>
            <?php } ?>
            <form method="POST">
                <input type="password" name="pin" placeholder="Default PIN: sparc2026" autofocus required>
                <button type="submit" class="btn-primary" style="width: 100%;">Buka Runner</button>
            </form>
        </div>
    <?php } else { ?>
        <div class="card">
            <div class="status-row">
                <span>PHP <?= phpversion() ?> • Laravel Artisan Helper</span>
                <a href="?action=logout" class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;">Keluar</a>
            </div>

            <h2 style="font-size: 15px; margin-bottom: 12px; color: #cbd5e1;">Aksi Cepat Artisan:</h2>
            <div class="btn-grid">
                <form method="POST">
                    <input type="hidden" name="command" value="migrate --force">
                    <button type="submit" class="btn-success" style="width: 100%;">1. Jalankan Migration</button>
                </form>

                <form method="POST">
                    <input type="hidden" name="command" value="storage:link">
                    <button type="submit" class="btn-primary" style="width: 100%;">2. Buat Storage Link</button>
                </form>

                <form method="POST">
                    <input type="hidden" name="command" value="optimize:clear">
                    <button type="submit" class="btn-amber" style="width: 100%;">3. Clear Semua Cache</button>
                </form>

                <form method="POST">
                    <input type="hidden" name="command" value="optimize">
                    <button type="submit" class="btn-primary" style="width: 100%;">4. Optimize (Cache Route/Config)</button>
                </form>

                <form method="POST">
                    <input type="hidden" name="command" value="instagram:sync-metrics">
                    <button type="submit" class="btn-success" style="width: 100%;">5. Sync Instagram via Runner (1000 Post)</button>
                </form>

                <form method="POST">
                    <input type="hidden" name="command" value="key:generate --show">
                    <button type="submit" class="btn-secondary" style="width: 100%;">Generate APP_KEY</button>
                </form>

                <form method="POST">
                    <input type="hidden" name="command" value="db:seed --force">
                    <button type="submit" class="btn-secondary" style="width: 100%;">Jalankan Seeder</button>
                </form>
                <form method="POST" onsubmit="return confirm('PERINGATAN: Ini akan menghapus SEMUA data di database lalu membuat ulang tabel dari awal. Lanjutkan?');">
                    <input type="hidden" name="command" value="migrate:fresh --force">
                    <button type="submit" class="btn-danger" style="width: 100%;">Migrate Fresh (Reset DB)</button>
                </form>
                <form method="POST" onsubmit="return confirm('PERINGATAN: Ini akan menghapus SEMUA data di database, membuat ulang tabel, lalu mengisi ulang data seeder. Lanjutkan?');">
                    <input type="hidden" name="command" value="migrate:fresh --seed --force">
                    <button type="submit" class="btn-danger" style="width: 100%;">Migrate Fresh + Seed</button>
                </form>
                <form method="POST">
                    <input type="hidden" name="command" value="sparc:reset-instagram">
                    <button type="submit" class="btn-secondary" style="width: 100%;">Reset Akun Instagram</button>
                </form>
                <form method="POST">
                    <input type="hidden" name="command" value="sparc:fix-env">
                    <button type="submit" class="btn-success" style="width: 100%;">Perbaiki .ENV ke HTTPS (sparc.apudev.id)</button>
                </form>
            </div>

            <h2 style="font-size: 13px; margin-bottom: 8px; color: #94a3b8;">Perintah Kustom:</h2>
            <form method="POST" class="custom-form">
                <input type="text" name="command" placeholder="Contoh: route:list atau config:clear" required>
                <button type="submit" class="btn-secondary">Jalankan</button>
            </form>

            <?php if (! empty($executedCmd)) { ?>
                <div style="margin-top: 16px;">
                    <div style="font-size: 12px; color: #94a3b8;">Output: <code>php artisan <?= htmlspecialchars($executedCmd) ?></code></div>
                    <div class="terminal"><?= htmlspecialchars($output) ?></div>
                </div>
            <?php } ?>
        </div>

        <div class="card" style="border-color: rgba(220, 38, 38, 0.4); background: rgba(220, 38, 38, 0.05);">
            <h3 style="font-size: 14px; color: #f87171; margin-bottom: 8px;">Pembersihan Keamanan:</h3>
            <p style="font-size: 12px; color: #cbd5e1; margin-bottom: 12px;">
                Jika website sudah normal dan migrasi selesai, segera hapus file ini agar tidak bisa diakses orang lain.
            </p>
            <form method="POST" onsubmit="return confirm('Hapus file run.php ini secara permanen dari server?');">
                <input type="hidden" name="action" value="self_delete">
                <button type="submit" class="btn-danger">Hapus run.php Ini Sekarang</button>
            </form>
        </div>
    <?php } ?>
</div>
</body>
</html>
