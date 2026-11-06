<?php

namespace App\Services;

use App\Models\ContentItem;
use App\Models\InstagramComment;
use App\Models\InstagramConnection;
use App\Models\InstagramSchedule;
use Illuminate\Http\Client\Batch;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class InstagramGraphService
{
    /**
     * Full recommended Meta Graph API OAuth scopes for SPARC HUMAS operations.
     *
     * @var array<int, string>
     */
    public const FULL_OAUTH_SCOPES = [
        'instagram_basic',
        'pages_show_list',
        'pages_read_engagement',
        'instagram_manage_insights',
        'instagram_content_publish',
        'instagram_manage_comments',
        'ads_read',
        'ads_management',
    ];

    protected ?string $accountId;

    protected ?string $accessToken;

    protected string $graphVersion;

    protected string $baseUrl;

    protected ?string $resolvedIgIdCache = null;

    /**
     * Create a new InstagramGraphService instance.
     */
    public function __construct(?string $accountId = null, ?string $accessToken = null, ?string $graphVersion = null)
    {
        $resolvedAccountId = $accountId;
        $resolvedAccessToken = $accessToken;

        // 1. Database singleton record (primary persistence)
        if (empty($resolvedAccountId) || empty($resolvedAccessToken)) {
            try {
                if (Schema::hasTable('instagram_connections')) {
                    $conn = InstagramConnection::current();
                    if (empty($resolvedAccountId) && ! empty($conn->account_id)) {
                        $resolvedAccountId = $conn->account_id;
                    }
                    if (empty($resolvedAccessToken) && ! empty($conn->access_token)) {
                        $resolvedAccessToken = $conn->access_token;
                    }
                }
            } catch (\Throwable) {
                // Ignore DB errors during early bootstrap
            }
        }

        // 2. Session store (legacy test compatibility)
        if (empty($resolvedAccountId) || empty($resolvedAccessToken)) {
            $sessionSettings = session('sparc_v3.settings.instagram', []);
            if (empty($resolvedAccountId)) {
                $resolvedAccountId = $sessionSettings['account_id'] ?? $sessionSettings['accountId'] ?? null;
            }
            if (empty($resolvedAccessToken)) {
                $resolvedAccessToken = $sessionSettings['access_token'] ?? $sessionSettings['accessToken'] ?? null;
            }
        }

        // 3. Configuration & .env
        if (empty($resolvedAccountId) || empty($resolvedAccessToken)) {
            if (empty($resolvedAccountId)) {
                $resolvedAccountId = config('services.instagram.account_id');
            }
            if (empty($resolvedAccessToken)) {
                $resolvedAccessToken = config('services.instagram.access_token');
            }
        }

        $rawAccountId = (string) $resolvedAccountId;
        $this->accountId = trim($rawAccountId, " \t\n\r\0\x0B\"'");

        $rawToken = (string) $resolvedAccessToken;
        $cleanToken = trim($rawToken, " \t\n\r\0\x0B\"'");
        if (str_starts_with($cleanToken, 'Bearer ')) {
            $cleanToken = trim(substr($cleanToken, 7));
        }
        $this->accessToken = $cleanToken;

        // Direct .env fallback if the PHP server process cached empty env values
        if (empty($this->accountId) || empty($this->accessToken)) {
            $envPath = base_path('.env');
            if (file_exists($envPath)) {
                $envContent = (string) @file_get_contents($envPath);
                if (empty($this->accountId) && preg_match('/^INSTAGRAM_ACCOUNT_ID=(.*)$/m', $envContent, $m)) {
                    $this->accountId = trim($m[1], " \t\n\r\0\x0B\"'");
                }
                if (empty($this->accessToken) && preg_match('/^INSTAGRAM_ACCESS_TOKEN=(.*)$/m', $envContent, $m)) {
                    $t = trim($m[1], " \t\n\r\0\x0B\"'");
                    if (str_starts_with($t, 'Bearer ')) {
                        $t = trim(substr($t, 7));
                    }
                    $this->accessToken = $t;
                }
            }
        }

        $this->graphVersion = $graphVersion
            ?: (string) config('services.instagram.graph_version', 'v21.0');

        $this->baseUrl = sprintf('https://graph.facebook.com/%s', trim($this->graphVersion, '/'));
    }

    /**
     * Check if minimum Meta Graph API credentials are configured.
     */
    public function isConfigured(): bool
    {
        return ! empty($this->accountId) && ! empty($this->accessToken);
    }

    /**
     * Resolve Meta OAuth Application Credentials from DB or Config.
     *
     * @return array{app_id: string, app_secret: string, redirect_uri: string}
     */
    public function resolveAppCredentials(): array
    {
        $appId = '';
        $appSecret = '';

        try {
            if (Schema::hasTable('instagram_connections')) {
                $conn = InstagramConnection::current();
                $appId = (string) ($conn->app_id ?? '');
                $appSecret = (string) ($conn->app_secret ?? '');
            }
        } catch (\Throwable) {
            // Ignore DB errors during bootstrap
        }

        if (empty($appId)) {
            $appId = (string) config('services.instagram.app_id', '');
        }
        if (empty($appSecret)) {
            $appSecret = (string) config('services.instagram.app_secret', '');
        }

        if (empty($appId) || empty($appSecret)) {
            $envPath = base_path('.env');
            if (file_exists($envPath)) {
                $envContent = (string) @file_get_contents($envPath);
                if (empty($appId) && preg_match('/^META_APP_ID=(.*)$/m', $envContent, $m)) {
                    $appId = trim($m[1], " \t\n\r\0\x0B\"'");
                }
                if (empty($appSecret) && preg_match('/^META_APP_SECRET=(.*)$/m', $envContent, $m)) {
                    $appSecret = trim($m[1], " \t\n\r\0\x0B\"'");
                }
            }
        }

        $redirectUri = (string) config('services.instagram.redirect_uri', '');
        if (empty($redirectUri)) {
            try {
                $redirectUri = route('settings.instagram.oauth.callback');
            } catch (\Throwable) {
                $redirectUri = url('/settings/instagram/oauth/callback');
            }
        }

        return [
            'app_id' => $appId,
            'app_secret' => $appSecret,
            'redirect_uri' => $redirectUri,
        ];
    }

    /**
     * Check whether Meta App ID and App Secret are configured.
     */
    public function hasAppCredentials(): bool
    {
        $creds = $this->resolveAppCredentials();

        return ! empty($creds['app_id']) && ! empty($creds['app_secret']);
    }

    /**
     * Resolve effective OAuth scopes from database selection or configuration.
     *
     * @return array<int, string>
     */
    public function resolveRequestedScopes(): array
    {
        try {
            if (Schema::hasTable('instagram_connections')) {
                $conn = InstagramConnection::current();
                if (is_array($conn->requested_scopes) && ! empty($conn->requested_scopes)) {
                    $base = ['instagram_basic', 'pages_show_list', 'pages_read_engagement'];

                    return array_values(array_unique(array_merge($base, $conn->requested_scopes)));
                }
            }
        } catch (\Throwable) {
            // Fallback to config
        }

        $configured = (string) config(
            'services.instagram.oauth_scopes',
            implode(',', self::FULL_OAUTH_SCOPES)
        );

        $parsed = array_values(array_filter(array_map('trim', explode(',', $configured))));

        return ! empty($parsed) ? $parsed : self::FULL_OAUTH_SCOPES;
    }

    /**
     * Build OAuth authorization URL for Meta Facebook Login.
     */
    public function getOAuthRedirectUrl(string $state, ?array $overrideScopes = null): string
    {
        $creds = $this->resolveAppCredentials();
        $scopesList = ! empty($overrideScopes) ? $overrideScopes : $this->resolveRequestedScopes();
        $params = http_build_query([
            'client_id' => $creds['app_id'],
            'redirect_uri' => $creds['redirect_uri'],
            'state' => $state,
            'response_type' => 'code',
            'scope' => implode(',', $scopesList),
        ]);

        return sprintf('https://www.facebook.com/%s/dialog/oauth?%s', trim($this->graphVersion, '/'), $params);
    }

    /**
     * Capture Meta rate-limit headers (`X-App-Usage`, `X-Business-Use-Case-Usage`) and append sync log.
     */
    public function captureApiTelemetry(?Response $response, string $operation, float $startedAt, string $note, bool $ok = true): void
    {
        try {
            if (! Schema::hasTable('instagram_connections') || ! Schema::hasColumn('instagram_connections', 'sync_logs')) {
                return;
            }

            $conn = InstagramConnection::current();
            $latencyMs = max(1, (int) round((microtime(true) - $startedAt) * 1000));
            $updates = [];

            if ($response !== null) {
                $appUsageHeader = $response->header('x-app-usage') ?: $response->header('X-App-Usage');
                $bucUsageHeader = $response->header('x-business-use-case-usage') ?: $response->header('X-Business-Use-Case-Usage');

                if (! empty($appUsageHeader)) {
                    $decoded = json_decode($appUsageHeader, true);
                    if (is_array($decoded)) {
                        $updates['rate_limit_usage'] = [
                            'call_pct' => (int) ($decoded['call_count'] ?? 0),
                            'cpu_pct' => (int) ($decoded['total_cputime'] ?? 0),
                            'time_pct' => (int) ($decoded['total_time'] ?? 0),
                            'source' => 'x-app-usage',
                            'updated_at' => now()->format('d M Y, H:i').' WIB',
                        ];
                    }
                } elseif (! empty($bucUsageHeader)) {
                    $decoded = json_decode($bucUsageHeader, true);
                    if (is_array($decoded)) {
                        $firstBucket = reset($decoded);
                        $firstEntry = is_array($firstBucket) ? ($firstBucket[0] ?? []) : [];
                        if (is_array($firstEntry) && ! empty($firstEntry)) {
                            $updates['rate_limit_usage'] = [
                                'call_pct' => (int) ($firstEntry['call_count'] ?? 0),
                                'cpu_pct' => (int) ($firstEntry['total_cputime'] ?? 0),
                                'time_pct' => (int) ($firstEntry['total_time'] ?? 0),
                                'estimated_time_to_regain_access' => (int) ($firstEntry['estimated_time_to_regain_access'] ?? 0),
                                'source' => 'x-business-use-case-usage',
                                'updated_at' => now()->format('d M Y, H:i').' WIB',
                            ];
                        }
                    }
                }
            }

            $logs = is_array($conn->sync_logs) ? $conn->sync_logs : [];
            array_unshift($logs, [
                'id' => 'iglog-'.Str::lower(Str::random(6)),
                'timestamp' => now()->format('d M Y H:i:s'),
                'operation' => $operation,
                'status' => $ok ? 'success' : 'error',
                'latencyMs' => $latencyMs,
                'note' => $note,
            ]);
            $updates['sync_logs'] = array_slice($logs, 0, 30);

            $conn->update($updates);
        } catch (\Throwable) {
            // Telemetry should never interrupt user flow
        }
    }

    /**
     * Inspect active token permissions from Meta `/me/permissions`.
     *
     * @return array{success: bool, granted: array<int, string>, capabilities: array{basic: bool, insights: bool, publish: bool, comments: bool}, error?: string}
     */
    public function inspectTokenPermissions(?string $overrideToken = null): array
    {
        $tokenToInspect = $overrideToken;
        if (empty($tokenToInspect)) {
            try {
                if (Schema::hasTable('instagram_connections')) {
                    $conn = InstagramConnection::current();
                    $tokenToInspect = $conn->user_access_token ?: $conn->access_token;
                }
            } catch (\Throwable) {
                // fallback
            }
        }
        $tokenToInspect = $tokenToInspect ?: $this->accessToken;

        if (empty($tokenToInspect)) {
            return [
                'success' => false,
                'granted' => [],
                'capabilities' => [
                    'basic' => false,
                    'insights' => false,
                    'publish' => false,
                    'comments' => false,
                ],
                'error' => 'Token belum tersedia untuk diperiksa.',
            ];
        }

        $started = microtime(true);

        try {
            $response = Http::timeout(10)->get(sprintf('%s/me/permissions', $this->baseUrl), [
                'access_token' => $tokenToInspect,
            ]);

            if (! $response->successful()) {
                return [
                    'success' => false,
                    'granted' => [],
                    'capabilities' => [
                        'basic' => false,
                        'insights' => false,
                        'publish' => false,
                        'comments' => false,
                    ],
                    'error' => $response->json('error.message') ?? 'Gagal memeriksa daftar izin token Meta.',
                ];
            }

            /** @var array<int, array<string, mixed>> $rows */
            $rows = $response->json('data') ?? [];
            $granted = [];
            foreach ($rows as $row) {
                if (($row['status'] ?? '') === 'granted' && ! empty($row['permission'])) {
                    $granted[] = (string) $row['permission'];
                }
            }

            if (Schema::hasTable('instagram_connections') && Schema::hasColumn('instagram_connections', 'granted_scopes') && ! empty($granted)) {
                InstagramConnection::current()->update(['granted_scopes' => array_values(array_unique($granted))]);
            }

            $this->captureApiTelemetry($response, 'permissions_check', $started, sprintf('%d izin aktif terverifikasi.', count($granted)));

            return [
                'success' => true,
                'granted' => $granted,
                'capabilities' => self::mapCapabilitiesFromScopes($granted),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'granted' => [],
                'capabilities' => [
                    'basic' => false,
                    'insights' => false,
                    'publish' => false,
                    'comments' => false,
                ],
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Map raw Meta scope names into SPARC functional capability flags.
     *
     * @param  array<int, string>  $scopes
     * @return array{basic: bool, insights: bool, publish: bool, comments: bool, ads: bool}
     */
    public static function mapCapabilitiesFromScopes(array $scopes): array
    {
        return [
            'basic' => count(array_intersect($scopes, ['instagram_basic', 'instagram_business_basic'])) > 0,
            'insights' => count(array_intersect($scopes, ['instagram_manage_insights', 'instagram_business_manage_insights'])) > 0,
            'publish' => count(array_intersect($scopes, ['instagram_content_publish', 'instagram_business_content_publish'])) > 0,
            'comments' => count(array_intersect($scopes, ['instagram_manage_comments', 'instagram_business_manage_comments'])) > 0,
            'ads' => count(array_intersect($scopes, ['ads_read', 'ads_management'])) > 0,
        ];
    }

    /**
     * Automatically refresh Long-Lived Token if close to expiry (or when forced).
     *
     * @return array{success: bool, refreshed: bool, expires_at?: string, days_remaining?: int|null, error?: string}
     */
    public function refreshTokenIfExpiring(int $thresholdDays = 14, bool $force = false): array
    {
        if (! Schema::hasTable('instagram_connections')) {
            return ['success' => false, 'refreshed' => false, 'error' => 'Tabel koneksi belum tersedia.'];
        }

        $conn = InstagramConnection::current();
        $sourceToken = (string) ($conn->user_access_token ?: $conn->access_token ?: $this->accessToken);

        if (empty($sourceToken)) {
            return ['success' => false, 'refreshed' => false, 'error' => 'Token akses belum dikonfigurasi.'];
        }

        if (! $force && $conn->token_expires_at !== null) {
            $daysLeft = (int) now()->diffInDays($conn->token_expires_at, false);
            if ($daysLeft > $thresholdDays) {
                return [
                    'success' => true,
                    'refreshed' => false,
                    'expires_at' => $conn->token_expires_at->toIso8601String(),
                    'days_remaining' => $daysLeft,
                ];
            }
        }

        $started = microtime(true);

        try {
            $newToken = '';
            $expiresIn = 5184000;
            $response = null;

            if (str_starts_with($sourceToken, 'IG')) {
                $response = Http::timeout(15)->get('https://graph.instagram.com/refresh_access_token', [
                    'grant_type' => 'ig_refresh_token',
                    'access_token' => $sourceToken,
                ]);
                if ($response->successful()) {
                    $newToken = (string) ($response->json('access_token') ?? '');
                    $expiresIn = (int) ($response->json('expires_in') ?: 5184000);
                }
            } elseif ($this->hasAppCredentials()) {
                $creds = $this->resolveAppCredentials();
                $response = Http::timeout(15)->get(sprintf('%s/oauth/access_token', $this->baseUrl), [
                    'grant_type' => 'fb_exchange_token',
                    'client_id' => $creds['app_id'],
                    'client_secret' => $creds['app_secret'],
                    'fb_exchange_token' => $sourceToken,
                ]);
                if ($response->successful()) {
                    $newToken = (string) ($response->json('access_token') ?? '');
                    $expiresIn = (int) ($response->json('expires_in') ?: 5184000);
                }
            } else {
                return [
                    'success' => false,
                    'refreshed' => false,
                    'error' => 'Meta App ID & App Secret diperlukan untuk memperpanjang token Facebook Login secara otomatis.',
                ];
            }

            if (empty($newToken)) {
                $errMsg = $response?->json('error.message') ?? 'Gagal memperpanjang masa aktif token Meta.';
                $this->captureApiTelemetry($response, 'token_refresh', $started, $errMsg, false);

                return [
                    'success' => false,
                    'refreshed' => false,
                    'error' => $errMsg,
                ];
            }

            $expiresAt = now()->addSeconds($expiresIn);
            $effectivePageToken = $newToken;

            if (! str_starts_with($newToken, 'IG') && ! empty($conn->account_id)) {
                $discovered = $this->discoverInstagramAccounts($newToken);
                if ($discovered['success'] ?? false) {
                    $matchedAcc = collect($discovered['accounts'])->firstWhere('account_id', $conn->account_id);
                    if (is_array($matchedAcc) && ! empty($matchedAcc['page_access_token'])) {
                        $effectivePageToken = (string) $matchedAcc['page_access_token'];
                    }
                }
            }

            $conn->update([
                'user_access_token' => $newToken,
                'access_token' => $effectivePageToken,
                'token_expires_at' => $expiresAt,
                'token_refreshed_at' => now(),
                'connected' => true,
            ]);

            $this->accessToken = $effectivePageToken;
            $this->captureApiTelemetry($response, 'token_refresh', $started, 'Token akses berhasil diperpanjang 60 hari ke depan.');

            return [
                'success' => true,
                'refreshed' => true,
                'expires_at' => $expiresAt->toIso8601String(),
                'days_remaining' => (int) now()->diffInDays($expiresAt, false),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'refreshed' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Exchange an authorization code for a Long-Lived User Access Token (60 Days).
     *
     * @return array{success: bool, access_token?: string, expires_in?: int, error?: string}
     */
    public function exchangeCodeForLongLivedToken(string $code, ?string $redirectUri = null): array
    {
        $creds = $this->resolveAppCredentials();
        if (! $this->hasAppCredentials()) {
            return [
                'success' => false,
                'error' => 'Meta App ID dan App Secret belum dikonfigurasi.',
            ];
        }

        $uri = $redirectUri ?: $creds['redirect_uri'];

        try {
            $response = Http::timeout(15)->get(sprintf('%s/oauth/access_token', $this->baseUrl), [
                'client_id' => $creds['app_id'],
                'client_secret' => $creds['app_secret'],
                'redirect_uri' => $uri,
                'code' => $code,
            ]);

            if (! $response->successful()) {
                $errorMsg = $response->json('error.message')
                    ?? sprintf('HTTP %d: Gagal menukar kode otorisasi Facebook.', $response->status());

                return [
                    'success' => false,
                    'error' => $errorMsg,
                ];
            }

            /** @var array<string, mixed> $shortData */
            $shortData = $response->json();
            $shortToken = (string) ($shortData['access_token'] ?? '');
            $expiresIn = isset($shortData['expires_in']) ? (int) $shortData['expires_in'] : 5184000;

            if (empty($shortToken)) {
                return [
                    'success' => false,
                    'error' => 'Token akses tidak ditemukan dalam respon Meta.',
                ];
            }

            $exchangeResponse = Http::timeout(15)->get(sprintf('%s/oauth/access_token', $this->baseUrl), [
                'grant_type' => 'fb_exchange_token',
                'client_id' => $creds['app_id'],
                'client_secret' => $creds['app_secret'],
                'fb_exchange_token' => $shortToken,
            ]);

            if ($exchangeResponse->successful()) {
                /** @var array<string, mixed> $longData */
                $longData = $exchangeResponse->json();
                $longToken = (string) ($longData['access_token'] ?? '');
                $longExpires = isset($longData['expires_in']) ? (int) $longData['expires_in'] : 5184000;

                if (! empty($longToken)) {
                    return [
                        'success' => true,
                        'access_token' => $longToken,
                        'expires_in' => $longExpires,
                    ];
                }
            }

            return [
                'success' => true,
                'access_token' => $shortToken,
                'expires_in' => $expiresIn,
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Exchange a manually provided user token for a 60-day Long-Lived Token if App credentials exist.
     *
     * @return array{success: bool, access_token: string, expires_in?: int, upgraded: bool}
     */
    public function exchangeManualTokenForLongLived(string $rawToken): array
    {
        if (! $this->hasAppCredentials()) {
            return [
                'success' => false,
                'access_token' => $rawToken,
                'upgraded' => false,
            ];
        }

        $creds = $this->resolveAppCredentials();

        try {
            $response = Http::timeout(15)->get(sprintf('%s/oauth/access_token', $this->baseUrl), [
                'grant_type' => 'fb_exchange_token',
                'client_id' => $creds['app_id'],
                'client_secret' => $creds['app_secret'],
                'fb_exchange_token' => $rawToken,
            ]);

            if ($response->successful()) {
                /** @var array<string, mixed> $data */
                $data = $response->json();
                $token = (string) ($data['access_token'] ?? '');
                $expiresIn = isset($data['expires_in']) ? (int) $data['expires_in'] : 5184000;

                if (! empty($token)) {
                    return [
                        'success' => true,
                        'access_token' => $token,
                        'expires_in' => $expiresIn,
                        'upgraded' => true,
                    ];
                }
            }
        } catch (\Throwable) {
            // fallback below
        }

        return [
            'success' => false,
            'access_token' => $rawToken,
            'upgraded' => false,
        ];
    }

    /**
     * Discover connected Instagram Business / Creator accounts from a User Access Token.
     *
     * @return array{success: bool, accounts: array<int, array{account_id: string, username: string, name: string, page_id: string, page_name: string, page_access_token: string}>, error?: string}
     */
    public function discoverInstagramAccounts(string $userAccessToken): array
    {
        try {
            $response = Http::timeout(15)->get(sprintf('%s/me/accounts', $this->baseUrl), [
                'fields' => 'id,name,access_token,instagram_business_account{id,username,name,followers_count,media_count,profile_picture_url,biography}',
                'limit' => 100,
                'access_token' => $userAccessToken,
            ]);

            if (! $response->successful()) {
                $errorMsg = $response->json('error.message')
                    ?? sprintf('HTTP %d: Gagal mengambil daftar Halaman Facebook dari Meta.', $response->status());

                return [
                    'success' => false,
                    'accounts' => [],
                    'error' => $errorMsg,
                ];
            }

            /** @var array<int, array<string, mixed>> $pages */
            $pages = $response->json('data') ?? [];
            $accounts = [];

            foreach ($pages as $page) {
                if (empty($page['instagram_business_account']['id'])) {
                    continue;
                }

                /** @var array<string, mixed> $ig */
                $ig = $page['instagram_business_account'];
                $igId = (string) $ig['id'];
                $username = (string) ($ig['username'] ?? '');
                $name = (string) ($ig['name'] ?? $page['name'] ?? '');
                $pageId = (string) ($page['id'] ?? '');
                $pageName = (string) ($page['name'] ?? '');
                $pageAccessToken = (string) ($page['access_token'] ?? $userAccessToken);

                if (empty($username)) {
                    try {
                        $detail = Http::timeout(8)->get(sprintf('%s/%s', $this->baseUrl, $igId), [
                            'fields' => 'id,username,name',
                            'access_token' => $pageAccessToken,
                        ]);
                        if ($detail->successful()) {
                            $username = (string) ($detail->json('username') ?? '');
                            if (! empty($detail->json('name'))) {
                                $name = (string) $detail->json('name');
                            }
                        }
                    } catch (\Throwable) {
                        // ignore and use fallback
                    }
                }

                $accounts[] = [
                    'account_id' => $igId,
                    'username' => $username ?: $igId,
                    'name' => $name,
                    'page_id' => $pageId,
                    'page_name' => $pageName,
                    'page_access_token' => $pageAccessToken,
                    'followers_count' => isset($ig['followers_count']) ? (int) $ig['followers_count'] : null,
                    'media_count' => isset($ig['media_count']) ? (int) $ig['media_count'] : null,
                    'profile_picture_url' => $ig['profile_picture_url'] ?? null,
                    'biography' => $ig['biography'] ?? null,
                ];
            }

            if (empty($accounts)) {
                return [
                    'success' => false,
                    'accounts' => [],
                    'error' => 'Tidak ada Halaman Facebook dengan akun Instagram Bisnis/Kreator yang ditemukan pada akun Facebook ini. Pastikan akun IG sudah ditautkan ke Facebook Page dan dicentang saat login.',
                ];
            }

            return [
                'success' => true,
                'accounts' => $accounts,
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'accounts' => [],
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Test connection to the Instagram Business account and capture profile fields when available.
     *
     * @return array{success: bool, data?: array<string, mixed>, error?: string}
     */
    public function testConnection(): array
    {
        if (! $this->isConfigured()) {
            return [
                'success' => false,
                'error' => 'Kredensial Meta/Instagram Graph API belum lengkap. Mohon isi Account ID dan Access Token.',
            ];
        }

        $started = microtime(true);

        try {
            $nodeResponse = Http::timeout(10)->get(sprintf('%s/%s', $this->baseUrl, $this->accountId), [
                'fields' => 'id,name,username,biography,website,profile_picture_url,followers_count,follows_count,media_count,instagram_business_account{id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count}',
                'access_token' => $this->accessToken,
            ]);

            if ($nodeResponse->successful()) {
                /** @var array<string, mixed> $nodeData */
                $nodeData = $nodeResponse->json();

                if (! empty($nodeData['instagram_business_account']['id'])) {
                    /** @var array<string, mixed> $ig */
                    $ig = $nodeData['instagram_business_account'];
                    $igUsername = (string) ($ig['username'] ?? '');

                    if (empty($igUsername)) {
                        $igDetail = Http::timeout(10)->get(sprintf('%s/%s', $this->baseUrl, $ig['id']), [
                            'fields' => 'id,username,name',
                            'access_token' => $this->accessToken,
                        ]);
                        if ($igDetail->successful()) {
                            $igUsername = (string) ($igDetail->json('username') ?? '');
                        }
                    }

                    $this->captureApiTelemetry($nodeResponse, 'test_connection', $started, sprintf('Koneksi terverifikasi ke @%s via Page.', $igUsername ?: $ig['id']));

                    return [
                        'success' => true,
                        'data' => [
                            'id' => (string) $ig['id'],
                            'username' => $igUsername ?: 'instagram_user',
                            'name' => (string) ($ig['name'] ?? $nodeData['name'] ?? ''),
                            'biography' => $ig['biography'] ?? null,
                            'website' => $ig['website'] ?? null,
                            'profile_picture_url' => $ig['profile_picture_url'] ?? null,
                            'followers_count' => isset($ig['followers_count']) ? (int) $ig['followers_count'] : null,
                            'follows_count' => isset($ig['follows_count']) ? (int) $ig['follows_count'] : null,
                            'media_count' => isset($ig['media_count']) ? (int) $ig['media_count'] : null,
                            'page_id' => (string) $nodeData['id'],
                            'page_name' => (string) ($nodeData['name'] ?? ''),
                            'resolved_from_page' => true,
                        ],
                    ];
                }

                if (! empty($nodeData['username'])) {
                    $this->captureApiTelemetry($nodeResponse, 'test_connection', $started, sprintf('Koneksi terverifikasi ke @%s.', $nodeData['username']));

                    return [
                        'success' => true,
                        'data' => $nodeData,
                    ];
                }

                return [
                    'success' => false,
                    'error' => sprintf(
                        'ID "%s" adalah Halaman Facebook ("%s"), namun belum terhubung ke akun Instagram Bisnis.',
                        $this->accountId,
                        $nodeData['name'] ?? 'Page'
                    ),
                ];
            }

            $igDirect = Http::timeout(10)->get(sprintf('%s/%s', $this->baseUrl, $this->accountId), [
                'fields' => 'id,username,name,followers_count,media_count,profile_picture_url',
                'access_token' => $this->accessToken,
            ]);

            if ($igDirect->successful() && ! empty($igDirect->json('username'))) {
                $this->captureApiTelemetry($igDirect, 'test_connection', $started, sprintf('Koneksi langsung terverifikasi ke @%s.', $igDirect->json('username')));

                return [
                    'success' => true,
                    'data' => $igDirect->json(),
                ];
            }

            $errorMessage = $nodeResponse->json('error.message')
                ?? sprintf('HTTP %d: Gagal menghubungi Meta Graph API.', $nodeResponse->status());

            $this->captureApiTelemetry($nodeResponse, 'test_connection', $started, $errorMessage, false);

            return [
                'success' => false,
                'error' => $errorMessage,
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Synchronize Instagram account profile metadata, 28-day account insights, and audience active hours (WIB).
     *
     * @return array{success: bool, profile?: array<string, mixed>, insights?: array<string, mixed>, error?: string}
     */
    public function syncAccountProfileAndInsights(): array
    {
        if (! $this->isConfigured()) {
            return [
                'success' => false,
                'error' => 'Kredensial Instagram Graph API belum terhubung.',
            ];
        }

        $actualIgId = $this->resolveActualInstagramId();
        $started = microtime(true);

        try {
            $profileResp = Http::timeout(10)->get(sprintf('%s/%s', $this->baseUrl, $actualIgId), [
                'fields' => 'id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count',
                'access_token' => $this->accessToken,
            ]);

            $profileData = $profileResp->successful() ? ($profileResp->json() ?? []) : [];

            $accountMetrics = [
                'reach_28d' => null,
                'views_28d' => null,
                'accounts_engaged_28d' => null,
                'total_interactions_28d' => null,
                'best_posting_hours' => ['11:30 WIB', '16:30 WIB', '19:30 WIB'],
                'best_hours_source' => 'benchmark_humas',
                'hourly_active_wib' => [],
                'synced_at' => now()->format('d M Y, H:i').' WIB',
            ];

            // 1. Account-level 28-day insights (v21/v22 compatible)
            $insightsResp = Http::timeout(10)->get(sprintf('%s/%s/insights', $this->baseUrl, $actualIgId), [
                'metric' => 'reach,views,accounts_engaged,total_interactions',
                'metric_type' => 'total_value',
                'period' => 'day',
                'since' => now()->subDays(28)->timestamp,
                'until' => now()->timestamp,
                'access_token' => $this->accessToken,
            ]);

            if (! $insightsResp->successful()) {
                $insightsResp = Http::timeout(10)->get(sprintf('%s/%s/insights', $this->baseUrl, $actualIgId), [
                    'metric' => 'reach',
                    'period' => 'days_28',
                    'access_token' => $this->accessToken,
                ]);
            }

            if ($insightsResp->successful()) {
                /** @var array<int, array<string, mixed>> $rows */
                $rows = $insightsResp->json('data') ?? [];
                foreach ($rows as $row) {
                    $mName = (string) ($row['name'] ?? '');
                    $val = null;
                    if (isset($row['total_value']['value'])) {
                        $val = (int) $row['total_value']['value'];
                    } elseif (isset($row['values']) && is_array($row['values']) && ! empty($row['values'])) {
                        $sum = 0;
                        foreach ($row['values'] as $pt) {
                            $sum += (int) ($pt['value'] ?? 0);
                        }
                        $val = $sum;
                    }

                    if ($val !== null) {
                        if ($mName === 'reach') {
                            $accountMetrics['reach_28d'] = $val;
                        } elseif ($mName === 'views') {
                            $accountMetrics['views_28d'] = $val;
                        } elseif ($mName === 'accounts_engaged') {
                            $accountMetrics['accounts_engaged_28d'] = $val;
                        } elseif ($mName === 'total_interactions') {
                            $accountMetrics['total_interactions_28d'] = $val;
                        }
                    }
                }
            }

            // 2. Online followers hourly distribution -> convert PST (UTC-8) to WIB (UTC+7 = +15h)
            $onlineResp = Http::timeout(8)->get(sprintf('%s/%s/insights', $this->baseUrl, $actualIgId), [
                'metric' => 'online_followers',
                'period' => 'lifetime',
                'access_token' => $this->accessToken,
            ]);

            if ($onlineResp->successful()) {
                /** @var array<int, array<string, mixed>> $onlineRows */
                $onlineRows = $onlineResp->json('data') ?? [];
                $valuesList = $onlineRows[0]['values'] ?? [];
                $latestMap = is_array($valuesList) && ! empty($valuesList)
                    ? (end($valuesList)['value'] ?? null)
                    : null;

                if (is_array($latestMap) && ! empty($latestMap)) {
                    $wibMap = [];
                    foreach ($latestMap as $pstHour => $count) {
                        $wibHour = (((int) $pstHour) + 15) % 24;
                        $wibMap[sprintf('%02d:00', $wibHour)] = (int) $count;
                    }
                    ksort($wibMap);
                    $sortedByCount = $wibMap;
                    arsort($sortedByCount);
                    $topHours = array_slice(array_keys($sortedByCount), 0, 3);
                    if (! empty($topHours)) {
                        $accountMetrics['best_posting_hours'] = array_map(
                            static fn (string $h): string => $h.' WIB',
                            $topHours
                        );
                        $accountMetrics['best_hours_source'] = 'instagram_audience';
                        $accountMetrics['hourly_active_wib'] = $wibMap;
                    }
                }
            }

            if (Schema::hasTable('instagram_connections')) {
                $conn = InstagramConnection::current();
                $updates = [
                    'account_insights' => $accountMetrics,
                ];
                if (! empty($profileData['username'])) {
                    $updates['username'] = (string) $profileData['username'];
                }
                if (! empty($profileData['name'])) {
                    $updates['name'] = (string) $profileData['name'];
                }
                if (array_key_exists('biography', $profileData)) {
                    $updates['biography'] = $profileData['biography'];
                }
                if (array_key_exists('website', $profileData)) {
                    $updates['website'] = $profileData['website'];
                }
                if (! empty($profileData['profile_picture_url'])) {
                    $updates['profile_picture_url'] = $this->cacheThumbnailUrl((string) $profileData['profile_picture_url'], 'profile_'.$actualIgId);
                }
                if (isset($profileData['followers_count'])) {
                    $updates['followers_count'] = (int) $profileData['followers_count'];
                }
                if (isset($profileData['follows_count'])) {
                    $updates['follows_count'] = (int) $profileData['follows_count'];
                }
                if (isset($profileData['media_count'])) {
                    $updates['media_count'] = (int) $profileData['media_count'];
                }
                $conn->update($updates);
            }
            try {
                $this->syncAudienceDemographics();
            } catch (\Throwable) {
                // ignore
            }

            $this->captureApiTelemetry(
                $profileResp,
                'sync_account_insights',
                $started,
                sprintf(
                    'Profil & Account Insights disinkronkan (%s pengikut).',
                    isset($profileData['followers_count']) ? number_format((float) $profileData['followers_count']) : '—'
                )
            );

            return [
                'success' => true,
                'profile' => $profileData,
                'insights' => $accountMetrics,
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Extract shortcode from an Instagram URL.
     */
    public function extractShortcode(string $url): ?string
    {
        if (preg_match('/(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/i', $url, $matches)) {
            return $matches[1];
        }

        return null;
    }

    /**
     * Resolve actual numeric Instagram Business ID (even if accountId is a Facebook Page ID).
     */
    public function resolveActualInstagramId(): string
    {
        if ($this->resolvedIgIdCache !== null) {
            return $this->resolvedIgIdCache;
        }

        $cacheKey = 'sparc.ig_resolved_id.'.$this->accountId;
        $cached = Cache::get($cacheKey);
        if (is_string($cached) && $cached !== '') {
            $this->resolvedIgIdCache = $cached;

            return $cached;
        }

        try {
            $check = Http::timeout(8)->get(sprintf('%s/%s', $this->baseUrl, $this->accountId), [
                'fields' => 'instagram_business_account{id}',
                'access_token' => $this->accessToken,
            ]);
            if ($check->successful() && ! empty($check->json('instagram_business_account.id'))) {
                $resolved = (string) $check->json('instagram_business_account.id');
                Cache::put($cacheKey, $resolved, now()->addMinutes(30));
                $this->resolvedIgIdCache = $resolved;

                return $resolved;
            }
        } catch (\Throwable) {
            // Keep original accountId if resolution fails
        }

        $this->resolvedIgIdCache = (string) $this->accountId;

        return (string) $this->accountId;
    }

    /**
     * Parse raw `/insights` response rows into pure separated metrics without synthetic multipliers.
     *
     * @param  array<int, array<string, mixed>>  $insightsData
     * @return array{reach: int|null, views: int, saves: int|null, shares: int|null, effective_shares: int}
     */
    protected function parseMediaInsightsRows(array $insightsData): array
    {
        $reach = null;
        $views = 0;
        $saves = null;
        $shares = null;

        foreach ($insightsData as $row) {
            $name = (string) ($row['name'] ?? '');
            /** @var array<int, array<string, mixed>> $values */
            $values = $row['values'] ?? [];
            $rawVal = $values[0]['value'] ?? ($row['total_value']['value'] ?? null);
            if ($rawVal === null || ! is_numeric($rawVal)) {
                continue;
            }
            $val = (int) $rawVal;

            if ($name === 'reach') {
                $reach = $val;
            } elseif ($name === 'views') {
                $views = max($views, $val);
            } elseif ($name === 'saved') {
                $saves = $val;
            } elseif ($name === 'shares') {
                $shares = $val;
            }
        }

        if ($views === 0 && $reach !== null && $reach > 0) {
            $views = $reach;
        }

        return [
            'reach' => $reach,
            'views' => $views,
            'saves' => $saves,
            'shares' => $shares,
            'effective_shares' => $shares ?? ($saves ?? 0),
        ];
    }

    /**
     * Fetch insights concurrently for multiple Instagram media IDs via `Http::batch`.
     *
     * @param  array<int, string>  $mediaIds
     * @return array<string, array{reach: int|null, views: int, saves: int|null, shares: int|null, effective_shares: int}>
     */
    protected function fetchBatchMediaInsights(array $mediaIds): array
    {
        $uniqueIds = array_values(array_unique(array_filter($mediaIds)));
        if (empty($uniqueIds)) {
            return [];
        }

        $parsedMap = [];

        try {
            $responses = Http::batch(function (Batch $batch) use ($uniqueIds): array {
                $reqs = [];
                foreach ($uniqueIds as $mId) {
                    $reqs[] = $batch->as((string) $mId)->timeout(10)->get(
                        sprintf('%s/%s/insights', $this->baseUrl, $mId),
                        [
                            'metric' => 'reach,views,saved,shares',
                            'access_token' => $this->accessToken,
                        ]
                    );
                }

                return $reqs;
            })->concurrency(10)->send();

            foreach ($uniqueIds as $mId) {
                $resp = $responses[$mId] ?? null;
                if ($resp instanceof Response && $resp->successful()) {
                    /** @var array<int, array<string, mixed>> $rows */
                    $rows = $resp->json('data') ?? [];
                    $parsedMap[$mId] = $this->parseMediaInsightsRows($rows);
                } elseif ($resp instanceof Response && $resp->status() === 400) {
                    // Graceful fallback if `shares` or `views` was rejected on legacy media object
                    try {
                        $fallback = Http::timeout(8)->get(sprintf('%s/%s/insights', $this->baseUrl, $mId), [
                            'metric' => 'reach,saved',
                            'access_token' => $this->accessToken,
                        ]);
                        if ($fallback->successful()) {
                            /** @var array<int, array<string, mixed>> $rows */
                            $rows = $fallback->json('data') ?? [];
                            $parsedMap[$mId] = $this->parseMediaInsightsRows($rows);

                            continue;
                        }
                    } catch (\Throwable) {
                        // ignore
                    }
                    $parsedMap[$mId] = $this->parseMediaInsightsRows([]);
                } else {
                    $parsedMap[$mId] = $this->parseMediaInsightsRows([]);
                }
            }
        } catch (\Throwable) {
            foreach ($uniqueIds as $mId) {
                $parsedMap[$mId] = $this->parseMediaInsightsRows([]);
            }
        }

        return $parsedMap;
    }

    /**
     * Fetch media metrics (reach, views, likes, comments, shares, saves) from Instagram Graph API for one post.
     *
     * @return array{success: bool, reach?: int|null, views?: int, likes?: int, comments_count?: int, shares?: int, saves?: int|null, media_id?: string, media_url?: string|null, thumbnail_url?: string|null, permalink?: string, error?: string}
     */
    public function fetchMediaMetrics(string $publishedUrlOrId): array
    {
        if (! $this->isConfigured()) {
            return [
                'success' => false,
                'error' => 'Kredensial Meta/Instagram Graph API belum dikonfigurasi. Silakan simpan Token & Account ID di menu Pengaturan.',
            ];
        }

        $shortcode = $this->extractShortcode($publishedUrlOrId);
        $actualIgId = $this->resolveActualInstagramId();
        $started = microtime(true);

        try {
            $mediaResponse = Http::timeout(15)->get(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), [
                'fields' => 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
                'limit' => 50,
                'access_token' => $this->accessToken,
            ]);

            if (! $mediaResponse->successful()) {
                $errorMsg = $mediaResponse->json('error.message') ?? 'Gagal mengambil data media dari Meta Graph API.';
                $this->captureApiTelemetry($mediaResponse, 'fetch_single_metric', $started, $errorMsg, false);

                return [
                    'success' => false,
                    'error' => $errorMsg,
                ];
            }

            /** @var array<int, array<string, mixed>> $mediaList */
            $mediaList = $mediaResponse->json('data') ?? [];
            $targetMedia = null;

            if ($shortcode !== null) {
                foreach ($mediaList as $m) {
                    $permalink = (string) ($m['permalink'] ?? '');
                    if (Str::contains($permalink, $shortcode) || ($m['id'] ?? '') === $shortcode) {
                        $targetMedia = $m;
                        break;
                    }
                }
            }

            if ($targetMedia === null) {
                foreach ($mediaList as $m) {
                    if (($m['id'] ?? '') === $publishedUrlOrId || Str::startsWith($publishedUrlOrId, (string) ($m['permalink'] ?? ''))) {
                        $targetMedia = $m;
                        break;
                    }
                }
            }

            if ($targetMedia === null) {
                return [
                    'success' => false,
                    'error' => sprintf('Postingan Instagram dengan URL/kode "%s" tidak ditemukan pada 50 postingan terakhir akun terhubung.', $shortcode ?? $publishedUrlOrId),
                ];
            }

            $mediaId = (string) $targetMedia['id'];
            $likes = (int) ($targetMedia['like_count'] ?? 0);
            $comments = (int) ($targetMedia['comments_count'] ?? 0);
            $insightsMap = $this->fetchBatchMediaInsights([$mediaId]);
            $parsed = $insightsMap[$mediaId] ?? $this->parseMediaInsightsRows([]);

            $this->captureApiTelemetry($mediaResponse, 'fetch_single_metric', $started, sprintf('Metrik media #%s ditarik.', $mediaId));

            return [
                'success' => true,
                'media_id' => $mediaId,
                'media_url' => isset($targetMedia['media_url']) ? (string) $targetMedia['media_url'] : null,
                'thumbnail_url' => isset($targetMedia['thumbnail_url']) ? (string) $targetMedia['thumbnail_url'] : null,
                'permalink' => (string) ($targetMedia['permalink'] ?? $publishedUrlOrId),
                'reach' => $parsed['reach'],
                'views' => $parsed['views'],
                'likes' => $likes,
                'comments_count' => $comments,
                'shares' => $parsed['effective_shares'],
                'saves' => $parsed['saves'],
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Get recent published media from connected Instagram account with caching.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getRecentMedia(int $limit = 25, bool $forceRefresh = false): array
    {
        if (! $this->isConfigured()) {
            return [];
        }

        $actualIgId = $this->resolveActualInstagramId();
        $cacheKey = "sparc.ig_media.{$actualIgId}.{$limit}";

        if ($forceRefresh) {
            Cache::forget($cacheKey);
        }

        return Cache::remember($cacheKey, now()->addMinutes(5), function () use ($actualIgId, $limit): array {
            try {
                $response = Http::timeout(10)->get(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), [
                    'fields' => 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
                    'limit' => $limit,
                    'access_token' => $this->accessToken,
                ]);

                /** @var array<int, array<string, mixed>> $data */
                $data = $response->json('data') ?? [];

                return $data;
            } catch (\Throwable) {
                return [];
            }
        });
    }

    /**
     * Synchronize performance metrics for all published Instagram content items using concurrent `Http::batch`.
     *
     * @return array{success: bool, synced_count: int, imported_count?: int, failed_count: int, skipped_count: int, synced_items: array<int, array<string, mixed>>, error?: string}
     */
    public function syncAllContentMetrics(?iterable $items = null, bool $autoImportNew = true): array
    {
        if ($items === null && $autoImportNew) {
            return $this->syncAndAutoImportRecentMedia(100, true);
        }
        if (! $this->isConfigured()) {
            return [
                'success' => false,
                'synced_count' => 0,
                'failed_count' => 0,
                'skipped_count' => 0,
                'synced_items' => [],
                'error' => 'Kredensial Instagram Graph API belum terhubung.',
            ];
        }

        $actualIgId = $this->resolveActualInstagramId();
        $started = microtime(true);

        try {
            $mediaResponse = Http::timeout(15)->get(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), [
                'fields' => 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
                'limit' => 100,
                'access_token' => $this->accessToken,
            ]);

            if (! $mediaResponse->successful()) {
                $errorMsg = $mediaResponse->json('error.message')
                    ?? sprintf('HTTP %d: Gagal mengambil daftar postingan dari Meta Graph API.', $mediaResponse->status());
                $this->captureApiTelemetry($mediaResponse, 'sync_metrics', $started, $errorMsg, false);

                return [
                    'success' => false,
                    'synced_count' => 0,
                    'failed_count' => 0,
                    'skipped_count' => 0,
                    'synced_items' => [],
                    'error' => $errorMsg,
                ];
            }

            /** @var array<int, array<string, mixed>> $mediaList */
            $mediaList = $mediaResponse->json('data') ?? [];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'synced_count' => 0,
                'failed_count' => 0,
                'skipped_count' => 0,
                'synced_items' => [],
                'error' => $e->getMessage(),
            ];
        }

        if ($items === null) {
            $items = ContentItem::query()
                ->whereNotNull('published_url')
                ->where('published_url', '!=', '')
                ->get()
                ->filter(function (ContentItem $item): bool {
                    return $item->platform === 'instagram'
                        || $this->extractShortcode((string) $item->published_url) !== null;
                });
        }

        $matchedMap = [];
        $skippedCount = 0;

        foreach ($items as $item) {
            $url = (string) $item->published_url;
            $shortcode = $this->extractShortcode($url);
            $targetMedia = null;

            if ($shortcode !== null) {
                foreach ($mediaList as $m) {
                    $permalink = (string) ($m['permalink'] ?? '');
                    if (Str::contains($permalink, $shortcode) || ($m['id'] ?? '') === $shortcode) {
                        $targetMedia = $m;
                        break;
                    }
                }
            }

            if ($targetMedia === null) {
                foreach ($mediaList as $m) {
                    if (($m['id'] ?? '') === $url || Str::startsWith($url, (string) ($m['permalink'] ?? ''))) {
                        $targetMedia = $m;
                        break;
                    }
                }
            }

            if ($targetMedia === null) {
                $skippedCount++;

                continue;
            }

            $matchedMap[] = ['item' => $item, 'media' => $targetMedia];
        }

        $mediaIds = array_map(static fn (array $pair): string => (string) $pair['media']['id'], $matchedMap);
        $insightsByMedia = $this->fetchBatchMediaInsights($mediaIds);

        $syncedCount = 0;
        $failedCount = 0;
        $syncedItems = [];

        foreach ($matchedMap as $pair) {
            /** @var ContentItem $item */
            $item = $pair['item'];
            /** @var array<string, mixed> $targetMedia */
            $targetMedia = $pair['media'];

            $mediaId = (string) $targetMedia['id'];
            $likes = (int) ($targetMedia['like_count'] ?? 0);
            $comments = (int) ($targetMedia['comments_count'] ?? 0);
            $parsed = $insightsByMedia[$mediaId] ?? $this->parseMediaInsightsRows([]);

            $views = $parsed['views'];
            $shares = $parsed['effective_shares'];

            $hasChanged = (int) $item->views !== $views
                || (int) $item->likes !== $likes
                || (int) $item->comments_count !== $comments
                || (int) $item->shares !== $shares;

            $item->update([
                'ig_media_id' => $mediaId,
                'ig_media_url' => $targetMedia['media_url'] ?? $item->ig_media_url,
                'ig_thumbnail_url' => $targetMedia['thumbnail_url'] ?? $item->ig_thumbnail_url,
                'reach' => $parsed['reach'] ?? $item->reach,
                'views' => $views,
                'likes' => $likes,
                'comments_count' => $comments,
                'shares' => $shares,
                'saves' => $parsed['saves'] ?? $item->saves,
                'metrics_synced_at' => now(),
            ]);

            if ($hasChanged) {
                $item->history()->create([
                    'from_status' => $item->status,
                    'to_status' => $item->status,
                    'actor' => auth()->user()->name ?? 'System (Auto Sync)',
                    'note' => sprintf(
                        'Metrik Instagram disinkronkan: %s views, %s suka, %s komentar, %s share.',
                        number_format((float) $views),
                        number_format((float) $likes),
                        number_format((float) $comments),
                        number_format((float) $shares)
                    ),
                ]);
            }

            $syncedCount++;
            $syncedItems[] = [
                'content_id' => (string) $item->content_id,
                'reach' => $parsed['reach'],
                'views' => $views,
                'likes' => $likes,
                'comments_count' => $comments,
                'shares' => $parsed['shares'] ?? $shares,
                'saves' => $parsed['saves'],
            ];
        }

        try {
            if (Schema::hasTable('instagram_connections')) {
                InstagramConnection::current()->update(['last_synced_at' => now()]);
            }
        } catch (\Throwable) {
            // Ignore
        }

        $this->captureApiTelemetry($mediaResponse, 'sync_metrics', $started, sprintf('%d konten disinkronkan paralel.', $syncedCount));

        return [
            'success' => true,
            'synced_count' => $syncedCount,
            'failed_count' => $failedCount,
            'skipped_count' => $skippedCount,
            'synced_items' => $syncedItems,
        ];
    }

    /**
     * Synchronize existing content items and automatically import new posts from Meta Instagram Graph API using concurrent `Http::batch`.
     *
     * @return array{
     *     success: bool,
     *     synced_count: int,
     *     imported_count: int,
     *     failed_count: int,
     *     skipped_count: int,
     *     synced_items: array<int, array<string, mixed>>,
     *     error?: string,
     *     throttled?: bool
     * }
     */
    public function syncAndAutoImportRecentMedia(int $limit = 25, bool $force = false): array
    {
        if (! $this->isConfigured()) {
            return [
                'success' => false,
                'synced_count' => 0,
                'imported_count' => 0,
                'failed_count' => 0,
                'skipped_count' => 0,
                'synced_items' => [],
                'error' => 'Kredensial Instagram Graph API belum terhubung.',
            ];
        }

        $throttleKey = 'sparc_ig_auto_import_throttle_'.$this->accountId;
        if (! $force && Cache::has($throttleKey)) {
            return [
                'success' => true,
                'synced_count' => 0,
                'imported_count' => 0,
                'failed_count' => 0,
                'skipped_count' => 0,
                'synced_items' => [],
                'throttled' => true,
            ];
        }

        $actualIgId = $this->resolveActualInstagramId();
        $started = microtime(true);

        try {
            $mediaResponse = Http::timeout(10)->get(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), [
                'fields' => 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
                'limit' => max(1, min(100, $limit)),
                'access_token' => $this->accessToken,
            ]);

            if (! $mediaResponse->successful()) {
                $errorMsg = $mediaResponse->json('error.message')
                    ?? sprintf('HTTP %d: Gagal mengambil daftar postingan dari Meta Graph API.', $mediaResponse->status());
                $this->captureApiTelemetry($mediaResponse, 'auto_import_sync', $started, $errorMsg, false);

                return [
                    'success' => false,
                    'synced_count' => 0,
                    'imported_count' => 0,
                    'failed_count' => 0,
                    'skipped_count' => 0,
                    'synced_items' => [],
                    'error' => $errorMsg,
                ];
            }

            /** @var array<int, array<string, mixed>> $mediaList */
            $mediaList = $mediaResponse->json('data') ?? [];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'synced_count' => 0,
                'imported_count' => 0,
                'failed_count' => 0,
                'skipped_count' => 0,
                'synced_items' => [],
                'error' => $e->getMessage(),
            ];
        }

        $mediaIds = array_values(array_filter(array_map(
            static fn (array $m): string => (string) ($m['id'] ?? ''),
            $mediaList
        )));
        $insightsByMedia = $this->fetchBatchMediaInsights($mediaIds);

        $existingItems = ContentItem::query()
            ->where(function ($q): void {
                $q->whereNotNull('published_url')->where('published_url', '!=', '')
                    ->orWhereNotNull('ig_media_id');
            })
            ->get();

        $syncedCount = 0;
        $importedCount = 0;
        $failedCount = 0;
        $skippedCount = 0;
        $syncedItems = [];

        foreach ($mediaList as $media) {
            $mediaId = (string) ($media['id'] ?? '');
            $permalink = (string) ($media['permalink'] ?? '');
            $shortcode = $this->extractShortcode($permalink);

            $matchedItem = $existingItems->first(function (ContentItem $item) use ($permalink, $shortcode, $mediaId): bool {
                if ($mediaId !== '' && (string) $item->ig_media_id === $mediaId) {
                    return true;
                }
                $itemUrl = (string) $item->published_url;
                if ($permalink !== '' && (strcasecmp($itemUrl, $permalink) === 0 || Str::startsWith($itemUrl, $permalink))) {
                    return true;
                }
                if ($shortcode !== null && $this->extractShortcode($itemUrl) === $shortcode) {
                    return true;
                }

                return $itemUrl === $mediaId;
            });

            $likes = (int) ($media['like_count'] ?? 0);
            $comments = (int) ($media['comments_count'] ?? 0);
            $parsed = $insightsByMedia[$mediaId] ?? $this->parseMediaInsightsRows([]);
            $views = $parsed['views'];
            $shares = $parsed['effective_shares'];

            if ($matchedItem) {
                $hasChanged = (int) $matchedItem->views !== $views
                    || (int) $matchedItem->likes !== $likes
                    || (int) $matchedItem->comments_count !== $comments
                    || (int) $matchedItem->shares !== $shares;

                $rawMediaUrl = $media['media_url'] ?? $matchedItem->ig_media_url;
                $rawThumbUrl = $media['thumbnail_url'] ?? $media['media_url'] ?? $matchedItem->ig_thumbnail_url;
                $cachedThumb = $this->cacheThumbnailUrl($rawThumbUrl, 'media_'.($mediaId ?: 'thumb'));

                $matchedItem->update([
                    'ig_media_id' => $mediaId ?: $matchedItem->ig_media_id,
                    'ig_media_url' => $rawMediaUrl,
                    'ig_thumbnail_url' => $cachedThumb ?: $rawThumbUrl,
                    'reach' => $parsed['reach'] ?? $matchedItem->reach,
                    'views' => $views,
                    'likes' => $likes,
                    'comments_count' => $comments,
                    'shares' => $shares,
                    'saves' => $parsed['saves'] ?? $matchedItem->saves,
                    'metrics_synced_at' => now(),
                ]);

                if ($hasChanged) {
                    $matchedItem->history()->create([
                        'from_status' => $matchedItem->status,
                        'to_status' => $matchedItem->status,
                        'actor' => 'System (Instagram Graph API)',
                        'note' => sprintf(
                            'Sinkronisasi metrik Instagram via batch: %s tayangan, %s suka, %s komentar, %s disimpan/dibagikan.',
                            number_format((float) $views),
                            number_format((float) $likes),
                            number_format((float) $comments),
                            number_format((float) $shares)
                        ),
                    ]);
                }

                $syncedCount++;
                $syncedItems[] = [
                    'content_id' => (string) $matchedItem->content_id,
                    'title' => (string) $matchedItem->title,
                    'permalink' => $permalink ?: (string) $matchedItem->published_url,
                    'reach' => $parsed['reach'] ?? $matchedItem->reach,
                    'views' => $views,
                    'likes' => $likes,
                    'comments_count' => $comments,
                    'shares' => $parsed['shares'] ?? $shares,
                    'saves' => $parsed['saves'] ?? $matchedItem->saves,
                ];
            } else {
                $rawCaption = trim((string) ($media['caption'] ?? ''));
                $firstLine = Str::before($rawCaption, "\n");
                $title = Str::limit(trim($firstLine), 80);
                if (empty($title)) {
                    $title = sprintf('Post Instagram #%s', $shortcode ?: substr($mediaId, 0, 10));
                }

                $publishedAt = isset($media['timestamp']) ? Carbon::parse($media['timestamp']) : now();
                $mediaType = strtoupper((string) ($media['media_type'] ?? ''));
                $format = $mediaType === 'VIDEO' ? 'reels' : ($mediaType === 'CAROUSEL_ALBUM' ? 'carousel' : 'feed');
                $rawMediaUrl = $media['media_url'] ?? null;
                $rawThumbUrl = $media['thumbnail_url'] ?? $rawMediaUrl;
                $cachedThumb = $this->cacheThumbnailUrl($rawThumbUrl, 'media_'.($mediaId ?: 'thumb'));

                $newItem = ContentItem::create([
                    'title' => $title,
                    'status' => 'published',
                    'priority' => 'normal',
                    'platform' => 'instagram',
                    'format' => $format,
                    'pillar' => 'kelembagaan',
                    'pic_name' => 'Instagram Auto-Sync',
                    'pic_role' => 'publisher',
                    'production_deadline' => $publishedAt->toDateString(),
                    'publish_date' => $publishedAt->toDateString(),
                    'publish_time' => $publishedAt->format('H:i'),
                    'caption' => $rawCaption ?: null,
                    'published_url' => $permalink ?: sprintf('https://www.instagram.com/p/%s/', $shortcode),
                    'ig_media_id' => $mediaId ?: null,
                    'ig_media_url' => $rawMediaUrl,
                    'ig_thumbnail_url' => $cachedThumb ?: $rawThumbUrl,
                    'reach' => $parsed['reach'],
                    'views' => $views,
                    'likes' => $likes,
                    'comments_count' => $comments,
                    'shares' => $shares,
                    'saves' => $parsed['saves'],
                    'metrics_synced_at' => now(),
                ]);

                $newItem->history()->create([
                    'from_status' => 'inbox',
                    'to_status' => 'published',
                    'actor' => 'System (Instagram Auto-Sync)',
                    'note' => 'Otomatis diimpor dan dipantau dari Instagram Graph API.',
                ]);

                $existingItems->push($newItem);
                $importedCount++;
                $syncedCount++;
                $syncedItems[] = [
                    'content_id' => (string) $newItem->content_id,
                    'title' => (string) $newItem->title,
                    'permalink' => (string) $newItem->published_url,
                    'published_at' => $publishedAt->format('Y-m-d H:i'),
                    'reach' => $parsed['reach'],
                    'views' => $views,
                    'likes' => $likes,
                    'comments_count' => $comments,
                    'shares' => $parsed['shares'] ?? $shares,
                    'saves' => $parsed['saves'],
                ];
            }
        }

        Cache::put($throttleKey, true, now()->addMinutes(5));

        try {
            if (Schema::hasTable('instagram_connections')) {
                InstagramConnection::current()->update(['last_synced_at' => now()]);
            }
        } catch (\Throwable) {
            // Ignore
        }

        $this->captureApiTelemetry(
            $mediaResponse,
            'auto_import_sync',
            $started,
            sprintf('%d konten disinkronkan (%d baru diimpor) via batch paralel.', $syncedCount, $importedCount)
        );

        return [
            'success' => true,
            'synced_count' => $syncedCount,
            'imported_count' => $importedCount,
            'failed_count' => $failedCount,
            'skipped_count' => $skippedCount,
            'synced_items' => $syncedItems,
        ];
    }

    /**
     * Execute Direct Publishing to Instagram for Feed Single (`IMAGE`), `CAROUSEL`, or `REELS` (URL & Resumable Binary Upload).
     *
     * @return array{success: bool, status: string, media_id?: string, permalink?: string, container_id?: string, error?: string}
     */
    public function publishSchedule(InstagramSchedule $schedule): array
    {
        if (! $this->isConfigured()) {
            $err = 'Kredensial Instagram Graph API belum terhubung.';
            $schedule->update(['status' => 'failed', 'error_message' => $err]);

            return ['success' => false, 'status' => 'failed', 'error' => $err];
        }

        $actualIgId = $this->resolveActualInstagramId();
        $started = microtime(true);
        $mediaType = strtoupper((string) $schedule->media_type);
        /** @var array<int, array<string, mixed>> $sources */
        $sources = is_array($schedule->media_sources) ? $schedule->media_sources : [];

        if (empty($sources) && empty($schedule->ig_container_id)) {
            $err = 'Sumber file atau tautan media publikasi tidak ditemukan.';
            $schedule->update(['status' => 'failed', 'error_message' => $err]);

            return ['success' => false, 'status' => 'failed', 'error' => $err];
        }

        try {
            $containerId = (string) ($schedule->ig_container_id ?? '');

            // Step 1: Create container if not resuming an existing processing container
            if ($containerId === '') {
                $schedule->update(['status' => 'uploading', 'error_message' => null]);

                if ($mediaType === 'CAROUSEL') {
                    if (count($sources) < 2) {
                        $err = 'Publikasi Carousel memerlukan minimal 2 slide foto/video.';
                        $schedule->update(['status' => 'failed', 'error_message' => $err]);

                        return ['success' => false, 'status' => 'failed', 'error' => $err];
                    }

                    $childIds = [];
                    foreach (array_slice($sources, 0, 10) as $slide) {
                        $slideUrl = (string) ($slide['url'] ?? '');
                        $isVideo = ($slide['media_kind'] ?? 'image') === 'video'
                            || preg_match('/\.(mp4|mov)(\?|$)/i', $slideUrl) === 1;

                        $childPayload = [
                            'is_carousel_item' => 'true',
                            'access_token' => $this->accessToken,
                        ];
                        if ($isVideo) {
                            $childPayload['media_type'] = 'VIDEO';
                            $childPayload['video_url'] = $slideUrl;
                        } else {
                            $childPayload['image_url'] = $slideUrl;
                        }

                        $childResp = Http::timeout(20)->post(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), $childPayload);
                        if (! $childResp->successful() || empty($childResp->json('id'))) {
                            $err = $childResp->json('error.message') ?? 'Gagal membuat slide container Carousel di Meta.';
                            $schedule->update(['status' => 'failed', 'error_message' => $err]);
                            $this->captureApiTelemetry($childResp, 'publish_carousel', $started, $err, false);

                            return ['success' => false, 'status' => 'failed', 'error' => $err];
                        }
                        $childIds[] = (string) $childResp->json('id');
                    }

                    $parentResp = Http::timeout(20)->post(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), [
                        'media_type' => 'CAROUSEL',
                        'children' => implode(',', $childIds),
                        'caption' => (string) ($schedule->caption ?? ''),
                        'access_token' => $this->accessToken,
                    ]);

                    if (! $parentResp->successful() || empty($parentResp->json('id'))) {
                        $err = $parentResp->json('error.message') ?? 'Gagal membuat container induk Carousel di Meta.';
                        $schedule->update(['status' => 'failed', 'error_message' => $err]);
                        $this->captureApiTelemetry($parentResp, 'publish_carousel', $started, $err, false);

                        return ['success' => false, 'status' => 'failed', 'error' => $err];
                    }

                    $containerId = (string) $parentResp->json('id');
                } elseif ($mediaType === 'REELS') {
                    $primary = $sources[0];
                    $sourceType = (string) ($primary['type'] ?? 'url');

                    if ($sourceType === 'local' && ! empty($primary['disk_path'])) {
                        $disk = (string) ($primary['disk'] ?? 'public');
                        $diskPath = (string) $primary['disk_path'];

                        if (! Storage::disk($disk)->exists($diskPath)) {
                            $err = 'Berkas video Reels lokal tidak ditemukan pada storage server.';
                            $schedule->update(['status' => 'failed', 'error_message' => $err]);

                            return ['success' => false, 'status' => 'failed', 'error' => $err];
                        }

                        $sessionPayload = [
                            'media_type' => 'REELS',
                            'upload_type' => 'resumable',
                            'caption' => (string) ($schedule->caption ?? ''),
                            'share_to_feed' => $schedule->share_to_feed ? 'true' : 'false',
                            'access_token' => $this->accessToken,
                        ];
                        if (! empty($schedule->cover_url)) {
                            $sessionPayload['cover_url'] = $schedule->cover_url;
                        }

                        $initResp = Http::timeout(20)->post(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), $sessionPayload);
                        if (! $initResp->successful() || empty($initResp->json('id'))) {
                            $err = $initResp->json('error.message') ?? 'Gagal memulai sesi Resumable Upload Reels di Meta.';
                            $schedule->update(['status' => 'failed', 'error_message' => $err]);
                            $this->captureApiTelemetry($initResp, 'publish_reels', $started, $err, false);

                            return ['success' => false, 'status' => 'failed', 'error' => $err];
                        }

                        $containerId = (string) $initResp->json('id');
                        $binary = (string) Storage::disk($disk)->get($diskPath);
                        $fileSize = strlen($binary);

                        $uploadUrl = sprintf(
                            'https://rupload.facebook.com/ig-api-upload/%s/%s',
                            trim($this->graphVersion, '/'),
                            $containerId
                        );

                        $uploadResp = Http::timeout(120)
                            ->withHeaders([
                                'Authorization' => 'OAuth '.$this->accessToken,
                                'offset' => '0',
                                'file_size' => (string) $fileSize,
                            ])
                            ->withBody($binary, 'application/octet-stream')
                            ->post($uploadUrl);

                        if (! $uploadResp->successful() || ($uploadResp->json('debug_info.type') !== null)) {
                            $err = $uploadResp->json('debug_info.message')
                                ?? $uploadResp->json('error.message')
                                ?? 'Gagal mengunggah biner video Reels ke rupload.facebook.com.';
                            $schedule->update(['status' => 'failed', 'error_message' => $err]);
                            $this->captureApiTelemetry($uploadResp, 'publish_reels_binary', $started, $err, false);

                            return ['success' => false, 'status' => 'failed', 'error' => $err];
                        }
                    } else {
                        $videoUrl = (string) ($primary['url'] ?? '');
                        $reelPayload = [
                            'media_type' => 'REELS',
                            'video_url' => $videoUrl,
                            'caption' => (string) ($schedule->caption ?? ''),
                            'share_to_feed' => $schedule->share_to_feed ? 'true' : 'false',
                            'access_token' => $this->accessToken,
                        ];
                        if (! empty($schedule->cover_url)) {
                            $reelPayload['cover_url'] = $schedule->cover_url;
                        }

                        $initResp = Http::timeout(25)->post(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), $reelPayload);
                        if (! $initResp->successful() || empty($initResp->json('id'))) {
                            $err = $initResp->json('error.message') ?? 'Gagal membuat container Reels dari URL video.';
                            $schedule->update(['status' => 'failed', 'error_message' => $err]);
                            $this->captureApiTelemetry($initResp, 'publish_reels', $started, $err, false);

                            return ['success' => false, 'status' => 'failed', 'error' => $err];
                        }
                        $containerId = (string) $initResp->json('id');
                    }
                } else {
                    // Single Feed Image (`IMAGE`)
                    $imageUrl = (string) ($sources[0]['url'] ?? '');
                    $imgResp = Http::timeout(20)->post(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), [
                        'image_url' => $imageUrl,
                        'caption' => (string) ($schedule->caption ?? ''),
                        'access_token' => $this->accessToken,
                    ]);

                    if (! $imgResp->successful() || empty($imgResp->json('id'))) {
                        $err = $imgResp->json('error.message') ?? 'Gagal membuat container Foto Feed di Meta Graph API.';
                        $schedule->update(['status' => 'failed', 'error_message' => $err]);
                        $this->captureApiTelemetry($imgResp, 'publish_image', $started, $err, false);

                        return ['success' => false, 'status' => 'failed', 'error' => $err];
                    }
                    $containerId = (string) $imgResp->json('id');
                }

                $schedule->update([
                    'ig_container_id' => $containerId,
                    'status' => 'processing',
                ]);
            }

            // Step 2: Check container readiness (`FINISHED` / empty status_code -> proceed to publish)
            $statusCheck = Http::timeout(10)->get(sprintf('%s/%s', $this->baseUrl, $containerId), [
                'fields' => 'status_code,status',
                'access_token' => $this->accessToken,
            ]);

            if ($statusCheck->successful()) {
                $statusCode = strtoupper((string) ($statusCheck->json('status_code') ?? 'FINISHED'));
                if ($statusCode === 'ERROR' || $statusCode === 'EXPIRED') {
                    $err = (string) ($statusCheck->json('status') ?: sprintf('Pemrosesan container Meta gagal (%s).', $statusCode));
                    $schedule->update(['status' => 'failed', 'error_message' => $err]);

                    return ['success' => false, 'status' => 'failed', 'error' => $err];
                }
                if ($statusCode === 'IN_PROGRESS') {
                    return [
                        'success' => true,
                        'status' => 'processing',
                        'container_id' => $containerId,
                    ];
                }
            }

            // Step 3: Publish container (`POST /{ig-user-id}/media_publish`)
            $publishResp = Http::timeout(25)->post(sprintf('%s/%s/media_publish', $this->baseUrl, $actualIgId), [
                'creation_id' => $containerId,
                'access_token' => $this->accessToken,
            ]);

            if (! $publishResp->successful() || empty($publishResp->json('id'))) {
                $err = $publishResp->json('error.message') ?? 'Gagal mengeksekusi media_publish ke Instagram.';
                $schedule->update(['status' => 'failed', 'error_message' => $err]);
                $this->captureApiTelemetry($publishResp, 'media_publish', $started, $err, false);

                return ['success' => false, 'status' => 'failed', 'error' => $err];
            }

            $publishedMediaId = (string) $publishResp->json('id');
            $permalink = sprintf('https://www.instagram.com/p/%s/', $publishedMediaId);
            $mediaUrl = null;
            $thumbUrl = null;

            $detailResp = Http::timeout(10)->get(sprintf('%s/%s', $this->baseUrl, $publishedMediaId), [
                'fields' => 'id,permalink,media_url,thumbnail_url',
                'access_token' => $this->accessToken,
            ]);
            if ($detailResp->successful()) {
                if (! empty($detailResp->json('permalink'))) {
                    $permalink = (string) $detailResp->json('permalink');
                }
                $mediaUrl = $detailResp->json('media_url');
                $thumbUrl = $detailResp->json('thumbnail_url');
            }

            $schedule->update([
                'status' => 'published',
                'ig_media_id' => $publishedMediaId,
                'permalink' => $permalink,
                'published_at' => now(),
                'error_message' => null,
            ]);

            if ($schedule->contentItem) {
                $oldStatus = $schedule->contentItem->status;
                $schedule->contentItem->update([
                    'status' => 'published',
                    'published_url' => $permalink,
                    'ig_media_id' => $publishedMediaId,
                    'ig_media_url' => $mediaUrl ?: $schedule->contentItem->ig_media_url,
                    'ig_thumbnail_url' => $thumbUrl ?: $schedule->contentItem->ig_thumbnail_url,
                ]);
                $schedule->contentItem->history()->create([
                    'from_status' => $oldStatus,
                    'to_status' => 'published',
                    'actor' => 'Instagram Direct Publish',
                    'note' => sprintf('Dipublikasikan langsung ke Instagram (%s): %s', $mediaType, $permalink),
                ]);

                app(HaloApuClientService::class)->handlePublishedContent(
                    $schedule->contentItem,
                    $permalink
                );
            }

            $this->captureApiTelemetry(
                $publishResp,
                'media_publish',
                $started,
                sprintf('Berhasil mempublikasikan %s ke Instagram (%s).', $mediaType, $permalink)
            );

            return [
                'success' => true,
                'status' => 'published',
                'media_id' => $publishedMediaId,
                'permalink' => $permalink,
                'container_id' => $containerId,
            ];
        } catch (\Throwable $e) {
            $schedule->update(['status' => 'failed', 'error_message' => $e->getMessage()]);

            return [
                'success' => false,
                'status' => 'failed',
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Synchronize public comments & replies across recent Instagram media in a single field-expanded API call.
     *
     * @return array{success: bool, synced_count: int, new_unreplied_count: int, error?: string}
     */
    public function syncRecentComments(int $mediaLimit = 25): array
    {
        if (! $this->isConfigured()) {
            return [
                'success' => false,
                'synced_count' => 0,
                'new_unreplied_count' => 0,
                'error' => 'Kredensial Instagram Graph API belum terhubung.',
            ];
        }

        if (! Schema::hasTable('instagram_comments')) {
            return ['success' => false, 'synced_count' => 0, 'new_unreplied_count' => 0];
        }

        $actualIgId = $this->resolveActualInstagramId();
        $started = microtime(true);
        $conn = Schema::hasTable('instagram_connections') ? InstagramConnection::current() : null;
        $ownUsername = strtolower((string) ($conn?->username ?? ''));

        try {
            $response = Http::timeout(15)->get(sprintf('%s/%s/media', $this->baseUrl, $actualIgId), [
                'fields' => 'id,caption,permalink,media_url,thumbnail_url,comments.limit(100){id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp,like_count}}',
                'limit' => max(1, min(50, $mediaLimit)),
                'access_token' => $this->accessToken,
            ]);

            if (! $response->successful()) {
                $err = $response->json('error.message') ?? 'Gagal menarik daftar komentar dari Meta Graph API.';
                $this->captureApiTelemetry($response, 'sync_comments', $started, $err, false);

                return [
                    'success' => false,
                    'synced_count' => 0,
                    'new_unreplied_count' => 0,
                    'error' => $err,
                ];
            }

            /** @var array<int, array<string, mixed>> $mediaList */
            $mediaList = $response->json('data') ?? [];
            $contentItems = ContentItem::query()
                ->where(function ($q): void {
                    $q->whereNotNull('ig_media_id')
                        ->orWhereNotNull('published_url');
                })
                ->get();

            $syncedCount = 0;
            $newUnrepliedCount = 0;

            foreach ($mediaList as $media) {
                $mediaId = (string) ($media['id'] ?? '');
                $permalink = (string) ($media['permalink'] ?? '');
                $shortcode = $this->extractShortcode($permalink);
                $captionExcerpt = Str::limit(trim((string) ($media['caption'] ?? '')), 120);
                $thumb = (string) ($media['thumbnail_url'] ?? $media['media_url'] ?? '');
                $cachedThumb = $this->cacheThumbnailUrl($thumb, 'comm_'.($mediaId ?: 'thumb')) ?: null;

                $linkedItem = $contentItems->first(function (ContentItem $ci) use ($mediaId, $permalink, $shortcode): bool {
                    if ($mediaId !== '' && (string) $ci->ig_media_id === $mediaId) {
                        return true;
                    }
                    if ($permalink !== '' && strcasecmp((string) $ci->published_url, $permalink) === 0) {
                        return true;
                    }

                    return $shortcode !== null && $this->extractShortcode((string) $ci->published_url) === $shortcode;
                });

                /** @var array<int, array<string, mixed>> $comments */
                $comments = $media['comments']['data'] ?? [];
                $nextPageUrl = $media['comments']['paging']['next'] ?? null;
                $pageGuard = 0;
                while (is_string($nextPageUrl) && $nextPageUrl !== '' && $pageGuard < 4) {
                    $pageGuard++;
                    try {
                        $nextResp = Http::timeout(10)->get($nextPageUrl);
                        if (! $nextResp->successful()) {
                            break;
                        }
                        /** @var array<int, array<string, mixed>> $moreComments */
                        $moreComments = $nextResp->json('data') ?? [];
                        if (empty($moreComments)) {
                            break;
                        }
                        $comments = array_merge($comments, $moreComments);
                        $nextPageUrl = $nextResp->json('paging.next');
                    } catch (\Throwable) {
                        break;
                    }
                }

                // Collect top-level owner @mention replies sent via Instagram app
                /** @var array<string, array<int, array<string, mixed>>> $ownerMentionRepliesByTarget */
                $ownerMentionRepliesByTarget = [];
                foreach ($comments as $cm) {
                    $cmUsername = strtolower((string) ($cm['username'] ?? ''));
                    if ($ownUsername !== '' && $cmUsername === $ownUsername) {
                        $cmText = trim((string) ($cm['text'] ?? ''));
                        if (preg_match('/^@([a-zA-Z0-9._]+)\b/u', $cmText, $m)) {
                            $targetUser = strtolower($m[1]);
                            $ownerMentionRepliesByTarget[$targetUser][] = $cm;
                        }
                    }
                }

                foreach ($comments as $cm) {
                    $igCommentId = (string) ($cm['id'] ?? '');
                    if ($igCommentId === '') {
                        continue;
                    }

                    $cmUsername = (string) ($cm['username'] ?? 'pengguna_ig');
                    $cmUsernameLower = strtolower($cmUsername);
                    if ($ownUsername !== '' && $cmUsernameLower === $ownUsername) {
                        continue;
                    }

                    /** @var array<int, array<string, mixed>> $replies */
                    $replies = $cm['replies']['data'] ?? [];
                    $officialReply = null;
                    foreach ($replies as $rep) {
                        $repUser = strtolower((string) ($rep['username'] ?? ''));
                        if ($ownUsername === '' || $repUser === $ownUsername) {
                            $officialReply = $rep;
                            break;
                        }
                    }

                    if ($officialReply === null && ! empty($ownerMentionRepliesByTarget[$cmUsernameLower])) {
                        $commentTs = isset($cm['timestamp']) ? Carbon::parse((string) $cm['timestamp'])->getTimestamp() : 0;
                        foreach ($ownerMentionRepliesByTarget[$cmUsernameLower] as $idx => $candidateReply) {
                            $replyTs = isset($candidateReply['timestamp']) ? Carbon::parse((string) $candidateReply['timestamp'])->getTimestamp() : 0;
                            if ($replyTs >= $commentTs) {
                                $officialReply = $candidateReply;
                                unset($ownerMentionRepliesByTarget[$cmUsernameLower][$idx]);
                                break;
                            }
                        }
                    }

                    $existing = InstagramComment::where('ig_comment_id', $igCommentId)->first();
                    $isReplied = ($existing?->is_replied ?? false) || $officialReply !== null;

                    $record = InstagramComment::updateOrCreate(
                        ['ig_comment_id' => $igCommentId],
                        [
                            'ig_media_id' => $mediaId,
                            'media_permalink' => $permalink ?: null,
                            'media_caption_excerpt' => $captionExcerpt ?: null,
                            'media_thumbnail_url' => $cachedThumb,
                            'content_item_id' => $linkedItem?->id,
                            'username' => $cmUsername,
                            'text' => (string) ($cm['text'] ?? ''),
                            'like_count' => (int) ($cm['like_count'] ?? 0),
                            'is_hidden' => (bool) ($cm['hidden'] ?? ($existing?->is_hidden ?? false)),
                            'is_replied' => $isReplied,
                            'reply_text' => $officialReply ? (string) ($officialReply['text'] ?? '') : $existing?->reply_text,
                            'replied_by' => $officialReply ? ('@'.($officialReply['username'] ?? $conn?->username)) : $existing?->replied_by,
                            'replied_at' => $officialReply && isset($officialReply['timestamp'])
                                ? Carbon::parse((string) $officialReply['timestamp'])
                                : $existing?->replied_at,
                            'commented_at' => isset($cm['timestamp']) ? Carbon::parse((string) $cm['timestamp']) : now(),
                        ]
                    );

                    if ($record->wasRecentlyCreated && ! $isReplied) {
                        $newUnrepliedCount++;
                    }
                    $syncedCount++;
                }
            }

            if ($conn) {
                $conn->update(['comments_synced_at' => now()]);
            }

            $this->captureApiTelemetry(
                $response,
                'sync_comments',
                $started,
                sprintf('%d komentar publik disinkronkan (%d baru belum dibalas).', $syncedCount, $newUnrepliedCount)
            );

            return [
                'success' => true,
                'synced_count' => $syncedCount,
                'new_unreplied_count' => $newUnrepliedCount,
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'synced_count' => 0,
                'new_unreplied_count' => 0,
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * Reply officially to a public Instagram comment (`POST /{ig-comment-id}/replies`).
     *
     * @return array{success: bool, reply_id?: string, error?: string}
     */
    public function replyToComment(InstagramComment $comment, string $message, string $actorName = 'Admin HUMAS'): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Instagram Graph API belum terhubung.'];
        }

        $started = microtime(true);

        try {
            $response = Http::timeout(15)->post(sprintf('%s/%s/replies', $this->baseUrl, $comment->ig_comment_id), [
                'message' => $message,
                'access_token' => $this->accessToken,
            ]);

            if (! $response->successful()) {
                $err = $response->json('error.message') ?? 'Gagal mengirim balasan komentar ke Instagram.';
                $this->captureApiTelemetry($response, 'reply_comment', $started, $err, false);

                return ['success' => false, 'error' => $err];
            }

            $replyId = (string) ($response->json('id') ?? '');
            $comment->update([
                'is_replied' => true,
                'reply_text' => $message,
                'replied_by' => $actorName,
                'replied_at' => now(),
            ]);

            $this->captureApiTelemetry($response, 'reply_comment', $started, sprintf('Balasan terkirim ke @%s.', $comment->username));

            return [
                'success' => true,
                'reply_id' => $replyId,
            ];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Hide or unhide a public comment on Instagram (`POST /{ig-comment-id}?hide=true|false`).
     *
     * @return array{success: bool, error?: string}
     */
    public function setCommentHidden(InstagramComment $comment, bool $hide): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Instagram Graph API belum terhubung.'];
        }

        $started = microtime(true);

        try {
            $response = Http::timeout(10)->post(sprintf('%s/%s', $this->baseUrl, $comment->ig_comment_id), [
                'hide' => $hide ? 'true' : 'false',
                'access_token' => $this->accessToken,
            ]);

            if (! $response->successful()) {
                $err = $response->json('error.message') ?? 'Gagal memperbarui visibilitas komentar di Instagram.';
                $this->captureApiTelemetry($response, 'hide_comment', $started, $err, false);

                return ['success' => false, 'error' => $err];
            }

            $comment->update(['is_hidden' => $hide]);
            $this->captureApiTelemetry(
                $response,
                'hide_comment',
                $started,
                sprintf('Komentar @%s %s.', $comment->username, $hide ? 'disembunyikan' : 'ditampilkan kembali')
            );

            return ['success' => true];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Permanently delete a public comment on Instagram (`DELETE /{ig-comment-id}`).
     *
     * @return array{success: bool, error?: string}
     */
    public function deleteComment(InstagramComment $comment): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Instagram Graph API belum terhubung.'];
        }

        $started = microtime(true);

        try {
            $response = Http::timeout(10)->delete(sprintf('%s/%s', $this->baseUrl, $comment->ig_comment_id), [
                'access_token' => $this->accessToken,
            ]);

            if (! $response->successful()) {
                $err = $response->json('error.message') ?? 'Gagal menghapus komentar dari Instagram.';
                $this->captureApiTelemetry($response, 'delete_comment', $started, $err, false);

                return ['success' => false, 'error' => $err];
            }

            InstagramComment::where('parent_ig_comment_id', $comment->ig_comment_id)->delete();
            $username = $comment->username;
            $comment->delete();

            $this->captureApiTelemetry($response, 'delete_comment', $started, sprintf('Komentar @%s dihapus dari Instagram.', $username));

            return ['success' => true];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Cache a temporary Meta CDN thumbnail locally so images remain visible long after CDN URLs expire.
     */
    public function cacheThumbnailUrl(?string $remoteUrl, string $prefix = 'thumb'): ?string
    {
        if (empty($remoteUrl) || ! filter_var($remoteUrl, FILTER_VALIDATE_URL)) {
            return $remoteUrl;
        }

        if (Str::contains($remoteUrl, '/storage/ig_cache/')) {
            return $remoteUrl;
        }

        try {
            $filename = sprintf('ig_cache/%s_%s.jpg', $prefix, substr(md5($remoteUrl), 0, 16));
            if (Storage::disk('public')->exists($filename)) {
                return Storage::disk('public')->url($filename);
            }

            if (app()->runningUnitTests() && ! Http::hasFakes()) {
                return $remoteUrl;
            }

            $response = Http::timeout(5)->get($remoteUrl);
            if ($response->successful() && ! empty($response->body())) {
                Storage::disk('public')->put($filename, $response->body());

                return Storage::disk('public')->url($filename);
            }
        } catch (\Throwable) {
            // Graceful fallback to original URL
        }

        return $remoteUrl;
    }

    /**
     * Fetch all Meta Ad Accounts accessible by the configured access token.
     *
     * @return array{success: bool, accounts?: array<int, array<string, mixed>>, error?: string}
     */
    public function fetchAdAccounts(): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Meta belum terhubung.'];
        }

        try {
            $resp = Http::timeout(10)->get(sprintf('%s/me/adaccounts', $this->baseUrl), [
                'fields' => 'id,name,account_id,account_status,currency,amount_spent,spend_cap,balance',
                'access_token' => $this->accessToken,
            ]);

            if (! $resp->successful()) {
                if ($resp->json('error.code') === 100) {
                    return [
                        'success' => true,
                        'accounts' => [],
                    ];
                }

                return [
                    'success' => false,
                    'error' => $resp->json('error.message') ?? sprintf('HTTP %d: Gagal memuat akun iklan.', $resp->status()),
                ];
            }

            return [
                'success' => true,
                'accounts' => $resp->json('data') ?? [],
            ];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Fetch active and completed ad campaigns for a specific ad account.
     *
     * @return array{success: bool, campaigns?: array<int, array<string, mixed>>, error?: string}
     */
    public function fetchAdCampaigns(string $adAccountId): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Meta belum terhubung.'];
        }

        $formattedId = Str::startsWith($adAccountId, 'act_') ? $adAccountId : 'act_'.$adAccountId;

        try {
            $resp = Http::timeout(10)->get(sprintf('%s/%s/campaigns', $this->baseUrl, $formattedId), [
                'fields' => 'id,name,status,objective,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining',
                'access_token' => $this->accessToken,
            ]);

            if (! $resp->successful()) {
                return [
                    'success' => false,
                    'error' => $resp->json('error.message') ?? sprintf('HTTP %d: Gagal memuat kampanye iklan.', $resp->status()),
                ];
            }

            return [
                'success' => true,
                'campaigns' => $resp->json('data') ?? [],
            ];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Fetch ad performance insights for a specific ad account.
     *
     * @return array{success: bool, insights?: array<int, array<string, mixed>>, summary?: array<string, mixed>, error?: string}
     */
    public function fetchAdInsights(string $adAccountId, string $datePreset = 'last_30d'): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Meta belum terhubung.'];
        }

        $formattedId = Str::startsWith($adAccountId, 'act_') ? $adAccountId : 'act_'.$adAccountId;

        try {
            $resp = Http::timeout(12)->get(sprintf('%s/%s/insights', $this->baseUrl, $formattedId), [
                'fields' => 'campaign_name,campaign_id,spend,impressions,reach,clicks,cpc,cpm,ctr,actions,cost_per_action_type',
                'date_preset' => $datePreset,
                'level' => 'campaign',
                'access_token' => $this->accessToken,
            ]);

            if (! $resp->successful()) {
                return [
                    'success' => false,
                    'error' => $resp->json('error.message') ?? sprintf('HTTP %d: Gagal memuat insights iklan.', $resp->status()),
                ];
            }

            /** @var array<int, array<string, mixed>> $rows */
            $rows = $resp->json('data') ?? [];
            $totalSpend = 0.0;
            $totalImpressions = 0;
            $totalReach = 0;
            $totalClicks = 0;

            foreach ($rows as $row) {
                $totalSpend += (float) ($row['spend'] ?? 0);
                $totalImpressions += (int) ($row['impressions'] ?? 0);
                $totalReach += (int) ($row['reach'] ?? 0);
                $totalClicks += (int) ($row['clicks'] ?? 0);
            }

            $avgCtr = $totalImpressions > 0 ? round(($totalClicks / $totalImpressions) * 100, 2) : 0.0;
            $avgCpc = $totalClicks > 0 ? round($totalSpend / $totalClicks, 2) : 0.0;
            $avgCpm = $totalImpressions > 0 ? round(($totalSpend / $totalImpressions) * 1000, 2) : 0.0;

            return [
                'success' => true,
                'insights' => $rows,
                'summary' => [
                    'total_spend' => $totalSpend,
                    'total_impressions' => $totalImpressions,
                    'total_reach' => $totalReach,
                    'total_clicks' => $totalClicks,
                    'avg_ctr' => $avgCtr,
                    'avg_cpc' => $avgCpc,
                    'avg_cpm' => $avgCpm,
                    'date_preset' => $datePreset,
                ],
            ];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Synchronize and cache complete Ads performance to `instagram_connections`.
     *
     * @return array{success: bool, ads_data?: array<string, mixed>, error?: string}
     */
    public function syncAdsPerformance(?string $targetAdAccountId = null, string $datePreset = 'last_30d'): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Meta belum terhubung.'];
        }

        $started = microtime(true);
        $accountsResult = $this->fetchAdAccounts();
        if (! $accountsResult['success']) {
            return ['success' => false, 'error' => $accountsResult['error'] ?? 'Gagal memuat akun iklan.'];
        }

        /** @var array<int, array<string, mixed>> $accounts */
        $accounts = $accountsResult['accounts'] ?? [];
        if (empty($accounts)) {
            $emptyPayload = [
                'accounts' => [],
                'active_account' => null,
                'campaigns' => [],
                'summary' => [
                    'total_spend' => 0.0,
                    'total_impressions' => 0,
                    'total_reach' => 0,
                    'total_clicks' => 0,
                    'avg_ctr' => 0.0,
                    'avg_cpc' => 0.0,
                    'avg_cpm' => 0.0,
                    'date_preset' => $datePreset,
                ],
                'insights' => [],
                'synced_at' => now()->format('d M Y, H:i').' WIB',
            ];

            if (Schema::hasTable('instagram_connections')) {
                InstagramConnection::current()->update(['ads_data' => $emptyPayload]);
            }

            return ['success' => true, 'ads_data' => $emptyPayload];
        }

        $selectedAccount = $accounts[0];
        if ($targetAdAccountId !== null) {
            foreach ($accounts as $acc) {
                if (($acc['id'] ?? '') === $targetAdAccountId || ($acc['account_id'] ?? '') === $targetAdAccountId) {
                    $selectedAccount = $acc;
                    break;
                }
            }
        }

        $selectedId = (string) ($selectedAccount['id'] ?? $selectedAccount['account_id'] ?? '');
        $campaignsResult = $this->fetchAdCampaigns($selectedId);
        $insightsResult = $this->fetchAdInsights($selectedId, $datePreset);

        $adsPayload = [
            'accounts' => $accounts,
            'active_account' => $selectedAccount,
            'campaigns' => $campaignsResult['campaigns'] ?? [],
            'summary' => $insightsResult['summary'] ?? [
                'total_spend' => 0.0,
                'total_impressions' => 0,
                'total_reach' => 0,
                'total_clicks' => 0,
                'avg_ctr' => 0.0,
                'avg_cpc' => 0.0,
                'avg_cpm' => 0.0,
                'date_preset' => $datePreset,
            ],
            'insights' => $insightsResult['insights'] ?? [],
            'synced_at' => now()->format('d M Y, H:i').' WIB',
        ];

        if (Schema::hasTable('instagram_connections')) {
            InstagramConnection::current()->update(['ads_data' => $adsPayload]);
        }

        return ['success' => true, 'ads_data' => $adsPayload];
    }

    /**
     * Synchronize lifetime Audience Demographics (gender, age, top cities, countries, locales).
     *
     * @return array{success: bool, demographics?: array<string, mixed>, error?: string}
     */
    public function syncAudienceDemographics(): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Meta belum terhubung.'];
        }

        $actualIgId = $this->resolveActualInstagramId();

        try {
            $resp = Http::timeout(10)->get(sprintf('%s/%s/insights', $this->baseUrl, $actualIgId), [
                'metric' => 'audience_gender_age,audience_country,audience_city,audience_locale',
                'period' => 'lifetime',
                'access_token' => $this->accessToken,
            ]);

            $payload = [
                'gender_age' => [],
                'gender_distribution' => ['male' => 0, 'female' => 0, 'unspecified' => 0],
                'top_countries' => [],
                'top_cities' => [],
                'top_locales' => [],
                'has_data' => false,
                'synced_at' => now()->format('d M Y, H:i').' WIB',
            ];

            if ($resp->successful()) {
                /** @var array<int, array<string, mixed>> $data */
                $data = $resp->json('data') ?? [];
                foreach ($data as $metricRow) {
                    $mName = (string) ($metricRow['name'] ?? '');
                    $valMap = $metricRow['values'][0]['value'] ?? ($metricRow['total_value']['value'] ?? []);

                    if (! is_array($valMap) || empty($valMap)) {
                        continue;
                    }

                    $payload['has_data'] = true;

                    if ($mName === 'audience_gender_age') {
                        $payload['gender_age'] = $valMap;
                        $mTotal = 0;
                        $fTotal = 0;
                        $uTotal = 0;
                        foreach ($valMap as $k => $count) {
                            if (Str::startsWith($k, 'M.')) {
                                $mTotal += (int) $count;
                            } elseif (Str::startsWith($k, 'F.')) {
                                $fTotal += (int) $count;
                            } else {
                                $uTotal += (int) $count;
                            }
                        }
                        $all = max(1, $mTotal + $fTotal + $uTotal);
                        $payload['gender_distribution'] = [
                            'male' => round(($mTotal / $all) * 100, 1),
                            'female' => round(($fTotal / $all) * 100, 1),
                            'unspecified' => round(($uTotal / $all) * 100, 1),
                        ];
                    } elseif ($mName === 'audience_country') {
                        arsort($valMap);
                        $payload['top_countries'] = array_slice($valMap, 0, 5, true);
                    } elseif ($mName === 'audience_city') {
                        arsort($valMap);
                        $payload['top_cities'] = array_slice($valMap, 0, 5, true);
                    } elseif ($mName === 'audience_locale') {
                        arsort($valMap);
                        $payload['top_locales'] = array_slice($valMap, 0, 5, true);
                    }
                }
            }

            if (Schema::hasTable('instagram_connections')) {
                InstagramConnection::current()->update(['demographics_data' => $payload]);
            }

            return ['success' => true, 'demographics' => $payload];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Synchronize recent 24-hour stories and their performance metrics.
     *
     * @return array{success: bool, stories?: array<int, array<string, mixed>>, error?: string}
     */
    public function syncRecentStories(): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Meta belum terhubung.'];
        }

        $actualIgId = $this->resolveActualInstagramId();

        try {
            $resp = Http::timeout(10)->get(sprintf('%s/%s/stories', $this->baseUrl, $actualIgId), [
                'fields' => 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
                'access_token' => $this->accessToken,
            ]);

            $stories = [];
            if ($resp->successful()) {
                /** @var array<int, array<string, mixed>> $rawList */
                $rawList = $resp->json('data') ?? [];
                foreach ($rawList as $s) {
                    $storyId = (string) ($s['id'] ?? '');
                    $storyMetrics = [
                        'reach' => 0,
                        'impressions' => 0,
                        'replies' => 0,
                        'exits' => 0,
                        'taps_forward' => 0,
                        'taps_back' => 0,
                    ];

                    try {
                        $sInsight = Http::timeout(6)->get(sprintf('%s/%s/insights', $this->baseUrl, $storyId), [
                            'metric' => 'reach,impressions,replies,exits,taps_forward,taps_back',
                            'access_token' => $this->accessToken,
                        ]);

                        if ($sInsight->successful()) {
                            /** @var array<int, array<string, mixed>> $insightRows */
                            $insightRows = $sInsight->json('data') ?? [];
                            foreach ($insightRows as $mRow) {
                                $k = (string) ($mRow['name'] ?? '');
                                $v = (int) ($mRow['values'][0]['value'] ?? 0);
                                if (array_key_exists($k, $storyMetrics)) {
                                    $storyMetrics[$k] = $v;
                                }
                            }
                        }
                    } catch (\Throwable) {
                        // ignore individual story insight failure
                    }

                    $stories[] = [
                        'id' => $storyId,
                        'caption' => $s['caption'] ?? '',
                        'media_type' => $s['media_type'] ?? 'IMAGE',
                        'media_url' => $s['media_url'] ?? '',
                        'thumbnail_url' => $this->cacheThumbnailUrl($s['thumbnail_url'] ?? $s['media_url'] ?? null, 'story_'.$storyId),
                        'permalink' => $s['permalink'] ?? '',
                        'timestamp' => $s['timestamp'] ?? '',
                        'metrics' => $storyMetrics,
                    ];
                }
            }

            if (Schema::hasTable('instagram_connections')) {
                InstagramConnection::current()->update(['stories_data' => $stories]);
            }

            return ['success' => true, 'stories' => $stories];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Synchronize public posts where this Instagram account is tagged or mentioned.
     *
     * @return array{success: bool, mentions?: array<string, mixed>, error?: string}
     */
    public function syncTagsAndMentions(): array
    {
        if (! $this->isConfigured()) {
            return ['success' => false, 'error' => 'Kredensial Meta belum terhubung.'];
        }

        $actualIgId = $this->resolveActualInstagramId();

        try {
            $tagsResp = Http::timeout(10)->get(sprintf('%s/%s/tags', $this->baseUrl, $actualIgId), [
                'fields' => 'id,caption,media_type,media_url,permalink,timestamp,username,like_count,comments_count',
                'limit' => 20,
                'access_token' => $this->accessToken,
            ]);

            $mentionsResp = Http::timeout(10)->get(sprintf('%s/%s/mentioned_media', $this->baseUrl, $actualIgId), [
                'fields' => 'id,caption,media_type,media_url,permalink,timestamp',
                'limit' => 20,
                'access_token' => $this->accessToken,
            ]);

            $taggedPosts = $tagsResp->successful() ? ($tagsResp->json('data') ?? []) : [];
            $mentionedPosts = $mentionsResp->successful() ? ($mentionsResp->json('data') ?? []) : [];

            $payload = [
                'tagged_posts' => $taggedPosts,
                'mentioned_posts' => $mentionedPosts,
                'total_tagged' => count($taggedPosts),
                'total_mentioned' => count($mentionedPosts),
                'synced_at' => now()->format('d M Y, H:i').' WIB',
            ];

            if (Schema::hasTable('instagram_connections')) {
                InstagramConnection::current()->update(['mentions_data' => $payload]);
            }

            return ['success' => true, 'mentions' => $payload];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
