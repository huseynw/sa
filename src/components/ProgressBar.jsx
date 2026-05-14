import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

const ProgressBar = ({ progress, speed }) => {
  const { t } = useTranslation();

  if (progress === null) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="glass-panel"
      style={{ padding: '20px', marginTop: '20px', width: '100%' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
        <span>{t('downloading')}</span>
        <span>{progress}%</span>
      </div>
      <div className="progress-container">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {t('speed')} {speed} MB/s
      </div>
    </motion.div>
  );
};

export default ProgressBar;
