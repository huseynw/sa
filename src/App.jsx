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

/* ── Looping Typewriter Title ── */
const TYPEWRITER_PHRASES = [
  'HUSEVN DOWNLOADER',
  'HUSEVN YÜKLƏYİCİ',
  'HUSEVN İNDİRİCİ',
  'HUSEVN ЗАГРУЗЧИК',
];

function TypewriterTitle() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [deleting, setDeleting] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const phrase = TYPEWRITER_PHRASES[phraseIdx];

    if (!deleting && displayed.length < phrase.length) {
      timeoutRef.current = setTimeout(() => {
        setDisplayed(phrase.slice(0, displayed.length + 1));
      }, 80);
    } else if (!deleting && displayed.length === phrase.length) {
      timeoutRef.current = setTimeout(() => setDeleting(true), 2000);
    } else if (deleting && displayed.length > 0) {
      timeoutRef.current = setTimeout(() => {
        setDisplayed(phrase.slice(0, displayed.length - 1));
      }, 40);
    } else if (deleting && displayed.length === 0) {
      setDeleting(false);
      setPhraseIdx(i => (i + 1) % TYPEWRITER_PHRASES.length);
    }

    return () => clearTimeout(timeoutRef.current);
  }, [displayed, deleting, phraseIdx]);

  return (
    <h1 className="hero-title">
      {displayed}<span className="typewriter-cursor" />
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
  const [urls,     setUrls]     = useState({});
  const [results,  setResults]  = useState({});
  const [loadings, setLoadings] = useState({});
  const [urlErrors, setUrlErrors] = useState({});

  /* ── YouTube search state ── */
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
      if (cleaned.trim() && !isValidUrlForPlatform(cleaned, pid)) {
        setUrlError(t('error_invalid_url_platform', { platform: activePlatform.label }));
      } else {
        setUrlError('');
      }
    } catch {}
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
        setSearchResults(data.data.results.slice(0, 5));
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
          setResult({
            status: 'ready',
            url: tiktokUrl,
            previewMeta: {
              title: d.title || 'TikTok Video',
              image: d.cover || d.author?.avatar || null,
              description: d.author?.nickname || '',
            },
          });
        } else {
          const errMsg = data?.status?.error || data?.data?.error || data?.error || t('error_fetching');
          console.error('[TikTok] All attempts failed:', errMsg);
          throw new Error(errMsg);
        }

      } else if (pid === 'instagram') {
        const cleanUrl = cleanInstagramUrl(url.trim());
        let data = null;
        const MAX_ATTEMPTS = 2;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          console.log(`[Instagram] Attempt ${attempt}/${MAX_ATTEMPTS}`);
          try {
            const res = await fetch('/.netlify/functions/megan-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'instagram', url: cleanUrl }),
            });
            data = await res.json();
            console.log(`[Instagram] Attempt ${attempt} result:`, data?.status?.success);
            if (data?.status?.success && data?.data) break;
          } catch (e) {
            console.error(`[Instagram] Attempt ${attempt} failed:`, e.message);
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
          // Megan API post yükləyə bilmədikdə (şəkil/karusel postları üçün) xüsusi ehtiyat API
          console.log('[Instagram] Megan API postu yükləyə bilmədi, post üçün Cobalt API çağırılır...');
          try {
            const [cobaltData, meta] = await Promise.all([
              fetch('/.netlify/functions/fetch-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: cleanUrl, quality: 'max' }),
              }).then(r => r.json()),
              fetch('/.netlify/functions/fetch-metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: cleanUrl }),
              }).then(r => r.json()).catch(() => null),
            ]);

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
          } catch (fallbackErr) {
            console.error('[Instagram] Post fallback xətası:', fallbackErr);
          }

          const errMsg = data?.status?.error || data?.data?.error || data?.error || t('error_fetching');
          console.error('[Instagram] Failed:', errMsg);
          throw new Error(errMsg);
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
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      <main>
        <motion.div
          className="hero"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <TypewriterTitle />
          <p className="hero-sub">{t('hero_subtitle')}</p>
        </motion.div>

        {/* Platform tabs */}
        <div className="platform-tabs">
          {platforms.map(p => (
            <motion.button
              key={p.id}
              className={`ptab ${p.cls} ${pid === p.id ? 'active-' + p.cls : ''}`}
              onClick={() => selectPlatform(p)}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <i className={p.icon} />
              {p.label}
            </motion.button>
          ))}
        </div>

        {/* Platform section */}
        <AnimatePresence mode="wait">
          <motion.div
            key={pid}
            className="platform-section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
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
                <div style={{ display: 'flex', gap: '0', marginBottom: '14px' }}>
                  <button
                    className="btn btn-ghost"
                    style={{
                      flex: 1, borderRadius: '12px 0 0 12px', padding: '10px',
                      background: !searchSearched && !url ? 'var(--surface2)' : 'transparent',
                      fontWeight: 600, fontSize: '0.85rem',
                    }}
                    onClick={() => { setSearchResults([]); setSearchSearched(false); setSearchQuery(''); setUrl(''); setResult(null); }}
                  >
                    <i className="fa-solid fa-magnifying-glass" /> {t('yt_mode_search')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{
                      flex: 1, borderRadius: '0 12px 12px 0', padding: '10px',
                      background: url ? 'var(--surface2)' : 'transparent',
                      fontWeight: 600, fontSize: '0.85rem',
                    }}
                    onClick={() => { setSearchResults([]); setSearchSearched(false); setSearchQuery(''); setResult(null); }}
                  >
                    <i className="fa-solid fa-link" /> {t('yt_mode_link')}
                  </button>
                </div>

                {/* Search mode */}
                {!url && (
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
                {url && (
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
              <div style={{
                padding: '30px 28px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: '0 0 24px 24px',
                textAlign: 'center', color: 'var(--text3)', fontSize: '0.9rem',
              }}>
                <i className="fa-solid fa-arrow-up" style={{ display: 'block', fontSize: '1.5rem', marginBottom: '8px', opacity: 0.4 }} />
                {isYouTube ? t('yt_empty_state') : t('empty_state')}
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
