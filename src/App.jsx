import React, { useState, useEffect, useRef } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import { getItems, getSeasons, getEpisodes, getLiveTvChannels, playOnDevice, getSessionStatus, sendControl, scanDevices } from './api/jellyfin'; 
import { searchMedia, submitRequest, getDiscovery, getRequests, runDiagnostics } from './api/jellyseer'; 
import { getConfig, saveConfig } from './utils/config';
import './styles/index.css';

const { JELLYFIN_URL } = window.env || {}; 

// KEYBOARD LAYOUTS
const KEYBOARD_LAYOUT = {
    'default': [ 'q w e r t y u i o p {bksp}', 'a s d f g h j k l {enter}', '{shift} z x c v b n m , . /', '{numbers} {space} .com' ],
    'shift': [ 'Q W E R T Y U I O P {bksp}', 'A S D F G H J K L {enter}', '{shift} Z X C V B N M , . /', '{numbers} {space} .com' ],
    'numbers': [ '1 2 3 4 5 6 7 8 9 0 {bksp}', '@ # $ % & - _ + = ( ) /', '* " \' : ; ! ? {enter}', '{abc} {space} .com' ]
};
const KEYBOARD_DISPLAY = { '{numbers}': '?123', '{abc}': 'ABC', '{bksp}': '⌫', '{enter}': 'GO', '{space}': ' ', '{shift}': '⇧' };

const ACCENT_COLORS = [ { name: 'Purple', hex: '#8a2be2' }, { name: 'Red', hex: '#e50914' }, { name: 'Blue', hex: '#007aff' }, { name: 'Pink', hex: '#ff69b4' }, { name: 'Orange', hex: '#ff9f43' }, { name: 'Yellow', hex: '#f1c40f' }, { name: 'Green', hex: '#2ecc71' }, { name: 'Teal', hex: '#1abc9c' }, { name: 'Black', hex: '#ffffff' }, { name: 'Maroon', hex: '#c0392b' } ];
const BG_THEMES = [ { id: 'black', name: 'Midnight', bg: '#141414', card: '#1f1f1f' }, { id: 'blue', name: 'Ocean', bg: '#0f172a', card: '#1e293b' }, { id: 'purple', name: 'Galaxy', bg: '#180f26', card: '#2d1b4e' }, { id: 'red', name: 'Crimson', bg: '#260f0f', card: '#4a1c1c' }, { id: 'green', name: 'Forest', bg: '#0f2615', card: '#1c4a25' }, { id: 'slate', name: 'Slate', bg: '#27272a', card: '#3f3f46' }, { id: 'maroon', name: 'Wine', bg: '#2b0505', card: '#4a0a0a' }, { id: 'royal', name: 'Royal', bg: '#05052b', card: '#0a0a4a' }, { id: 'coffee', name: 'Coffee', bg: '#2b1a05', card: '#4a2e0a' }, { id: 'gray', name: 'Concrete', bg: '#333333', card: '#444444' } ];

export default function App() {
  const initialConfig = getConfig();
  
  // SAFE INIT
  const [config, setConfig] = useState({
      ...initialConfig,
      DEFAULT_LIVETV_NAME: initialConfig.DEFAULT_LIVETV_NAME || "Live TV",
      LIVETV_TABS: Array.isArray(initialConfig.LIVETV_TABS) ? initialConfig.LIVETV_TABS : []
  });

  const [wizardMode, setWizardMode] = useState(!initialConfig.TERMS_ACCEPTED || !initialConfig.JELLYFIN_URL);
  const [wizardStep, setWizardStep] = useState(initialConfig.TERMS_ACCEPTED ? 2 : 1);

  const [activeTab, setActiveTab] = useState('movies');
  const [viewState, setViewState] = useState('grid');
  
  const [cache, setCache] = useState({ movies: [], series: [], livetv: [] });
  const [items, setItems] = useState([]);
  const [parentItem, setParentItem] = useState(null);
  
  const [discovery, setDiscovery] = useState({ trendingMovies: [], trendingSeries: [], popularMixed: [] });
  const [activeRequests, setActiveRequests] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  
  // UI State
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState('default');
  const [reqInput, setReqInput] = useState("");
  const [liveTvSearch, setLiveTvSearch] = useState(""); 
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState('main'); 
  const [editingTab, setEditingTab] = useState(null); 
  const [allChannels, setAllChannels] = useState([]);
  const [channelSearch, setChannelSearch] = useState(""); 
  const [scanResults, setScanResults] = useState([]);
  const [activeSettingInput, setActiveSettingInput] = useState(null);

  const keyboard = useRef();
  const scrollRef = useRef(null);
  const settingsScrollRef = useRef(null);
  
  // DRAG SCROLL (NAVBAR)
  const navRef = useRef(null);
  const isNavDragging = useRef(false);
  const navStartX = useRef(0);
  const navScrollLeft = useRef(0);

  // CUSTOM SCROLLBAR STATE
  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [isScrollDragging, setIsScrollDragging] = useState(false);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollStartY = useRef(0);
  const scrollStartTop = useRef(0);

  const isDragging = useRef(false);
  const isSeeking = useRef(false);
  const [seekValue, setSeekValue] = useState(0);
  const startY = useRef(0);
  const scrollTop = useRef(0);

  // --- CUSTOM SCROLLBAR LOGIC ---
  const updateScrollbar = () => {
      if (!scrollRef.current) return;
      const { clientHeight, scrollHeight, scrollTop } = scrollRef.current;
      
      if (scrollHeight <= clientHeight + 20) {
          setShowScrollbar(false);
          return;
      }
      setShowScrollbar(true);

      const heightRatio = clientHeight / scrollHeight;
      const tHeight = Math.max(heightRatio * clientHeight, 30); 
      setThumbHeight(tHeight);
      
      const scrollRatio = scrollTop / (scrollHeight - clientHeight);
      const tTop = scrollRatio * (clientHeight - tHeight);
      setThumbTop(tTop);
  };

  const onScrollbarDown = (e) => {
      e.stopPropagation();
      e.preventDefault(); 
      setIsScrollDragging(true);
      scrollStartY.current = e.touches ? e.touches[0].clientY : e.clientY;
      scrollStartTop.current = thumbTop;
  };

  const onGlobalMove = (e) => {
      if (isScrollDragging && scrollRef.current) {
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          const deltaY = clientY - scrollStartY.current;
          const { clientHeight, scrollHeight } = scrollRef.current;
          const maxThumbTop = clientHeight - thumbHeight;
          const newThumbTop = Math.min(Math.max(scrollStartTop.current + deltaY, 0), maxThumbTop);
          const scrollRatio = newThumbTop / maxThumbTop;
          scrollRef.current.scrollTop = scrollRatio * (scrollHeight - clientHeight);
      }
  };

  const onGlobalUp = () => {
      setIsScrollDragging(false);
  };

  useEffect(() => {
      window.addEventListener('mousemove', onGlobalMove);
      window.addEventListener('mouseup', onGlobalUp);
      window.addEventListener('touchmove', onGlobalMove, {passive: false});
      window.addEventListener('touchend', onGlobalUp);
      return () => {
          window.removeEventListener('mousemove', onGlobalMove);
          window.removeEventListener('mouseup', onGlobalUp);
          window.removeEventListener('touchmove', onGlobalMove);
          window.removeEventListener('touchend', onGlobalUp);
      };
  }, [isScrollDragging, thumbHeight]);

  useEffect(() => {
      updateScrollbar(); 
      window.addEventListener('resize', updateScrollbar);
      return () => window.removeEventListener('resize', updateScrollbar);
  }, [items, viewState, activeTab]);

  // --- CONTENT DRAG SCROLL (INVERTED) ---
  const onMouseDown = (e) => { isDragging.current = true; startY.current = e.pageY - scrollRef.current.offsetTop; scrollTop.current = scrollRef.current.scrollTop; };
  const onMouseUp = () => { isDragging.current = false; };
  const onMouseMove = (e) => { 
      if (!isDragging.current) return; 
      e.preventDefault(); 
      const y = e.pageY - scrollRef.current.offsetTop; 
      const walk = (y - startY.current) * 2; 
      // INVERTED LOGIC: Plus instead of Minus
      scrollRef.current.scrollTop = scrollTop.current + walk; 
  };

  const onNavDown = (e) => { 
      isNavDragging.current = true; 
      navStartX.current = (e.touches ? e.touches[0].pageX : e.pageX) - navRef.current.offsetLeft; 
      navScrollLeft.current = navRef.current.scrollLeft; 
  };
  const onNavUp = () => { isNavDragging.current = false; };
  const onNavMove = (e) => { 
      if (!isNavDragging.current) return; 
      e.preventDefault(); 
      const x = (e.touches ? e.touches[0].pageX : e.pageX) - navRef.current.offsetLeft; 
      const walk = (x - navStartX.current) * 1.5; 
      navRef.current.scrollLeft = navScrollLeft.current - walk; 
  };

  const getThemeStyles = () => {
      const t = BG_THEMES.find(x => x.id === config.BG_THEME) || BG_THEMES[0];
      return { '--accent': config.ACCENT_COLOR, '--bg': t.bg, '--card': t.card };
  };

  useEffect(() => {
      if (!wizardMode && config.JELLYFIN_URL) {
          if (cache[activeTab]) setItems(cache[activeTab]);
          loadMainTab(activeTab);
      }
      const dataInterval = setInterval(() => {
          if (wizardMode || !config.JELLYFIN_URL) return;
          if (activeTab === 'requests' && config.ENABLE_REQUESTS) getRequests().then(setActiveRequests);
          else if (activeTab === 'movies' || activeTab === 'series') refreshLibraryMerge(activeTab);
      }, 15000);
      const playerInterval = setInterval(async () => {
          if (wizardMode || !config.JELLYFIN_URL) return;
          const status = await getSessionStatus();
          setPlayerState(status); 
          if (status && !isSeeking.current) setSeekValue((status.positionTicks / status.durationTicks) * 100 || 0);
      }, 1000);
      return () => { clearInterval(dataInterval); clearInterval(playerInterval); };
  }, [activeTab, wizardMode, config.JELLYFIN_URL]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; updateScrollbar(); }, [viewState, activeTab, parentItem]);

  const handleConfigChange = (field, value) => { setConfig(prev => ({ ...prev, [field]: value })); };
  const handleSettingsFocus = (field, e) => { 
      setActiveSettingInput(field); setShowKeyboard(true); 
      let val = "";
      if (field === 'tabName' && editingTab) val = editingTab.name; else if (field === 'channelSearch') val = channelSearch; else if (field === 'liveTvSearch') val = liveTvSearch; else val = config[field] || "";
      if (keyboard.current) keyboard.current.setInput(val);
      if (e && e.target) setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  };
  const handleSettingsInput = (val) => { if (activeSettingInput === 'tabName' && editingTab) setEditingTab(prev => ({ ...prev, name: val })); else if (activeSettingInput === 'channelSearch') setChannelSearch(val); else if (activeSettingInput === 'liveTvSearch') setLiveTvSearch(val); else if (activeSettingInput) handleConfigChange(activeSettingInput, val); };
  const handleKeyboardPress = (button) => { if (button === "{numbers}") setKeyboardLayout("numbers"); else if (button === "{abc}") setKeyboardLayout("default"); else if (button === "{shift}") setKeyboardLayout(keyboardLayout === "default" ? "shift" : "default"); };
  const handleDeviceSelect = (deviceId) => { handleConfigChange('ANDROID_TV_ID', deviceId); setScanResults([]); };
  const handleScan = async () => { saveConfig(config); try { setScanResults(await scanDevices()); } catch(e) { alert(e.message); } };
  const handleManageTabs = async () => { setSettingsView('tabs'); try { const channels = await getLiveTvChannels(); setAllChannels(channels || []); } catch(e) { setAllChannels([]); } };
  const handleAddTab = () => { if (config.LIVETV_TABS.length >= 5) return alert("Max 5 tabs allowed."); const newTab = { id: Date.now(), name: "New Tab", type: 'static', channels: [] }; setEditingTab(newTab); setChannelSearch(""); setSettingsView('edit-tab'); };
  const handleEditTab = (tab) => { setEditingTab({ ...tab, channels: [...(tab.channels || [])] }); setChannelSearch(""); setSettingsView('edit-tab'); };
  const handleDeleteTab = (id) => { if (!confirm("Delete this tab?")) return; let newTabs = config.LIVETV_TABS.filter(t => t.id !== id); if (newTabs.length === 0) newTabs = [{ id: 'main', name: 'Live TV', type: 'dynamic', channels: [] }]; handleConfigChange('LIVETV_TABS', newTabs); };
  const handleSaveTab = () => { if (!editingTab.name.trim()) return alert("Tab Name Required"); let newTabs = [...config.LIVETV_TABS]; const existingIndex = newTabs.findIndex(t => t.id === editingTab.id); if (existingIndex >= 0) newTabs[existingIndex] = editingTab; else newTabs.push(editingTab); handleConfigChange('LIVETV_TABS', newTabs); setSettingsView('tabs'); };
  const toggleChannelInTab = (channelId) => { if (!editingTab) return; const current = editingTab.channels || []; const newChannels = current.includes(channelId) ? current.filter(id => id !== channelId) : [...current, channelId]; setEditingTab({ ...editingTab, channels: newChannels }); };
  const handleSelectAllChannels = () => { if (!editingTab) return; const filteredChannels = channelSearch ? (allChannels || []).filter(c => c.Name.toLowerCase().includes(channelSearch.toLowerCase())) : (allChannels || []); const filteredIds = filteredChannels.map(c => c.Id); const current = new Set(editingTab.channels || []); filteredIds.forEach(id => current.add(id)); setEditingTab({ ...editingTab, channels: Array.from(current) }); };
  const handleSaveSettings = () => { saveConfig(config); setShowSettings(false); setShowKeyboard(false); alert("Saved! Reloading..."); setCache({ movies: [], series: [], livetv: [] }); loadMainTab(activeTab); };
  const handleThemeChange = (type, value) => { const newConfig = { ...config, [type]: value }; setConfig(newConfig); saveConfig(newConfig); setSettingsView('main'); };
  const refreshLibraryMerge = async (tab) => { const isMovie = tab === 'movies'; const requestType = isMovie ? 'movie' : 'tv'; const allRequests = await getRequests(); const relevantRequests = allRequests.filter(r => r.type === requestType && r.status !== 'AVAILABLE'); setItems(currentItems => { const libraryItems = currentItems.filter(i => !i.status); return [...relevantRequests, ...libraryItems]; }); };
  const handleNavClick = (tab) => { setActiveTab(tab); loadMainTab(tab); };
  const loadMainTab = async (tab) => { setSearchResults(null); clearSearch(); setShowKeyboard(false); setParentItem(null); setLiveTvSearch(""); if (tab === 'requests') { const discData = await getDiscovery(); setDiscovery(discData); setViewState('grid'); } else if (tab.startsWith('livetv-')) { setViewState('livetv'); setItems([]); const tabId = tab.replace('livetv-', ''); const tabConfig = config.LIVETV_TABS.find(t => String(t.id) === tabId); if (tabConfig) { let channels = []; if (tabConfig.type === 'dynamic') { channels = await getLiveTvChannels(); } else { const all = await getLiveTvChannels(); channels = all.filter(c => tabConfig.channels.includes(c.Id)); } setItems(channels); } } else { setViewState('grid'); const isMovie = tab === 'movies'; const targetType = isMovie ? 'Movie' : 'Series'; const requestType = isMovie ? 'movie' : 'tv'; const libraryItems = await getItems(targetType); setItems(libraryItems); const allRequests = await getRequests(); const relevantRequests = allRequests.filter(r => r.type === requestType && r.status !== 'AVAILABLE'); setItems([...relevantRequests, ...libraryItems]); setCache(prev => ({ ...prev, [tab]: [...relevantRequests, ...libraryItems] })); } };
  
  // --- ITEM CLICK HANDLER (FIXED FOR SEASONS) ---
  const handleItemClick = async (item) => { 
      if (item.status && item.status !== 'AVAILABLE') return; 
      if (item.mediaType) { setModalData(item); setModalOpen(true); return; }
      
      const isContainer = ['Series', 'Season', 'BoxSet', 'Folder', 'Collection'].includes(item.Type); 
      if (isContainer) { 
          if (item.Type === 'Series') { 
              setParentItem(item); 
              setItems(await getSeasons(item.Id)); 
              setViewState('seasons'); 
          } else if (item.Type === 'Season') { 
              // Fix: Ensure we preserve Series Name for the back button
              // The 'item' here is the Season object. It usually contains SeriesId and SeriesName.
              setParentItem({ 
                  ...item, 
                  SeriesName: item.SeriesName || parentItem?.Name || "Series", // Safe fallback
                  SeriesId: item.SeriesId || parentItem?.Id 
              }); 
              setItems(await getEpisodes(item.SeriesId, item.Id)); 
              setViewState('episodes'); 
          } 
      } else { 
          setPlaybackLoading(true); 
          try { await playOnDevice(item.Id); setMinimized(false); } catch(e) { alert("Error: " + e.message); } finally { setTimeout(() => setPlaybackLoading(false), 4000); } 
      } 
  };

  const handleBack = async () => { 
      if (viewState === 'episodes') { 
          if (parentItem && parentItem.SeriesId) { 
              const seasons = await getSeasons(parentItem.SeriesId); 
              setItems(seasons); 
              setViewState('seasons'); 
              // When going back to seasons, parentItem should be the Series info again.
              // Ideally, you'd fetch the Series info, but using the stored ID and Name is usually enough for the header.
              setParentItem({ Name: parentItem.SeriesName, Id: parentItem.SeriesId }); 
          } else { 
              loadMainTab('series'); 
          } 
      } else if (viewState === 'seasons') { 
          loadMainTab('series'); 
      } else { 
          loadMainTab(activeTab); 
      } 
  };
  
  const handleControl = (cmd) => sendControl(cmd);
  const handleSeekStart = () => { isSeeking.current = true; };
  const handleSeekMove = (e) => { setSeekValue(e.target.value); };
  const handleSeekEnd = (e) => { isSeeking.current = false; const pct = e.target.value; const ticks = (pct / 100) * playerState.durationTicks; sendControl('seek', Math.floor(ticks)); };
  const skip = (seconds) => { const jump = seconds * 10000000; sendControl('seek', playerState.positionTicks + jump); };
  const formatTime = (ticks) => { if (!ticks) return "0:00"; const seconds = Math.floor(ticks / 10000000); const minutes = Math.floor(seconds / 60); const remainingSeconds = seconds % 60; return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`; };
  const formatDuration = (ticks) => { if (!ticks) return ""; const minutes = Math.floor(ticks / 10000000 / 60); return `${minutes}m`; };
  const getEndTime = () => { if(!playerState) return ""; const remainingMs = (playerState.durationTicks - playerState.positionTicks) / 10000; const endDate = new Date(Date.now() + remainingMs); return `Ends at ${endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`; };
  const performSearch = async () => { if(!reqInput.trim()) return; try { setSearchResults(await searchMedia(reqInput)); setShowKeyboard(false); } catch(e) { alert(e.message); } };
  const clearSearch = () => { setReqInput(""); setSearchResults(null); if(keyboard.current) keyboard.current.clearInput(); };
  const handlePhysicalInput = (e) => { setReqInput(e.target.value); if(keyboard.current) keyboard.current.setInput(e.target.value); };
  const initiateRequest = (item) => { if(item.mediaType) { setModalData(item); setModalOpen(true); } };
  const confirmRequest = async () => { if(!modalData) return; setModalOpen(false); try { await submitRequest(modalData.id, modalData.mediaType); alert("Requested!"); clearSearch(); loadMainTab(activeTab); } catch(e) { alert(e.message); } };
  const handleQuit = () => { if(confirm("Quit Kiosk?")) window.close(); };
  const renderMiniPlayer = () => { if (!playerState) return null; return ( <div className={`mini-player ${minimized ? 'minimized' : ''}`} onClick={() => minimized && setMinimized(false)}> <div className="mini-header-text">Now Playing: {playerState.title}</div> <div className="player-top-bar"><button className="minimize-btn" onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}>▼</button></div> <div className="player-body"> {playerState.image && <img src={playerState.image} className="mini-art" />} <div className="mini-info"> <div className="mini-meta-row">{playerState.seriesName && <span className="series-info">{playerState.seriesName} • S{playerState.season} E{playerState.episode}</span>}<span className="meta-badge quality">{playerState.quality}</span></div> <div className="mini-title">{playerState.title}</div> <div className="mini-seek-row"> <span className="time-label">{formatTime(playerState.positionTicks)}</span> <input type="range" className="mini-slider" min="0" max="100" value={seekValue} onMouseDown={handleSeekStart} onTouchStart={handleSeekStart} onChange={handleSeekMove} onMouseUp={handleSeekEnd} onTouchEnd={handleSeekEnd} /> <span className="time-label">{formatTime(playerState.durationTicks)}</span> </div> <div className="ends-at">{getEndTime()}</div> </div> <div className="mini-controls"> <button className="mini-btn" onClick={() => handleControl('prev')}>⏮</button><button className="mini-btn" onClick={() => skip(-10)}>↺</button><button className="mini-btn play" onClick={() => handleControl('playpause')}>{playerState.isPlaying ? '⏸' : '▶'}</button><button className="mini-btn" onClick={() => skip(10)}>↻</button><button className="mini-btn" onClick={() => handleControl('next')}>⏭</button> </div> </div> </div> ); };
  const renderDiscoverySection = (title, data) => { return ( <div className="discovery-section"> <h2 className="section-title">{title}</h2> {data && data.length > 0 ? ( <div className="grid-mode"> {data.map(t => ( <div key={t.id} className="card" onClick={() => initiateRequest({ ...t, mediaType: t.mediaType || 'movie' })}> <div className="poster-wrapper"> <img src={t.isJellyfin ? `${getConfig().JELLYFIN_URL}${t.posterPath}` : t.posterPath} loading="lazy" /> {t.status && t.status !== 'AVAILABLE' && ( <> <div className="status-label">{t.status}</div> <div className={`status-bar ${t.statusClass}`}></div> </> )} </div> <div className="card-title">{t.title || t.name}</div> </div> ))} </div> ) : ( <div style={{color: '#777', padding: '20px', fontStyle: 'italic'}}> No items found. Check Diagnostics in Settings. </div> )} </div> ); };
  const renderWizard = () => { if (wizardStep === 1) { return ( <div className="wizard-step"> <h2>End User License Agreement</h2> <div style={{height: '300px', overflowY: 'auto', background: '#222', padding: '20px', borderRadius: '8px', marginBottom: '20px'}}> <h3 style={{color: 'white', marginTop: 0}}>1. ACCEPTANCE OF TERMS</h3> <p>Standard EULA...</p> </div> <div className="wizard-actions"> <button className="wizard-btn wizard-back" onClick={() => window.close()}>Decline</button> <button className="wizard-btn wizard-next" onClick={() => { handleConfigChange('TERMS_ACCEPTED', true); setWizardStep(2); }}>I Agree</button> </div> </div> ); } if (wizardStep === 2) { return ( <div className="wizard-step"> <h2>Connection Setup</h2> <div className="input-group"> <label className="input-label">Jellyfin URL</label> <input className="settings-input" value={config.JELLYFIN_URL} onFocus={(e) => handleSettingsFocus('JELLYFIN_URL', e)} onChange={e => handleConfigChange('JELLYFIN_URL', e.target.value)} /> </div> <div className="input-group"> <label className="input-label">Jellyfin API Key</label> <input className="settings-input" value={config.JELLYFIN_API_KEY} onFocus={(e) => handleSettingsFocus('JELLYFIN_API_KEY', e)} onChange={e => handleConfigChange('JELLYFIN_API_KEY', e.target.value)} /> </div> <hr style={{borderColor: '#333', margin: '15px 0'}}/> <div className="input-group"> <label className="input-label">Jellyseerr URL</label> <input className="settings-input" value={config.JELLYSEER_URL} onFocus={(e) => handleSettingsFocus('JELLYSEER_URL', e)} onChange={e => handleConfigChange('JELLYSEER_URL', e.target.value)} /> </div> <div className="input-group"> <label className="input-label">Jellyseerr API Key</label> <input className="settings-input" value={config.JELLYSEER_API_KEY} onFocus={(e) => handleSettingsFocus('JELLYSEER_API_KEY', e)} onChange={e => handleConfigChange('JELLYSEER_API_KEY', e.target.value)} /> </div> <div className="wizard-actions"> <button className="wizard-btn wizard-next" onClick={() => setWizardStep(3)}>Next</button> </div> </div> ); } if (wizardStep === 3) { return ( <div className="wizard-step"> <h2>Select Target TV</h2> <div className="device-scan-row"> <input className="settings-input" style={{flex: 1}} value={config.ANDROID_TV_ID} onFocus={(e) => handleSettingsFocus('ANDROID_TV_ID', e)} onChange={e => handleConfigChange('ANDROID_TV_ID', e.target.value)} /> <button className="scan-btn" onClick={handleScan}>Scan</button> </div> {scanResults.length > 0 && ( <div className="device-list"> {scanResults.map(d => ( <div key={d.id} className={`device-card ${config.ANDROID_TV_ID === d.id ? 'active' : ''}`} onClick={() => handleDeviceSelect(d.id)}> <div className="device-name">{d.name}</div><div className="device-app">{d.app}</div> <div className="device-status"><div className={`status-dot ${d.isControllable ? 'green' : 'red'}`}></div>{d.isControllable ? 'Controllable' : 'Read Only'}</div> </div> ))} </div> )} <div className="wizard-actions"> <button className="wizard-btn wizard-back" onClick={() => setWizardStep(2)}>Back</button> <button className="wizard-btn wizard-next" style={{background: '#2ecc71', color: 'black'}} onClick={() => { saveConfig(config); setWizardMode(false); setShowKeyboard(false); loadMainTab('movies'); }}>Finish Setup</button> </div> </div> ); } };
  const renderSettingsContent = () => { if (settingsView === 'accent') { return ( <> <div className="settings-title">Select Accent</div> <div className="color-grid"> {ACCENT_COLORS.map(c => ( <div key={c.hex} className={`color-swatch ${config.ACCENT_COLOR === c.hex ? 'selected' : ''}`} style={{backgroundColor: c.hex}} onClick={() => handleThemeChange('ACCENT_COLOR', c.hex)} /> ))} </div> <div className="settings-actions"><button className="back-btn" onClick={() => setSettingsView('main')}>Back</button></div> </> ); } if (settingsView === 'bg') { return ( <> <div className="settings-title">Select Background</div> <div className="color-grid"> {BG_THEMES.map(t => ( <div key={t.id} className={`theme-preview ${config.BG_THEME === t.id ? 'selected' : ''}`} style={{backgroundColor: t.bg}} onClick={() => handleThemeChange('BG_THEME', t.id)}> <div className="theme-preview-card" style={{backgroundColor: t.card}}></div> </div> ))} </div> <div className="settings-actions"><button className="back-btn" onClick={() => setSettingsView('main')}>Back</button></div> </> ); } if (settingsView === 'tabs') { return ( <> <div className="settings-title">Live TV Tabs</div> <div className="tab-list"> {(config.LIVETV_TABS || []).map(tab => ( <div key={tab.id} className="tab-item"> <span style={{fontSize: '1.2rem', fontWeight: 'bold'}}>{tab.name} {tab.type === 'dynamic' && '(All)'}</span> <div className="tab-actions"> <button className="mini-action-btn" onClick={() => handleEditTab(tab)}>Edit</button> <button className="mini-action-btn delete" onClick={() => handleDeleteTab(tab.id)}>Del</button> </div> </div> ))} {(config.LIVETV_TABS || []).length < 5 && <button className="scan-btn" onClick={handleAddTab}>+ New Tab</button>} </div> <div className="settings-actions"><button className="back-btn" onClick={() => setSettingsView('main')}>Back</button></div> </> ); } if (settingsView === 'edit-tab' && editingTab) { const filteredChannels = (allChannels || []).filter(c => c.Name.toLowerCase().includes(channelSearch.toLowerCase())); return ( <> <div className="settings-title">Edit Tab</div> <div className="input-group"> <label className="input-label">Tab Name</label> <input className="settings-input" value={editingTab.name || ""} onFocus={(e) => handleSettingsFocus('tabName', e)} onChange={e => setEditingTab({...editingTab, name: e.target.value})} placeholder="e.g. Sports" /> </div> <div className="input-group" style={{marginTop: '10px'}}> <label className="input-label">Search Channels</label> <div className="device-scan-row"> <input className="settings-input" value={channelSearch} onFocus={(e) => handleSettingsFocus('channelSearch', e)} onChange={e => setChannelSearch(e.target.value)} placeholder="Filter..." /> <button className="scan-btn" onClick={() => setChannelSearch("")}>X</button> <button className="scan-btn" style={{background: '#444'}} onClick={handleSelectAllChannels}>Select All</button> </div> </div> <div className="input-label" style={{marginTop: '10px'}}>Select Channels ({editingTab.channels ? editingTab.channels.length : 0})</div> <div className="channel-list-container"> {filteredChannels.slice(0, 50).map(c => ( <div key={c.Id} className={`channel-item ${editingTab.channels.includes(c.Id) ? 'selected' : ''}`} onClick={() => toggleChannelInTab(c.Id)}> <img src={`${config.JELLYFIN_URL}/Items/${c.Id}/Images/Primary`} loading="lazy" onError={(e) => e.target.style.display='none'} /> <div className="channel-name">{c.Name}</div> </div> ))} </div> <div className="settings-actions"> <button className="back-btn" onClick={() => setSettingsView('tabs')}>Cancel</button> <button className="save-btn" onClick={handleSaveTab}>Save Tab</button> </div> </> ); } return ( <> <div className="settings-title">Settings</div> <div className="toggle-row"> <div className="toggle-label">Enable Requests</div> <button className={`toggle-btn ${config.ENABLE_REQUESTS ? 'on' : ''}`} onClick={() => handleConfigChange('ENABLE_REQUESTS', !config.ENABLE_REQUESTS)}>{config.ENABLE_REQUESTS ? 'ON' : 'OFF'}</button> </div> <div className="toggle-row"> <div className="toggle-label">Enable Live TV</div> <button className={`toggle-btn ${config.ENABLE_LIVETV ? 'on' : ''}`} onClick={() => handleConfigChange('ENABLE_LIVETV', !config.ENABLE_LIVETV)}>{config.ENABLE_LIVETV ? 'ON' : 'OFF'}</button> </div> {config.ENABLE_LIVETV && ( <div className="device-scan-row" style={{marginTop: '10px'}}> <button className="scan-btn" style={{flex: 1, background: '#444', width: '100%'}} onClick={handleManageTabs}>Manage Live TV Tabs</button> </div> )} <hr style={{width: '100%', borderColor: '#333', margin: '15px 0'}} /> <div className="input-group"> <label className="input-label">Appearance</label> <div className="device-scan-row"> <button className="scan-btn" style={{flex: 1, backgroundColor: config.ACCENT_COLOR}} onClick={() => setSettingsView('accent')}>Accent Color</button> <button className="scan-btn" style={{flex: 1, backgroundColor: '#333'}} onClick={() => setSettingsView('bg')}>Background</button> </div> </div> <hr style={{width: '100%', borderColor: '#333', margin: '15px 0'}} /> <div className="input-group"> <label className="input-label">Jellyfin URL</label> <input className="settings-input" value={config.JELLYFIN_URL || ""} onFocus={(e) => handleSettingsFocus('JELLYFIN_URL', e)} onChange={e => handleConfigChange('JELLYFIN_URL', e.target.value)} /> </div> <div className="input-group"> <label className="input-label">Jellyfin API Key</label> <input className="settings-input" value={config.JELLYFIN_API_KEY || ""} onFocus={(e) => handleSettingsFocus('JELLYFIN_API_KEY', e)} onChange={e => handleConfigChange('JELLYFIN_API_KEY', e.target.value)} /> </div> {config.ENABLE_REQUESTS && ( <> <div className="input-group"> <label className="input-label">Jellyseerr URL</label> <input className="settings-input" value={config.JELLYSEER_URL || ""} onFocus={(e) => handleSettingsFocus('JELLYSEER_URL', e)} onChange={e => handleConfigChange('JELLYSEER_URL', e.target.value)} /> </div> <div className="input-group"> <label className="input-label">Jellyseerr API Key</label> <input className="settings-input" value={config.JELLYSEER_API_KEY || ""} onFocus={(e) => handleSettingsFocus('JELLYSEER_API_KEY', e)} onChange={e => handleConfigChange('JELLYSEER_API_KEY', e.target.value)} /> </div> </> )} <div className="input-group" style={{marginTop: '10px'}}> <label className="input-label">Target Device</label> <div className="device-scan-row"> <input className="settings-input" style={{flex: 1}} value={config.ANDROID_TV_ID} onFocus={(e) => handleSettingsFocus('ANDROID_TV_ID', e)} onChange={e => handleConfigChange('ANDROID_TV_ID', e.target.value)} /> <button className="scan-btn" onClick={handleScan}>Scan</button> </div> {scanResults.length > 0 && ( <div className="device-list"> {scanResults.map(d => ( <div key={d.id} className={`device-card ${config.ANDROID_TV_ID === d.id ? 'active' : ''}`} onClick={() => handleDeviceSelect(d.id)}> <div className="device-name">{d.name}</div> <div className="device-app">{d.app}</div> <div className="device-status"> <div className={`status-dot ${d.isControllable ? 'green' : 'red'}`}></div> {d.isControllable ? 'Controllable' : 'Read Only'} </div> </div> ))} </div> )} </div> <div className="settings-actions"> <button className="btn-cancel" style={{borderColor: '#e74c3c', color: '#e74c3c'}} onClick={handleQuit}>Quit App</button> <button className="btn-cancel" style={{borderColor: '#3498db', color: '#3498db'}} onClick={() => {alert("Testing Connection..."); runDiagnostics().then(alert);}}>Run Diagnostics</button> <button className="save-btn" onClick={handleSaveSettings}>Save</button> </div> </> ); };
  const renderStatusIndicator = (item) => { if (!item.UserData) return null; const { Played, PlaybackPositionTicks, UnplayedItemCount } = item.UserData; const duration = item.RunTimeTicks || 0; if (item.Type === 'Series') { if (UnplayedItemCount === 0 || Played) return <div className="indicator-badge status-watched"></div>; return null; } const threeMinsTicks = 3 * 60 * 10000000; const isAlmostDone = duration > 0 && (duration - PlaybackPositionTicks) <= threeMinsTicks; if (Played || (PlaybackPositionTicks > 0 && isAlmostDone)) { return <div className="indicator-badge status-watched"></div>; } if (PlaybackPositionTicks > 0 && !isAlmostDone) { return <div className="indicator-badge status-resume"></div>; } return null; };

  return (
    <div className="app-container" style={getThemeStyles()}>
      {wizardMode && ( <div className={`wizard-container ${showKeyboard ? 'keyboard-open' : ''}`}> <div className="wizard-header"><div className="wizard-logo">KLOUDIT</div><div className="wizard-subtitle">Kiosk Setup</div></div> {renderWizard()} </div> )}
      {!wizardMode && ( <> 
          <nav> 
            <div className="nav-scroll-area" ref={navRef} 
                 onMouseDown={onNavDown} 
                 onMouseLeave={onNavUp} 
                 onMouseUp={onNavUp} 
                 onMouseMove={onNavMove}
                 onTouchStart={onNavDown}
                 onTouchEnd={onNavUp}
                 onTouchMove={onNavMove}
            >
                {(() => {
                    const totalTabs = 2 + (config.ENABLE_LIVETV ? (config.LIVETV_TABS || []).length : 0) + (config.ENABLE_REQUESTS ? 1 : 0);
                    const btnClass = totalTabs <= 4 ? "nav-btn fill" : "nav-btn fixed";

                    return (
                        <>
                            <button className={`${btnClass} ${activeTab==='movies'?'active':''}`} onClick={()=>handleNavClick('movies')}>Movies</button> 
                            <button className={`${btnClass} ${activeTab==='series'?'active':''}`} onClick={()=>handleNavClick('series')}>Series</button> 
                            {config.ENABLE_LIVETV && (config.LIVETV_TABS || []).map(tab => (
                                <button key={tab.id} className={`${btnClass} ${activeTab===`livetv-${tab.id}`?'active':''}`} onClick={()=>handleNavClick(`livetv-${tab.id}`)}>{tab.name}</button> 
                            ))}
                            {config.ENABLE_REQUESTS && <button className={`${btnClass} ${activeTab==='requests'?'active':''}`} onClick={()=>handleNavClick('requests')}>Request</button>} 
                        </>
                    );
                })()}
            </div>
            <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button> 
          </nav> 
          
          <div className="content"> 
            
            {(viewState === 'seasons' || viewState === 'episodes') && parentItem && (
                <div className="back-header">
                    <button className="back-btn-ui" onClick={handleBack}>
                        <span>← Back</span>
                    </button>
                    <div className="breadcrumb-title">
                        {viewState === 'seasons' ? parentItem.Name : parentItem.SeriesName}
                        {viewState === 'episodes' && <span className="breadcrumb-subtitle">Season {parentItem.IndexNumber}</span>}
                    </div>
                </div>
            )}

            <div className={`scroll-container ${viewState === 'livetv' ? 'livetv-mode' : ''}`} ref={scrollRef} onMouseDown={onMouseDown} onMouseLeave={onMouseUp} onMouseUp={onMouseUp} onMouseMove={onMouseMove} onScroll={updateScrollbar}> 
          
              {activeTab !== 'requests' && viewState !== 'livetv' && viewState !== 'episodes' && ( 
                  <div className="grid-mode"> {items.map(i => ( <div key={i.Id || i.id} className="card" onClick={() => handleItemClick(i)}> <div className="poster-wrapper"> <img src={`${config.JELLYFIN_URL}/Items/${i.Id}/Images/Primary`} loading="lazy" onError={(e) => e.target.style.display = 'none'} /> {renderStatusIndicator(i)} </div> <div className="card-title">{i.Name || i.title}</div> </div> ))} </div> 
              )}

              {viewState === 'episodes' && (
                  <div className="list-mode"> {items.map(i => ( 
                      <div key={i.Id} className="episode-card" onClick={() => handleItemClick(i)}> 
                          <div className="episode-thumb-container">
                              <img src={`${config.JELLYFIN_URL}/Items/${i.Id}/Images/Primary`} loading="lazy" /> 
                              {renderStatusIndicator(i)} 
                              <div className="episode-overlay"><div className="play-icon-shape"></div></div>
                          </div>
                          <div className="episode-info"> 
                            <div className="episode-meta">S{parentItem?.IndexNumber} : E{i.IndexNumber} {i.RunTimeTicks && `• ${formatDuration(i.RunTimeTicks)}`}</div>
                            <div className="episode-title">{i.IndexNumber}. {i.Name}</div> 
                            <div className="episode-desc">{i.Overview}</div> 
                          </div> 
                      </div> 
                  ))} </div> 
              )}
              
              {activeTab === 'requests' && ( <div style={{width: '100%'}}> <div className="search-container"> <input className="search-input" value={reqInput} onChange={handlePhysicalInput} placeholder="Search..." onFocus={() => {setActiveSettingInput(null); setShowKeyboard(true);}} /> <button className="search-btn" onClick={performSearch}>Go</button> {(reqInput || searchResults) && <button className="clear-btn" onClick={clearSearch}>X</button>} </div> {searchResults ? renderDiscoverySection(`Results for "${reqInput}"`, searchResults) : ( <> {renderDiscoverySection("Trending Movies", discovery.trendingMovies)} {renderDiscoverySection("Trending Series", discovery.trendingSeries)} {renderDiscoverySection("Popular Movies & TV", discovery.popularMixed)} </> )} </div> )}
              
              {viewState === 'livetv' && (
                  <div style={{width: '100%'}}>
                      <div style={{width: '100%', marginBottom: '20px', display: 'flex', gap: '10px'}}>
                          <input className="search-input" value={liveTvSearch} onChange={(e) => setLiveTvSearch(e.target.value)} placeholder="Search Channels..." onFocus={(e) => handleSettingsFocus('liveTvSearch', e)} />
                          <button className="scan-btn" onClick={() => setLiveTvSearch("")}>X</button>
                      </div>
                      <div className="grid-mode">
                          {items.filter(i => i.Name.toLowerCase().includes(liveTvSearch.toLowerCase())).map(i => (
                              <div key={i.Id} className="card" onClick={() => handleItemClick(i)}>
                                  <div className="poster-wrapper" style={{background: 'white', padding: '10px'}}>
                                      <img src={`${config.JELLYFIN_URL}/Items/${i.Id}/Images/Primary`} style={{objectFit: 'contain'}} loading="lazy" onError={(e) => e.target.style.display = 'none'} />
                                  </div>
                                  <div className="card-title">{i.ChannelNumber ? `${i.ChannelNumber} - ` : ''}{i.Name}</div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {showScrollbar && (
                  <div className="custom-scrollbar-track"
                      onMouseDown={onScrollbarDown}
                      onTouchStart={onScrollbarDown}
                  >
                      <div 
                          className={`custom-scrollbar-thumb ${isScrollDragging ? 'active' : ''}`}
                          style={{ height: `${thumbHeight}px`, top: `${thumbTop}px` }}
                      >
                      </div>
                  </div>
              )}
              
            </div> 
          </div> 
      </> )}
      {showKeyboard && ( <div className="keyboard-wrapper"> <div className="keyboard-header"><button className="close-kb-btn" onClick={() => setShowKeyboard(false)}>Done</button></div> <Keyboard keyboardRef={r => (keyboard.current = r)} onChange={activeSettingInput ? handleSettingsInput : setReqInput} onKeyPress={handleKeyboardPress} layoutName={keyboardLayout} layout={KEYBOARD_LAYOUT} display={KEYBOARD_DISPLAY} theme={"hg-theme-default"} /> </div> )}
      {showSettings && !wizardMode && ( <div className="settings-modal"> <div className={`settings-content ${showKeyboard ? 'keyboard-open' : ''}`} ref={settingsScrollRef}> <button className="close-settings" onClick={() => setShowSettings(false)}>×</button> {renderSettingsContent()} </div> </div> )}
      {playbackLoading && <div className="loading-overlay"><div className="spinner"></div><div className="loading-text">Starting Playback...</div></div>}
      {modalOpen && modalData && ( <div className="modal-overlay"> <div className="modal-content"> <div className="modal-title">Confirm Request</div> <div className="modal-text">Request download for <b>{modalData.title}</b>?</div> <div className="modal-actions"><button className="btn-confirm" onClick={confirmRequest}>Request</button><button className="btn-cancel" onClick={() => setModalOpen(false)}>Cancel</button></div> </div> </div> )}
      {!wizardMode && renderMiniPlayer()}
    </div>
  );
}
