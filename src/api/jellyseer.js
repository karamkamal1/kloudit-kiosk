import axios from 'axios';
import { getConfig } from '../utils/config';

// 1. ROBUST CLIENT CREATOR
const getClient = () => {
    let { JELLYSEER_URL, JELLYSEER_API_KEY } = getConfig();
    
    if (!JELLYSEER_URL || !JELLYSEER_API_KEY) return null;

    JELLYSEER_URL = JELLYSEER_URL.trim().replace(/\/$/, ""); 
    JELLYSEER_API_KEY = JELLYSEER_API_KEY.trim();

    return axios.create({
        baseURL: `${JELLYSEER_URL}/api/v1`,
        headers: { 'X-Api-Key': JELLYSEER_API_KEY },
        timeout: 10000 
    });
};

// SAFE FORMATTER (Filters out broken items)
const formatResults = (results, typeOverride = null) => {
    if (!Array.isArray(results)) return [];
    return results
        .filter(item => item && typeof item === 'object') // Filter out nulls
        .map(item => ({
            id: item.id,
            mediaType: typeOverride || item.mediaType || 'movie', 
            title: item.title || item.name || "Unknown",
            posterPath: item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : null,
            status: item.mediaInfo ? item.mediaInfo.status : null,
            isJellyfin: false
        }));
};

export const getDiscovery = async () => {
    const client = getClient();
    
    // DEFAULT SAFE STRUCTURE
    const safeResponse = { 
        popularMixed: [], 
        trendingMovies: [], 
        trendingSeries: [] 
    };
    
    if (!client) return safeResponse;

    try {
        const [mixedRes, moviesRes, seriesRes] = await Promise.allSettled([
            client.get('/discover/trending'), 
            client.get('/discover/movies'),   
            client.get('/discover/tv')        
        ]);

        // STRICT CHECKING: Only format if data.results exists
        if (mixedRes.status === 'fulfilled' && mixedRes.value?.data?.results) {
            safeResponse.popularMixed = formatResults(mixedRes.value.data.results);
        }
        
        if (moviesRes.status === 'fulfilled' && moviesRes.value?.data?.results) {
            safeResponse.trendingMovies = formatResults(moviesRes.value.data.results, 'movie');
        }

        if (seriesRes.status === 'fulfilled' && seriesRes.value?.data?.results) {
            safeResponse.trendingSeries = formatResults(seriesRes.value.data.results, 'tv');
        }

        return safeResponse;

    } catch (e) {
        console.error("Jellyseerr Discovery Error:", e);
        return safeResponse;
    }
};

// THIS WAS THE CRASH CAUSE
export const getRequests = async () => {
    const client = getClient();
    if (!client) return [];
    try {
        const res = await client.get('/request?take=50&skip=0&sort=added');
        const results = res.data?.results || [];
        
        return results
            .map(r => {
                // CRITICAL SAFETY CHECK: If r.media is missing, skip this item
                if (!r || !r.media) return null;

                return {
                    id: r.id,
                    mediaId: r.media.tmdbId,
                    title: r.media.title || r.media.name || "Unknown",
                    status: r.media.status === 5 ? 'Available' : r.status === 2 ? 'Approved' : 'Pending',
                    posterPath: r.media.posterPath ? `https://image.tmdb.org/t/p/w500${r.media.posterPath}` : null,
                    isJellyfin: false,
                    type: r.type // Ensure type is passed for filtering
                };
            })
            .filter(item => item !== null); // Remove the nulls we just created
            
    } catch (e) { 
        console.error("Get Requests Error:", e);
        return []; 
    }
};

export const searchMedia = async (query) => {
    const client = getClient();
    if (!client) throw new Error("Jellyseerr not configured.");
    try {
        const res = await client.get(`/search?query=${encodeURIComponent(query)}`);
        return formatResults(res.data?.results); 
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

export const runDiagnostics = async () => {
    const client = getClient();
    if (!client) return "Config Missing";
    try {
        const res = await client.get('/status');
        return `Connected! Version: ${res.data?.version}`;
    } catch(e) { return "Connection Failed: " + e.message; }
};
