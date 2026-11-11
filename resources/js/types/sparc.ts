import type {
    CanonicalWorkflowStatus,
    ContentPillarKey,
    PriorityLevel,
    SocialPlatform,
    UserRoleKey,
} from '@/Components/UI/Semantics';

export interface ProductionTaskItem {
    id: string;
    title: string;
    taskType: 'scripting' | 'design' | 'video' | 'review' | 'approval' | 'distribution' | 'other';
    status: 'todo' | 'in_progress' | 'done' | 'blocked';
    assignedTo: string;
    dueDate: string;
}

export interface ContentCommentItem {
    id: string;
    author: string;
    roleLabel: string;
    comment: string;
    isRevisionNote: boolean;
    createdAt: string;
}

export interface WorkflowHistoryEntry {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actor: string;
    timestamp: string;
    note: string;
}

export interface InstagramPublicComment {
    id: string;
    igCommentId: string;
    igMediaId?: string;
    mediaPermalink?: string | null;
    mediaCaptionExcerpt?: string | null;
    mediaThumbnailUrl?: string | null;
    contentItemId?: string | null;
    contentCode?: string | null;
    contentTitle?: string | null;
    username: string;
    text: string;
    likeCount: number;
    isHidden: boolean;
    isReplied: boolean;
    repliedBy?: string | null;
    replyText?: string | null;
    repliedAt?: string | null;
    convertedContentItemId?: string | null;
    convertedContentCode?: string | null;
    commentedAt: string;
}

export interface InstagramScheduleItem {
    id: string;
    publicationSlotId?: string | null;
    contentItemId?: string | null;
    contentCode?: string | null;
    contentTitle?: string | null;
    mediaType: 'IMAGE' | 'REELS' | 'CAROUSEL';
    publishMode: 'immediate' | 'scheduled';
    status: 'queued' | 'uploading' | 'processing' | 'published' | 'failed' | 'cancelled';
    scheduledAt?: string | null;
    publishedAt?: string | null;
    permalink?: string | null;
    errorMessage?: string | null;
}

export interface InstagramAccountInsights {
    reach_28d?: number | null;
    views_28d?: number | null;
    accounts_engaged_28d?: number | null;
    total_interactions_28d?: number | null;
    best_posting_hours?: string[];
    best_hours_source?: 'instagram_audience' | 'benchmark_humas';
    hourly_active_wib?: Record<string, number>;
    synced_at?: string;
}

export interface InstagramSyncLog {
    id: string;
    timestamp: string;
    operation: string;
    status: 'success' | 'error';
    latencyMs: number;
    note: string;
}

export interface MetaAdsSummary {
    total_spend: number;
    total_impressions: number;
    total_reach: number;
    total_clicks: number;
    avg_ctr: number;
    avg_cpc: number;
    avg_cpm: number;
    date_preset?: string;
}

export interface MetaAdCampaign {
    id: string;
    name: string;
    status: string;
    objective?: string;
    start_time?: string;
    stop_time?: string;
    daily_budget?: string;
    lifetime_budget?: string;
    budget_remaining?: string;
}

export interface MetaAdsData {
    accounts?: Array<{
        id: string;
        name: string;
        account_id: string;
        account_status?: number;
        currency?: string;
        amount_spent?: string;
    }>;
    active_account?: {
        id: string;
        name: string;
        account_id: string;
        currency?: string;
    } | null;
    campaigns?: MetaAdCampaign[];
    summary: MetaAdsSummary;
    insights?: Array<{
        campaign_name?: string;
        campaign_id?: string;
        spend?: string;
        impressions?: string;
        reach?: string;
        clicks?: string;
        cpc?: string;
        cpm?: string;
        ctr?: string;
    }>;
    synced_at?: string;
}

export interface AudienceDemographicsData {
    gender_age: Record<string, number>;
    gender_distribution: {
        male: number;
        female: number;
        unspecified: number;
    };
    top_countries: Record<string, number>;
    top_cities: Record<string, number>;
    top_locales: Record<string, number>;
    has_data: boolean;
    synced_at?: string;
}

export interface InstagramStoryItem {
    id: string;
    caption?: string;
    media_type: string;
    media_url: string;
    thumbnail_url?: string;
    permalink?: string;
    timestamp?: string;
    metrics: {
        reach: number;
        views?: number;
        impressions: number;
        replies: number;
        navigation?: number;
        shares?: number;
        profile_visits?: number;
        exits?: number;
        taps_forward?: number;
        taps_back?: number;
    };
}

export interface InstagramMentionsData {
    tagged_posts: Array<{
        id: string;
        caption?: string;
        media_type?: string;
        media_url?: string;
        permalink?: string;
        timestamp?: string;
        username?: string;
        like_count?: number;
        comments_count?: number;
    }>;
    mentioned_posts: Array<{
        id: string;
        caption?: string;
        media_type?: string;
        media_url?: string;
        permalink?: string;
        timestamp?: string;
    }>;
    total_tagged: number;
    total_mentioned: number;
    synced_at?: string;
}

export interface SparcContentItem {
    id: string;
    contentId: string;
    ticketId?: string | null;
    haloapuTicketId?: string | null;
    haloapuStatus?: string | null;
    isResultAccepted?: boolean | null;
    revisionCount?: number;
    deliverableUrl?: string | null;
    haloApuDbId?: string | null;
    requesterName?: string | null;
    requesterUnit?: string | null;
    requesterAvatar?: string | null;
    assignedOperatorName?: string | null;
    title: string;
    status: CanonicalWorkflowStatus;
    priority: PriorityLevel;
    platform: SocialPlatform;
    format: string;
    pillar: ContentPillarKey;
    picName: string;
    picRole?: UserRoleKey;
    picAvatar: string;
    productionDeadline: string;
    publishDate: string;
    publishTime?: string;
    activityTitle?: string | null;
    campaignTitle?: string | null;
    brief?: string;
    caption?: string;
    publishedUrl?: string;
    igMediaId?: string | null;
    igMediaUrl?: string | null;
    igThumbnailUrl?: string | null;
    refDesignUrl?: string | null;
    resultDesignUrl?: string | null;
    revisionNote?: string | null;
    performanceNotes?: string | null;
    reach?: number | null;
    views?: number;
    likes?: number;
    commentsCount?: number;
    shares?: number;
    saves?: number | null;
    reelsWatchTime?: number | null;
    reelsAvgWatchTime?: number | null;
    isAdBoosted?: boolean;
    adSpend?: number | null;
    metricsSyncedAt?: string | null;
    gridPosition?: number | null;
    isCarryOver?: boolean;
    hasFullDetail?: boolean;
    igComments?: InstagramPublicComment[];
    tasks: ProductionTaskItem[];
    comments: ContentCommentItem[];
    history: WorkflowHistoryEntry[];
}

export interface InstitutionalActivity {
    id: string;
    title: string;
    activityDate: string;
    type: 'agenda' | 'event' | 'hari_besar' | 'kampanye' | 'momentum';
    description?: string;
    linkedCount?: number;
}

export interface PublicationChecklistItem {
    key: string;
    label: string;
    checked: boolean;
}

export interface PublicationMetrics {
    reach: number | null;
    impressions: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    clicks: number | null;
    source: 'manual' | 'excel' | 'csv' | 'api';
    recordedAt: string;
}

export interface SparcPublication {
    id: string;
    contentItemId: string;
    contentId: string;
    title: string;
    platform: SocialPlatform;
    format?: string;
    caption?: string;
    mediaPreviewUrl?: string | null;
    scheduledAt: string;
    publishedActualAt: string | null;
    publishedUrl: string | null;
    picName: string;
    checklist: PublicationChecklistItem[];
    metrics: PublicationMetrics | null;
}

export interface SparcVisualAsset {
    id: string;
    title: string;
    category: 'foto' | 'video' | 'ilustrasi' | 'template_desain' | 'infografis' | 'dokumen' | 'offline' | 'online';
    session?: string | null;
    tags: string[];
    externalUrl: string;
    thumbnailUrl: string;
    contentId: string | null;
    uploadedBy: string;
    createdAt: string;
    dimensions?: string;
}

export interface SparcTeamMember {
    id: string;
    name: string;
    email: string;
    roles: UserRoleKey[];
    primaryRole: UserRoleKey;
    avatar: string;
    activeTasks: number;
    dueThisWeek: number;
    overdueTasks: number;
    effortHours: number;
    capacityHours: number;
    status: string;
}

export interface SparcSystemSettings {
    monthlyContentTarget: number;
    workingHoursStart: string;
    workingHoursEnd: string;
    pollingIntervalSeconds: number;
    lastSyncAt: string;
    tokenHealthy: boolean;
    contentPilars: Array<{ key: string; label: string }>;
    platforms: Array<{ key: string; label: string }>;
    haloApuLogs: Array<{
        id: string;
        timestamp: string;
        status: 'success' | 'error';
        fetched: number;
        latencyMs: number;
        note: string;
    }>;
    haloApu?: {
        isEnabled: boolean;
        baseUrl: string;
        autoSolveOnPublish: boolean;
        lastSyncAt: string;
        lastStatus: string;
    };
    instagram?: {
        appId?: string;
        hasAppSecret?: boolean;
        redirectUri?: string;
        oauthReady?: boolean;
        accountId?: string;
        accessToken?: string;
        hasAccessToken?: boolean;
        connected?: boolean;
        username?: string;
        name?: string;
        biography?: string | null;
        website?: string | null;
        profilePictureUrl?: string | null;
        followersCount?: number | null;
        followsCount?: number | null;
        mediaCount?: number | null;
        pageName?: string;
        tokenExpiresAt?: string | null;
        tokenDaysRemaining?: number | null;
        tokenRefreshedAt?: string | null;
        lastTestedAt?: string;
        lastSyncedAt?: string | null;
        commentsSyncedAt?: string | null;
        grantedScopes?: string[];
        requestedScopes?: string[];
        capabilities?: {
            basic: boolean;
            insights: boolean;
            publish: boolean;
            comments: boolean;
            ads?: boolean;
        };
        accountInsights?: InstagramAccountInsights;
        bestPostingHours?: string[];
        rateLimitUsage?: {
            call_pct: number;
            cpu_pct: number;
            time_pct: number;
            source?: string;
            updated_at?: string;
        } | null;
        syncLogs?: InstagramSyncLog[];
        adsData?: MetaAdsData | null;
        demographicsData?: AudienceDemographicsData | null;
        storiesData?: InstagramStoryItem[];
        mentionsData?: InstagramMentionsData | null;
        candidateAccounts?: Array<{
            accountId: string;
            username: string;
            name?: string;
            pageId?: string;
            pageName?: string;
        }>;
    };
}

export interface DashboardIncomingTicket {
    id: string;
    haloapuTicketId: string;
    sourceType: 'video_reels' | 'desain_feed';
    title: string;
    brief: string;
    requesterName: string;
    requesterUnit?: string;
    requesterAvatar: string;
    targetDate: string;
    haloapuStatus: 'open' | 'on_proses' | 'pending' | 'need_revision' | 'solve' | 'reject' | 'dibatalkan';
    syncStatus: 'pending' | 'converted' | 'ignored';
    createdAt: string;
    formSnapshot: Record<string, string>;
    revisionCount?: number;
    isResultAccepted?: boolean;
    isSlaBreached?: boolean;
    slaResponseDeadline?: string;
    slaResolutionDeadline?: string;
    attachments: Array<{
        id?: string;
        fileName: string;
        url: string;
        fileSize?: string;
    }>;
    logs?: Array<{
        id: string;
        aksi: string;
        actor: string;
        catatan: string;
        timestamp: string;
    }>;
}

export interface DashboardTrendPoint {
    key: string;
    label: string;
    fullLabel: string;
    reach: number;
    interactions: number;
    byPlatform: Record<
        string,
        {
            reach: number;
            interactions: number;
        }
    >;
}
