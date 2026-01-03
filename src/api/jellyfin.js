import axios from 'axios';
import { getConfig } from '../utils/config';

// Helper to get a fresh client
const getClient = () => {
    const { JELLYFIN_URL, JELLYFIN_API_KEY } = getConfig();
    return axios.create({
        baseURL: JELLYFIN_URL,
        headers: { 'X-Emby-Token': JELLYFIN_API_KEY }
    });
};

const getUserId = async () => {
    const res = await getClient().get('/Users');
    return res.data[0].Id; 
}

// --- SCANNER ---
export const scanDevices = async () => {
    try {
        const { ANDROID_TV_ID } = getConfig();
        const res = await getClient().get('/Sessions');
        
        return res.data.map(s => ({
            name: s.DeviceName || "Unknown Device",
            id: s.DeviceId,
            app: s.Client,
            isActive: true,
            isControllable: s.SupportsRemoteControl,
            isCurrentTarget: s.DeviceId === ANDROID_TV_ID
        }));
    } catch (e) {
        throw new Error("Connection failed. Check URL and API Key.");
    }
};

// --- MEDIA FETCHERS ---
export const getItems = async (type = 'Movie') => {
  try {
    const userId = await getUserId();
    const res = await getClient().get(`/Users/${userId}/Items`, {
      params: { 
          IncludeItemTypes: type, 
          Recursive: true, 
          SortBy: 'DateCreated', 
          SortOrder: 'Descending', 
          Limit: 100, 
          Fields: 'PrimaryImageAspectRatio,UserData,RunTimeTicks' 
      }
    });
    return res.data.Items;
  } catch (e) { console.error(e); return []; }
};

export const getLiveTvChannels = async () => {
    try {
        const userId = await getUserId();
        const res = await getClient().get('/LiveTv/Channels', {
            params: { UserId: userId, Limit: 2000, Fields: 'PrimaryImageAspectRatio,ChannelNumber', SortBy: 'ChannelNumber,SortName' }
        });
        return res.data.Items; 
    } catch (e) { return []; }
};

export const getSeasons = async (seriesId) => {
    const userId = await getUserId();
    const res = await getClient().get(`/Shows/${seriesId}/Seasons`, { 
        params: { UserId: userId, Fields: 'PrimaryImageAspectRatio,UserData' } 
    });
    return res.data.Items;
};

export const getEpisodes = async (seriesId, seasonId) => {
    const userId = await getUserId();
    const res = await getClient().get(`/Shows/${seriesId}/Episodes`, {
        params: { UserId: userId, SeasonId: seasonId, Fields: 'PrimaryImageAspectRatio,IndexNumber,Overview,UserData,RunTimeTicks' }
    });
    return res.data.Items;
};

// --- REMOTE CONTROL ---
const getTargetSession = async () => {
    const { ANDROID_TV_ID } = getConfig();
    const sessions = await getClient().get('/Sessions');
    return sessions.data.find(s => 
        (s.DeviceId === ANDROID_TV_ID || (s.DeviceName && s.DeviceName.includes(ANDROID_TV_ID)))
    );
};

// --- UPDATED PLAY LOGIC (AUTO-STOP) ---
export const playOnDevice = async (itemId) => {
  if (!itemId) return;
  try {
    const session = await getTargetSession();
    if (!session) { alert("Device not found! Go to Settings -> Scan."); return; }
    
    const client = getClient();

    // 1. If currently playing, STOP it first to clear the buffer
    if (session.NowPlayingItem) {
        await client.post(`/Sessions/${session.Id}/Playing/Stop`);
        // 2. Wait 500ms for the TV to actually stop
        await new Promise(r => setTimeout(r, 500));
    }

    // 3. Send Play Command
    await client.post(`/Sessions/${session.Id}/Playing`, 
      { ItemIds: [String(itemId)], PlayCommand: 'PlayNow' }, 
      { params: { ItemIds: String(itemId), PlayCommand: 'PlayNow' } }
    );
    
  } catch (err) { 
      console.error(err);
      alert("Play Failed: " + err.message); 
  }
};

export const getSessionStatus = async () => {
    try {
        const session = await getTargetSession();
        if (!session || !session.NowPlayingItem) return null;
        const { JELLYFIN_URL } = getConfig();
        const item = session.NowPlayingItem;

        let quality = "HD";
        if (item.Width >= 3000) quality = "4K";
        else if (item.Width >= 1900) quality = "1080p";
        else if (item.Width >= 1200) quality = "720p";
        else if (item.Width < 1200) quality = "SD";

        return {
            sessionId: session.Id,
            itemId: item.Id,
            title: item.Name,
            seriesName: item.SeriesName || null,
            season: item.ParentIndexNumber || null,
            episode: item.IndexNumber || null,
            quality: quality, 
            image: item.PrimaryImageTag 
                ? `${JELLYFIN_URL}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` 
                : null,
            isPlaying: !session.PlayState.IsPaused,
            positionTicks: session.PlayState.PositionTicks,
            durationTicks: item.RunTimeTicks
        };
    } catch (e) { return null; }
};

export const sendControl = async (command, val = null) => {
    try {
        const session = await getTargetSession();
        if (!session) return;
        const client = getClient();
        let url = "";

        switch (command) {
            case 'playpause': url = `/Sessions/${session.Id}/Playing/PlayPause`; break;
            case 'stop': url = `/Sessions/${session.Id}/Playing/Stop`; break;
            case 'next': url = `/Sessions/${session.Id}/Playing/NextTrack`; break;
            case 'prev': url = `/Sessions/${session.Id}/Playing/PreviousTrack`; break;
            case 'seek': url = `/Sessions/${session.Id}/Playing/Seek?SeekPositionTicks=${val}`; break;
            case 'volume': 
                await client.post(`/Sessions/${session.Id}/Command/SetVolume`, { Arguments: { Volume: val } });
                return; 
        }
        if (url) await client.post(url);
    } catch (e) { console.error("Control Error", e); }
};
