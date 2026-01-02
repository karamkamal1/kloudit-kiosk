export const getConfig = () => {
    const saved = JSON.parse(localStorage.getItem('kiosk_settings') || '{}');
    const defaults = window.env || {};

    return {
        JELLYFIN_URL: saved.JELLYFIN_URL || defaults.JELLYFIN_URL || '',
        JELLYFIN_API_KEY: saved.JELLYFIN_API_KEY || defaults.JELLYFIN_API_KEY || '',
        JELLYSEER_URL: saved.JELLYSEER_URL || defaults.JELLYSEER_URL || '',
        JELLYSEER_API_KEY: saved.JELLYSEER_API_KEY || defaults.JELLYSEER_API_KEY || '',
        ANDROID_TV_ID: saved.ANDROID_TV_ID || defaults.ANDROID_TV_ID || '',
        
        // THEME SETTINGS
        ACCENT_COLOR: saved.ACCENT_COLOR || '#8a2be2', // Default Purple
        BG_THEME: saved.BG_THEME || 'black'            // Default Dark
    };
};

export const saveConfig = (newSettings) => {
    // Merge with existing to avoid data loss
    const current = JSON.parse(localStorage.getItem('kiosk_settings') || '{}');
    localStorage.setItem('kiosk_settings', JSON.stringify({ ...current, ...newSettings }));
};
