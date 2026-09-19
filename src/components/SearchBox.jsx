import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

const SearchBox = ({ onSearch, loading }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error('Clipboard read failed:', err);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) onSearch(url.trim());
  };

  return (
    <motion.div
      style={{ width: '100%', maxWidth: '720px', margin: '0 auto' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <form onSubmit={handleSubmit}>
        <div className="search-wrapper">
          <i className="fa-solid fa-link" style={{ color: 'var(--text3)', marginLeft: '12px', fontSize: '0.9rem' }} />
          <input
            className="search-input"
            type="text"
            placeholder={t('placeholder')}
            value={url}
            onChange={e => setUrl(e.target.value)}
            autoComplete="off"
            spellCheck="false"
          />
          <div className="search-actions">
            <button
              type="button"
              onClick={handlePaste}
              className="btn btn-ghost"
              style={{ padding: '8px 14px', borderRadius: '12px', fontSize: '0.85rem' }}
              title="Paste"
            >
              <i className="fa-regular fa-clipboard" /> Paste
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: '8px 20px', borderRadius: '12px' }}
              disabled={loading}
            >
              {loading
                ? <span className="spinner" />
                : <><i className="fa-solid fa-download" /> Download</>
              }
            </button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

export default SearchBox;
