import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import LyricsCard from './LyricsCard';
import LyricsModal from './LyricsModal';

export default function LyricsView({ onTrackStat }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all'); // 'all' | 'lrclib' | 'genius'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'synced' | 'plain'
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [stats, setStats] = useState(null);

  const currentLang = (i18n.language || 'AZ').toUpperCase();
  const sampleHints = {
    AZ: [
      { label: 'Okaber - Axtarma', query: 'Okaber Axtarma' },
      { label: 'Adele - Easy On Me', query: 'Adele Easy On Me' },
      { label: 'The Weeknd - Starboy', query: 'The Weeknd Starboy' },
      { label: 'Eminem - Lose Yourself', query: 'Eminem Lose Yourself' },
    ],
    TR: [
      { label: 'Tarkan - Şımarık', query: 'Tarkan Şımarık' },
      { label: 'Manga - Bir Kadın Çizeceksin', query: 'Manga Bir Kadın Çizeceksin' },
      { label: 'Duman - Haberin Yok Ölüyorum', query: 'Duman Haberin Yok Ölüyorum' },
      { label: 'The Weeknd - Starboy', query: 'The Weeknd Starboy' },
    ],
    RU: [
      { label: 'Баста - Сансара', query: 'Баста Сансара' },
      { label: 'Miyagi & Эндшпиль - I Got Love', query: 'Miyagi I Got Love' },
      { label: 'Скриптонит - Положение', query: 'Скриптонит Положение' },
      { label: 'The Weeknd - Starboy', query: 'The Weeknd Starboy' },
    ],
    EN: [
      { label: 'Coldplay - Yellow', query: 'Coldplay Yellow' },
      { label: 'Adele - Easy On Me', query: 'Adele Easy On Me' },
      { label: 'The Weeknd - Starboy', query: 'The Weeknd Starboy' },
      { label: 'Eminem - Lose Yourself', query: 'Eminem Lose Yourself' },
    ],
  };
  const activeHints = sampleHints[currentLang] || sampleHints.EN;

  const handleSearch = async (e, sourceOverride = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    const targetSource = sourceOverride !== null ? sourceOverride : source;

    if (onTrackStat) onTrackStat('search', 'lyrics');

    setLoading(true);
    setSearched(true);
    setTypeFilter('all');

    try {
      const res = await fetch('/.netlify/functions/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search',
          q: cleanQuery,
          source: targetSource,
          limit: 15,
        }),
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        setResults(data.results.slice(0, 15));
        setStats(data.stats || null);
      } else {
        setResults([]);
        setStats(null);
      }
    } catch (err) {
      console.error('Lyrics search error:', err);
      setResults([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setQuery(text.trim());
      }
    } catch (err) {
      console.warn('Paste failed:', err);
    }
  };

  const handleSourceChange = (newSource) => {
    setSource(newSource);
    if (searched && query.trim()) {
      handleSearch(null, newSource);
    }
  };

  const filteredResults = results.filter(item => {
    if (typeFilter === 'synced') return item.isSynced;
    if (typeFilter === 'plain') return !item.isSynced;
    return true;
  });

  const syncedCount = results.filter(r => r.isSynced).length;
  const plainCount = results.filter(r => !r.isSynced).length;

  return (
    <div className="lyrics-view-container">
      <div className="lyrics-source-tabs">
        <button
          type="button"
          className={`lyrics-source-tab ${source === 'all' ? 'active' : ''}`}
          onClick={() => handleSourceChange('all')}
        >
          <i className="fa-solid fa-layer-group" />
          <span>{t('lyrics_source_all')}</span>
          <span className="source-pill">LRCLIB + Genius</span>
        </button>

        <button
          type="button"
          className={`lyrics-source-tab ${source === 'lrclib' ? 'active' : ''}`}
          onClick={() => handleSourceChange('lrclib')}
        >
          <i className="fa-solid fa-bolt" />
          <span>LRCLIB</span>
          <span className="source-pill pill-lrclib">Synced & Plain</span>
        </button>

        <button
          type="button"
          className={`lyrics-source-tab ${source === 'genius' ? 'active' : ''}`}
          onClick={() => handleSourceChange('genius')}
        >
          <i className="fa-solid fa-feather-pointed" />
          <span>Genius</span>
          <span className="source-pill pill-genius">Genius Community</span>
        </button>
      </div>

      <form onSubmit={handleSearch} className="lyrics-search-form">
        <div className="search-wrapper ly">
          <i className="fa-solid fa-music" style={{ color: 'var(--text3)', marginLeft: '14px', fontSize: '1rem' }} />
          <input
            className="search-input"
            type="text"
            placeholder={t('lyrics_search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
          <div className="search-actions">
            <button
              type="button"
              onClick={handlePaste}
              className="btn btn-ghost"
              style={{ padding: '8px 14px', borderRadius: '12px', fontSize: '0.85rem' }}
            >
              <i className="fa-regular fa-clipboard" /> {t('paste')}
            </button>
            <button
              type="submit"
              className="btn btn-ly"
              style={{ padding: '8px 20px', borderRadius: '12px' }}
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <>
                  <i className="fa-solid fa-magnifying-glass" /> {t('search')}
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {searched && results.length > 0 && (
        <div className="lyrics-filters-bar">
          <div className="lyrics-results-count">
            <i className="fa-solid fa-list-check" />
            <span>{t('lyrics_showing_results', { count: filteredResults.length })}</span>
          </div>

          <div className="lyrics-type-chips">
            <button
              type="button"
              className={`chip-filter ${typeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setTypeFilter('all')}
            >
              {t('lyrics_filter_all')} ({results.length})
            </button>

            <button
              type="button"
              className={`chip-filter chip-synced ${typeFilter === 'synced' ? 'active' : ''}`}
              onClick={() => setTypeFilter('synced')}
            >
              <i className="fa-solid fa-bolt" /> {t('synced_badge')} ({syncedCount})
            </button>

            <button
              type="button"
              className={`chip-filter chip-plain ${typeFilter === 'plain' ? 'active' : ''}`}
              onClick={() => setTypeFilter('plain')}
            >
              <i className="fa-solid fa-align-left" /> {t('plain_badge')} ({plainCount})
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="lyrics-state-box">
          <span className="spinner" style={{ width: '32px', height: '32px', borderTopColor: '#8b5cf6' }} />
          <p>{t('lyrics_loading')}</p>
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="lyrics-state-box">
          <div className="lyrics-empty-icon">
            <i className="fa-solid fa-compact-disc fa-spin" style={{ animationDuration: '6s' }} />
          </div>
          <h3>{t('no_lyrics_found')}</h3>
          <p>{t('no_lyrics_found_desc')}</p>
        </div>
      )}

      {!loading && !searched && (
        <div className="platform-empty-box ly">
          <div className="empty-radar-glow">
            <div className="empty-radar-ping" />
            <i className="fa-solid fa-music" />
          </div>
          <div className="empty-title">{t('lyrics_empty_state')}</div>
          <div className="lyrics-hints">
            {activeHints.map((hint, idx) => (
              <span
                key={idx}
                className="lyrics-hint-tag"
                onClick={() => { setQuery(hint.query); }}
              >
                {hint.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="lyrics-results-grid">
          {filteredResults.map((item, index) => (
            <LyricsCard
              key={item.id || index}
              item={item}
              index={index}
              onSelect={(song) => setSelectedItem(song)}
            />
          ))}
        </div>
      )}

      {selectedItem && (
        <LyricsModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
