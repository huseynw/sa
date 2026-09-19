import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

const ProgressBar = ({ progress, speed }) => {
  const { t } = useTranslation();
  if (progress === null) return null;

  const isNumeric = typeof speed === 'number' || (typeof speed === 'string' && speed.trim() !== '' && !isNaN(Number(speed)));

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="progress-wrap"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text2)' }}>
        <span>{t('downloading')}</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{progress}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div style={{ textAlign: 'right', marginTop: '6px', fontSize: '0.78rem', color: 'var(--text3)' }}>
        {isNumeric ? `${t('speed')} ${speed} MB/s` : (speed || '')}
      </div>
    </motion.div>
  );
};

export default ProgressBar;
