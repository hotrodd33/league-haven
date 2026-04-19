import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchBranding } from '../api/index.js';
import { STALE } from '../lib/queryConfig.js';

const DEFAULT_FEATURES = {
    feature_live_scoring: true,
    feature_pitch_tracking: true,
    feature_officials: true,
    feature_stats: true,
    feature_documents: true,
    feature_financials: true,
    feature_registration: true,
    feature_public_site: true,
    feature_push_notifications: true,
};

export function useBranding(isAuthenticated) {
    const { data } = useQuery({
        queryKey: ['branding'],
        queryFn: fetchBranding,
        enabled: isAuthenticated,
        staleTime: STALE.HOUR,
    });

    const branding = {
        app_name: data?.app_name || 'LeagueHaven',
        logo_url: data?.logo_url || null,
        public_site_url: data?.public_site_url || null,
    };

    const features = Object.fromEntries(
        Object.keys(DEFAULT_FEATURES).map(k => [k, data?.[k] !== false])
    );

    useEffect(() => {
        document.title = `${branding.app_name} - LeagueHaven Sports Management`;
    }, [branding.app_name]);

    useEffect(() => {
        const cssValue = branding.logo_url ? `url("${branding.logo_url}")` : 'none';
        document.documentElement.style.setProperty('--league-logo-watermark', cssValue);
    }, [branding.logo_url]);

    function setTeamWatermark(logoUrl) {
        if (logoUrl) {
            document.documentElement.style.setProperty('--page-logo-watermark', `url("${logoUrl}")`);
        } else {
            document.documentElement.style.removeProperty('--page-logo-watermark');
        }
    }

    return { branding, features, setTeamWatermark };
}
