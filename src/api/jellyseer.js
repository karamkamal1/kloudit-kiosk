import axios from 'axios';
import { getConfig } from '../utils/config';

// 1. ROBUST CLIENT CREATOR
const getClient = () => {
    let { JELLYSEER_URL, JELLYSEER_API_KEY } = getConfig();
    
    if (!JELLYSEER_URL || !JELLYSEER_API_KEY) return null;

    // CLEANUP: Remove spaces and trailing slashes
    JELLYSEER_URL = JELLYSEER_URL.trim().replace(/\/$/, ""); 
    JELLYSEER_API_KEY = JELLYSEER_API_KEY.trim();

    return axios.create({
        baseURL: `${JELLYSEER_URL}/api/v1`,
        headers: { 'X-Api-Key': JELLYSEER_API_KEY },
        timeout: 10000 
    });
};

const formatResults = (results, typeOverride = 'movie') => {
    if (!Array.isArray(results)) return [];
    return results.map(item => ({
        id: item.id,
        mediaType: typeOverride, 
        title: item.title || item.name || "Unknown",
        posterPath: item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : null,
        status: item.mediaInfo ? item.mediaInfo.status : null,
        isJellyfin: false
    }));
};

// --- IMPROVED DIAGNOSTICS ---
export const runDiagnostics = async () => {
    const client = getClient();
    if (!client) return "Error: Settings missing. Please enter URL & API Key.";

    try {
        // Step 1: Simple Ping (System Status)
        // This is the safest endpoint. If this fails, the URL/Key is wrong.
        const statusRes = await client.get('/status');
        
        if (statusRes.status === 200) {
            // Step 2: Try fetching Content
            try {
                const discRes = await client.get('/discover/movies');
                return `Success! Connected to Jellyseerr v${statusRes.data.version}.\nFound ${discRes.data.results.length} movies.`;
            } catch (e) {
                return `Connected to Server, but Discovery failed: ${e.message}`;
            }
        }
    } catch (e) {
        if (e.response) {
            if (e.response.status === 401) return "401 Unauthorized: API Key is incorrect.";
            if (e.response.status === 404) return "404 Not Found: Check URL (should differ from Jellyfin URL).";
            return `API Error ${e.response.status}: ${e.response.statusText}`;
        }
        return `Network Error: ${e.message}. Check IP address.`;
    }
    return "Unknown Error.";
};

const safeGet = async (client, endpoint, fallback = []) => {
    try {
        const res = await client.get(endpoint);
        return res.data.results || fallback;
    } catch (e) {
        console.warn(`Fetch Failed [${endpoint}]:`, e.message);
        return fallback;
    }
};

export const getDiscovery = async () => {
    const client = getClient();
    const empty = { trendingMovies: [], trendingSeries: [], popularMixed: [] };
    if (!client) return empty;

    try {
        // We removed ?sort=trending to use defaults (safer)
        const [movies, series] = await Promise.all([
            safeGet(client, '/discover/movies'),
            safeGet(client, '/discover/tv')
        ]);

        const formattedMovies = formatResults(movies, 'movie');
        const formattedSeries = formatResults(series, 'tv');

        // Mix them for "Popular"
        const mixed = [];
        const maxLength = Math.max(formattedMovies.length, formattedSeries.length);
        for (let i = 0; i < maxLength; i++) {
            if (formattedMovies[i]) mixed.push(formattedMovies[i]);
            if (formattedSeries[i]) mixed.push(formattedSeries[i]);
        }

        return {
            trendingMovies: formattedMovies,
            trendingSeries: formattedSeries,
            popularMixed: mixed.slice(0, 25)
        };
    } catch (e) {
        return empty;
    }
};

export const getRequests = async () => {
    const client = getClient();
    if (!client) return [];
    try {
        const res = await client.get('/request?take=20&skip=0&sort=added');
        return res.data.results.map(r => ({
            id: r.id,
            mediaId: r.media.tmdbId,
            title: r.media.title || r.media.name || "Unknown",
            status: r.media.status === 5 ? 'Available' : r.status === 2 ? 'Approved' : 'Pending',
            posterPath: r.media.posterPath ? `https://image.tmdb.org/t/p/w500${r.media.posterPath}` : null,
            isJellyfin: false
        }));
    } catch (e) { return []; }
};

export const searchMedia = async (query) => {
    const client = getClient();
    if (!client) throw new Error("Jellyseerr not configured.");
    try {
        const res = await client.get(`/search?query=${encodeURIComponent(query)}`);
        return formatResults(res.data.results, 'movie'); 
    } catch (e) {
        throw new Error(e.response ? `API Error ${e.response.status}` : "Network Error");
    }
};

export const submitRequest = async (tmdbId, type) => {
    const client = getClient();
    if (!client) return;
    try {
        await client.post('/request', { mediaId: tmdbId, mediaType: type, is4k: false });
    } catch (e) {
        throw new Error("Request failed.");
    }
};
