import axios from 'axios';
import { getConfig } from '../utils/config';

const getClient = () => {
    const { JELLYSEER_URL, JELLYSEER_API_KEY } = getConfig();
    return axios.create({
        baseURL: JELLYSEER_URL,
        headers: { 'X-Api-Key': JELLYSEER_API_KEY }
    });
};

const getJellyfinRecents = async () => {
    try {
        const { JELLYFIN_URL, JELLYFIN_API_KEY } = getConfig();
        const api = axios.create({ baseURL: JELLYFIN_URL, headers: { 'X-Emby-Token': JELLYFIN_API_KEY } });
        const userRes = await api.get('/Users');
        const userId = userRes.data[0].Id;
        const res = await api.get(`/Users/${userId}/Items/Latest`, { params: { IncludeItemTypes: 'Movie', Limit: 20 } });
        return res.data.map(i => ({
            id: i.Id, title: i.Name, posterPath: `/Items/${i.Id}/Images/Primary`, isJellyfin: true
        }));
    } catch (e) { return []; }
};

export const getRequests = async () => {
    try {
        const res = await getClient().get(`/api/v1/request`, { 
            params: { take: 100, skip: 0, sort: 'modified' } 
        });

        return res.data.results.map(r => {
            let statusLabel = 'PENDING'; let statusClass = 'pending';
            if (r.status === 1) { statusLabel = 'WAITING APPROVAL'; statusClass = 'pending'; }
            else if (r.media) {
                if (r.media.status === 5) { statusLabel = 'AVAILABLE'; statusClass = 'available'; }
                else if (r.media.status === 4 || r.media.status === 3) { statusLabel = 'DOWNLOADING'; statusClass = 'downloading'; }
                else if (r.media.status === 2) { statusLabel = 'QUEUED'; statusClass = 'pending'; }
            }
            const safeTitle = r.media?.title || r.media?.name || r.media?.originalTitle || "Processing...";
            const poster = r.media?.posterPath || r.posterPath;
            return {
                id: r.id, mediaId: r.media?.tmdbId || r.media?.tvdbId,
                title: safeTitle, posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : null,
                status: statusLabel, statusClass: statusClass, type: r.type 
            };
        }).filter(i => i.posterPath); 
    } catch (e) { return []; }
};

export const getDiscovery = async () => {
    try {
        const fetch = async (url) => {
            const res = await getClient().get(url);
            return res.data.results.map(i => ({
                id: i.id, title: i.title || i.name,
                posterPath: i.posterPath ? `https://image.tmdb.org/t/p/w500${i.posterPath}` : null, isJellyfin: false
            })).filter(i => i.posterPath);
        };
        const trendingMix = await fetch(`/api/v1/discover/trending`);
        const popularMovies = await fetch(`/api/v1/discover/movies`);
        const popularTv = await fetch(`/api/v1/discover/tv`);

        if (trendingMix.length === 0 && popularMovies.length === 0) {
            const recents = await getJellyfinRecents();
            return { trendingMovies: recents, trendingTv: [], popularMovies: [] };
        }
        return { trendingMovies: trendingMix, trendingTv: popularTv, popularMovies };
    } catch (e) { return null; }
};

export const searchMedia = async (query) => {
    if (!query || query.trim() === "") throw new Error("Search empty.");
    const safeQuery = encodeURIComponent(query.trim());
    const res = await getClient().get(`/api/v1/search?query=${safeQuery}`);
    const results = res.data.results.filter(i => i.mediaType === 'movie' || i.mediaType === 'tv');
    return results.map(i => ({
        id: i.id, title: i.title || i.name,
        posterPath: i.posterPath ? `https://image.tmdb.org/t/p/w500${i.posterPath}` : null,
        mediaType: i.mediaType, isJellyfin: false
    })).filter(i => i.posterPath);
};

const getTvSeasons = async (tvId) => {
    try {
        const res = await getClient().get(`/api/v1/tv/${tvId}`);
        return res.data.seasons.map(s => s.seasonNumber);
    } catch (e) { return [1]; }
};

export const submitRequest = async (mediaId, mediaType) => {
    let seasons = [];
    if (mediaType === 'tv') seasons = await getTvSeasons(mediaId);
    await getClient().post(`/api/v1/request`, {
        mediaId: Number(mediaId), mediaType: mediaType, is4k: false, seasons: seasons
    });
    return "Request Sent!";
};
export const requestMedia = submitRequest;
