export const getConfig = () => {
    let saved = {};
    try {
        const raw = localStorage.getItem('kiosk_settings');
        if (raw) saved = JSON.parse(raw);
    } catch (e) {
        console.error("Config Load Error:", e);
    }

    const defaults = window.env || {};

    // DEFAULT TABS: If none exist, create the main "All Channels" tab
    let defaultTabs = [];
    if (saved.LIVETV_TABS && Array.isArray(saved.LIVETV_TABS)) {
        defaultTabs = saved.LIVETV_TABS;
    } else {
        // Default "Dynamic" tab that shows everything
        defaultTabs = [{ id: 'main', name: 'Live TV', type: 'dynamic', channels: [] }];
    }

    return {
        JELLYFIN_URL: saved.JELLYFIN_URL || defaults.JELLYFIN_URL || '',
        JELLYFIN_API_KEY: saved.JELLYFIN_API_KEY || defaults.JELLYFIN_API_KEY || '',
        JELLYSEER_URL: saved.JELLYSEER_URL || defaults.JELLYSEER_URL || '',
        JELLYSEER_API_KEY: saved.JELLYSEER_API_KEY || defaults.JELLYSEER_API_KEY || '',
        ANDROID_TV_ID: saved.ANDROID_TV_ID || defaults.ANDROID_TV_ID || '',
        
        // VISUALS
        ACCENT_COLOR: saved.ACCENT_COLOR || '#8a2be2',
        BG_THEME: saved.BG_THEME || 'black',
        
        // FEATURE TOGGLES
        ENABLE_REQUESTS: saved.ENABLE_REQUESTS !== false, 
        ENABLE_LIVETV: saved.ENABLE_LIVETV !== false,     
        
        // TABS
        LIVETV_TABS: defaultTabs,

        TERMS_ACCEPTED: saved.TERMS_ACCEPTED === true 
    };
};

export const saveConfig = (newSettings) => {
    try {
        const current = getConfig();
        const merged = { ...current, ...newSettings };
        localStorage.setItem('kiosk_settings', JSON.stringify(merged));
    } catch (e) {
        console.error("Config Save Error:", e);
        alert("Failed to save settings!");
    }
};
