import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export const DEFAULT_SHORTCUT_URL = 'https://www.icloud.com/shortcuts/45a72db4df8e4384815d72c0ddf2d969';

export default function ShortcutModal({ isOpen, onClose, shortcutUrl = DEFAULT_SHORTCUT_URL }) {
  const { t } = useTranslation();
  const [showGuide, setShowGuide] = useState(false);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="shortcut-modal-backdrop" onClick={onClose}>
        <motion.div
          className="shortcut-modal"
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <div className="shortcut-modal-header">
            <div className="shortcut-header-title">
              <div className="shortcut-apple-badge">
                <i className="fa-brands fa-apple" />
              </div>
              <div>
                <h3>{t('ios_shortcut_title', 'iPhone Kəstirməsi')}</h3>
                <p className="shortcut-subtitle">HUSEVN Downloader iOS Shortcut</p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-icon btn-close"
              onClick={onClose}
              title="Bağla"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          <div className="shortcut-modal-body">
            <p className="shortcut-desc">
              {t(
                'ios_shortcut_desc',
                'Panodan linki avtomatik götürür, platformanı təyin edir və tək toxunuşla medianı (MP4, MP3 və ya şəkilləri) Qalereyanıza yükləyir.'
              )}
            </p>

            <div className="shortcut-features-grid">
              <div className="shortcut-feature-item">
                <div className="shortcut-feature-icon">
                  <i className="fa-regular fa-clipboard" />
                </div>
                <div>
                  <h4>Panodan Avtomatik Al</h4>
                  <p>Linki kopyalayıb kəstirməyə basmağınız kifayətdir.</p>
                </div>
              </div>

              <div className="shortcut-feature-item">
                <div className="shortcut-feature-icon">
                  <i className="fa-solid fa-film" />
                </div>
                <div>
                  <h4>Video və ya MP3</h4>
                  <p>İstəyinizə uyğun olaraq MP4 video və ya MP3 audio seçimi.</p>
                </div>
              </div>

              <div className="shortcut-feature-item">
                <div className="shortcut-feature-icon">
                  <i className="fa-regular fa-images" />
                </div>
                <div>
                  <h4>Şəkillərdə Seçim</h4>
                  <p>Çoxsaylı şəkillərdə hansını yükləmək istədiyinizi seçin.</p>
                </div>
              </div>
            </div>

            <div className="shortcut-actions">
              <a
                href={shortcutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-shortcut-primary"
                onClick={() => {
                  if (shortcutUrl.endsWith('/shortcuts/')) {
                    setShowGuide(true);
                  }
                }}
              >
                <i className="fa-brands fa-apple" />
                <span>{t('ios_shortcut_add_btn', 'Kəstirməni Əlavə Et')}</span>
              </a>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowGuide(!showGuide)}
                style={{ fontSize: '0.85rem' }}
              >
                <i className={`fa-solid ${showGuide ? 'fa-chevron-up' : 'fa-circle-play'}`} />
                {showGuide ? 'Tutorialı gizlə' : 'Video Tutorial'}
              </button>
            </div>

            {showGuide && (
              <motion.div
                className="shortcut-guide-box"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <h4>🎬 Kəstirmə Video Tutorialı:</h4>
                <div className="shortcut-video-wrapper">
                  <iframe
                    src="https://www.youtube.com/embed/i2aDnvtk92I?si=xOr1v63iepvyCebJ"
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

