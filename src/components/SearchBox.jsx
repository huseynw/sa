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
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) {
      onSearch(url.trim());
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={{ width: '100%', maxWidth: '700px', margin: '0 auto', padding: '0 20px' }}
    >
      <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
        <input
          type="text"
          className="input-premium glass-panel"
          placeholder={t('placeholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ paddingRight: '120px' }}
        />
        <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '8px' }}>
          <button 
            type="button" 
            onClick={handlePaste}
            className="btn btn-secondary"
            style={{ padding: '8px 12px', borderRadius: '12px' }}
            title="Paste"
          >
            <i className="fa-regular fa-clipboard"></i>
          </button>
          <button 
            type="submit" 
            className="btn btn-primary"
            style={{ padding: '8px 20px', borderRadius: '12px' }}
            disabled={loading}
          >
            {loading ? <div className="loader"></div> : <i className="fa-solid fa-arrow-right"></i>}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default SearchBox;
