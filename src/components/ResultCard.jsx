import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import ProgressBar from './ProgressBar';
import { downloadFile } from '../utils/downloader';

const ResultCard = ({ result, url }) => {
  const { t } = useTranslation();
  const [selectedQuality, setSelectedQuality] = useState('max');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [speed, setSpeed] = useState('0.00');
  const [selectedImages, setSelectedImages] = useState([]);

  if (!result) return null;

  const handleDownload = async (isAudioOnly = false, specificUrl = null, filename = 'download') => {
    try {
      setDownloading(true);

      let downloadUrl = specificUrl;

      if (!downloadUrl) {
        // We need to fetch the actual direct link from our proxy based on quality selection
        const res = await fetch('/.netlify/functions/fetch-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, isAudioOnly, quality: selectedQuality })
        });
        const data = await res.json();
        
        if (data.status === 'error') {
          if (data.error?.code === 'error.api.youtube.login') {
             throw new Error("YouTube qorunması! Serveriniz (Render) 'Bot' kimi algılandı. Zəhmət olmasa Cobalt serverinizə YouTube Cookie-lərini əlavə edin.");
          }
          throw new Error(data.text || data.error?.code || 'Naməlum xəta');
        }
        
        if (data.status === 'stream' || data.status === 'redirect' || data.status === 'tunnel') {
          downloadUrl = data.url;
        } else if (data.status === 'picker') {
          // It's a gallery, shouldn't happen here if handled, but fallback
          alert("Gallery requires selecting items.");
          setDownloading(false);
          return;
        }
      }

      if (downloadUrl) {
         // Brauzerin öz təbii yükləmə menecerini işə salırıq. Bu ən stabil üsuldur.
         const a = document.createElement('a');
         a.href = downloadUrl;
         a.download = filename;
         a.target = '_blank';
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
      }

      setDownloading(false);

    } catch (error) {
      console.error(error);
      alert(error.message || t('error_fetching'));
      setDownloading(false);
    }
  };

  const toggleImage = (url) => {
    if (selectedImages.includes(url)) {
      setSelectedImages(selectedImages.filter(img => img !== url));
    } else {
      setSelectedImages([...selectedImages, url]);
    }
  };

  const downloadSelectedImages = async () => {
    setDownloading(true);
    for (let i = 0; i < selectedImages.length; i++) {
       await downloadFile(selectedImages[i], `image_${i+1}.jpg`, () => {});
    }
    setDownloading(false);
    setSelectedImages([]);
  };

  // Check if it's a gallery (picker)
  const isGallery = result.status === 'picker';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-panel"
      style={{ padding: '24px', marginTop: '30px', width: '100%', maxWidth: '700px', margin: '30px auto 0 auto' }}
    >
      {!isGallery && result.status !== 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
             <select 
               className="select-premium" 
               value={selectedQuality} 
               onChange={(e) => setSelectedQuality(e.target.value)}
               style={{ flex: 1 }}
               disabled={downloading}
             >
                <option value="max">Highest Quality</option>
                <option value="2160">2160p (4K)</option>
                <option value="1440">1440p (2K)</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="480">480p</option>
                <option value="360">360p</option>
                <option value="144">144p</option>
             </select>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-primary" 
              onClick={() => handleDownload(false, null, 'video.mp4')}
              disabled={downloading}
              style={{ flex: 1 }}
            >
              <i className="fa-solid fa-video"></i> {t('download_video')}
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={() => handleDownload(true, null, 'audio.mp3')}
              disabled={downloading}
              style={{ flex: 1 }}
            >
              <i className="fa-solid fa-music"></i> {t('download_audio')}
            </button>
          </div>
        </div>
      )}

      {isGallery && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h4>Select images to download</h4>
          <div className="image-grid">
            {result.picker.map((item, idx) => (
              <div 
                key={idx} 
                className={`image-grid-item ${selectedImages.includes(item.url) ? 'selected' : ''}`}
                onClick={() => toggleImage(item.url)}
              >
                <img src={item.thumb || item.url} alt={`item ${idx}`} />
                <div className="check-icon"><i className="fa-solid fa-check"></i></div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
            <button 
              className="btn btn-primary" 
              onClick={downloadSelectedImages}
              disabled={downloading || selectedImages.length === 0}
              style={{ flex: 1 }}
            >
              <i className="fa-solid fa-images"></i> {t('download_selected_images')} ({selectedImages.length})
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => handleDownload(true, result.audio, 'audio.mp3')}
              disabled={downloading || !result.audio}
              style={{ flex: 1 }}
            >
              <i className="fa-solid fa-music"></i> {t('download_audio')}
            </button>
          </div>
        </div>
      )}

      {downloading && progress !== null && (
        <ProgressBar progress={progress} speed={speed} />
      )}
    </motion.div>
  );
};

export default ResultCard;
