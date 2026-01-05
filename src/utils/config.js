// src/utils/config.js

// Default safe state
let localCache = {
    JELLYFIN_URL: "",
    JELLYFIN_API_KEY: "",
    JELLYSEER_URL: "",
    JELLYSEER_API_KEY: "",
    ANDROID_TV_ID: "",
    ACCENT_COLOR: "#8a2be2",
    BG_THEME: "black",
    ENABLE_REQUESTS: true,
    ENABLE_LIVETV: true,
    ENABLE_SCREENSAVER: true,
    SCREENSAVER_TIMEOUT: 2,
    SCREENSAVER_ORDER: [],
    LIVETV_TABS: [],
    TERMS_ACCEPTED: false
};

// 1. ROBUST INIT (Retries if server is slow)
export const initConfig = async () => {
    let retries = 5;
    while (retries > 0) {
        try {
            const res = await fetch('http://127.0.0.1:3000/api/settings');
            if (res.ok) {
                const data = await res.json();
                localCache = { ...localCache, ...data };
                return localCache;
            }
        } catch (e) {
            console.warn(`Config fetch failed, retrying... (${retries})`);
        }
        retries--;
        await new Promise(r => setTimeout(r, 500)); // Wait 500ms
    }
    return localCache; // Return defaults if all fail
};

// 2. SYNCHRONOUS GETTER - This was missing or not exported
export const getConfig = () => {
    return localCache;
};

// 3. SAVER
export const saveConfig = async (newSettings) => {
    try {
        localCache = { ...localCache, ...newSettings };
        await fetch('http://127.0.0.1:3000/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localCache)
        });
        return localCache;
    } catch (e) {
        console.error("Save Failed:", e);
    }
};
