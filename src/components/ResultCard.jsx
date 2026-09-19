import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { downloadFile } from '../utils/downloader';
import ProgressBar from './ProgressBar';

const detectPlatform = (url = '', forcedPlatform) => {
  if (forcedPlatform && forcedPlatform !== 'generic') return forcedPlatform;
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be') || u.includes('music.youtube')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('pinterest.com') || u.includes('pin.it')) return 'pinterest';
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
  return 'generic';
};

const extractYtId = (url = '') => {
  const m = url.match(/(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|v\/|live\/))([a-zA-Z0-9_-]{11})/i);
  return m ? m[1] : null;
};

const platformMeta = {
  youtube:   { label: 'YouTube',   icon: 'fa-brands fa-youtube',   cls: 'yt', btnCls: 'btn-yt' },
  tiktok:    { label: 'TikTok',    icon: 'fa-brands fa-tiktok',    cls: 'tt', btnCls: 'btn-tt' },
  instagram: { label: 'Instagram', icon: 'fa-brands fa-instagram', cls: 'ig', btnCls: 'btn-ig' },
  pinterest: { label: 'Pinterest', icon: 'fa-brands fa-pinterest', cls: 'pi', btnCls: 'btn-pi' },
  facebook:  { label: 'Facebook',  icon: 'fa-brands fa-facebook',  cls: 'fb', btnCls: 'btn-fb' },
  generic:   { label: 'Media',     icon: 'fa-solid fa-photo-film', cls: '',   btnCls: 'btn-primary' },
};

const ResultCard = ({ result, url, platform: forcedPlatform }) => {
  const { t } = useTranslation();
  const platform = detectPlatform(url, forcedPlatform);
  const meta = platformMeta[platform] || platformMeta.generic;
  const isGallery = result?.status === 'picker';

  const tabs = buildTabs(platform, isGallery, t, result);
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'video');

  React.useEffect(() => {
    if (tabs.length > 0 && !tabs.find(tb => tb.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
    if (result?.picker && Array.isArray(result.picker)) {
      setSelectedImgs(result.picker.map(item => item.url));
    } else {
      setSelectedImgs([]);
    }
  }, [result, platform]);

  const [muted, setMuted] = useState(false);

  const [selectedImgs, setSelectedImgs] = useState([]);

  const [downloading, setDownloading] = useState(false);
  const [progressData, setProgressData] = useState(null);

  if (!result) return null;

  const getBaseName = () => {
    const rawTitle = result?.previewMeta?.title || result?.previewMeta?.description || result?.title || 'Media';
    const cleanTitle = rawTitle.replace(/[^\w\s-]/g, '').trim().substring(0, 60) || 'Media';
    return `HUSEVN DOWNLOADER - ${cleanTitle}`;
  };

  const handleDownload = async ({ audioOnly = false, specificUrl = null, isMuted = false, imageMode = false } = {}) => {
    try {
      setDownloading(true);
      setProgressData({ percent: 0, speed: 0 });

      try {
        fetch('/api/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'download', platform: platform || 'youtube' }),
        }).catch(() => {});
      } catch {}

      let dlUrl = specificUrl;
      let dlExt = audioOnly ? 'mp3' : (imageMode ? 'jpg' : 'mp4');

      if (!dlUrl) {
        if (platform === 'youtube') {
          setProgressData({ percent: 10, speed: 'Yüklənir...' });

          const action = audioOnly ? 'yt-mp3' : 'yt-mp4';
          const data = await fetch('/.netlify/functions/media-fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, url }),
          }).then(r => r.json());

          if (!data.status?.success) {
            throw new Error(data.data?.error || data.error || t('error_fetching'));
          }

          dlUrl = data.data.downloadUrl || data.data.proxyUrl;
          dlExt = audioOnly ? 'mp3' : 'mp4';

          if (data.data?.title) {
            if (!result.previewMeta) result.previewMeta = {};
            if (!result.previewMeta.title || result.previewMeta.title === 'YouTube Video') {
              result.previewMeta.title = data.data.title;
            }
          }

          if (!dlUrl) throw new Error('Download URL tapılmadı');

        } else if (platform === 'tiktok') {
          setProgressData({ percent: 10, speed: 'Yüklənir...' });

          const action = audioOnly ? 'tiktok-audio' : 'tiktok';
          const MAX_DL = 5;
          let data;
          for (let i = 1; i <= MAX_DL; i++) {
            console.log(`[TikTok DL] attempt ${i}/${MAX_DL}`);
            try {
              const res = await fetch('/.netlify/functions/media-fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, url }),
              });
              data = await res.json();
              console.log(`[TikTok DL] attempt ${i} success:`, data?.status?.success);
              if (data.status?.success) break;
            } catch (e) {
              console.error(`[TikTok DL] attempt ${i} failed:`, e.message);
            }
            if (i < MAX_DL) await new Promise(r => setTimeout(r, 1500));
          }

          if (!data?.status?.success) {
            console.error('[TikTok DL] All attempts failed:', data);
            throw new Error(data?.data?.error || data?.error || t('error_fetching'));
          }

          const d = data.data;
          if (audioOnly) {
            dlUrl = d.music || d.audioUrl || d.download || d.url;
            dlExt = 'mp3';
          } else {
            dlUrl = d.videoUrl || d.videoUrlNoWatermark || d.download || d.url || d.hdplay || d.play;
            dlExt = 'mp4';
          }

          if (!dlUrl) throw new Error('Download URL tapılmadı');

        } else if (platform === 'instagram') {
          setProgressData({ percent: 10, speed: 'Yüklənir...' });

          if (result?.downloadUrl) {
            dlUrl = result.downloadUrl;
            dlExt = result.mediaType === 'image' || imageMode ? 'jpg' : 'mp4';
          } else if (result?.media?.[0]?.url) {
            dlUrl = result.media[0].proxyUrl || result.media[0].url;
            dlExt = result.media[0].type === 'image' || imageMode ? 'jpg' : 'mp4';
          } else {
            const cleanUrl = url.trim();
            const res = await fetch('/.netlify/functions/media-fetch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'instagram', url: cleanUrl }),
            });
            const data = await res.json();
            if (!data?.status?.success) {
              throw new Error(data?.data?.error || data?.error || t('error_fetching'));
            }
            const d = data.data;
            if (d.images?.length > 1) {
              alert('Gallery üçün əvvəlcə şəkilləri seçin.');
              setDownloading(false);
              return;
            }
            const primary = d.media?.[0];
            dlUrl = primary?.proxyUrl || primary?.url || d.download || d.url || d.video || d.images?.[0];
            dlExt = (primary?.type === 'image' || d.images?.length > 0 || imageMode) ? 'jpg' : 'mp4';
          }

          if (!dlUrl) throw new Error('Download URL tapılmadı');

        } else if (platform === 'facebook') {
          setProgressData({ percent: 10, speed: 'Yüklənir...' });

          const data = await fetch('/.netlify/functions/media-fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'facebook', url }),
          }).then(r => r.json());

          if (!data.status?.success) {
            throw new Error(data.data?.error || data.error || t('error_fetching'));
          }

          const d = data.data;
          dlUrl = d.hdUrl || d.sdUrl || d.download || d.url;
          dlExt = 'mp4';

          if (!dlUrl) throw new Error('Download URL tapılmadı');

        } else if (platform === 'pinterest') {
          setProgressData({ percent: 10, speed: 'Yüklənir...' });

          if (result?.downloadUrl) {
            dlUrl = result.downloadUrl;
            dlExt = result.mediaType === 'video' ? 'mp4' : 'jpg';
          } else {
            const res = await fetch('/.netlify/functions/media-fetch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'pinterest', url }),
            });
            const d = await res.json();
            if (d.data?.video_url) {
              dlUrl = d.data.video_url;
              dlExt = 'mp4';
            } else if (d.data?.image || d.data?.images?.[0]) {
              dlUrl = d.data.image || d.data.images[0];
              dlExt = 'jpg';
            } else {
              throw new Error('Pinterest faylı tapılmadı');
            }
          }
        }
      }

      if (dlUrl) {
        setProgressData({ percent: 50, speed: 'Yüklənir...' });

        if (imageMode || dlExt === 'jpg') {
          try {
            const urlPath = new URL(dlUrl).pathname.toLowerCase();
            if (urlPath.endsWith('.png')) dlExt = 'jpg'; // PNG da JPG-ə çevrilir (downloader.js)
            else if (urlPath.endsWith('.webp')) dlExt = 'jpg'; // WebP iPhone-da açılmır, JPG-ə çevrilir
            else if (urlPath.endsWith('.jpeg') || urlPath.endsWith('.jpg')) dlExt = 'jpg';
            else if (urlPath.endsWith('.gif')) dlExt = 'gif';
          } catch {}
        }

        const baseTitle = getBaseName();
        const safeName = `${baseTitle}.${dlExt}`;

        let finalDlUrl = dlUrl;
        if (finalDlUrl.includes('googlevideo.com') && !finalDlUrl.includes('&title=')) {
          const cleanTitleOnly = baseTitle.replace(/[^\w\s-]/g, '').trim().substring(0, 50) || 'video';
          finalDlUrl = `${finalDlUrl}&title=${encodeURIComponent(cleanTitleOnly)}`;
        }

        try {
          await downloadFile(finalDlUrl, safeName, (prog) => setProgressData(prog));
        } catch (downloadErr) {
          console.warn('XHR download failed, using direct attachment link:', downloadErr);
          setProgressData({ percent: 100, speed: 'Yüklənir...' });
          const a = document.createElement('a');
          a.href = finalDlUrl;
          a.download = safeName;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
          }, 2000);
        }
      }
    } catch (err) {
      alert(err.message || t('error_fetching'));
    } finally {
      setDownloading(false);
      setTimeout(() => setProgressData(null), 2000);
    }
  };

  const toggleImg = (imgUrl) =>
    setSelectedImgs(prev =>
      prev.includes(imgUrl) ? prev.filter(u => u !== imgUrl) : [...prev, imgUrl]
    );

  const downloadSelectedImgs = async () => {
    try {
      setDownloading(true);
      setProgressData({ percent: 0, speed: 0 });
      const baseName = getBaseName();
      for (let i = 0; i < selectedImgs.length; i++) {
        setProgressData({ percent: Math.round((i / selectedImgs.length) * 100), speed: 0 });
        const imgUrl = selectedImgs[i];
        if (!imgUrl) continue;

        const ext = 'jpg';
        const safeName = `${baseName}_${i + 1}.${ext}`;

        try {
          await downloadFile(imgUrl, safeName, () => {});
        } catch (err) {
          console.warn('XHR failed, using direct download:', err);
          const a = document.createElement('a');
          a.href = imgUrl;
          a.download = safeName;
          a.target = '_blank';
          a.rel = 'noreferrer';
          a.referrerPolicy = 'no-referrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }
      setProgressData({ percent: 100, speed: 0 });
    } catch (e) {
      console.error('Gallery download error:', e);
      alert('Şəkil yüklənərkən xəta baş verdi: ' + e.message);
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setProgressData(null);
        setSelectedImgs([]);
      }, 1000);
    }
  };

  const ytId = platform === 'youtube' ? extractYtId(url) : null;
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;

  const previewImg = result.previewMeta?.image || thumbUrl || null;
  const previewTitle = result.previewMeta?.title || '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {previewTitle && (
        <div className="preview-card">
          {previewImg && (
            <div className="preview-img">
              <img src={previewImg} alt="preview" onError={e => e.target.style.display = 'none'} />
              <div className="preview-overlay">
                <i className={meta.icon} style={{ fontSize: '1.5rem', color: '#fff', opacity: 0.9 }} />
              </div>
            </div>
          )}
          <div className="preview-info">
            <h3 className="preview-title">{previewTitle}</h3>
            {result.previewMeta?.description && (
              <p className="preview-desc">{result.previewMeta.description.substring(0, 80)}...</p>
            )}
          </div>
        </div>
      )}

      {progressData && (
        <div style={{ marginBottom: '16px' }}>
          <ProgressBar progress={progressData.percent} speed={progressData.speed} />
        </div>
      )}

      <div className="tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active ' + meta.cls : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={tab.icon} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {platform === 'youtube' && activeTab === 'mp3' && (
          <YoutubeMP3Tab thumbUrl={thumbUrl} downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
        {platform === 'youtube' && activeTab === 'video' && (
          <YoutubeVideoTab thumbUrl={thumbUrl} downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
        {platform === 'youtube' && activeTab === 'thumbnail' && (
          <YoutubeThumbnailTab videoId={extractYtId(url)} title={result?.previewMeta?.title || 'thumbnail'} btnCls={meta.btnCls} />
        )}

        {platform === 'tiktok' && activeTab === 'video' && (
          <TikTokVideoTab muted={muted} setMuted={setMuted} downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
        {platform === 'tiktok' && activeTab === 'mp3' && (
          <AudioTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
        {platform === 'tiktok' && activeTab === 'images' && isGallery && (
          <GalleryTab
            items={result.picker}
            selectedImgs={selectedImgs}
            setSelectedImgs={setSelectedImgs}
            toggleImg={toggleImg}
            downloading={downloading}
            onDownloadSelected={downloadSelectedImgs}
            onDownloadAudio={() => handleDownload({ audioOnly: true })}
            pcCls={meta.cls}
            btnCls={meta.btnCls}
            hasAudio={!!result.musicUrl}
          />
        )}

        {platform === 'instagram' && activeTab === 'video' && !isGallery && (
          <VideoTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} isReels={true} />
        )}
        {platform === 'instagram' && activeTab === 'image' && !isGallery && (
          <ImageTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
        {platform === 'instagram' && activeTab === 'images' && isGallery && (
          <GalleryTab
            items={result.picker}
            selectedImgs={selectedImgs}
            setSelectedImgs={setSelectedImgs}
            toggleImg={toggleImg}
            downloading={downloading}
            onDownloadSelected={downloadSelectedImgs}
            onDownloadAudio={null}
            pcCls={meta.cls}
            btnCls={meta.btnCls}
            hasAudio={false}
          />
        )}

        {['pinterest', 'facebook'].includes(platform) && activeTab === 'video' && (
          <VideoTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} isReels={false} />
        )}
        {['pinterest', 'facebook'].includes(platform) && activeTab === 'image' && (
          <ImageTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
        {['pinterest', 'facebook'].includes(platform) && activeTab === 'mp3' && (
          <AudioTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
      </div>
    </motion.div>
  );
};

function buildTabs(platform, isGallery, t, result) {
  if (platform === 'youtube') return [
    { id: 'mp3',       label: t('tab_mp3'),       icon: 'fa-solid fa-music' },
    { id: 'video',     label: t('tab_video'),     icon: 'fa-solid fa-video' },
    { id: 'thumbnail', label: 'Thumbnail', icon: 'fa-solid fa-image' },
  ];
  if (platform === 'tiktok') {
    if (isGallery) {
      return [
        { id: 'images', label: t('tab_images') || 'Şəkillər', icon: 'fa-solid fa-images' },
        { id: 'mp3',   label: 'MP3',          icon: 'fa-solid fa-music' },
        { id: 'video', label: t('tab_video'), icon: 'fa-solid fa-video' },
      ];
    }
    return [
      { id: 'video', label: t('tab_video'), icon: 'fa-solid fa-video' },
      { id: 'mp3',   label: 'MP3',          icon: 'fa-solid fa-music' },
    ];
  }
  if (platform === 'instagram') {
    if (isGallery) return [{ id: 'images', label: t('tab_images'), icon: 'fa-solid fa-images' }];
    if (result?.mediaType === 'image' || result?.previewMeta?.isImage) {
      return [{ id: 'image', label: t('btn_image') || 'Şəkil', icon: 'fa-solid fa-image' }];
    }
    return [
      { id: 'video', label: t('tab_reels'), icon: 'fa-solid fa-video' },
    ];
  }
  if (platform === 'pinterest') return [
    { id: 'video', label: t('tab_video'), icon: 'fa-solid fa-video' },
    { id: 'image', label: t('pi_feat2'),  icon: 'fa-solid fa-image' },
  ];
  if (platform === 'facebook') return [
    { id: 'video', label: t('tab_video'), icon: 'fa-solid fa-video' },
    { id: 'image', label: t('fb_feat2'),  icon: 'fa-solid fa-image' },
  ];
  return [
    { id: 'video', label: t('tab_video'), icon: 'fa-solid fa-video' },
    { id: 'mp3',   label: 'MP3',          icon: 'fa-solid fa-music' },
  ];
}

const YoutubeMP3Tab = ({ thumbUrl, downloading, onDownload, btnCls }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <i className="fa-solid fa-circle-info" />
      {t('yt_mp3_info')}
    </div>
    <div className="action-row">
      <button className={`btn ${btnCls}`} disabled={downloading}
        onClick={() => onDownload({ audioOnly: true })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-music" /> {t('btn_mp3')}</>}
      </button>
    </div>
  </div>
);};

const YoutubeVideoTab = ({ thumbUrl, downloading, onDownload, btnCls }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <i className="fa-solid fa-circle-info" />
      {t('yt_video_info')}
    </div>
    <div className="action-row">
      <button className={`btn ${btnCls}`} disabled={downloading}
        onClick={() => onDownload({ audioOnly: false })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-video" /> {t('btn_video')}</>}
      </button>
      <button className="btn btn-ghost" disabled={downloading}
        onClick={() => onDownload({ audioOnly: true })}>
        <i className="fa-solid fa-music" /> {t('btn_audio_only')}
      </button>
    </div>
  </div>
);};

const TikTokVideoTab = ({ muted, setMuted, downloading, onDownload, btnCls }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div className="toggle-row">
      <span className="toggle-label">
        <i className={`fa-solid ${muted ? 'fa-volume-xmark' : 'fa-volume-high'}`} />
        {muted ? t('tt_muted_label') : t('tt_sound_label')}
      </span>
      <div className={`toggle ${muted ? 'on' : ''}`} onClick={() => setMuted(m => !m)} />
    </div>
    <div className="action-row">
      <button className={`btn ${btnCls}`} disabled={downloading}
        onClick={() => onDownload({ isMuted: muted, audioOnly: false })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-video" /> {muted ? t('btn_muted') : t('btn_video')}</>}
      </button>
    </div>
  </div>
);};

const AudioTab = ({ downloading, onDownload, btnCls }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <i className="fa-solid fa-circle-info" />
      {t('audio_info')}
    </div>
    <div className="action-row">
      <button className={`btn ${btnCls}`} disabled={downloading}
        onClick={() => onDownload({ audioOnly: true })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-music" /> {t('btn_mp3')}</>}
      </button>
    </div>
  </div>
);};

const VideoTab = ({ downloading, onDownload, btnCls, isReels }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div className="action-row">
      <button className={`btn ${btnCls}`} disabled={downloading}
        onClick={() => onDownload({ audioOnly: false })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-video" /> {isReels ? t('btn_reels') : t('btn_video')}</>}
      </button>
    </div>
  </div>
);};

const ImageTab = ({ downloading, onDownload, btnCls }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div className="action-row">
      <button className={`btn ${btnCls}`} disabled={downloading}
        onClick={() => onDownload({ audioOnly: false, imageMode: true })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-image" /> {t('btn_image')}</>}
      </button>
    </div>
  </div>
);};

const GalleryTab = ({ items, selectedImgs, setSelectedImgs, toggleImg, downloading, onDownloadSelected, onDownloadAudio, pcCls, btnCls, hasAudio }) => {
  const { t } = useTranslation();
  const allSelected = items && items.length > 0 && selectedImgs.length === items.length;

  return (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text2)' }}>
        <i className="fa-solid fa-hand-pointer" style={{ marginRight: 6 }} />
        {t('gallery_info', { count: selectedImgs.length })}
      </div>
      {items && items.length > 1 && setSelectedImgs && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '8px' }}
          onClick={() => {
            if (allSelected) {
              setSelectedImgs([]);
            } else {
              setSelectedImgs(items.map(i => i.url));
            }
          }}
        >
          <i className={allSelected ? "fa-regular fa-square" : "fa-regular fa-square-check"} style={{ marginRight: 5 }} />
          {allSelected ? 'Seçimi təmizlə' : 'Hamısını seç'}
        </button>
      )}
    </div>
    <div className="image-grid">
      {items && items.map((item, idx) => {
        const imgUrl = item.url;
        const thumbSrc = item.thumb || item.url;
        const sel = selectedImgs.includes(imgUrl);
        return (
          <div key={idx} className={`img-item ${sel ? 'selected ' + pcCls : ''}`}
            onClick={() => toggleImg(imgUrl)}>
            <img src={thumbSrc} alt={`item ${idx + 1}`} loading="lazy" />
            <div className="check-badge"><i className="fa-solid fa-check" /></div>
          </div>
        );
      })}
    </div>
    <div className="action-row" style={{ marginTop: '12px' }}>
      <button className={`btn ${btnCls}`} disabled={downloading || selectedImgs.length === 0}
        onClick={onDownloadSelected}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-download" /> {t('btn_selected', { count: selectedImgs.length })}</>}
      </button>
      {hasAudio && onDownloadAudio && (
        <button className="btn btn-ghost" disabled={downloading} onClick={onDownloadAudio}>
          <i className="fa-solid fa-music" /> {t('btn_mp3')}
        </button>
      )}
    </div>
  </div>
);};

const YoutubeThumbnailTab = ({ videoId, title, btnCls }) => {
  const QUALITIES = [
    { id: 'maxresdefault', label: 'Max HD', desc: '1280×720' },
    { id: 'sddefault',     label: 'SD',     desc: '640×480' },
    { id: 'hqdefault',     label: 'HQ',     desc: '480×360' },
    { id: 'mqdefault',     label: 'MQ',     desc: '320×180' },
  ];

  const [selectedQ, setSelectedQ] = React.useState('maxresdefault');
  const [downloading, setDownloading] = React.useState(false);

  const getThumbUrl = (qId) => `https://i.ytimg.com/vi/${videoId}/${qId}.jpg`;

  const handleDownload = async () => {
    if (!videoId) return;
    setDownloading(true);
    try {
      const thumbUrl = getThumbUrl(selectedQ);
      const safeTitle = (title || 'thumbnail').replace(/[^\w\s-]/g, '').trim().substring(0, 60);
      const filename = `HUSEVN DOWNLOADER - ${safeTitle} [${selectedQ}].jpg`;
      const proxyUrl = `/.netlify/functions/proxy-youtube?url=${encodeURIComponent(thumbUrl)}&filename=${encodeURIComponent(filename)}&audio=false`;

      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch (e) {
      alert('Thumbnail yüklənmədi: ' + e.message);
    } finally {
      setDownloading(false);
    }
  };

  if (!videoId) return <div style={{color:'var(--text2)'}}>Video ID tapılmadı.</div>;

  return (
    <div>
      <div className="quality-row" style={{ marginBottom: '14px' }}>
        {QUALITIES.map(q => (
          <button key={q.id}
            className={`quality-pill ${selectedQ === q.id ? 'selected yt' : ''}`}
            onClick={() => setSelectedQ(q.id)}>
            {q.label} <span style={{ fontSize: '0.75em', opacity: 0.7 }}>{q.desc}</span>
          </button>
        ))}
      </div>

      <div style={{ borderRadius: '10px', overflow: 'hidden', marginBottom: '14px', background: 'var(--card2)' }}>
        <img
          key={selectedQ}
          src={getThumbUrl(selectedQ)}
          alt="thumbnail preview"
          style={{ width: '100%', display: 'block', maxHeight: '220px', objectFit: 'cover' }}
          onError={e => { e.target.style.display = 'none'; }}
        />
      </div>

      <div className="action-row">
        <button className={`btn ${btnCls}`} disabled={downloading} onClick={handleDownload}>
          {downloading
            ? <span className="spinner" />
            : <><i className="fa-solid fa-image" /> Thumbnail Yüklə</>}
        </button>
      </div>
    </div>
  );
};

export default ResultCard;
