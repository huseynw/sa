import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import ResultCard from './components/ResultCard';
import StatsPanel from './components/StatsPanel';
import FeedbackForm from './components/FeedbackForm';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

/* ── Stats API helper ── */
const trackStat = (action, platform) => {
  fetch('/api/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, platform }),
    keepalive: true,
  }).catch(() => {});
};

/* ── Rolling Odometer Title ── */
const ROLLING_WORDS = [
  'DOWNLOADER',
  'YÜKLƏYİCİ',
  'İNDİRİCİ',
  'ЗАГРУЗЧИК',
];

function OdometerTitle() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(i => (i + 1) % ROLLING_WORDS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <h1 className="hero-title">
      <span className="hero-title-brand">HUSEVN</span>
      <span className="hero-title-roller">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={ROLLING_WORDS[index]}
            className="hero-roller-word"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {ROLLING_WORDS[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </h1>
  );
}

/* ── Instagram URL Sanitizer ── */
export function cleanInstagramUrl(rawUrl) {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  const match = trimmed.match(/https?:\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv|stories\/[a-zA-Z0-9._]+)\/([A-Za-z0-9_-]+)/i);
  if (match) {
    return match[0] + '/';
  }
  return trimmed.split('?')[0];
}

/* ── Platform URL Validation ── */
const URL_PATTERNS = {
  youtube: /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/|clip\/|playlist\?list=)|youtu\.be\/|youtube\.com\/channel\/|youtube\.com\/@|youtube\.com\/c\/)/i,
  tiktok: /(?:tiktok\.com\/|vm\.tiktok\.com\/|tiktok\.com\/@[\w.-]+\/video\/)/i,
  instagram: /(?:instagram\.com\/(?:p|reel|reels|stories|tv|explore\/tags)\/|instagr\.am\/)/i,
  pinterest: /(?:pinterest\.com\/|pin\.it\/|pinterest\.[a-z]+\.au|pinterest\.[a-z]+\.co\.[a-z]+)/i,
  facebook: /(?:facebook\.com\/|fb\.watch\/|fb\.com\/|m\.facebook\.com\/|web\.facebook\.com\/|facebook\.com\/watch)/i,
};

function isValidUrlForPlatform(url, platform) {
  if (!url || !url.trim()) return false;
  const trimmed = url.trim();
  if (platform === 'instagram') {
    return URL_PATTERNS.instagram.test(trimmed) || /instagram\.com|instagr\.am/i.test(trimmed);
  }
  return URL_PATTERNS[platform]?.test(trimmed) || false;
}

const PLATFORMS = (t) => [
  {
    id: 'youtube', cls: 'yt', label: 'YouTube',
    icon: 'fa-brands fa-youtube',
    color: '#ff0000', glow: 'rgba(255,0,0,0.25)',
    placeholder: t('yt_placeholder'),
    desc: t('yt_desc'),
    features: [t('yt_feat1'), t('yt_feat2'), t('yt_feat3')],
    isSearchable: true,
  },
  {
    id: 'tiktok', cls: 'tt', label: 'TikTok',
    icon: 'fa-brands fa-tiktok',
    color: '#69c9d0', glow: 'rgba(105,201,208,0.25)',
    placeholder: t('tt_placeholder'),
    desc: t('tt_desc'),
    features: [t('tt_feat1'), t('tt_feat2'), t('tt_feat3')],
  },
  {
    id: 'instagram', cls: 'ig', label: 'Instagram',
    icon: 'fa-brands fa-instagram',
    color: '#dd2a7b', glow: 'rgba(221,42,123,0.25)',
    placeholder: t('ig_placeholder'),
    desc: t('ig_desc'),
    features: [t('ig_feat1'), t('ig_feat2'), t('ig_feat3')],
  },
  {
    id: 'pinterest', cls: 'pi', label: 'Pinterest',
    icon: 'fa-brands fa-pinterest',
    color: '#e60023', glow: 'rgba(230,0,35,0.25)',
    placeholder: t('pi_placeholder'),
    desc: t('pi_desc'),
    features: [t('pi_feat1'), t('pi_feat2')],
  },
  {
    id: 'facebook', cls: 'fb', label: 'Facebook',
    icon: 'fa-brands fa-facebook',
    color: '#1877f2', glow: 'rgba(24,119,242,0.25)',
    placeholder: t('fb_placeholder'),
    desc: t('fb_desc'),
    features: [t('fb_feat1'), t('fb_feat2')],
  },
];

const PIB_CLS = { youtube: 'pib-yt', tiktok: 'pib-tt', instagram: 'pib-ig', pinterest: 'pib-pi', facebook: 'pib-fb' };

function App() {
  const { t } = useTranslation();
  const platforms = PLATFORMS(t);

  const visitTracked = useRef(false);
  useEffect(() => {
    if (!visitTracked.current) {
      visitTracked.current = true;
      trackStat('visit');
    }
  }, []);

  const [activePlatform, setActivePlatform] = useState(platforms[0]);
  const [hoveredTab, setHoveredTab] = useState(null);
  const [urls,     setUrls]     = useState({});
  const [results,  setResults]  = useState({});
  const [loadings, setLoadings] = useState({});
  const [urlErrors, setUrlErrors] = useState({});

  /* ── YouTube search state ── */
  const [ytMode, setYtMode] = useState('link'); // 'link' | 'search'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);

  const pid = activePlatform.id;
  const url     = urls[pid]     || '';
  const result  = results[pid]  || null;
  const loading = loadings[pid] || false;
  const urlError = urlErrors[pid] || '';

  const setUrl    = (v) => setUrls(p     => ({ ...p, [pid]: v }));
  const setResult = (v) => setResults(p  => ({ ...p, [pid]: v }));
  const setLoad   = (v) => setLoadings(p => ({ ...p, [pid]: v }));
  const setUrlError = (v) => setUrlErrors(p => ({ ...p, [pid]: v }));

  const selectPlatform = (p) => {
    setActivePlatform(p);
    document.documentElement.style.setProperty('--platform-color', p.color);
    document.documentElement.style.setProperty('--platform-glow',  p.glow);
    setSearchQuery('');
    setSearchResults([]);
    setSearchSearched(false);
    setUrlErrors(prev => ({ ...prev, [p.id]: '' }));
  };

  /* ── Real-time URL validation on type ── */
  const handleUrlChange = (v) => {
    setUrl(v);
    if (v.trim() && !isValidUrlForPlatform(v, pid)) {
      setUrlError(t('error_invalid_url_platform', { platform: activePlatform.label }));
    } else {
      setUrlError('');
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const cleaned = pid === 'instagram' ? cleanInstagramUrl(text) : text;
      setUrl(cleaned);
      if (pid === 'youtube') setYtMode('link');
      if (cleaned.trim() && !isValidUrlForPlatform(cleaned, pid)) {
        setUrlError(t('error_invalid_url_platform', { platform: activePlatform.label }));
      } else {
        setUrlError('');
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  /* ── YouTube search handler ── */
  const handleYouTubeSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    trackStat('download', 'youtube');

    try {
      setSearchLoading(true);
      setSearchResults([]);
      setSearchSearched(true);

      const res = await fetch('/.netlify/functions/megan-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'yt-search', query: searchQuery.trim() }),
      });
      const data = await res.json();

      if (data.status?.success && data.data?.results) {
        setSearchResults(data.data.results.slice(0, 8));
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  /* ── Select a YouTube search result ── */
  const handleSelectSearchResult = (item) => {
    const fullUrl = item.url || `https://youtube.com/watch?v=${item.videoId}`;
    setUrl(fullUrl);
    setYtMode('link');
    setSearchResults([]);
    setSearchQuery('');
    setSearchSearched(false);

    trackStat('download', 'youtube');

    setLoad(true);
    setResult(null);

    fetch('/.netlify/functions/megan-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'yt-info', url: fullUrl }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.status?.success && data.data) {
          setResult({
            status: 'youtube_ready',
            url: fullUrl,
            previewMeta: {
              title: data.data.title || item.title,
              image: data.data.thumbnail || item.thumbnail,
              description: data.data.author || '',
            },
          });
        } else {
          setResult({
            status: 'youtube_ready',
            url: fullUrl,
            previewMeta: { title: item.title, image: item.thumbnail, description: item.author || '' },
          });
        }
      })
      .catch(() => {
        setResult({
          status: 'youtube_ready',
          url: fullUrl,
          previewMeta: { title: item.title, image: item.thumbnail, description: item.author || '' },
        });
      })
      .finally(() => setLoad(false));
  };

  /* ── Main search handler (link mode) ── */
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    /* ── URL validation ── */
    if (!isValidUrlForPlatform(url, pid)) {
      setUrlError(t('error_invalid_url_platform', { platform: activePlatform.label }));
      return;
    }
    setUrlError('');

    trackStat('download', pid);

    try {
      setLoad(true);
      setResult(null);

      if (pid === 'youtube') {
        /* YouTube link — Megan API ilə məlumat al */
        const data = await fetch('/.netlify/functions/megan-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'yt-info', url: url.trim() }),
        }).then(r => r.json());

        if (data.status?.success && data.data) {
          setResult({
            status: 'youtube_ready',
            url: url.trim(),
            previewMeta: {
              title: data.data.title,
              image: data.data.thumbnail,
              description: data.data.author || '',
            },
          });
        } else {
          setResult({
            status: 'youtube_ready',
            url: url.trim(),
            previewMeta: { title: 'YouTube Video', image: null, description: '' },
          });
        }

      } else if (pid === 'tiktok') {
        let data;
        const tiktokUrl = url.trim();
        const MAX_ATTEMPTS = 5;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          console.log(`[TikTok] Attempt ${attempt}/${MAX_ATTEMPTS}`);
          try {
            const res = await fetch('/.netlify/functions/megan-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'tiktok', url: tiktokUrl }),
            });
            data = await res.json();
            console.log(`[TikTok] Attempt ${attempt} success:`, data?.status?.success);
            if (data.status?.success && data.data) break;
          } catch (e) {
            console.error(`[TikTok] Attempt ${attempt} failed:`, e.message);
          }
          if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 1500));
        }

        if (data?.status?.success && data.data) {
          const d = data.data;

          const imagesList = Array.isArray(d.images) && d.images.length > 0 ? d.images
            : Array.isArray(d.photos) && d.photos.length > 0 ? d.photos
            : Array.isArray(d.slides) && d.slides.length > 0 ? d.slides
            : Array.isArray(d.album) && d.album.length > 0 ? d.album
            : [];

          const isGallery = imagesList.length > 0;
          let pickerItems = [];
          if (isGallery) {
            pickerItems = imagesList.map((img, idx) => {
              const imgUrl = typeof img === 'string' ? img : (img.url || img.thumbnail || img.play_url || img);
              return { url: imgUrl, thumb: imgUrl, type: 'image', id: idx };
            });
          }

          setResult({
            status: isGallery ? 'picker' : 'ready',
            url: tiktokUrl,
            downloadUrl: isGallery ? pickerItems[0]?.url : (d.videoUrl || d.download || d.video || d.play || null),
            mediaType: isGallery ? 'image' : 'video',
            musicUrl: d.music || null,
            previewMeta: {
              title: d.title || (isGallery ? 'TikTok Şəkillər' : 'TikTok Video'),
              image: isGallery ? (pickerItems[0]?.thumb || d.cover) : (d.cover || d.author?.avatar || null),
              description: d.author?.nickname || d.author?.unique_id || '',
              isImage: isGallery,
            },
            picker: pickerItems,
          });
        } else {
          const errMsg = data?.status?.error || data?.data?.error || data?.error || t('error_fetching');
          console.error('[TikTok] All attempts failed:', errMsg);
          throw new Error(errMsg);
        }

      } else if (pid === 'instagram') {
        const cleanUrl = cleanInstagramUrl(url.trim());
        const isPost = /\/p\/[A-Za-z0-9_-]+/i.test(cleanUrl);
        console.log(`[Instagram] URL: ${cleanUrl}, isPost: ${isPost}`);

        if (isPost) {
          /* ── Postlar (şəkil və karusellər) üçün xüsusi Post API ── */
          console.log('[Instagram] Post linki aşkarlandı, birbaşa Post API istifadə olunur...');
          try {
            let cobaltData = null;
            const metaPromise = fetch('/.netlify/functions/fetch-metadata', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: cleanUrl }),
            }).then(r => r.json()).catch(() => null);

            for (let a = 1; a <= 2; a++) {
              try {
                console.log(`[Instagram Post] Cəhd ${a}/2...`);
                const res = await fetch('/.netlify/functions/fetch-info', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ url: cleanUrl, quality: 'max' }),
                });
                cobaltData = await res.json();
                if (cobaltData && (cobaltData.status === 'picker' || cobaltData.url)) break;
              } catch (err) {
                console.warn(`[Instagram Post] Cəhd ${a} xətası:`, err.message);
              }
              if (a < 2) await new Promise(r => setTimeout(r, 2000));
            }

            const meta = await metaPromise;

            if (cobaltData && (cobaltData.status === 'picker' || cobaltData.url)) {
              if (cobaltData.status === 'picker' && Array.isArray(cobaltData.picker)) {
                const pickerItems = cobaltData.picker.map(item => ({
                  url: item.url,
                  thumb: item.thumb || item.url,
                  type: item.type === 'photo' ? 'image' : (item.type || 'image'),
                }));
                setResult({
                  status: 'picker',
                  url: cleanUrl,
                  downloadUrl: pickerItems[0]?.url,
                  mediaType: 'image',
                  previewMeta: {
                    title: meta?.title || 'Instagram Post',
                    image: meta?.image || pickerItems[0]?.thumb || pickerItems[0]?.url,
                    description: meta?.description || '',
                    isImage: true,
                  },
                  picker: pickerItems,
                });
                return;
              } else if (cobaltData.url) {
                const isPhoto = cobaltData.type === 'photo' || cobaltData.ext === 'jpg' || cobaltData.ext === 'png';
                setResult({
                  status: 'ready',
                  url: cleanUrl,
                  downloadUrl: cobaltData.url,
                  mediaType: isPhoto ? 'image' : 'video',
                  previewMeta: {
                    title: meta?.title || 'Instagram Media',
                    image: meta?.image || cobaltData.thumb || cobaltData.url,
                    description: meta?.description || '',
                    isImage: isPhoto,
                  },
                });
                return;
              }
            }

            // Əgər Cobalt boş və ya xəta veribsə, lakin metadata vasitəsilə post şəkli tapılıbsa:
            if (meta && meta.image) {
              console.log('[Instagram Post] Metadata şəkli istifadə olunur:', meta.image);
              setResult({
                status: 'ready',
                url: cleanUrl,
                downloadUrl: meta.image,
                mediaType: 'image',
                previewMeta: {
                  title: meta.title || 'Instagram Post',
                  image: meta.image,
                  description: meta.description || '',
                  isImage: true,
                },
              });
              return;
            }

            if (cobaltData?.text || cobaltData?.error) {
              throw new Error(cobaltData.text || cobaltData.details || cobaltData.error);
            }
          } catch (postErr) {
            console.error('[Instagram Post] Xəta:', postErr.message);
            throw new Error(postErr.message || t('error_fetching'));
          }
        } else {
          /* ── Reels və Videolar üçün Megan API ── */
          console.log('[Instagram] Reel/Video linki aşkarlandı, Megan API istifadə olunur...');
          let data = null;
          const MAX_ATTEMPTS = 2;

          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            console.log(`[Instagram Megan] Attempt ${attempt}/${MAX_ATTEMPTS}`);
            try {
              const res = await fetch('/.netlify/functions/megan-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'instagram', url: cleanUrl }),
              });
              data = await res.json();
              console.log(`[Instagram Megan] Attempt ${attempt} result:`, data?.status?.success);
              if (data?.status?.success && data?.data) break;
            } catch (e) {
              console.error(`[Instagram Megan] Attempt ${attempt} failed:`, e.message);
            }
            if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 1500));
          }

          if (data?.status?.success && data.data) {
            const d = data.data;
            const mediaItems = Array.isArray(d.media) ? d.media : [];
            const imagesList = Array.isArray(d.images) ? d.images : [];
            
            const isGallery = imagesList.length > 1 || mediaItems.length > 1;
            const isSingleImage = imagesList.length === 1 || (mediaItems.length === 1 && mediaItems[0]?.type === 'image');

            const primaryMedia = mediaItems[0] || {};
            const downloadUrl = primaryMedia.proxyUrl || primaryMedia.url || d.download || d.url || d.video || imagesList[0];
            const mediaType = isSingleImage ? 'image' : (primaryMedia.type || (imagesList.length > 0 ? 'image' : 'video'));

            let pickerItems = [];
            if (imagesList.length > 0) {
              pickerItems = imagesList.map(img => ({ url: img, thumb: img }));
            } else if (mediaItems.length > 0) {
              pickerItems = mediaItems.map(m => ({
                url: m.proxyUrl || m.url,
                thumb: m.thumbnail || m.proxyUrl || m.url,
                type: m.type,
              }));
            }

            setResult({
              status: isGallery ? 'picker' : 'ready',
              url: cleanUrl,
              downloadUrl: downloadUrl,
              proxyUrl: primaryMedia.proxyUrl || null,
              mediaType: mediaType,
              media: mediaItems,
              previewMeta: {
                title: d.title || (d.username ? `@${d.username}` : 'Instagram Post'),
                image: d.thumbnail || primaryMedia.thumbnail || imagesList[0] || primaryMedia.url || null,
                description: d.caption || d.description || '',
                isImage: mediaType === 'image',
              },
              picker: pickerItems,
            });
          } else {
            const errMsg = data?.status?.error || data?.data?.error || data?.error || t('error_fetching');
            console.error('[Instagram] Failed:', errMsg);
            throw new Error(errMsg);
          }
        }

      } else if (pid === 'facebook') {
        const data = await fetch('/.netlify/functions/megan-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'facebook', url: url.trim() }),
        }).then(r => r.json());

        if (data.status?.success && data.data) {
          const d = data.data;
          setResult({
            status: 'ready',
            url: url.trim(),
            previewMeta: {
              title: d.title || 'Facebook Video',
              image: d.thumbnail || null,
              description: '',
            },
          });
        } else {
          const errMsg = data.status?.error || data.data?.error || data.error || t('error_fetching');
          throw new Error(errMsg);
        }

      } else if (pid === 'pinterest') {
        /* Pinterest hələ də Cobalt istifadə edir */
        const [data, meta] = await Promise.all([
          fetch('/.netlify/functions/fetch-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url.trim() }),
          }).then(r => r.json()),
          fetch('/.netlify/functions/fetch-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url.trim() }),
          }).then(r => r.json()).catch(() => null),
        ]);

        if (data.status === 'error') alert(data.text || t('error_fetching'));
        else setResult({ ...data, previewMeta: meta });
      }
    } catch (err) { console.error('[handleSearch error]', err); alert(err.message || t('error_fetching')); }
    finally { setLoad(false); }
  };

  const activePFull = platforms.find(p => p.id === pid) || platforms[0];
  const isYouTube = pid === 'youtube';

  return (
    <>
      <Header />

      <main>
        <motion.div
          className="hero"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <OdometerTitle />
          <p className="hero-sub">{t('hero_subtitle')}</p>
        </motion.div>

        {/* Platform tabs */}
        <div className="platform-tabs">
          {platforms.map(p => {
            const isExpanded = pid === p.id || hoveredTab === p.id;
            return (
              <motion.button
                key={p.id}
                className={`ptab ${p.cls} ${pid === p.id ? 'active-' + p.cls : ''} ${isExpanded ? 'is-expanded' : ''}`}
                onClick={() => selectPlatform(p)}
                onMouseEnter={() => setHoveredTab(p.id)}
                onMouseLeave={() => setHoveredTab(null)}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                <i className={p.icon} />
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.span
                      className="ptab-label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                    >
                      {p.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {/* Platform section */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={pid}
            className="platform-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {/* Header card */}
            <div className={`platform-section-header ${activePFull.cls}`}>
              <div className={`platform-icon-big ${PIB_CLS[pid]}`}>
                <i className={activePFull.icon} />
              </div>
              <div>
                <div className="platform-section-title">{activePFull.label}</div>
                <div className="platform-section-desc">{activePFull.desc}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {activePFull.features.map(f => (
                  <span key={f} className="chip" style={{ fontSize: '0.75rem' }}>{f}</span>
                ))}
              </div>
            </div>

            {/* YouTube: Search or Link mode */}
            {isYouTube ? (
              <div className={`platform-search-area ${activePFull.cls}`}>
                {/* Mode tabs */}
                <div className="yt-mode-selector">
                  <button
                    type="button"
                    className={`yt-mode-btn ${ytMode === 'link' ? 'active' : ''}`}
                    onClick={() => { setYtMode('link'); setSearchResults([]); setSearchSearched(false); setResult(null); }}
                  >
                    <i className="fa-solid fa-link" /> {t('yt_mode_link')}
                  </button>
                  <button
                    type="button"
                    className={`yt-mode-btn ${ytMode === 'search' ? 'active' : ''}`}
                    onClick={() => { setYtMode('search'); setSearchResults([]); setSearchSearched(false); setResult(null); }}
                  >
                    <i className="fa-solid fa-magnifying-glass" /> {t('yt_mode_search')}
                  </button>
                </div>

                {/* Search mode */}
                {ytMode === 'search' && (
                  <form onSubmit={handleYouTubeSearch}>
                    <div className={`search-wrapper ${activePFull.cls}`}>
                      <i className="fa-solid fa-magnifying-glass" style={{ color: 'var(--text3)', marginLeft: '12px', fontSize: '0.9rem' }} />
                      <input
                        className="search-input"
                        type="text"
                        placeholder={t('yt_search_placeholder')}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                      />
                      <div className="search-actions">
                        <button type="button" onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (isValidUrlForPlatform(text, 'youtube') || text.includes('youtube.com') || text.includes('youtu.be')) {
                              setUrl(text);
                              setYtMode('link');
                              if (!isValidUrlForPlatform(text, 'youtube')) {
                                setUrlError(t('error_invalid_url_platform', { platform: activePlatform.label }));
                              } else {
                                setUrlError('');
                              }
                            } else {
                              setSearchQuery(text);
                            }
                          } catch (err) {
                            console.warn('Clipboard read failed:', err);
                          }
                        }}
                          className="btn btn-ghost"
                          style={{ padding: '8px 14px', borderRadius: '12px', fontSize: '0.85rem' }}>
                          <i className="fa-regular fa-clipboard" /> {t('paste')}
                        </button>
                        <button type="submit"
                          className={`btn btn-${activePFull.cls}`}
                          style={{ padding: '8px 20px', borderRadius: '12px' }}
                          disabled={searchLoading}>
                          {searchLoading ? <span className="spinner" /> : <><i className="fa-solid fa-magnifying-glass" /> {t('search')}</>}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Link mode */}
                {ytMode === 'link' && (
                  <form onSubmit={handleSearch}>
                    <div className={`search-wrapper ${activePFull.cls} ${urlError ? 'input-error' : ''}`}>
                      <i className="fa-solid fa-link" style={{ color: 'var(--text3)', marginLeft: '12px', fontSize: '0.9rem' }} />
                      <input
                        className="search-input"
                        type="text"
                        placeholder={activePFull.placeholder}
                        value={url}
                        onChange={e => handleUrlChange(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                      />
                      <div className="search-actions">
                        <button type="button" onClick={handlePaste}
                          className="btn btn-ghost"
                          style={{ padding: '8px 14px', borderRadius: '12px', fontSize: '0.85rem' }}>
                          <i className="fa-regular fa-clipboard" /> {t('paste')}
                        </button>
                        <button type="submit"
                          className={`btn btn-${activePFull.cls}`}
                          style={{ padding: '8px 20px', borderRadius: '12px' }}
                          disabled={loading || !!urlError}>
                          {loading ? <span className="spinner" /> : <><i className="fa-solid fa-magnifying-glass" /> {t('search')}</>}
                        </button>
                      </div>
                    </div>
                    {urlError && (
                      <div className="url-error-msg">
                        <i className="fa-solid fa-triangle-exclamation" /> {urlError}
                      </div>
                    )}
                  </form>
                )}

                {/* YouTube search results */}
                {searchLoading && (
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                    <span className="spinner" style={{ borderTopColor: 'var(--text2)' }} />
                  </div>
                )}
                {!searchLoading && searchSearched && searchResults.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '0.9rem' }}>
                    {t('yt_no_results')}
                  </div>
                )}
                {!searchLoading && searchResults.length > 0 && (
                  <div className="yt-search-results">
                    {searchResults.map((item, idx) => (
                      <motion.div
                        key={item.videoId || idx}
                        className="yt-search-item"
                        onClick={() => handleSelectSearchResult(item)}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        whileHover={{ scale: 1.01 }}
                      >
                        <div className="yt-search-thumb">
                          <img src={item.thumbnail} alt={item.title} onError={e => e.target.style.display = 'none'} />
                          <span className="yt-search-duration">{item.duration}</span>
                        </div>
                        <div className="yt-search-info">
                          <div className="yt-search-title">{item.title}</div>
                          <div className="yt-search-meta">
                            <span>{item.author}</span>
                            <span>•</span>
                            <span>{item.views?.toLocaleString()} {t('views')}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Other platforms: link-only mode */
              <div className={`platform-search-area ${activePFull.cls}`}>
                <form onSubmit={handleSearch}>
                  <div className={`search-wrapper ${activePFull.cls} ${urlError ? 'input-error' : ''}`}>
                    <i className="fa-solid fa-link" style={{ color: 'var(--text3)', marginLeft: '12px', fontSize: '0.9rem' }} />
                    <input
                      className="search-input"
                      type="text"
                      placeholder={activePFull.placeholder}
                      value={url}
                      onChange={e => handleUrlChange(e.target.value)}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <div className="search-actions">
                      <button type="button" onClick={handlePaste}
                        className="btn btn-ghost"
                        style={{ padding: '8px 14px', borderRadius: '12px', fontSize: '0.85rem' }}>
                        <i className="fa-regular fa-clipboard" /> {t('paste')}
                      </button>
                      <button type="submit"
                        className={`btn btn-${activePFull.cls}`}
                        style={{ padding: '8px 20px', borderRadius: '12px' }}
                        disabled={loading || !!urlError}>
                        {loading ? <span className="spinner" /> : <><i className="fa-solid fa-magnifying-glass" /> {t('search')}</>}
                      </button>
                    </div>
                  </div>
                  {urlError && (
                    <div className="url-error-msg">
                      <i className="fa-solid fa-triangle-exclamation" /> {urlError}
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* Result */}
            <AnimatePresence>
              {result && (
                <div className={`result-card result-card-platform ${activePFull.cls}`}>
                  <ResultCard result={result} url={url} platform={pid} />
                </div>
              )}
            </AnimatePresence>

            {/* Empty state */}
            {!result && !loading && !searchLoading && searchResults.length === 0 && (
              <div className={`platform-empty-box ${activePFull.cls}`}>
                <div className="empty-radar-glow">
                  <div className="empty-radar-ping" />
                  <i className="fa-solid fa-arrow-up-long" />
                </div>
                <div className="empty-title">
                  {isYouTube ? t('yt_empty_state') : t('empty_state')}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Feedback Form */}
      <div style={{ padding: '0 20px', position: 'relative', zIndex: 1, maxWidth: '800px', margin: '0 auto 40px auto' }}>
        <FeedbackForm />
      </div>

      {/* Stats Panel */}
      <div style={{ padding: '0 20px 80px', position: 'relative', zIndex: 1 }}>
        <StatsPanel />
        <div className="stats-footer">
          <i className="fa-solid fa-shield-halved" />
          {t('stats_footer')}
        </div>
      </div>
    </>
  );
}

export default App;
