import React, { useState, useEffect, useRef } from 'react';
import Keyboard from 'react-simple-keyboard';
import QRCode from "react-qr-code";
import 'react-simple-keyboard/build/css/index.css';
import { getItems, getSeasons, getEpisodes, getLiveTvChannels, playOnDevice, getSessionStatus, sendControl, scanDevices, searchLocalLibrary } from './api/jellyfin'; 
import { searchMedia, submitRequest, getDiscovery, getRequests, runDiagnostics } from './api/jellyseer'; 
import { getConfig, saveConfig, initConfig } from './utils/config';
import IdleScreen from './components/IdleScreen'; 
import './styles/index.css';

const KEYBOARD_LAYOUT = {
    'default': [ 'q w e r t y u i o p {bksp}', 'a s d f g h j k l {enter}', '{shift} z x c v b n m , . /', '{numbers} {space} .com' ],
    'shift': [ 'Q W E R T Y U I O P {bksp}', 'A S D F G H J K L {enter}', '{shift} Z X C V B N M , . /', '{numbers} {space} .com' ],
    'numbers': [ '1 2 3 4 5 6 7 8 9 0 {bksp}', '@ # $ % & - _ + = ( ) /', '* " \' : ; ! ? {enter}', '{abc} {space} .com' ]
};
const KEYBOARD_DISPLAY = { '{numbers}': '?123', '{abc}': 'ABC', '{bksp}': '⌫', '{enter}': 'GO', '{space}': ' ', '{shift}': '⇧' };
const ACCENT_COLORS = [ { name: 'Purple', hex: '#8a2be2' }, { name: 'Red', hex: '#e50914' }, { name: 'Blue', hex: '#007aff' }, { name: 'Pink', hex: '#ff69b4' }, { name: 'Orange', hex: '#ff9f43' }, { name: 'Yellow', hex: '#f1c40f' }, { name: 'Green', hex: '#2ecc71' }, { name: 'Teal', hex: '#1abc9c' }, { name: 'Black', hex: '#ffffff' }, { name: 'Maroon', hex: '#c0392b' } ];
const BG_THEMES = [ { id: 'black', name: 'Midnight', bg: '#141414', card: '#1f1f1f' }, { id: 'blue', name: 'Ocean', bg: '#0f172a', card: '#1e293b' }, { id: 'purple', name: 'Galaxy', bg: '#180f26', card: '#2d1b4e' }, { id: 'red', name: 'Crimson', bg: '#260f0f', card: '#4a1c1c' }, { id: 'green', name: 'Forest', bg: '#0f2615', card: '#1c4a25' }, { id: 'slate', name: 'Slate', bg: '#27272a', card: '#3f3f46' }, { id: 'maroon', name: 'Wine', bg: '#2b0505', card: '#4a0a0a' }, { id: 'royal', name: 'Royal', bg: '#05052b', card: '#0a0a4a' }, { id: 'coffee', name: 'Coffee', bg: '#2b1a05', card: '#4a2e0a' }, { id: 'gray', name: 'Concrete', bg: '#333333', card: '#444444' } ];

export default function App() {
  const [config, setConfig] = useState(null); 
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [localIp, setLocalIp] = useState("Loading...");

  useEffect(() => {
      const init = async () => {
          try {
              const ipRes = await fetch('http://127.0.0.1:3000/api/ip');
              const ipData = await ipRes.json();
              setLocalIp(ipData.ip);
          } catch(e) {}
          const cfg = await initConfig(); 
          if(cfg) {
              setConfig({ ...cfg, LIVETV_TABS: Array.isArray(cfg.LIVETV_TABS) ? cfg.LIVETV_TABS : [] });
              if (!cfg.TERMS_ACCEPTED || !cfg.JELLYFIN_URL) setWizardMode(true);
          }
          setLoadingConfig(false);
      };
      init();
  }, []);

  const [wizardMode, setWizardMode] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [activeTab, setActiveTab] = useState('movies');
  const [viewState, setViewState] = useState('grid');
  
  const [items, setItems] = useState([]);
  const [parentItem, setParentItem] = useState(null);
  
  const [discovery, setDiscovery] = useState({ popularMixed: [], trendingMovies: [], trendingSeries: [] });
  const [activeRequests, setActiveRequests] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  
  const [libraryFilter, setLibraryFilter] = useState("");
  const [librarySort, setLibrarySort] = useState("DateCreated");
  const [reqInput, setReqInput] = useState("");
  const [liveTvSearch, setLiveTvSearch] = useState(""); 
  const [channelSearch, setChannelSearch] = useState("");

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState('default');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState('main'); 
  const [editingTab, setEditingTab] = useState(null); 
  const [allChannels, setAllChannels] = useState([]);
  const [scanResults, setScanResults] = useState([]);
  const [activeSettingInput, setActiveSettingInput] = useState(null);

  const [isIdle, setIsIdle] = useState(false);
  const idleTimer = useRef(null);
  const keyboard = useRef();
  
  const scrollRef = useRef(null);
  const trackRef = useRef(null);
  const settingsScrollRef = useRef(null);
  const navRef = useRef(null);

  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [isScrollDragging, setIsScrollDragging] = useState(false);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollDragInfo = useRef({ startY: 0, startScrollTop: 0 });

  const isSeeking = useRef(false);
  const [seekValue, setSeekValue] = useState(0);

  const showNotification = (msg) => {
      setNotification(msg);
      setTimeout(() => setNotification(null), 3000);
  };

  const resetIdleTimer = () => {
      setIsIdle(false);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (config && (!config.ENABLE_SCREENSAVER || playerState?.isPlaying)) return;
      const duration = (config && config.SCREENSAVER_TIMEOUT ? config.SCREENSAVER_TIMEOUT : 2) * 60 * 1000;
      idleTimer.current = setTimeout(() => { if (!playerState?.isPlaying) setIsIdle(true); }, duration); 
  };

  useEffect(() => {
      window.addEventListener('mousemove', resetIdleTimer); window.addEventListener('mousedown', resetIdleTimer); window.addEventListener('touchstart', resetIdleTimer); window.addEventListener('keydown', resetIdleTimer);
      resetIdleTimer();
      return () => { if (idleTimer.current) clearTimeout(idleTimer.current); window.removeEventListener('mousemove', resetIdleTimer); window.removeEventListener('mousedown', resetIdleTimer); window.removeEventListener('touchstart', resetIdleTimer); window.removeEventListener('keydown', resetIdleTimer); };
  }, [playerState, config]);

  // --- SCROLLBAR LOGIC ---
  const updateScrollbar = () => {
      if (!scrollRef.current) return;
      const { clientHeight, scrollHeight, scrollTop } = scrollRef.current;
      
      if (scrollHeight <= clientHeight + 20) {
          setShowScrollbar(false);
          return;
      }
      setShowScrollbar(true);

      const trackHeight = clientHeight - 40; 
      const heightRatio = clientHeight / scrollHeight;
      const tHeight = Math.max(heightRatio * trackHeight, 40); 
      setThumbHeight(tHeight);
      
      const maxScrollTop = scrollHeight - clientHeight;
      const maxThumbTop = trackHeight - tHeight;
      
      if (maxScrollTop > 0) {
          const scrollRatio = scrollTop / maxScrollTop;
          setThumbTop(scrollRatio * maxThumbTop);
      }
  };

  const onScrollbarDown = (e) => { 
      e.stopPropagation(); e.preventDefault(); 
      setIsScrollDragging(true); 
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      scrollDragInfo.current = { startY: clientY, startScrollTop: scrollRef.current.scrollTop };
  };

  const onGlobalMove = (e) => { 
      if (isScrollDragging && scrollRef.current) { 
          e.preventDefault();
          const clientY = e.touches ? e.touches[0].clientY : e.clientY; 
          const dy = clientY - scrollDragInfo.current.startY;
          
          const { scrollHeight, clientHeight } = scrollRef.current;
          const trackHeight = clientHeight - 40; 
          const maxThumbTop = trackHeight - thumbHeight;
          const maxScrollTop = scrollHeight - clientHeight;
          const ratio = maxScrollTop / maxThumbTop;
          
          scrollRef.current.scrollTop = scrollDragInfo.current.startScrollTop + (dy * ratio);
      } 
  };
  
  const onGlobalUp = () => { setIsScrollDragging(false); };
  
  useEffect(() => { 
      window.addEventListener('mousemove', onGlobalMove); window.addEventListener('mouseup', onGlobalUp); window.addEventListener('touchmove', onGlobalMove, {passive: false}); window.addEventListener('touchend', onGlobalUp); 
      return () => { window.removeEventListener('mousemove', onGlobalMove); window.removeEventListener('mouseup', onGlobalUp); window.removeEventListener('touchmove', onGlobalMove); window.removeEventListener('touchend', onGlobalUp); }; 
  }, [isScrollDragging, thumbHeight]);

  useEffect(() => { updateScrollbar(); window.addEventListener('resize', updateScrollbar); return () => window.removeEventListener('resize', updateScrollbar); }, [items, viewState, activeTab, discovery]);

  const getThemeStyles = () => { const t = BG_THEMES.find(x => x.id === config?.BG_THEME) || BG_THEMES[0]; return { '--accent': config?.ACCENT_COLOR || '#8a2be2', '--bg': t.bg, '--card': t.card }; };

  const loadContent = async (tab, filter = "", sort = "DateCreated") => {
      setSearchResults(null); 
      if (!config?.JELLYFIN_URL) return;

      if (tab === 'requests') { 
          setViewState('grid');
          const discData = await getDiscovery();
          setDiscovery(discData || { popularMixed: [], trendingMovies: [], trendingSeries: [] }); 
      } else if (tab.startsWith('livetv-')) {
          setViewState('livetv');
          const tabId = tab.replace('livetv-', '');
          const tabConfig = config.LIVETV_TABS.find(t => String(t.id) === tabId);
          if (tabConfig) {
              let channels = tabConfig.type === 'dynamic' ? await getLiveTvChannels() : (await getLiveTvChannels() || []).filter(c => tabConfig.channels.includes(c.Id));
              setItems(channels || []);
          }
      } else { 
          setViewState('grid');
          const isMovie = tab === 'movies'; 
          const targetType = isMovie ? 'Movie' : 'Series'; 
          let libraryItems = await getItems(targetType, librarySort, libraryFilter); 
          setItems(libraryItems || []); 
      } 
  };

  useEffect(() => {
      if (!loadingConfig && !wizardMode && config?.JELLYFIN_URL) loadContent(activeTab, libraryFilter, librarySort);
      const playerInterval = setInterval(async () => {
          if (wizardMode || !config?.JELLYFIN_URL) return;
          const status = await getSessionStatus();
          setPlayerState(status); 
          if (status && !isSeeking.current) setSeekValue((status.positionTicks / status.durationTicks) * 100 || 0);
      }, 1000);
      return () => clearInterval(playerInterval);
  }, [activeTab, wizardMode, loadingConfig, libraryFilter, librarySort]); 

  // Reset scroll on view change
  useEffect(() => { if (scrollRef.current) { scrollRef.current.scrollTop = 0; setTimeout(updateScrollbar, 100); } }, [viewState, activeTab, parentItem, items]);

  if (loadingConfig || !config) return <div className="loading-overlay" style={{opacity: 1}}><div className="spinner"></div><div className="loading-text">Starting...</div></div>;

  const handleConfigChange = (field, value) => { setConfig(prev => ({ ...prev, [field]: value })); };
  const handleSettingsFocus = (field, e) => { setActiveSettingInput(field); setShowKeyboard(true); let val = ""; if (field === 'tabName' && editingTab) val = editingTab.name; else if (field === 'channelSearch') val = channelSearch; else if (field === 'liveTvSearch') val = liveTvSearch; else if (field === 'libraryFilter') val = libraryFilter; else if (field === 'reqInput') val = reqInput; else val = config[field] || ""; if (keyboard.current) keyboard.current.setInput(val); if (e && e.target) setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); };
  const handleSettingsInput = (val) => { if (activeSettingInput === 'tabName' && editingTab) setEditingTab(prev => ({ ...prev, name: val })); else if (activeSettingInput === 'channelSearch') setChannelSearch(val); else if (activeSettingInput === 'liveTvSearch') setLiveTvSearch(val); else if (activeSettingInput === 'libraryFilter') setLibraryFilter(val); else if (activeSettingInput === 'reqInput') setReqInput(val); else if (activeSettingInput) handleConfigChange(activeSettingInput, val); };
  const handleKeyboardPress = (button) => { if (button === "{numbers}") setKeyboardLayout("numbers"); else if (button === "{abc}") setKeyboardLayout("default"); else if (button === "{shift}") setKeyboardLayout(keyboardLayout === "default" ? "shift" : "default"); };
  const handleDeviceSelect = (deviceId) => { handleConfigChange('ANDROID_TV_ID', deviceId); setScanResults([]); };
  const handleScan = async () => { await saveConfig(config); try { setScanResults(await scanDevices()); } catch(e) { showNotification(e.message); } };
  const handleManageTabs = async () => { setSettingsView('tabs'); try { const channels = await getLiveTvChannels(); setAllChannels(channels || []); } catch(e) { setAllChannels([]); } };
  const handleAddTab = () => { if (config.LIVETV_TABS.length >= 5) return showNotification("Max 5 tabs allowed."); const newTab = { id: Date.now(), name: "New Tab", type: 'static', channels: [] }; setEditingTab(newTab); setChannelSearch(""); setSettingsView('edit-tab'); };
  const handleEditTab = (tab) => { setEditingTab({ ...tab, channels: [...(tab.channels || [])] }); setChannelSearch(""); setSettingsView('edit-tab'); };
  const handleDeleteTab = (id) => { if (!confirm("Delete this tab?")) return; let newTabs = config.LIVETV_TABS.filter(t => String(t.id) !== String(id)); if (newTabs.length === 0) newTabs = [{ id: 'main', name: 'Live TV', type: 'dynamic', channels: [] }]; handleConfigChange('LIVETV_TABS', newTabs); };
  const handleSaveTab = () => { if (!editingTab.name.trim()) return showNotification("Tab Name Required"); let newTabs = [...config.LIVETV_TABS]; const existingIndex = newTabs.findIndex(t => t.id === editingTab.id); if (existingIndex >= 0) newTabs[existingIndex] = editingTab; else newTabs.push(editingTab); handleConfigChange('LIVETV_TABS', newTabs); setSettingsView('tabs'); };
  const toggleChannelInTab = (channelId) => { if (!editingTab) return; const current = editingTab.channels || []; const newChannels = current.includes(channelId) ? current.filter(id => id !== channelId) : [...current, channelId]; setEditingTab({ ...editingTab, channels: newChannels }); };
  const handleSelectAllChannels = () => { if (!editingTab) return; const filteredChannels = channelSearch ? (allChannels || []).filter(c => c.Name.toLowerCase().includes(channelSearch.toLowerCase())) : (allChannels || []); const filteredIds = filteredChannels.map(c => c.Id); const current = new Set(editingTab.channels || []); filteredIds.forEach(id => current.add(id)); setEditingTab({ ...editingTab, channels: Array.from(current) }); };
  const handleSaveSettings = async () => { await saveConfig(config); setShowSettings(false); setShowKeyboard(false); showNotification("Settings Saved!"); loadContent(activeTab); };
  const handleThemeChange = (type, value) => { const newConfig = { ...config, [type]: value }; setConfig(newConfig); saveConfig(newConfig); setSettingsView('main'); };
  const handleNavClick = (tab) => { setActiveTab(tab); setLibraryFilter(""); loadContent(tab); };

  const handleItemClick = async (item) => { 
      if (!item) return;
      if (item.status && item.status !== 'AVAILABLE') return; 
      if (item.mediaType) { setModalData(item); setModalOpen(true); return; } 
      const isContainer = ['Series', 'Season', 'BoxSet', 'Folder', 'Collection'].includes(item.Type); 
      if (isContainer) { 
          if (item.Type === 'Series') { setParentItem(item); const seasons = await getSeasons(item.Id); setItems(seasons || []); setViewState('seasons'); } 
          else if (item.Type === 'Season') { setParentItem({ ...item, SeriesName: item.SeriesName || parentItem?.Name || "Series", SeriesId: item.SeriesId || parentItem?.Id }); const eps = await getEpisodes(item.SeriesId, item.Id); setItems(eps || []); setViewState('episodes'); } 
      } else { 
          setPlaybackLoading(true); try { await playOnDevice(item.Id); setMinimized(false); } catch(e) { showNotification("Error: " + e.message); } finally { setTimeout(() => setPlaybackLoading(false), 4000); } 
      } 
  };

  const handleBack = async () => { 
      if (viewState === 'episodes') { 
          if (parentItem && parentItem.SeriesId) { const seasons = await getSeasons(parentItem.SeriesId); setItems(seasons || []); setViewState('seasons'); setParentItem({ Name: parentItem.SeriesName, Id: parentItem.SeriesId }); } 
          else { loadContent('series'); } 
      } else if (viewState === 'seasons') { loadContent('series'); } 
      else { loadContent(activeTab); } 
      if(scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const handleControl = (cmd) => sendControl(cmd);
  const handleSeekStart = () => { isSeeking.current = true; };
  const handleSeekMove = (e) => { setSeekValue(e.target.value); };
  const handleSeekEnd = (e) => { isSeeking.current = false; const pct = e.target.value; const ticks = (pct / 100) * playerState.durationTicks; sendControl('seek', Math.floor(ticks)); };
  const skip = (seconds) => { const jump = seconds * 10000000; sendControl('seek', playerState.positionTicks + jump); };
  const formatTime = (ticks) => { if (!ticks) return "0:00"; const seconds = Math.floor(ticks / 10000000); const minutes = Math.floor(seconds / 60); const remainingSeconds = seconds % 60; return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`; };
  const formatDuration = (ticks) => { if (!ticks) return ""; const minutes = Math.floor(ticks / 10000000 / 60); return `${minutes}m`; };
  const getEndTime = () => { if(!playerState) return ""; const remainingMs = (playerState.durationTicks - playerState.positionTicks) / 10000; const endDate = new Date(Date.now() + remainingMs); return `Ends at ${endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`; };
  const performSearch = async () => { if(!reqInput.trim()) return; try { setSearchResults(await searchMedia(reqInput)); setShowKeyboard(false); } catch(e) { showNotification(e.message); } };
  const clearSearch = () => { setReqInput(""); setSearchResults(null); if(keyboard.current) keyboard.current.clearInput(); };
  const handlePhysicalInput = (e) => { setReqInput(e.target.value); if(keyboard.current) keyboard.current.setInput(e.target.value); };
  const initiateRequest = (item) => { if(item.mediaType) { setModalData(item); setModalOpen(true); } };
  const confirmRequest = async () => { if(!modalData) return; setModalOpen(false); try { await submitRequest(modalData.id, modalData.mediaType); showNotification("Requested!"); clearSearch(); loadContent(activeTab); } catch(e) { showNotification(e.message); } };
  const handleQuit = () => { if(confirm("Quit?")) window.close(); };

  const renderMiniPlayer = () => { if (!playerState) return null; return ( <div className={`mini-player ${minimized ? 'minimized' : ''}`} onClick={() => minimized && setMinimized(false)}> <div className="mini-header-text">Now Playing: {playerState.title}</div> <div className="player-top-bar"><button className="minimize-btn" onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}>▼</button></div> <div className="player-body"> {playerState.image && <img src={playerState.image} className="mini-art" />} <div className="mini-info"> <div className="mini-meta-row">{playerState.seriesName && <span className="series-info">{playerState.seriesName} • S{playerState.season} E{playerState.episode}</span>}<span className="meta-badge quality">{playerState.quality}</span></div> <div className="mini-title">{playerState.title}</div> <div className="mini-seek-row"> <span className="time-label">{formatTime(playerState.positionTicks)}</span> <input type="range" className="mini-slider" min="0" max="100" value={seekValue} onMouseDown={handleSeekStart} onTouchStart={handleSeekStart} onChange={handleSeekMove} onMouseUp={handleSeekEnd} onTouchEnd={handleSeekEnd} /> <span className="time-label">{formatTime(playerState.durationTicks)}</span> </div> <div className="ends-at">{getEndTime()}</div> </div> <div className="mini-controls"> <button className="mini-btn" onClick={() => handleControl('prev')}>⏮</button><button className="mini-btn" onClick={() => skip(-10)}>↺</button><button className="mini-btn play" onClick={() => handleControl('playpause')}>{playerState.isPlaying ? '⏸' : '▶'}</button><button className="mini-btn" onClick={() => skip(10)}>↻</button><button className="mini-btn" onClick={() => handleControl('next')}>⏭</button> <button className="mini-btn stop" onClick={() => handleControl('stop')}>■</button> </div> </div> </div> ); };
  const renderWizard = () => { if (wizardStep === 1) { return ( <div className="wizard-step"> <h2>End User License Agreement</h2> <div style={{height: '300px', overflowY: 'auto', background: '#1a1a1a', padding: '25px', borderRadius: '12px', marginBottom: '25px', border: '1px solid #333', fontSize: '0.9rem', lineHeight: '1.6', color: '#ccc'}}> <h3 style={{color: 'white', marginTop: 0}}>1. SOFTWARE LICENSE</h3> <p>This hardware product includes software ("Media Dashboard") provided by [Your Company Name]. By using this product, you agree to be bound by the terms of this agreement.</p> <h3 style={{color: 'white'}}>2. THIRD PARTY NOTICES</h3> <p>This software includes code from <b>Jellyseerr</b>, which is licensed under the MIT License:</p> <blockquote style={{background: '#222', padding: '10px', borderLeft: '3px solid #666', fontStyle: 'italic'}}> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction... </blockquote> <p>Full license text available at: https://github.com/Fallenbagel/jellyseerr/blob/main/LICENSE</p> <h3 style={{color: 'white'}}>3. DISCLAIMER</h3> <p>THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. WE ARE NOT AFFILIATED WITH JELLYFIN, PLEX, OR ANY MEDIA PROVIDERS.</p> </div> <div className="wizard-actions"> <button className="wizard-btn wizard-back" onClick={() => window.close()}>Decline & Exit</button> <button className="wizard-btn wizard-next" onClick={() => { handleConfigChange('TERMS_ACCEPTED', true); setWizardStep(2); }}>I Accept</button> </div> </div> ); } if (wizardStep === 2) { return ( <div className="wizard-step" style={{textAlign: 'center', alignItems: 'center'}}> <h2>Configure Your Device</h2> <p style={{marginBottom: '30px', color: '#aaa'}}>Scan to setup via your phone, or enter details manually below.</p> <div style={{background: 'white', padding: '15px', borderRadius: '16px', display: 'inline-block', marginBottom: '30px', boxShadow: '0 10px 40px rgba(255,255,255,0.1)'}}> <QRCode value={`http://${localIp}:3000`} size={180} /> </div> <div style={{fontSize: '1.2rem', fontFamily: 'monospace', color: 'var(--accent)', marginBottom: '30px', background: '#222', padding: '10px 20px', borderRadius: '8px'}}> http://{localIp}:3000 </div> <div style={{width: '100%', textAlign: 'left'}}> <div className="input-group"> <label className="input-label">Jellyfin URL</label> <input className="settings-input" value={config.JELLYFIN_URL} onFocus={(e) => handleSettingsFocus('JELLYFIN_URL', e)} onChange={e => handleConfigChange('JELLYFIN_URL', e.target.value)} placeholder="http://192.168.1.50:8096" /> </div> <div className="input-group"> <label className="input-label">Jellyfin API Key</label> <input className="settings-input" value={config.JELLYFIN_API_KEY} onFocus={(e) => handleSettingsFocus('JELLYFIN_API_KEY', e)} onChange={e => handleConfigChange('JELLYFIN_API_KEY', e.target.value)} /> </div> </div> <div className="wizard-actions" style={{width: '100%'}}> <button className="wizard-btn wizard-back" onClick={() => setWizardStep(1)}>Back</button> <button className="wizard-btn wizard-next" onClick={() => setWizardStep(3)}>Next Step</button> </div> </div> ); } if (wizardStep === 3) { return ( <div className="wizard-step"> <h2>Select Target TV</h2> <div className="device-scan-row"> <input className="settings-input" style={{flex: 1}} value={config.ANDROID_TV_ID} onFocus={(e) => handleSettingsFocus('ANDROID_TV_ID', e)} onChange={e => handleConfigChange('ANDROID_TV_ID', e.target.value)} /> <button className="scan-btn" onClick={handleScan}>Scan</button> </div> {scanResults.length > 0 && ( <div className="device-list"> {scanResults.map(d => ( <div key={d.id} className={`device-card ${config.ANDROID_TV_ID === d.id ? 'active' : ''}`} onClick={() => handleDeviceSelect(d.id)}> <div className="device-name">{d.name}</div><div className="device-app">{d.app}</div> <div className="device-status"><div className={`status-dot ${d.isControllable ? 'green' : 'red'}`}></div>{d.isControllable ? 'Controllable' : 'Read Only'}</div> </div> ))} </div> )} <div className="wizard-actions"> <button className="wizard-btn wizard-back" onClick={() => setWizardStep(2)}>Back</button> <button className="wizard-btn wizard-next" style={{background: '#2ecc71', color: 'black'}} onClick={() => { handleSaveSettings(); setWizardMode(false); loadContent('movies'); }}>Finish Setup</button> </div> </div> ); } };
  const renderSettingsContent = () => { 
    if (settingsView === 'accent') { return ( <> <div className="settings-title">Select Accent</div> <div className="color-grid settings-scroll-area"> {ACCENT_COLORS.map(c => ( <div key={c.hex} className={`color-swatch ${config.ACCENT_COLOR === c.hex ? 'selected' : ''}`} style={{backgroundColor: c.hex}} onClick={() => handleThemeChange('ACCENT_COLOR', c.hex)} /> ))} </div> <div className="settings-actions"><button className="back-btn" onClick={() => setSettingsView('main')}>Back</button></div> </> ); } 
    if (settingsView === 'bg') { return ( <> <div className="settings-title">Select Background</div> <div className="color-grid settings-scroll-area"> {BG_THEMES.map(t => ( <div key={t.id} className={`theme-preview ${config.BG_THEME === t.id ? 'selected' : ''}`} style={{backgroundColor: t.bg}} onClick={() => handleThemeChange('BG_THEME', t.id)}> <div className="theme-preview-card" style={{backgroundColor: t.card}}></div> </div> ))} </div> <div className="settings-actions"><button className="back-btn" onClick={() => setSettingsView('main')}>Back</button></div> </> ); } 
    if (settingsView === 'tabs') { return ( <> <div className="settings-title">Live TV Tabs</div> <div className="tab-list settings-scroll-area"> {(config.LIVETV_TABS || []).map(tab => ( <div key={tab.id} className="tab-item"> <span style={{fontSize: '1.2rem', fontWeight: 'bold'}}>{tab.name} {tab.type === 'dynamic' && '(All)'}</span> <div className="tab-actions"> <button className="mini-action-btn" onClick={() => handleEditTab(tab)}>Edit</button> <button className="mini-action-btn delete" onClick={() => handleDeleteTab(tab.id)}>Del</button> </div> </div> ))} {(config.LIVETV_TABS || []).length < 5 && <button className="scan-btn" onClick={handleAddTab}>+ New Tab</button>} </div> <div className="settings-actions"><button className="back-btn" onClick={() => setSettingsView('main')}>Back</button></div> </> ); } 
    
    if (settingsView === 'edit-tab' && editingTab) { 
        const filteredChannels = (allChannels || []).filter(c => c.Name.toLowerCase().includes(channelSearch.toLowerCase())); 
        return ( 
            <> 
                <div className="settings-title">Edit Tab</div> 
                <div className="settings-scroll-area"> 
                    <div className="input-group"> 
                        <label className="input-label">Tab Name</label> 
                        <input className="settings-input" value={editingTab.name || ""} onFocus={(e) => handleSettingsFocus('tabName', e)} onChange={e => setEditingTab({...editingTab, name: e.target.value})} placeholder="e.g. Sports" /> 
                    </div> 
                    <div className="input-group" style={{marginTop: '10px'}}> 
                        <label className="input-label">Search Channels</label> 
                        <div className="search-container" style={{marginBottom: 0}}> 
                            <input className="settings-input" value={channelSearch} onFocus={(e) => handleSettingsFocus('channelSearch', e)} onChange={e => setChannelSearch(e.target.value)} placeholder="Filter..." /> 
                            {channelSearch && <button className="clear-btn" onClick={() => setChannelSearch("")}>X</button>}
                            <button className="scan-btn" style={{background: '#444', marginLeft: 'auto'}} onClick={handleSelectAllChannels}>Select All</button> 
                        </div> 
                    </div> 
                    <div className="input-label" style={{marginTop: '20px'}}>Select Channels ({editingTab.channels ? editingTab.channels.length : 0})</div> 
                    <div className="channel-list-container"> 
                        {filteredChannels.slice(0, 50).map(c => ( 
                            <div key={c.Id} className={`channel-item ${editingTab.channels.includes(c.Id) ? 'selected' : ''}`} onClick={() => toggleChannelInTab(c.Id)}> 
                                <img src={`${config.JELLYFIN_URL}/Items/${c.Id}/Images/Primary`} loading="lazy" onError={(e) => e.target.style.display='none'} /> 
                                <div className="channel-name">{c.Name}</div> 
                            </div> 
                        ))} 
                    </div> 
                </div> 
                <div className="settings-actions"> 
                    <button className="back-btn" onClick={() => setSettingsView('tabs')}>Cancel</button> 
                    <button className="save-btn" onClick={handleSaveTab}>Save Tab</button> 
                </div> 
            </> 
        ); 
    } 
    return ( <> 
        <div className="settings-title">Settings</div> 
        <div className="settings-scroll-area"> 
            <div className="toggle-row"> <div className="toggle-label">Enable Requests</div> <button className={`toggle-btn ${config.ENABLE_REQUESTS ? 'on' : ''}`} onClick={() => handleConfigChange('ENABLE_REQUESTS', !config.ENABLE_REQUESTS)}>{config.ENABLE_REQUESTS ? 'ON' : 'OFF'}</button> </div> 
            <div className="toggle-row"> <div className="toggle-label">Enable Live TV</div> <button className={`toggle-btn ${config.ENABLE_LIVETV ? 'on' : ''}`} onClick={() => handleConfigChange('ENABLE_LIVETV', !config.ENABLE_LIVETV)}>{config.ENABLE_LIVETV ? 'ON' : 'OFF'}</button> </div> 
            {config.ENABLE_LIVETV && ( <div className="device-scan-row" style={{marginTop: '10px', marginBottom: '15px'}}> <button className="scan-btn" style={{flex: 1, background: '#444', width: '100%'}} onClick={handleManageTabs}>Manage Live TV Tabs</button> </div> )} 
            <hr style={{width: '100%', borderColor: '#333', margin: '15px 0'}} /> 
            <div className="input-group"> <label className="input-label">Appearance</label> <div className="dual-button-row"> <button className="scan-btn" style={{flex: 1, backgroundColor: config.ACCENT_COLOR}} onClick={() => setSettingsView('accent')}>Accent Color</button> <button className="scan-btn" style={{flex: 1, backgroundColor: '#333'}} onClick={() => setSettingsView('bg')}>Background</button> </div> </div> 
            <hr style={{width: '100%', borderColor: '#333', margin: '15px 0'}} /> 
            <div className="input-group"> <label className="input-label">Jellyfin URL</label> <input className="settings-input" value={config.JELLYFIN_URL || ""} onFocus={(e) => handleSettingsFocus('JELLYFIN_URL', e)} onChange={e => handleConfigChange('JELLYFIN_URL', e.target.value)} /> </div> 
            <div className="input-group"> <label className="input-label">Jellyfin API Key</label> <input className="settings-input" value={config.JELLYFIN_API_KEY || ""} onFocus={(e) => handleSettingsFocus('JELLYFIN_API_KEY', e)} onChange={e => handleConfigChange('JELLYFIN_API_KEY', e.target.value)} /> </div> 
            {config.ENABLE_REQUESTS && ( <> <div className="input-group"> <label className="input-label">Jellyseerr URL</label> <input className="settings-input" value={config.JELLYSEER_URL || ""} onFocus={(e) => handleSettingsFocus('JELLYSEER_URL', e)} onChange={e => handleConfigChange('JELLYSEER_URL', e.target.value)} /> </div> <div className="input-group"> <label className="input-label">Jellyseerr API Key</label> <input className="settings-input" value={config.JELLYSEER_API_KEY || ""} onFocus={(e) => handleSettingsFocus('JELLYSEER_API_KEY', e)} onChange={e => handleConfigChange('JELLYSEER_API_KEY', e.target.value)} /> </div> </> )} <div className="input-group" style={{marginTop: '10px'}}> <label className="input-label">Target Device</label> <div className="device-scan-row"> <input className="settings-input" style={{flex: 1}} value={config.ANDROID_TV_ID} onFocus={(e) => handleSettingsFocus('ANDROID_TV_ID', e)} onChange={e => handleConfigChange('ANDROID_TV_ID', e.target.value)} /> <button className="scan-btn" onClick={handleScan}>Scan</button> </div> {scanResults.length > 0 && ( <div className="device-list"> {scanResults.map(d => ( <div key={d.id} className={`device-card ${config.ANDROID_TV_ID === d.id ? 'active' : ''}`} onClick={() => handleDeviceSelect(d.id)}> <div className="device-name">{d.name}</div><div className="device-app">{d.app}</div> <div className="device-status"><div className={`status-dot ${d.isControllable ? 'green' : 'red'}`}></div>{d.isControllable ? 'Controllable' : 'Read Only'}</div> </div> ))} </div> )} </div> 
            <div className="input-group" style={{marginTop: '10px'}}> <label className="input-label">Screensaver</label> <div className="toggle-row"> <div className="toggle-label">Enable Screensaver</div> <button className={`toggle-btn ${config.ENABLE_SCREENSAVER ? 'on' : ''}`} onClick={() => handleConfigChange('ENABLE_SCREENSAVER', !config.ENABLE_SCREENSAVER)}>{config.ENABLE_SCREENSAVER ? 'ON' : 'OFF'}</button> </div> <div className="device-scan-row" style={{marginTop:'10px'}}> <input className="settings-input" type="number" value={config.SCREENSAVER_TIMEOUT || 2} onFocus={(e) => handleSettingsFocus('SCREENSAVER_TIMEOUT', e)} onChange={e => handleConfigChange('SCREENSAVER_TIMEOUT', parseInt(e.target.value))} placeholder="Minutes" /> </div> </div> 
        </div> 
        <div className="settings-actions"> <button className="btn-cancel" onClick={handleQuit}>Quit</button> <button className="btn-cancel" style={{borderColor: '#3498db', color: '#3498db'}} onClick={() => {alert("Testing Connection..."); runDiagnostics().then(alert);}}>Diagnostics</button> <button className="save-btn" onClick={handleSaveSettings}>Save & Reload</button> </div> 
    </> ); };

  // SAFETY: Ensure data is an array before mapping
  const renderDiscoverySection = (title, data) => { 
      if (!data || !Array.isArray(data)) return null;
      return ( 
          <div className="discovery-section"> 
              <h2 className="section-title">{title}</h2> 
              {data.length > 0 ? ( 
                  <div className="grid-mode"> 
                      {data.map(t => ( 
                          <div key={t.id} className="card" onClick={() => initiateRequest({ ...t, mediaType: t.mediaType || 'movie' })}> 
                              <div className="poster-wrapper"> 
                                  <img src={t.isJellyfin ? `${getConfig().JELLYFIN_URL}${t.posterPath}` : t.posterPath} loading="lazy" onError={(e) => e.target.style.display = 'none'} /> 
                                  {t.status && t.status !== 'AVAILABLE' && ( <> <div className="status-label">{t.status}</div> <div className={`status-bar ${t.statusClass}`}></div> </> )} 
                              </div> 
                              <div className="card-title">{t.title || t.name}</div> 
                          </div> 
                      ))} 
                  </div> 
              ) : ( 
                  <div style={{color: '#777', padding: '20px', fontStyle: 'italic'}}>No Items Found</div> 
              )} 
          </div> 
      ); 
  };

  const renderStatusIndicator = (item) => {
    if (item.status === 'PENDING') return <div className="status-badge pending">Pending</div>;
    if (item.status === 'AVAILABLE') return <div className="status-badge available">Available</div>;
    if (item.UserData?.Played) return <div className="status-badge played">✔</div>;
    return null;
  };

  return (
    <div className="app-container" style={getThemeStyles()}>
      {/* IDLE SCREEN COMPONENT */}
      <IdleScreen isActive={isIdle} config={config} />

      {/* CUSTOM TOAST NOTIFICATION */}
      {notification && <div className="notification-toast">{notification}</div>}

      {wizardMode && ( <div className={`wizard-container ${showKeyboard ? 'keyboard-open' : ''}`}> <div className="wizard-header"><div className="wizard-logo">SETUP</div><div className="wizard-subtitle">First Run Configuration</div></div> {renderWizard()} </div> )}
      {!wizardMode && ( <> 
          <nav> 
            <div className="nav-scroll-area" ref={navRef}>
                {(() => {
                    const totalTabs = 2 + (config.ENABLE_LIVETV ? (config.LIVETV_TABS || []).length : 0) + (config.ENABLE_REQUESTS ? 1 : 0);
                    let sizeClass = "size-5"; 
                    if (totalTabs <= 3) sizeClass = "size-3"; 
                    else if (totalTabs === 4) sizeClass = "size-4"; 

                    return (
                        <>
                            <button className={`nav-btn ${sizeClass} ${activeTab==='movies'?'active':''}`} onClick={()=>handleNavClick('movies')}>Movies</button> 
                            <button className={`nav-btn ${sizeClass} ${activeTab==='series'?'active':''}`} onClick={()=>handleNavClick('series')}>Series</button> 
                            {config.ENABLE_LIVETV && (config.LIVETV_TABS || []).map(tab => (
                                <button key={tab.id} className={`nav-btn ${sizeClass} ${activeTab===`livetv-${tab.id}`?'active':''}`} onClick={()=>handleNavClick(`livetv-${tab.id}`)}>{tab.name}</button> 
                            ))}
                            {config.ENABLE_REQUESTS && <button className={`nav-btn ${sizeClass} ${activeTab==='requests'?'active':''}`} onClick={()=>handleNavClick('requests')}>Request</button>} 
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

            <div className={`scroll-container ${viewState === 'livetv' ? 'livetv-mode' : ''}`} ref={scrollRef} onScroll={updateScrollbar}> 
          
                  {(activeTab === 'movies' || activeTab === 'series') && viewState === 'grid' && (
                      <div className="search-container">
                          <input 
                              className="search-input" 
                              value={libraryFilter} 
                              onChange={(e) => { setLibraryFilter(e.target.value); if(keyboard.current) keyboard.current.setInput(e.target.value); }} 
                              placeholder={`Search ${activeTab === 'movies' ? 'Movies' : 'Series'}...`}
                              onFocus={(e) => handleSettingsFocus('libraryFilter', e)}
                          />
                          {(libraryFilter) && <button className="clear-btn" onClick={() => {setLibraryFilter(""); }}>X</button>}
                          
                          <select className="sleek-select" value={librarySort} onChange={(e) => setLibrarySort(e.target.value)}>
                              <option value="DateCreated">Recently Added</option>
                              <option value="Name">Name (A-Z)</option>
                              <option value="PremiereDate">Release Date</option>
                          </select>
                      </div>
                  )}

                  {activeTab !== 'requests' && viewState !== 'livetv' && viewState !== 'episodes' && ( 
                      <div className="grid-mode"> {items.map(i => ( <div key={i.Id || i.id} className="card" onClick={() => handleItemClick(i)}> <div className="poster-wrapper"> <img src={`${config?.JELLYFIN_URL || ''}/Items/${i.Id}/Images/Primary`} loading="lazy" onError={(e) => e.target.style.display = 'none'} /> {renderStatusIndicator(i)} </div> <div className="card-title">{i.Name || i.title}</div> </div> ))} </div> 
                  )}

                  {viewState === 'episodes' && (
                      <div className="list-mode"> {items.map(i => ( 
                          <div key={i.Id} className="episode-card" onClick={() => handleItemClick(i)}> 
                              <div className="episode-thumb-container">
                                  <img src={`${config?.JELLYFIN_URL || ''}/Items/${i.Id}/Images/Primary`} loading="lazy" /> 
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
                  
                  {activeTab === 'requests' && ( 
                      <div style={{width: '100%'}}> 
                          <div className="search-container"> 
                              <input className="search-input" value={reqInput} onChange={handlePhysicalInput} placeholder="Search new movies/shows..." onFocus={(e) => {setActiveSettingInput(null); setShowKeyboard(true);}} /> 
                              <button className="search-btn" onClick={performSearch}>Go</button> 
                              {(reqInput || searchResults) && <button className="clear-btn" onClick={clearSearch}>X</button>} 
                          </div> 
                          
                          {searchResults ? renderDiscoverySection(`Results for "${reqInput}"`, searchResults) : ( 
                              <> 
                                  {renderDiscoverySection("Popular & Trending", discovery.popularMixed)} 
                                  {renderDiscoverySection("Trending Movies", discovery.trendingMovies)} 
                                  {renderDiscoverySection("Trending Series", discovery.trendingSeries)} 
                              </> 
                          )} 
                      </div> 
                  )}
                  
                  {viewState === 'livetv' && (
                      <div style={{width: '100%'}}>
                          <div className="search-container">
                              <input className="search-input" value={liveTvSearch} onChange={(e) => setLiveTvSearch(e.target.value)} placeholder="Search Channels..." onFocus={(e) => handleSettingsFocus('liveTvSearch', e)} />
                              <button className="scan-btn" onClick={() => setLiveTvSearch("")}>X</button>
                          </div>
                          <div className="grid-mode">
                              {items.filter(i => i.Name.toLowerCase().includes(liveTvSearch.toLowerCase())).map(i => (
                                  <div key={i.Id} className="card" onClick={() => handleItemClick(i)}>
                                      <div className="poster-wrapper" style={{background: 'white', padding: '10px'}}>
                                          <img src={`${config?.JELLYFIN_URL || ''}/Items/${i.Id}/Images/Primary`} style={{objectFit: 'contain'}} loading="lazy" onError={(e) => e.target.style.display = 'none'} />
                                      </div>
                                      <div className="card-title">{i.ChannelNumber ? `${i.ChannelNumber} - ` : ''}{i.Name}</div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}

                  {showScrollbar && (
                      <div className="custom-scrollbar-track"
                          ref={trackRef}
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
