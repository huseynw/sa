import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export default function LyricsCard({ item, index, onSelect }) {
  const { t } = useTranslation();

  const isSynced = item.isSynced;
  const isGenius = item.source === 'genius';

  const formatDuration = (seconds) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <motion.div
      className={`lyrics-card ${isSynced ? 'is-synced' : 'is-plain'}`}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      whileHover={{ y: -3, scale: 1.01 }}
      onClick={() => onSelect(item)}
    >
      <div className="lyrics-card-number">#{index + 1}</div>
      <div className="lyrics-card-thumb">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="lyrics-card-thumb-placeholder"
          style={{ display: item.thumbnail ? 'none' : 'flex' }}
        >
          <i className="fa-solid fa-music" />
        </div>
      </div>
      <div className="lyrics-card-info">
        <div className="lyrics-card-title" title={item.title}>
          {item.title}
        </div>
        <div className="lyrics-card-artist" title={item.artist}>
          <i className="fa-solid fa-user-astronaut" />
          <span>{item.artist}</span>
          {item.album && <span className="lyrics-card-album"> • {item.album}</span>}
        </div>
        <div className="lyrics-card-badges">
          {isSynced ? (
            <span className="badge badge-synced" title="LRC Format - Time-synchronized lyrics">
              <i className="fa-solid fa-bolt" /> {t('synced_badge')}
            </span>
          ) : (
            <span className="badge badge-plain" title="Standard text lyrics">
              <i className="fa-solid fa-align-left" /> {t('plain_badge')}
            </span>
          )}
          <span className={`badge badge-source ${isGenius ? 'badge-genius' : 'badge-lrclib'}`}>
            {isGenius ? 'Genius' : 'LRCLIB'}
          </span>
          {item.duration ? (
            <span className="badge badge-duration">
              <i className="fa-regular fa-clock" /> {formatDuration(item.duration)}
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="lyrics-card-action"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(item);
        }}
      >
        <span>{t('view_lyrics')}</span>
        <i className="fa-solid fa-arrow-right" />
      </button>
    </motion.div>
  );
}
