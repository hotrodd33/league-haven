import { useState, useEffect } from 'react';
import { fetchBranding } from '../api/index.js';

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
    const [branding, setBranding] = useState({ app_name: 'LeagueHaven', logo_url: null });
    const [features, setFeatures] = useState(DEFAULT_FEATURES);

    useEffect(() => {
        if (!isAuthenticated) return;
        fetchBranding()
            .then((data) => {
                setBranding({ app_name: data?.app_name || 'LeagueHaven', logo_url: data?.logo_url || null });
                const f = {};
                for (const k of Object.keys(DEFAULT_FEATURES)) f[k] = data?.[k] !== false;
                setFeatures(f);
            })
            .catch(() => {});
    }, [isAuthenticated]);

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
