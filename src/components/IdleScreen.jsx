import React, { useState, useEffect } from 'react';
import { getItems } from '../api/jellyfin'; // Import API to fetch real media

export default function IdleScreen({ isActive, config }) {
    const [images, setImages] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAppActive, setIsAppActive] = useState(false);
    const [imageOpacity, setImageOpacity] = useState(0);

    // 1. LOAD IMAGES (Local Uploads -> Fallback to Jellyfin Library)
    useEffect(() => {
        if (!isActive) {
            setIsAppActive(false);
            setImageOpacity(0);
            return;
        }

        const loadContent = async () => {
            let finalUrls = [];

            // A. TRY LOCAL PHOTOS FIRST
            try {
                const res = await fetch('http://127.0.0.1:3000/api/photos');
                const filenames = await res.json();
                if (filenames && filenames.length > 0) {
                    finalUrls = filenames.map(f => `http://127.0.0.1:3000/photos/${f}`);
                }
            } catch (e) {
                // Ignore local server errors
            }

            // B. FALLBACK: JELLYFIN LIBRARY (If no local photos)
            if (finalUrls.length === 0 && config?.JELLYFIN_URL) {
                try {
                    // Fetch Movies and Series from your actual library
                    const [movies, series] = await Promise.all([
                        getItems('Movie'),
                        getItems('Series')
                    ]);
                    
                    const allItems = [...(movies || []), ...(series || [])];

                    // Convert to Image URLs
                    const posterUrls = allItems
                        .filter(i => i.Id) // Ensure ID exists
                        .map(i => `${config.JELLYFIN_URL}/Items/${i.Id}/Images/Primary`);

                    finalUrls = posterUrls;
                } catch (err) {
                    console.error("Screensaver: Failed to load Jellyfin items", err);
                }
            }

            // C. SHUFFLE & SET
            if (finalUrls.length > 0) {
                // Fisher-Yates Shuffle for better randomness
                for (let i = finalUrls.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [finalUrls[i], finalUrls[j]] = [finalUrls[j], finalUrls[i]];
                }
                
                // Limit to 50 items to save memory
                setImages(finalUrls.slice(0, 50));
                
                setIsAppActive(true);
                // Start Fade In
                setTimeout(() => setImageOpacity(1), 100);
            }
        };

        loadContent();
    }, [isActive, config]); // Re-run if active state or config changes

    // 2. CYCLE LOGIC (Fade -> Swap -> Fade)
    useEffect(() => {
        if (!isAppActive || images.length === 0) return;
        
        const interval = setInterval(() => {
            setImageOpacity(0); // Fade out

            setTimeout(() => {
                setCurrentIndex(prev => (prev + 1) % images.length);
                setTimeout(() => {
                    setImageOpacity(1); // Fade in
                }, 100); 
            }, 1000); // Wait 1s for fade out

        }, 8000); // 8 Seconds per image

        return () => clearInterval(interval);
    }, [isAppActive, images]);

    if (!isAppActive || images.length === 0) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'black', 
            zIndex: 99999, 
            opacity: 1, 
            pointerEvents: 'auto', // Catch clicks to wake up
            cursor: 'none'
        }}>
            {/* Blurred Background */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: `url(${images[currentIndex]})`,
                backgroundSize: 'cover', backgroundPosition: 'center',
                filter: 'blur(30px) brightness(0.3)',
                transition: 'background-image 0s, opacity 1s ease-in-out',
                opacity: imageOpacity
            }} />

            {/* Sharp Foreground Image */}
            <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', justifyContent: 'center', alignItems: 'center'
            }}>
                <img 
                    src={images[currentIndex]} 
                    style={{
                        maxHeight: '85vh', maxWidth: '85vw', 
                        boxShadow: '0 30px 80px rgba(0,0,0,0.8)',
                        borderRadius: '16px',
                        transition: 'opacity 1s ease-in-out',
                        opacity: imageOpacity,
                        animation: 'float 20s infinite ease-in-out'
                    }} 
                />
            </div>
            
            <div style={{
                position: 'absolute', bottom: 30, right: 30, 
                color: 'rgba(255,255,255,0.3)', fontSize: '1rem', fontWeight: 'bold',
                textTransform: 'uppercase', letterSpacing: '2px',
                transition: 'opacity 1s ease-in-out',
                opacity: imageOpacity
            }}>
                Touch to Wake
            </div>
            
            <style>{`@keyframes float { 0% { transform: scale(1); } 50% { transform: scale(1.03); } 100% { transform: scale(1); } }`}</style>
        </div>
    );
}
