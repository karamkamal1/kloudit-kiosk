import axios from 'axios';
import { getConfig } from '../utils/config';

const getClient = () => {
    const { JELLYFIN_URL, JELLYFIN_API_KEY } = getConfig();
    if (!JELLYFIN_URL || !JELLYFIN_API_KEY) return null;
    
    // Ensure no double slash at end
    const cleanUrl = JELLYFIN_URL.endsWith('/') ? JELLYFIN_URL.slice(0, -1) : JELLYFIN_URL;
    
    return axios.create({
        baseURL: cleanUrl,
        headers: { 
            'X-Emby-Token': JELLYFIN_API_KEY,
            'X-Emby-Authorization': `MediaBrowser Client="Media Dashboard", Device="Kiosk", DeviceId="kiosk-01", Version="1.0.0"`,
            'Content-Type': 'application/json'
        },
        timeout: 5000
    });
};

const getUserId = async () => {
    const client = getClient();
    if (!client) return null;
    try {
        const res = await client.get('/Users');
        // Prefer an Admin user to ensure control rights
        const admin = res.data.find(u => u.Policy && u.Policy.IsAdministrator);
        return admin ? admin.Id : res.data[0]?.Id; 
    } catch (e) { return null; }
}

export const scanDevices = async () => {
    const client = getClient();
    if (!client) return [];
    try {
        const res = await client.get('/Sessions');
        const targetId = getConfig().ANDROID_TV_ID;
        
        return (res.data || []).map(s => ({
            name: s.DeviceName || "Unknown Device",
            id: s.DeviceId,
            app: s.Client,
            isActive: true,
            isControllable: s.SupportsRemoteControl,
            isCurrentTarget: s.DeviceId === targetId
        }));
    } catch (e) { return []; }
};

export const getItems = async (type = 'Movie', sortBy = 'DateCreated', searchTerm = '') => {
  const client = getClient();
  if (!client) return [];
  try {
    const userId = await getUserId();
    if (!userId) return [];
    
    const params = { 
        IncludeItemTypes: type, 
        Recursive: true, 
        Limit: 100, 
        Fields: 'PrimaryImageAspectRatio,UserData,RunTimeTicks,ChannelNumber',
        // FIX 1: STRICT FILTERS FOR DOWNLOADED CONTENT
        IsMissing: false,            // Ignore missing episodes/files
        LocationTypes: 'FileSystem', // Only actual files on disk
        ExcludeLocationTypes: 'Virtual',
    };

    // Sorting Logic
    if (sortBy === 'Name') {
        params.SortBy = 'SortName';
        params.SortOrder = 'Ascending';
    } else if (sortBy === 'DateCreated') {
        params.SortBy = 'DateCreated';
        params.SortOrder = 'Descending';
    } else if (sortBy === 'PremiereDate') {
        params.SortBy = 'PremiereDate';
        params.SortOrder = 'Descending';
    }

    if (searchTerm) {
        params.SearchTerm = searchTerm;
    }

    const res = await client.get(`/Users/${userId}/Items`, { params });
    return res.data.Items || [];
  } catch (e) { return []; }
};

export const getLiveTvChannels = async () => {
    const client = getClient();
    if (!client) return [];
    try {
        const userId = await getUserId();
        if (!userId) return [];
        const res = await client.get('/LiveTv/Channels', {
            params: { 
                UserId: userId, 
                Limit: 2000, 
                Fields: 'PrimaryImageAspectRatio,ChannelNumber', 
                SortBy: 'ChannelNumber,SortName' 
            }
        });
        return res.data.Items || []; 
    } catch (e) { return []; }
};

export const getSeasons = async (seriesId) => {
    const client = getClient();
    if (!client) return [];
    try {
        const userId = await getUserId();
        const res = await client.get(`/Shows/${seriesId}/Seasons`, { 
            params: { 
                UserId: userId, 
                Fields: 'PrimaryImageAspectRatio,UserData',
                IsMissing: false // Ensure we don't show empty seasons
            } 
        });
        return res.data.Items || [];
    } catch (e) { return []; }
};

export const getEpisodes = async (seriesId, seasonId) => {
    const client = getClient();
    if (!client) return [];
    try {
        const userId = await getUserId();
        const res = await client.get(`/Shows/${seriesId}/Episodes`, {
            params: { 
                UserId: userId, 
                SeasonId: seasonId, 
                Fields: 'PrimaryImageAspectRatio,IndexNumber,Overview,UserData,RunTimeTicks',
                IsMissing: false // Ensure we don't show missing episodes
            }
        });
        return res.data.Items || [];
    } catch (e) { return []; }
};

// FIX 2: ROBUST PLAYBACK COMMAND
export const playOnDevice = async (itemId) => {
  if (!itemId) throw new Error("No Item ID provided");
  const client = getClient();
  if (!client) throw new Error("API Client not ready");

  try {
    const userId = await getUserId(); 
    if (!userId) throw new Error("No valid user found to issue command.");

    const { ANDROID_TV_ID } = getConfig();
    if (!ANDROID_TV_ID) throw new Error("No Target Device set in settings.");

    const sessions = await client.get('/Sessions');
    const session = sessions.data.find(s => (s.DeviceId === ANDROID_TV_ID || (s.DeviceName && s.DeviceName.includes(ANDROID_TV_ID))));
    
    if (!session) throw new Error(`Device "${ANDROID_TV_ID}" not found. Is it active?`);
    if (!session.SupportsRemoteControl) throw new Error("Target device does not support remote control.");

    // Issue Play Command
    console.log(`Sending Play Command to ${session.Id} for Item ${itemId}`);
    
    // NOTE: Sending params in BOTH query and body covers all server versions
    const queryParams = { 
        ControllingUserId: userId,
        PlayCommand: 'PlayNow',
        ItemIds: String(itemId)
    };

    const bodyParams = {
        ControllingUserId: userId,
        PlayCommand: 'PlayNow',
        ItemIds: [String(itemId)]
    };
    
    await client.post(`/Sessions/${session.Id}/Playing`, bodyParams, { params: queryParams });

  } catch (err) { 
      const status = err.response?.status;
      const msg = err.response?.data || err.message;
      console.error("Playback Error:", err);
      throw new Error(`Error ${status}: ${JSON.stringify(msg)}`); 
  }
};

export const getSessionStatus = async () => {
    try {
        const client = getClient();
        if (!client) return null;
        
        const { ANDROID_TV_ID, JELLYFIN_URL } = getConfig();
        const sessions = await client.get('/Sessions');
        const session = sessions.data.find(s => (s.DeviceId === ANDROID_TV_ID || (s.DeviceName && s.DeviceName.includes(ANDROID_TV_ID))));
        
        if (!session || !session.NowPlayingItem) return null;
        
        const item = session.NowPlayingItem;
        const cleanUrl = JELLYFIN_URL.endsWith('/') ? JELLYFIN_URL.slice(0, -1) : JELLYFIN_URL;
        
        return {
            title: item.Name,
            seriesName: item.SeriesName,
            season: item.ParentIndexNumber,
            episode: item.IndexNumber,
            image: item.PrimaryImageTag ? `${cleanUrl}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : null,
            isPlaying: !session.PlayState.IsPaused,
            positionTicks: session.PlayState.PositionTicks,
            durationTicks: item.RunTimeTicks,
            quality: item.Width >= 3000 ? "4K" : item.Width >= 1900 ? "1080p" : "SD"
        };
    } catch (e) { return null; }
};

export const sendControl = async (command, val = null) => {
    const client = getClient();
    if (!client) return;
    try {
        const userId = await getUserId();
        const { ANDROID_TV_ID } = getConfig();
        const sessions = await client.get('/Sessions');
        const session = sessions.data.find(s => (s.DeviceId === ANDROID_TV_ID || (s.DeviceName && s.DeviceName.includes(ANDROID_TV_ID))));
        if (!session) return;

        let url = "";
        const params = { ControllingUserId: userId };
        
        switch (command) {
            case 'playpause': url = `/Sessions/${session.Id}/Playing/PlayPause`; break;
            case 'stop': url = `/Sessions/${session.Id}/Playing/Stop`; break;
            case 'next': url = `/Sessions/${session.Id}/Playing/NextTrack`; break;
            case 'prev': url = `/Sessions/${session.Id}/Playing/PreviousTrack`; break;
            case 'seek': 
                url = `/Sessions/${session.Id}/Playing/Seek`; 
                params.SeekPositionTicks = val;
                break;
        }
        if (url) await client.post(url, null, { params });
    } catch (e) { console.error(e); }
};

export const searchLocalLibrary = async (query) => {
    const client = getClient();
    if (!client) return [];
    try {
        const userId = await getUserId();
        if (!userId) return [];

        // Base Params - Ensure filtered to only valid files
        const baseParams = {
            IncludeItemTypes: 'Movie,Series',
            Recursive: true,
            IsMissing: false,
            LocationTypes: 'FileSystem',
            Limit: 50,
            Fields: 'PrimaryImageAspectRatio,UserData,RunTimeTicks'
        };

        if (!query || query.trim() === "") {
            const res = await client.get(`/Users/${userId}/Items`, {
                params: { ...baseParams, SortBy: 'DateCreated', SortOrder: 'Descending' }
            });
            return res.data.Items || [];
        }

        const res = await client.get(`/Users/${userId}/Items`, {
            params: { ...baseParams, SearchTerm: query }
        });
        return res.data.Items || [];
    } catch (e) { 
        console.error("Search Error:", e);
        return []; 
    }
};
