import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import ResultCard from './components/ResultCard';
import StatsPanel from './components/StatsPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

/* ── Stats API helper ── */
const trackStat = (action, platform) => {
  fetch('/api/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, platform }),
  }).catch(() => {}); // fire-and-forget, errors silently ignored
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

const PLATFORMS = (t) => [
  {
    id: 'youtube', cls: 'yt', label: 'YouTube',
    icon: 'fa-brands fa-youtube',
    color: '#ff0000', glow: 'rgba(255,0,0,0.25)',
    placeholder: t('yt_placeholder'),
    desc: t('yt_desc'),
    features: [t('yt_feat1'), t('yt_feat2'), t('yt_feat3')],
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

  /* Track page visit once */
  const visitTracked = useRef(false);
  useEffect(() => {
    if (!visitTracked.current) {
      visitTracked.current = true;
      trackStat('visit');
    }
  }, []);

  /* Download tracker — passed down to ResultCard */
  const handleDownloadTracked = useCallback((platform) => {
    trackStat('download', platform);
  }, []);

  const [activePlatform, setActivePlatform] = useState(platforms[0]);
  const [urls,     setUrls]     = useState({});
  const [results,  setResults]  = useState({});
  const [loadings, setLoadings] = useState({});

  const pid = activePlatform.id;
  const url     = urls[pid]     || '';
  const result  = results[pid]  || null;
  const loading = loadings[pid] || false;

  const setUrl    = (v) => setUrls(p     => ({ ...p, [pid]: v }));
  const setResult = (v) => setResults(p  => ({ ...p, [pid]: v }));
  const setLoad   = (v) => setLoadings(p => ({ ...p, [pid]: v }));

  const selectPlatform = (p) => {
    setActivePlatform(p);
    document.documentElement.style.setProperty('--platform-color', p.color);
    document.documentElement.style.setProperty('--platform-glow',  p.glow);
  };

  const handlePaste = async () => {
    try { const text = await navigator.clipboard.readText(); setUrl(text); } catch {}
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      setLoad(true);
      setResult(null);

      const isYouTube = url.toLowerCase().includes('youtube.com') || url.toLowerCase().includes('youtu.be');

      // Fetch metadata always (for preview card)
      const metaPromise = fetch('/.netlify/functions/fetch-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      }).then(r => r.json()).catch(() => null);

      if (isYouTube) {
        // For YouTube, skip Cobalt — just set a ready result.
        // The download URL is fetched when the user clicks a download button.
        const meta = await metaPromise;
        setResult({ status: 'youtube_ready', url: url.trim(), previewMeta: meta });
      } else {
        const [data, meta] = await Promise.all([
          fetch('/.netlify/functions/fetch-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url.trim() }),
          }).then(r => r.json()),
          metaPromise
        ]);

        if (data.status === 'error') alert(data.text || t('error_fetching'));
        else setResult({ ...data, previewMeta: meta });
      }
    } catch { alert(t('error_fetching')); }
    finally { setLoad(false); }
  };

  // Re-compute active platform with fresh translations on lang change
  const activePFull = platforms.find(p => p.id === pid) || platforms[0];

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

            {/* Search area */}
            <div className={`platform-search-area ${activePFull.cls}`}>
              <form onSubmit={handleSearch}>
                <div className={`search-wrapper ${activePFull.cls}`}>
                  <i className="fa-solid fa-link" style={{ color: 'var(--text3)', marginLeft: '12px', fontSize: '0.9rem' }} />
                  <input
                    className="search-input"
                    type="text"
                    placeholder={activePFull.placeholder}
                    value={url}
                    onChange={e => setUrl(e.target.value)}
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
                      disabled={loading}>
                      {loading ? <span className="spinner" /> : <><i className="fa-solid fa-magnifying-glass" /> {t('search')}</>}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Result */}
            <AnimatePresence>
              {result && (
                <div className={`result-card result-card-platform ${activePFull.cls}`}>
                  <ResultCard result={result} url={url} onDownload={handleDownloadTracked} />
                </div>
              )}
            </AnimatePresence>

            {/* Empty state */}
            {!result && !loading && (
              <div style={{
                padding: '30px 28px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: '0 0 24px 24px',
                textAlign: 'center', color: 'var(--text3)', fontSize: '0.9rem',
              }}>
                <i className="fa-solid fa-arrow-up" style={{ display: 'block', fontSize: '1.5rem', marginBottom: '8px', opacity: 0.4 }} />
                {t('empty_state')}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Stats Panel (site footer area) ── */}
      <div style={{ padding: '0 20px 80px', position: 'relative', zIndex: 1 }}>
        <StatsPanel />
        <div className="stats-footer">
          <i className="fa-solid fa-shield-halved" />
          Bütün statistikalar real vaxt rejimində toplanır · HUSEVN DOWNLOADER © 2025
        </div>
      </div>
    </>
  );
}

export default App;
