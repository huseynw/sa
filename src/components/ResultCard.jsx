import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { downloadFile } from '../utils/downloader';
import ProgressBar from './ProgressBar';

/* ── helpers ── */
const detectPlatform = (url = '') => {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('pinterest.com') || u.includes('pin.it')) return 'pinterest';
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
  return 'generic';
};

const extractYtId = (url = '') => {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
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

const ALL_QUALITIES = [144, 240, 360, 480, 720, 1080, 1440, 2160];
const QUALITY_LABELS = { 144:'144p', 240:'240p', 360:'360p', 480:'480p', 720:'720p', 1080:'1080p', 1440:'1440p (2K)', 2160:'2160p (4K)' };

/* ────────────────────────────────── */
const ResultCard = ({ result, url }) => {
  const { t } = useTranslation();
  const platform = detectPlatform(url);
  const meta = platformMeta[platform] || platformMeta.generic;
  const isGallery = result?.status === 'picker';

  /* tabs */
  const tabs = buildTabs(platform, isGallery, t);
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || 'video');

  /* quality */
  const [qualities, setQualities] = useState(null);   // null = loading, [] = failed/fallback
  const [selectedQ, setSelectedQ] = useState('max');

  /* mute toggle (TikTok) */
  const [muted, setMuted] = useState(false);

  /* images */
  const [selectedImgs, setSelectedImgs] = useState([]);

  /* download state */
  const [downloading, setDownloading] = useState(false);
  const [progressData, setProgressData] = useState(null);

  /* ── Fetch YouTube qualities ── */
  useEffect(() => {
    if (platform !== 'youtube') return;
    setQualities(null);
    fetch('/.netlify/functions/get-qualities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then(r => r.json())
      .then(d => {
        const list = (d.qualities || ALL_QUALITIES).sort((a, b) => a - b);
        setQualities(list);
        setSelectedQ(String(list[list.length - 1]));
      })
      .catch(() => {
        setQualities(ALL_QUALITIES);
        setSelectedQ('max');
      });
  }, [url, platform]);

  if (!result) return null;

  /* ── Dynamic Filename Generator ── */
  const getBaseName = () => {
    const rawTitle = result?.previewMeta?.title || result?.previewMeta?.description || 'Media';
    const cleanTitle = rawTitle.replace(/[^\w\s-]/g, '').trim().substring(0, 50) || 'Media';
    return `HUSEVN DOWNLOADER - ${cleanTitle}`;
  };

  /* ── Core download handler ── */
  const handleDownload = async ({ audioOnly = false, specificUrl = null, isMuted = false } = {}) => {
    try {
      setDownloading(true);
      setProgressData({ percent: 0, speed: 0 });
      let dlUrl = specificUrl;
      let dlExt = audioOnly ? 'mp3' : 'mp4';

      if (!dlUrl) {
        // We removed yt-dlp completely because Netlify AWS Lambda IPs are blocked by YouTube
        // bot protection ("Sign in to confirm you're not a bot").
        // Cobalt handles YouTube and TikTok perfectly via alwaysProxy.
        const fetchEndpoint = '/.netlify/functions/fetch-info';

        const res = await fetch(fetchEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, isAudioOnly: audioOnly, quality: selectedQ, isMuted }),
        });
        const data = await res.json();

        if (data.error) throw new Error(data.details || data.error);
        if (data.status === 'error') throw new Error(data.text || data.error?.code || 'Naməlum xəta');

        if (['stream', 'redirect', 'tunnel', 'youtube_ready'].includes(data.status)) {
          dlUrl = data.url;
          if (data.ext) dlExt = data.ext;
        } else if (data.status === 'picker') {
          alert('Gallery üçün əvvəlcə şəkilləri seçin.');
          setDownloading(false);
          return;
        }
      }

      if (dlUrl) {
        const safeName = `${getBaseName()}.${dlExt}`;

        if (platform === 'tiktok' && dlUrl.startsWith('http') && !dlUrl.includes('cobalt')) {
          // Raw TikTok CDN links often block XHR via CORS. Opening them directly works!
          const a = document.createElement('a');
          a.href = dlUrl.includes('#') ? dlUrl : `${dlUrl}#${safeName}`;
          a.download = safeName;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setDownloading(false);
        } else {
          try {
            // Cobalt proxy URLs and other public URLs support CORS, so XHR works
            await downloadFile(dlUrl, safeName, (prog) => setProgressData(prog));
          } catch (downloadErr) {
            console.warn('XHR download failed, falling back to direct link:', downloadErr);
            const a = document.createElement('a');
            a.href = dlUrl.includes('#') ? dlUrl : `${dlUrl}#${safeName}`;
            a.download = safeName;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        }
      }
    } catch (err) {
      alert(err.message || t('error_fetching'));
    } finally {
      setDownloading(false);
      setTimeout(() => setProgressData(null), 2000);
    }
  };

  /* ── Image gallery handlers ── */
  const toggleImg = (imgUrl) =>
    setSelectedImgs(prev =>
      prev.includes(imgUrl) ? prev.filter(u => u !== imgUrl) : [...prev, imgUrl]
    );

  const downloadSelectedImgs = async () => {
    setDownloading(true);
    setProgressData({ percent: 0, speed: 0 });
    const baseName = getBaseName();
    for (let i = 0; i < selectedImgs.length; i++) {
      // Simulate progress for multi-image
      setProgressData({ percent: Math.round((i / selectedImgs.length) * 100), speed: 0 });
      let imgUrl = selectedImgs[i];
      const safeName = `${baseName}_${i + 1}.jpg`;
      
      // We don't proxy TikTok images anymore because it causes 403 Forbidden
      // due to missing specific cookies/signatures on the Netlify proxy.
      await downloadFile(imgUrl, safeName, () => {});
    }
    setProgressData({ percent: 100, speed: 0 });
    setTimeout(() => {
      setDownloading(false);
      setProgressData(null);
      setSelectedImgs([]);
    }, 1000);
  };

  /* ── YouTube thumbnail ── */
  const ytId = platform === 'youtube' ? extractYtId(url) : null;
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;

  /* Use scraped metadata if available, fallback to youtube thumb */
  const previewImg = result.previewMeta?.image || thumbUrl || null;
  const previewTitle = result.previewMeta?.title || '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* ── Metadata Preview ── */}
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

      {/* ── Progress Bar ── */}
      {progressData && (
        <div style={{ marginBottom: '16px' }}>
          <ProgressBar progress={progressData.percent} speed={progressData.speed} />
        </div>
      )}

      {/* tabs */}
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

      {/* tab content */}
      <div className="tab-content">
        {/* ═══ YOUTUBE ═══ */}
        {platform === 'youtube' && activeTab === 'mp3' && (
          <YoutubeMP3Tab thumbUrl={thumbUrl} downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
        {platform === 'youtube' && activeTab === 'video' && (
          <YoutubeVideoTab
            thumbUrl={thumbUrl}
            qualities={qualities}
            selectedQ={selectedQ}
            setSelectedQ={setSelectedQ}
            downloading={downloading}
            onDownload={handleDownload}
            btnCls={meta.btnCls}
          />
        )}

        {/* ═══ TIKTOK ═══ */}
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
            toggleImg={toggleImg}
            downloading={downloading}
            onDownloadSelected={downloadSelectedImgs}
            onDownloadAudio={() => handleDownload({ audioOnly: true, specificUrl: result.audio, filename: 'audio.mp3' })}
            pcCls={meta.cls}
            btnCls={meta.btnCls}
            hasAudio={!!result.audio}
          />
        )}

        {/* ═══ INSTAGRAM ═══ */}
        {platform === 'instagram' && activeTab === 'video' && !isGallery && (
          <VideoTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} isReels={true} />
        )}
        {platform === 'instagram' && activeTab === 'images' && isGallery && (
          <GalleryTab
            items={result.picker}
            selectedImgs={selectedImgs}
            toggleImg={toggleImg}
            downloading={downloading}
            onDownloadSelected={downloadSelectedImgs}
            onDownloadAudio={null}
            pcCls={meta.cls}
            btnCls={meta.btnCls}
            hasAudio={false}
          />
        )}

        {/* ═══ PINTEREST & FACEBOOK & INSTAGRAM & GENERIC ═══ */}
        {['pinterest', 'facebook', 'generic'].includes(platform) && activeTab === 'video' && (
          <VideoTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} isReels={false} />
        )}
        {['pinterest', 'facebook', 'generic', 'instagram'].includes(platform) && activeTab === 'image' && (
          <ImageTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
        {['pinterest', 'facebook', 'generic'].includes(platform) && activeTab === 'mp3' && (
          <AudioTab downloading={downloading} onDownload={handleDownload} btnCls={meta.btnCls} />
        )}
      </div>
    </motion.div>
  );
};

/* ───────────────── Build tabs per platform ───────────────── */
function buildTabs(platform, isGallery, t) {
  if (platform === 'youtube') return [
    { id: 'mp3',   label: t('tab_mp3'),   icon: 'fa-solid fa-music' },
    { id: 'video', label: t('tab_video'), icon: 'fa-solid fa-video' },
  ];
  if (platform === 'tiktok') {
    const tabs = [
      { id: 'video', label: t('tab_video'), icon: 'fa-solid fa-video' },
      { id: 'mp3',   label: 'MP3',          icon: 'fa-solid fa-music' },
    ];
    if (isGallery) tabs.push({ id: 'images', label: t('tab_images'), icon: 'fa-solid fa-images' });
    return tabs;
  }
  if (platform === 'instagram') {
    if (isGallery) return [{ id: 'images', label: t('tab_images'), icon: 'fa-solid fa-images' }];
    return [
      { id: 'video', label: t('tab_reels'), icon: 'fa-solid fa-video' },
      { id: 'image', label: t('ig_feat2'),  icon: 'fa-solid fa-image' }
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

/* ───────────────── Sub-components ───────────────── */

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
        onClick={() => onDownload({ audioOnly: true, filename: 'audio.mp3' })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-music" /> {t('btn_mp3')}</>}
      </button>
    </div>
  </div>
);};

const YoutubeVideoTab = ({ thumbUrl, qualities, selectedQ, setSelectedQ, downloading, onDownload, btnCls }) => {
  const { t } = useTranslation();
  return (
  <div>
    {qualities === null ? (
      <div className="quality-loading">
        <span className="spinner" style={{ borderTopColor: 'var(--text2)' }} />
        {t('qualities_loading')}
      </div>
    ) : (
      <div className="quality-row">
        <button className={`quality-pill max yt ${selectedQ === 'max' ? 'selected yt' : ''}`}
          onClick={() => setSelectedQ('max')}>{t('quality_max')}</button>
        {qualities.map(q => (
          <button key={q}
            className={`quality-pill ${selectedQ === String(q) ? 'selected yt' : ''}`}
            onClick={() => setSelectedQ(String(q))}>
            {QUALITY_LABELS[q] || `${q}p`}
          </button>
        ))}
      </div>
    )}
    <div className="divider" />
    <div className="action-row">
      <button className={`btn ${btnCls}`} disabled={downloading || qualities === null}
        onClick={() => onDownload({ audioOnly: false, filename: 'video.mp4' })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-video" /> {t('btn_video')}</>}
      </button>
      <button className="btn btn-ghost" disabled={downloading || qualities === null}
        onClick={() => onDownload({ audioOnly: true, filename: 'audio.mp3' })}>
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
        onClick={() => onDownload({ isMuted: muted, filename: 'tiktok_video.mp4' })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-video" /> {muted ? t('btn_muted') : t('btn_video')}</>}
      </button>
    </div>
  </div>
);};

const AudioTab = ({ downloading, onDownload, btnCls, audioUrl }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <i className="fa-solid fa-circle-info" />
      {t('audio_info')}
    </div>
    <div className="action-row">
      <button className={`btn ${btnCls}`} disabled={downloading}
        onClick={() => onDownload({ audioOnly: true, specificUrl: audioUrl || null, filename: 'audio.mp3' })}>
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
        onClick={() => onDownload({ audioOnly: false, filename: 'video.mp4' })}>
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
        onClick={() => onDownload({ audioOnly: false, filename: 'image.jpg' })}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-image" /> {t('btn_image')}</>}
      </button>
    </div>
  </div>
);};

const GalleryTab = ({ items, selectedImgs, toggleImg, downloading, onDownloadSelected, onDownloadAudio, pcCls, btnCls, hasAudio }) => {
  const { t } = useTranslation();
  return (
  <div>
    <div style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '12px' }}>
      <i className="fa-solid fa-hand-pointer" style={{ marginRight: 6 }} />
      {t('gallery_info', { count: selectedImgs.length })}
    </div>
    <div className="image-grid">
      {items.map((item, idx) => {
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
    <div className="action-row" style={{ marginTop: '4px' }}>
      <button className={`btn ${btnCls}`} disabled={downloading || selectedImgs.length === 0}
        onClick={onDownloadSelected}>
        {downloading ? <span className="spinner" /> : <><i className="fa-solid fa-images" /> {t('btn_selected', { count: selectedImgs.length })}</>}
      </button>
      {hasAudio && onDownloadAudio && (
        <button className="btn btn-ghost" disabled={downloading} onClick={onDownloadAudio}>
          <i className="fa-solid fa-music" /> {t('btn_mp3')}
        </button>
      )}
    </div>
  </div>
);};

export default ResultCard;
