import React, { useState, useEffect, useRef } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import { getItems, getSeasons, getEpisodes, getLiveTvChannels, playOnDevice, getSessionStatus, sendControl, scanDevices } from './api/jellyfin'; 
import { searchMedia, submitRequest, getDiscovery, getRequests } from './api/jellyseer'; 
import { getConfig, saveConfig } from './utils/config';
import './styles/index.css';

const { JELLYFIN_URL } = window.env || {}; 

export default function App() {
  const [activeTab, setActiveTab] = useState('movies');
  const [viewState, setViewState] = useState('grid');
  
  const [cache, setCache] = useState({ movies: [], series: [], livetv: [] });
  const [items, setItems] = useState([]);
  const [parentItem, setParentItem] = useState(null);
  
  const [discovery, setDiscovery] = useState({ trendingMovies: [], trendingTv: [], popularMovies: [] });
  const [activeRequests, setActiveRequests] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [reqInput, setReqInput] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState(getConfig());
  const [scanResults, setScanResults] = useState([]);
  const [activeSettingInput, setActiveSettingInput] = useState(null);

  const keyboard = useRef();
  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const isSeeking = useRef(false);
  const [seekValue, setSeekValue] = useState(0);
  const startY = useRef(0);
  const scrollTop = useRef(0);
  
  const onMouseDown = (e) => { isDragging.current = true; startY.current = e.pageY - scrollRef.current.offsetTop; scrollTop.current = scrollRef.current.scrollTop; };
  const onMouseUp = () => { isDragging.current = false; };
  const onMouseMove = (e) => { if (!isDragging.current) return; e.preventDefault(); const y = e.pageY - scrollRef.current.offsetTop; const walk = (y - startY.current) * 2; scrollRef.current.scrollTop = scrollTop.current - walk; };

  // --- STYLE INJECTION ---
  const getThemeStyles = () => {
      const themes = [
        { id: 'black', bg: '#141414', card: '#1f1f1f' },
        { id: 'blue', bg: '#0f172a', card: '#1e293b' },
        { id: 'purple', bg: '#180f26', card: '#2d1b4e' },
        { id: 'red', bg: '#260f0f', card: '#4a1c1c' },
        { id: 'green', bg: '#0f2615', card: '#1c4a25' },
        { id: 'slate', bg: '#27272a', card: '#3f3f46' },
        { id: 'maroon', bg: '#2b0505', card: '#4a0a0a' },
        { id: 'royal', bg: '#05052b', card: '#0a0a4a' },
        { id: 'coffee', bg: '#2b1a05', card: '#4a2e0a' },
        { id: 'gray', bg: '#333333', card: '#444444' }
      ];
      const t = themes.find(x => x.id === config.BG_THEME) || themes[0];
      return { '--accent': config.ACCENT_COLOR, '--bg': t.bg, '--card': t.card };
  };

  useEffect(() => {
      setConfig(getConfig());
      if (cache[activeTab]) setItems(cache[activeTab]);
      loadMainTab(activeTab);

      const dataInterval = setInterval(() => {
          if (activeTab === 'requests') getRequests().then(setActiveRequests);
          else if (activeTab === 'movies' || activeTab === 'series') refreshLibraryMerge(activeTab);
      }, 15000);

      const playerInterval = setInterval(async () => {
          const status = await getSessionStatus();
          setPlayerState(status); 
          if (status && !isSeeking.current) {
              const progress = (status.positionTicks / status.durationTicks) * 100 || 0;
              setSeekValue(progress);
          }
      }, 1000);

      return () => { clearInterval(dataInterval); clearInterval(playerInterval); };
  }, [activeTab]);

  const handleConfigChange = (field, value) => { setConfig(prev => ({ ...prev, [field]: value })); };
  const handleDeviceSelect = (deviceId) => { handleConfigChange('ANDROID_TV_ID', deviceId); setScanResults([]); };
  const handleSettingsFocus = (field) => { setActiveSettingInput(field); setShowKeyboard(true); if (keyboard.current) keyboard.current.setInput(config[field]); };
  const handleSettingsInput = (val) => { if (activeSettingInput) handleConfigChange(activeSettingInput, val); };
  
  const handleScan = async () => { saveConfig(config); try { setScanResults(await scanDevices()); } catch(e) { alert(e.message); } };
  const handleSaveSettings = () => { saveConfig(config); setShowSettings(false); alert("Settings Saved! Reloading..."); setCache({ movies: [], series: [], livetv: [] }); loadMainTab(activeTab); };

  // --- NEW: QUIT APPLICATION ---
  const handleQuit = () => {
      if (confirm("Are you sure you want to quit the Kiosk?")) {
          window.close(); // Standard way to close Electron/Browser windows
      }
  };

  const refreshLibraryMerge = async (tab) => {
      const isMovie = tab === 'movies';
      const requestType = isMovie ? 'movie' : 'tv';
      const allRequests = await getRequests();
      const relevantRequests = allRequests.filter(r => r.type === requestType && r.status !== 'AVAILABLE');
      setItems(currentItems => {
          const libraryItems = currentItems.filter(i => !i.status);
          return [...relevantRequests, ...libraryItems];
      });
  };

  const handleNavClick = (tab) => { setActiveTab(tab); loadMainTab(tab); };

  const loadMainTab = async (tab) => {
    setSearchResults(null); clearSearch(); setShowKeyboard(false); setParentItem(null); 
    if (tab === 'requests') {
        const [discData, reqData] = await Promise.all([getDiscovery(), getRequests()]);
        setDiscovery(discData || {}); setActiveRequests(reqData || []); setViewState('grid');
    } else if (tab === 'livetv') {
        const channels = await getLiveTvChannels();
        setItems(channels); setCache(prev => ({ ...prev, livetv: channels })); setViewState('livetv');
    } else {
        const isMovie = tab === 'movies';
        const targetType = isMovie ? 'Movie' : 'Series'; 
        const requestType = isMovie ? 'movie' : 'tv';
        const libraryItems = await getItems(targetType);
        setItems(libraryItems); setViewState('grid');
        const allRequests = await getRequests();
        const relevantRequests = allRequests.filter(r => r.type === requestType && r.status !== 'AVAILABLE');
        setItems([...relevantRequests, ...libraryItems]);
        setCache(prev => ({ ...prev, [tab]: [...relevantRequests, ...libraryItems] }));
    }
  };

  const handleItemClick = async (item) => {
    if (item.status && item.status !== 'AVAILABLE') return; 

    const isContainer = ['Series', 'Season', 'BoxSet', 'Folder', 'Collection'].includes(item.Type);

    if (isContainer) {
        if (item.Type === 'Series') {
            setParentItem(item);
            setItems(await getSeasons(item.Id));
            setViewState('seasons');
        } else if (item.Type === 'Season') {
            setParentItem(item);
            setItems(await getEpisodes(item.SeriesId, item.Id));
            setViewState('episodes');
        }
    } else {
        setPlaybackLoading(true);
        try {
            await playOnDevice(item.Id);
            setMinimized(false); 
        } catch(e) { 
            alert("Error playing item: " + e.message); 
        } finally { 
            setTimeout(() => setPlaybackLoading(false), 4000); 
        }
    }
  };

  const handleBack = () => { if (viewState === 'episodes') loadMainTab('series'); else loadMainTab(activeTab); };

  const handleControl = (cmd) => sendControl(cmd);
  const handleSeekStart = () => { isSeeking.current = true; };
  const handleSeekMove = (e) => { setSeekValue(e.target.value); };
  const handleSeekEnd = (e) => { isSeeking.current = false; const pct = e.target.value; const ticks = (pct / 100) * playerState.durationTicks; sendControl('seek', Math.floor(ticks)); };
  const skip = (seconds) => { const jump = seconds * 10000000; sendControl('seek', playerState.positionTicks + jump); };
  const formatTime = (ticks) => { if (!ticks) return "0:00"; const seconds = Math.floor(ticks / 10000000); const minutes = Math.floor(seconds / 60); const remainingSeconds = seconds % 60; return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`; };
  const getEndTime = () => {
      if(!playerState) return "";
      const remainingMs = (playerState.durationTicks - playerState.positionTicks) / 10000;
      const endDate = new Date(Date.now() + remainingMs);
      return `Ends at ${endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  };

  const renderMiniPlayer = () => {
      if (!playerState) return null;
      return (
          <div className={`mini-player ${minimized ? 'minimized' : ''}`} onClick={() => minimized && setMinimized(false)}>
              <div className="mini-header-text">Now Playing: {playerState.title}</div>
              <div className="player-top-bar"><button className="minimize-btn" onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}>▼</button></div>
              <div className="player-body">
                  {playerState.image && <img src={playerState.image} className="mini-art" />}
                  <div className="mini-info">
                      <div className="mini-meta-row">{playerState.seriesName && <span className="series-info">{playerState.seriesName} • S{playerState.season} E{playerState.episode}</span>}<span className="meta-badge quality">{playerState.quality}</span></div>
                      <div className="mini-title">{playerState.title}</div>
                      <div className="mini-seek-row">
                          <span className="time-label">{formatTime(playerState.positionTicks)}</span>
                          <input type="range" className="mini-slider" min="0" max="100" value={seekValue} onMouseDown={handleSeekStart} onTouchStart={handleSeekStart} onChange={handleSeekMove} onMouseUp={handleSeekEnd} onTouchEnd={handleSeekEnd} />
                          <span className="time-label">{formatTime(playerState.durationTicks)}</span>
                      </div>
                      <div className="ends-at">{getEndTime()}</div>
                  </div>
                  <div className="mini-controls">
                      <button className="mini-btn" onClick={() => handleControl('prev')}>⏮</button><button className="mini-btn" onClick={() => skip(-10)}>↺</button><button className="mini-btn play" onClick={() => handleControl('playpause')}>{playerState.isPlaying ? '⏸' : '▶'}</button><button className="mini-btn" onClick={() => skip(10)}>↻</button><button className="mini-btn" onClick={() => handleControl('next')}>⏭</button>
                  </div>
              </div>
          </div>
      );
  };

  const performSearch = async () => { if(!reqInput.trim()) return; try { setSearchResults(await searchMedia(reqInput)); setShowKeyboard(false); } catch(e) { alert(e.message); } };
  const clearSearch = () => { setReqInput(""); setSearchResults(null); if(keyboard.current) keyboard.current.clearInput(); };
  const handlePhysicalInput = (e) => { setReqInput(e.target.value); if(keyboard.current) keyboard.current.setInput(e.target.value); };
  const initiateRequest = (item) => { if(item.mediaType) { setModalData(item); setModalOpen(true); } };
  const confirmRequest = async () => { if(!modalData) return; setModalOpen(false); try { await submitRequest(modalData.id, modalData.mediaType); alert("Requested!"); clearSearch(); loadMainTab(activeTab); } catch(e) { alert(e.message); } };

  const renderDiscoverySection = (title, data) => {
    if (!data || data.length === 0) return null;
    return (
      <div className="discovery-section"><h2 className="section-title">{title}</h2>
          <div className="grid-mode">
              {data.map(t => (
                  <div key={t.id} className="card" onClick={() => initiateRequest({ ...t, mediaType: t.mediaType || 'movie' })}>
                      <div className="poster-wrapper">
                          <img src={t.isJellyfin ? `${getConfig().JELLYFIN_URL}${t.posterPath}` : t.posterPath} loading="lazy" />
                          {t.status && t.status !== 'AVAILABLE' && ( <> <div className="status-label">{t.status}</div> <div className={`status-bar ${t.statusClass}`}></div> </> )}
                      </div>
                      <div className="card-title">{t.title || t.name}</div>
                  </div>
              ))}
          </div>
      </div>
    );
  };

  return (
    <div className="app-container" style={getThemeStyles()}>
      <nav>
        <button className={`nav-btn ${activeTab==='movies'?'active':''}`} onClick={()=>handleNavClick('movies')}>Movies</button>
        <button className={`nav-btn ${activeTab==='series'?'active':''}`} onClick={()=>handleNavClick('series')}>TV Shows</button>
        <button className={`nav-btn ${activeTab==='livetv'?'active':''}`} onClick={()=>handleNavClick('livetv')}>Live Sports</button>
        <button className={`nav-btn ${activeTab==='requests'?'active':''}`} onClick={()=>handleNavClick('requests')}>Request</button>
        <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button>
      </nav>
      
      <div className="content">
        <div className={`scroll-container ${viewState === 'livetv' ? 'livetv-mode' : ''}`} ref={scrollRef} onMouseDown={onMouseDown} onMouseLeave={onMouseUp} onMouseUp={onMouseUp} onMouseMove={onMouseMove}>
            {activeTab !== 'requests' && (
                <div className={viewState === 'episodes' ? 'list-mode' : 'grid-mode'}>
                    {items.map(i => (
                      <div key={i.Id || i.id} className={viewState === 'episodes' ? "episode-row" : "card"} onClick={() => handleItemClick(i)}>
                        {viewState === 'episodes' ? (
                            <>
                                <img src={`${getConfig().JELLYFIN_URL}/Items/${i.Id}/Images/Primary`} loading="lazy" />
                                <div className="episode-info"><div className="episode-num">{i.IndexNumber}. {i.Name}</div></div>
                            </>
                        ) : (
                            <>
                                <div className="poster-wrapper">
                                    <img src={i.posterPath ? i.posterPath : `${getConfig().JELLYFIN_URL}/Items/${i.Id}/Images/Primary`} onError={(e) => e.target.style.display = 'none'} loading="lazy" />
                                    {i.status && i.status !== 'AVAILABLE' && (<> <div className="status-label">{i.status}</div> <div className={`status-bar ${i.statusClass}`}></div> </>)}
                                </div>
                                <div className="card-title">{i.Name || i.title}</div>
                            </>
                        )}
                      </div>
                    ))}
                </div>
            )}

            {activeTab === 'requests' && (
                <div style={{width: '100%'}}>
                    <div className="search-container">
                        <input className="search-input" value={reqInput} onChange={handlePhysicalInput} placeholder="Search..." onFocus={() => {setActiveSettingInput(null); setShowKeyboard(true);}} />
                        <button className="search-btn" onClick={performSearch}>Go</button>
                        {(reqInput || searchResults) && <button className="clear-btn" onClick={clearSearch}>X</button>}
                    </div>
                    {searchResults ? renderDiscoverySection(`Results for "${reqInput}"`, searchResults) : (
                        <>
                            {activeRequests.length > 0 && renderDiscoverySection("Processing / Downloads", activeRequests)}
                            {renderDiscoverySection("Trending Movies", discovery.trendingMovies)}
                            {renderDiscoverySection("Popular Movies", discovery.popularMovies)}
                        </>
                    )}
                </div>
            )}
        </div>
        
        {showKeyboard && (
            <div className="keyboard-wrapper">
                <div className="keyboard-header"><button className="close-kb-btn" onClick={() => setShowKeyboard(false)}>Done / Close</button></div>
                <Keyboard keyboardRef={r => (keyboard.current = r)} 
                    onChange={activeSettingInput ? handleSettingsInput : setReqInput} 
                    inputName="default" />
            </div>
        )}

        {showSettings && (
            <div className="settings-modal">
                <div className="settings-content" style={{overflowY: 'auto'}}>
                    <button className="close-settings" onClick={() => setShowSettings(false)}>×</button>
                    <div className="settings-title">Settings</div>
                    {/* (Existing Inputs for URLs/Keys...) */}
                    <div className="input-group">
                        <label className="input-label">Jellyfin URL</label>
                        <input className="settings-input" value={config.JELLYFIN_URL} onFocus={() => handleSettingsFocus('JELLYFIN_URL')} onChange={e => handleConfigChange('JELLYFIN_URL', e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Jellyfin API Key</label>
                        <input className="settings-input" value={config.JELLYFIN_API_KEY} onFocus={() => handleSettingsFocus('JELLYFIN_API_KEY')} onChange={e => handleConfigChange('JELLYFIN_API_KEY', e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Target Device</label>
                        <div className="device-scan-row">
                            <input className="settings-input" style={{flex: 1}} value={config.ANDROID_TV_ID} onFocus={() => handleSettingsFocus('ANDROID_TV_ID')} onChange={e => handleConfigChange('ANDROID_TV_ID', e.target.value)} />
                            <button className="scan-btn" onClick={handleScan}>Scan</button>
                        </div>
                        {scanResults.length > 0 && (
                            <div className="device-list">
                                {scanResults.map(d => (
                                    <div key={d.id} className={`device-card ${config.ANDROID_TV_ID === d.id ? 'active' : ''}`} onClick={() => handleDeviceSelect(d.id)}>
                                        <div className="device-name">{d.name}</div>
                                        <div className="device-app">{d.app}</div>
                                        <div className="device-status"><div className={`status-dot ${d.isControllable ? 'green' : 'red'}`}></div>{d.isControllable ? 'Controllable' : 'Read Only'}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="input-group">
                        <label className="input-label">Jellyseerr URL</label>
                        <input className="settings-input" value={config.JELLYSEER_URL} onFocus={() => handleSettingsFocus('JELLYSEER_URL')} onChange={e => handleConfigChange('JELLYSEER_URL', e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Jellyseerr API Key</label>
                        <input className="settings-input" value={config.JELLYSEER_API_KEY} onFocus={() => handleSettingsFocus('JELLYSEER_API_KEY')} onChange={e => handleConfigChange('JELLYSEER_API_KEY', e.target.value)} />
                    </div>

                    <div className="settings-actions">
                        <button className="btn-cancel" style={{borderColor: 'red', color: 'red'}} onClick={handleQuit}>Quit App</button>
                        <button className="save-btn" onClick={handleSaveSettings}>Save</button>
                    </div>
                </div>
            </div>
        )}

        {playbackLoading && <div className="loading-overlay"><div className="spinner"></div><div className="loading-text">Starting Playback...</div></div>}
        
        {modalOpen && modalData && (
            <div className="modal-overlay">
                <div className="modal-content">
                    <div className="modal-title">Confirm Request</div>
                    <div className="modal-text">Request download for <b>{modalData.title}</b>?</div>
                    <div className="modal-actions"><button className="btn-confirm" onClick={confirmRequest}>Request</button><button className="btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button></div>
                </div>
            </div>
        )}

        {renderMiniPlayer()}
      </div>
    </div>
  );
}
