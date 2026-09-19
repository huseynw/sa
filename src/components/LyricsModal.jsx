import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export default function LyricsModal({ item, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState(item?.isSynced ? 'synced' : 'plain');
  const [lyricsText, setLyricsText] = useState(item?.plainLyrics || '');
  const [syncedLines, setSyncedLines] = useState([]);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!item) return;

    if (item.syncedLyrics) {
      const lines = item.syncedLyrics
        .split('\n')
        .map(line => {
          const match = line.match(/^\[(\d{2}:\d{2}\.\d{2,3})\](.*)$/);
          if (match) {
            return { time: match[1], text: match[2].trim() };
          }
          return { time: '', text: line.trim() };
        })
        .filter(l => l.text.length > 0 || l.time.length > 0);
      setSyncedLines(lines);
    }

    if (item.source === 'genius' && !item.plainLyrics) {
      setLoadingLyrics(true);
      setErrorMsg('');

      fetch('/.netlify/functions/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'genius-lyrics', url: item.url || item.path }),
      })
        .then(r => r.json())
        .then(data => {
          if (data.success && data.lyrics) {
            setLyricsText(data.lyrics);
          } else {
            setErrorMsg(data.error || t('error_fetching'));
          }
        })
        .catch(err => {
          console.error('Failed to load Genius lyrics:', err);
          setErrorMsg(t('error_fetching'));
        })
        .finally(() => {
          setLoadingLyrics(false);
        });
    } else {
      setLyricsText(item.plainLyrics || '');
    }
  }, [item, t]);

  if (!item) return null;

  const handleCopy = async () => {
    const textToCopy = (viewMode === 'synced' && item.syncedLyrics)
      ? item.syncedLyrics
      : lyricsText;
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const handleDownload = (format) => {
    let content = lyricsText;
    let ext = 'txt';
    let mime = 'text/plain;charset=utf-8';

    if (format === 'lrc' && item.syncedLyrics) {
      content = item.syncedLyrics;
      ext = 'lrc';
    }

    const safeTitle = (item.title || 'Lyrics').replace(/[/\\?%*:|"<>]/g, '_');
    const safeArtist = (item.artist || 'Artist').replace(/[/\\?%*:|"<>]/g, '_');
    const filename = `${safeArtist} - ${safeTitle}.${ext}`;

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      <div className="lyrics-modal-backdrop" onClick={onClose}>
        <motion.div
          className="lyrics-modal-box"
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="lyrics-modal-header">
            <div className="lyrics-modal-cover">
              {item.thumbnail ? (
                <img src={item.thumbnail} alt={item.title} />
              ) : (
                <div className="lyrics-modal-cover-placeholder">
                  <i className="fa-solid fa-music" />
                </div>
              )}
            </div>

            <div className="lyrics-modal-info">
              <div className="lyrics-modal-badges">
                {item.isSynced ? (
                  <span className="badge badge-synced">
                    <i className="fa-solid fa-bolt" /> {t('synced_badge')}
                  </span>
                ) : (
                  <span className="badge badge-plain">
                    <i className="fa-solid fa-align-left" /> {t('plain_badge')}
                  </span>
                )}

                <span className={`badge badge-source ${item.source === 'genius' ? 'badge-genius' : 'badge-lrclib'}`}>
                  {item.source === 'genius' ? 'Genius' : 'LRCLIB'}
                </span>

                {item.duration ? (
                  <span className="badge badge-duration">
                    <i className="fa-regular fa-clock" /> {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
                  </span>
                ) : null}
              </div>

              <h2 className="lyrics-modal-title">{item.title}</h2>
              <p className="lyrics-modal-artist">
                <i className="fa-solid fa-user-astronaut" style={{ marginRight: '6px', opacity: 0.7 }} />
                {item.artist}
                {item.album && <span className="lyrics-modal-album"> • {item.album}</span>}
              </p>
            </div>

            <button type="button" className="lyrics-modal-close" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          <div className="lyrics-modal-toolbar">
            {item.isSynced && (
              <div className="lyrics-view-switch">
                <button
                  type="button"
                  className={`lyrics-switch-btn ${viewMode === 'synced' ? 'active' : ''}`}
                  onClick={() => setViewMode('synced')}
                >
                  <i className="fa-solid fa-bolt" /> {t('view_synced')}
                </button>
                <button
                  type="button"
                  className={`lyrics-switch-btn ${viewMode === 'plain' ? 'active' : ''}`}
                  onClick={() => setViewMode('plain')}
                >
                  <i className="fa-solid fa-align-left" /> {t('view_plain')}
                </button>
              </div>
            )}

            <div className="lyrics-toolbar-actions">
              <button
                type="button"
                className={`btn btn-secondary ${copied ? 'btn-copied' : ''}`}
                onClick={handleCopy}
                disabled={loadingLyrics || (!lyricsText && syncedLines.length === 0)}
              >
                <i className={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} />
                {copied ? t('copied') : t('copy_lyrics')}
              </button>

              {item.isSynced && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleDownload('lrc')}
                  title="Download synchronized LRC file"
                >
                  <i className="fa-solid fa-download" /> {t('download_lrc')}
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleDownload('txt')}
                disabled={loadingLyrics || !lyricsText}
                title="Download text file"
              >
                <i className="fa-regular fa-file-lines" /> {t('download_txt')}
              </button>

              {item.url && item.source === 'genius' && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-genius"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" /> Genius
                </a>
              )}
            </div>
          </div>

          <div className="lyrics-modal-content">
            {loadingLyrics && (
              <div className="lyrics-modal-loading">
                <span className="spinner" />
                <p>{t('lyrics_loading')}</p>
              </div>
            )}

            {errorMsg && (
              <div className="lyrics-modal-error">
                <i className="fa-solid fa-triangle-exclamation" />
                <p>{errorMsg}</p>
              </div>
            )}

            {!loadingLyrics && !errorMsg && (
              <>
                {viewMode === 'synced' && item.isSynced ? (
                  <div className="lyrics-synced-container">
                    {syncedLines.map((line, idx) => (
                      <div key={idx} className={`synced-line ${!line.text ? 'synced-empty' : ''}`}>
                        {line.time && <span className="synced-timestamp">{line.time}</span>}
                        <span className="synced-text">{line.text || '♪'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="lyrics-plain-container">
                    {lyricsText ? (
                      lyricsText.split('\n').map((line, idx) => (
                        <p key={idx} className={line.startsWith('[') ? 'lyrics-section-header' : 'lyrics-line'}>
                          {line || '\u00A0'}
                        </p>
                      ))
                    ) : (
                      <p className="lyrics-empty">{t('no_lyrics_found')}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
