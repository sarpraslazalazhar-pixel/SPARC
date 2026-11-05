import React, { useMemo } from 'react';
import ReportIndex, { type ReportPageProps } from '@/Pages/Report/Index';
import type { SocialPlatform } from '@/Components/UI/Semantics';
import type { SparcPublication } from '@/types/sparc';

interface LegacyMetricItem {
    id: string;
    title: string;
    platform: SocialPlatform;
    date: string;
    views: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    er: number;
}

interface AnalyticsPageProps extends ReportPageProps {
    sessionMetrics?: LegacyMetricItem[];
}

export default function AnalyticsIndex({
    today = '2026-10-27',
    contentItems = [],
    publications = [],
    team = [],
    sessionMetrics = [],
}: AnalyticsPageProps) {
    const mergedPublications = useMemo<SparcPublication[]>(() => {
        const legacyConverted: SparcPublication[] = sessionMetrics.map((m, idx) => ({
            id: m.id || `legacy-metric-${idx}`,
            contentItemId: m.id || `legacy-metric-${idx}`,
            contentId: `SPARC-2026-90${idx + 1}`,
            title: m.title,
            platform: m.platform,
            scheduledAt: `${today} 10:00`,
            publishedActualAt: m.date || `${today} 10:00`,
            publishedUrl: null,
            picName: 'Publisher HUMAS',
            checklist: [],
            metrics: {
                reach: m.reach,
                impressions: m.views,
                views: m.views,
                likes: m.likes,
                comments: m.comments,
                shares: m.shares,
                saves: m.saves,
                clicks: null,
                source: 'manual',
                recordedAt: m.date || today,
            },
        }));

        return [...legacyConverted, ...publications];
    }, [publications, sessionMetrics, today]);

    return (
        <ReportIndex
            today={today}
            contentItems={contentItems}
            publications={mergedPublications}
            team={team}
            pageTitle="Performance Report"
        />
    );
}
