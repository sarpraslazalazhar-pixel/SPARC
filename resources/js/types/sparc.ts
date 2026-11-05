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

export interface SparcContentItem {
    id: string;
    contentId: string;
    ticketId?: string | null;
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
    metricsSyncedAt?: string | null;
    gridPosition?: number | null;
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
    source: 'manual' | 'csv' | 'api';
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
    category: 'foto' | 'video' | 'ilustrasi' | 'template_desain' | 'infografis' | 'dokumen';
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
    attachments: Array<{
        id?: string;
        fileName: string;
        url: string;
        fileSize?: string;
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
