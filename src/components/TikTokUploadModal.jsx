import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { patchMp4, ENCODER_TAG, COMMENT_TAG } from '../utils/mp4Patcher';

export default function TikTokUploadModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('patcher'); // 'patcher' | 'guide'

  // Patcher states
  const [file, setFile] = useState(null);
  const [preset, setPreset] = useState('60fps'); // '60fps' | '120fps' | 'anticompress'
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, stage: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.mp4') && !selectedFile.type.includes('video')) {
      setError(t('tt_modal_err_mp4_only', 'Zəhmət olmasa yalnız MP4 video faylı seçin.'));
      return;
    }
    setError('');
    setResult(null);
    setFile(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleStartPatch = async () => {
    if (!file) return;
    setProcessing(true);
    setError('');
    setProgress({ percent: 5, stage: t('tt_modal_stage_start', 'Başlanılır...') });

    try {
      const res = await patchMp4(
        file,
        {
          preset,
          encoder: ENCODER_TAG,
          comment: COMMENT_TAG,
        },
        (prog) => setProgress(prog)
      );

      const blobUrl = URL.createObjectURL(res.blob);
      setResult({ ...res, url: blobUrl });

      // Automatically trigger download
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = res.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
      }, 2000);
    } catch (err) {
      console.error('Patch error:', err);
      setError(err.message || t('tt_modal_err_generic', 'Faylı emal edərkən xəta baş verdi.'));
    } finally {
      setProcessing(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <AnimatePresence>
      <div className="shortcut-modal-backdrop" onClick={onClose}>
        <motion.div
          className="shortcut-modal tt-upload-modal"
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {/* Modal Header */}
          <div className="shortcut-modal-header tt-modal-header">
            <div className="shortcut-header-title">
              <div className="tt-modal-badge">
                <i className="fa-brands fa-tiktok" />
              </div>
              <div>
                <div className="tt-modal-title-row">
                  <h3>{t('tt_modal_title', 'TikTok Studio Upload Metodu')}</h3>
                </div>
                <p className="shortcut-subtitle">
                  {t('tt_modal_sub', '60 / 120 FPS Bypass & FastStart Optimizer')}
                </p>
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

          {/* Modal Tabs */}
          <div className="tt-modal-tabs">
            <button
              type="button"
              className={`tt-tab-btn ${activeTab === 'patcher' ? 'active' : ''}`}
              onClick={() => setActiveTab('patcher')}
            >
              <i className="fa-solid fa-wand-magic-sparkles" />
              <span>{t('tt_tab_web_patcher', 'Brauzerdə Hazırla')}</span>
            </button>
            <button
              type="button"
              className={`tt-tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
              onClick={() => setActiveTab('guide')}
            >
              <i className="fa-solid fa-book-open" />
              <span>{t('tt_tab_guide', 'Yükləmə Qaydası')}</span>
            </button>
          </div>

          <div className="shortcut-modal-body tt-modal-body">
            {/* TAB 1: WEB PATCHER */}
            {activeTab === 'patcher' && (
              <div className="tt-patcher-section">
                <p className="shortcut-desc">
                  {t(
                    'tt_modal_patcher_desc',
                    'Faylınızı birbaşa brauzerinizdə dərhal FastStart containerə keçirir və husevndownloader.netlify.app encoder teqi ilə TikTok Studio üçün hazır edir.'
                  )}
                </p>

                {/* Dropzone */}
                {!file ? (
                  <div
                    className={`tt-dropzone ${isDragging ? 'dragover' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/mp4,video/*"
                      style={{ display: 'none' }}
                      onChange={(e) => handleFileSelect(e.target.files?.[0])}
                    />
                    <div className="tt-dropzone-icon">
                      <i className="fa-solid fa-cloud-arrow-up" />
                    </div>
                    <h4>{t('tt_drop_title', 'MP4 Videonuzu Bura Atın')}</h4>
                    <p>{t('tt_drop_hint', 'və ya cihazdan fayl seçmək üçün klikləyin')}</p>
                  </div>
                ) : (
                  <div className="tt-file-selected-box">
                    <div className="tt-file-info-row">
                      <div className="tt-file-icon">
                        <i className="fa-solid fa-file-video" />
                      </div>
                      <div className="tt-file-details">
                        <span className="tt-file-name" title={file.name}>{file.name}</span>
                        <span className="tt-file-size">{formatSize(file.size)}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-icon tt-file-remove"
                        onClick={() => { setFile(null); setResult(null); }}
                        disabled={processing}
                        title="Faylı dəyiş"
                      >
                        <i className="fa-solid fa-arrow-rotate-left" />
                      </button>
                    </div>

                    {/* Presets */}
                    <div className="tt-presets-group">
                      <label className="tt-preset-label">{t('tt_select_preset', 'Yüklənmə Metodu Rejimi:')}</label>
                      <div className="tt-preset-grid">
                        <div
                          className={`tt-preset-card ${preset === '60fps' ? 'active' : ''}`}
                          onClick={() => !processing && setPreset('60fps')}
                        >
                          <div className="tt-preset-header">
                            <span className="tt-preset-badge">60 FPS</span>
                            <span className="tt-preset-title">TikTok Studio 60 FPS</span>
                          </div>
                          <p className="tt-preset-desc">
                            {t('tt_preset_60_desc', 'x2 itsscale vaxt miqyası. TikTok-un 30 FPS həddini aşaraq axıcı 60 FPS hərəkəti saxlayır.')}
                          </p>
                        </div>

                        <div
                          className={`tt-preset-card ${preset === '120fps' ? 'active' : ''}`}
                          onClick={() => !processing && setPreset('120fps')}
                        >
                          <div className="tt-preset-header">
                            <span className="tt-preset-badge purple">120 FPS</span>
                            <span className="tt-preset-title">TikTok Studio 120 FPS</span>
                          </div>
                          <p className="tt-preset-desc">
                            {t('tt_preset_120_desc', 'x6 itsscale bypass. Xüsusi yüksək kadr tezlikli montajlar üçün ultra-axıcı rejim.')}
                          </p>
                        </div>

                        <div
                          className={`tt-preset-card ${preset === 'anticompress' ? 'active' : ''}`}
                          onClick={() => !processing && setPreset('anticompress')}
                        >
                          <div className="tt-preset-header">
                            <span className="tt-preset-badge green">FastStart</span>
                            <span className="tt-preset-title">Lossless FastStart</span>
                          </div>
                          <p className="tt-preset-desc">
                            {t('tt_preset_clean_desc', 'Kadrların vaxtına toxunmadan moov atomunu başa keçirir və husevndownloader encoder teqini daxil edir.')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Tag preview box */}
                    <div className="tt-tag-preview-box">
                      <div className="tt-tag-row">
                        <span className="tt-tag-key"><i className="fa-solid fa-code" /> Encoder Tag:</span>
                        <span className="tt-tag-val">husevndownloader.netlify.app</span>
                      </div>
                      <div className="tt-tag-row">
                        <span className="tt-tag-key"><i className="fa-solid fa-tag" /> Method Comment:</span>
                        <span className="tt-tag-val">Patched by husevndownloader.netlify.app</span>
                      </div>
                      <div className="tt-tag-row">
                        <span className="tt-tag-key"><i className="fa-solid fa-bolt" /> FastStart:</span>
                        <span className="tt-tag-val text-green">Aktiv (moov atomu faylın başında)</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {processing && (
                      <div className="tt-progress-container">
                        <div className="tt-progress-bar-wrap">
                          <div
                            className="tt-progress-bar-fill"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                        <div className="tt-progress-status">
                          <span>{progress.stage}</span>
                          <span>{progress.percent}%</span>
                        </div>
                      </div>
                    )}

                    {/* Success message */}
                    {result && !processing && (
                      <div className="tt-success-box">
                        <div className="tt-success-icon">
                          <i className="fa-solid fa-circle-check" />
                        </div>
                        <div>
                          <h4>{t('tt_success_title', 'Video Uğurla Patch Olundu!')}</h4>
                          <p>
                            {t(
                              'tt_success_desc',
                              'Fayl avtomatik endirildi. İndi bu videonu TikTok Studio (PC brauzeri) vasitəsilə yükləyin.'
                            )}
                          </p>
                          <a
                            href={result.url}
                            download={result.name}
                            className="btn btn-download-again"
                          >
                            <i className="fa-solid fa-download" /> {t('tt_btn_download_again', 'Yenidən Endir')} ({formatSize(result.size)})
                          </a>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="tt-error-box">
                        <i className="fa-solid fa-triangle-exclamation" />
                        <span>{error}</span>
                      </div>
                    )}

                    {/* Action Button */}
                    {!result && (
                      <button
                        type="button"
                        className="btn btn-tt-primary"
                        onClick={handleStartPatch}
                        disabled={processing}
                      >
                        {processing ? (
                          <>
                            <span className="spinner" />
                            <span>{t('tt_btn_processing', 'Emal Edilir...')}</span>
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-wand-magic-sparkles" />
                            <span>{t('tt_btn_patch', 'Videonuzu Hazırla və Yüklə')}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: GUIDE WITH VERTICAL VIDEO CONTAINER */}
            {activeTab === 'guide' && (
              <div className="tt-guide-section">
                {/* Vertical 9:16 Video Player Container for tuto.mp4 */}
                <div className="tt-guide-video-wrapper">
                  <div className="tt-vertical-video-box">
                    <video
                      src="/tuto.mp4"
                      controls
                      playsInline
                      preload="metadata"
                      className="tt-vertical-video-player"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const ph = e.currentTarget.parentElement?.querySelector('.tt-video-placeholder');
                        if (ph) ph.style.display = 'flex';
                      }}
                      onLoadedData={(e) => {
                        e.currentTarget.style.display = 'block';
                        const ph = e.currentTarget.parentElement?.querySelector('.tt-video-placeholder');
                        if (ph) ph.style.display = 'none';
                      }}
                    />
                    <div className="tt-video-placeholder">
                      <div className="tt-placeholder-icon">
                        <i className="fa-solid fa-play" />
                      </div>
                      <span className="tt-placeholder-title">tuto.mp4</span>
                      <span className="tt-placeholder-text">
                        {t('tt_video_placeholder_hint', 'Video yükləndikdə avtomatik burada göstəriləcək')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="tt-guide-step">
                  <div className="tt-step-num">1</div>
                  <div className="tt-step-content">
                    <h4>{t('tt_step1_title', 'Video Export Ayarları (Montaj Proqramında)')}</h4>
                    <p>
                      Videonuzu montajdan çıxararkən aşağıdakı parametrləri seçin:
                    </p>
                    <ul className="tt-guide-list">
                      <li><strong>Resolution:</strong> 1080×1920 (9:16 Dikey)</li>
                      <li><strong>Format / Codec:</strong> MP4 / H.264 (AVC)</li>
                      <li><strong>Bitrate:</strong> 20 Mbps – 30 Mbps CBR (Constant Bitrate)</li>
                      <li><strong>Profile:</strong> High Profile, Level 4.2 / 5.1</li>
                    </ul>
                  </div>
                </div>

                <div className="tt-guide-step">
                  <div className="tt-step-num">2</div>
                  <div className="tt-step-content">
                    <h4>{t('tt_step2_title', 'Metod ilə Videonu Patch Edin')}</h4>
                    <p>
                      Export olunmuş videonu saytımızın <strong>Brauzerdə Hazırla</strong> bölməsinə atın. Bu zaman fayl FastStart containerə çevrilir və <code>husevndownloader.netlify.app</code> encoder metadatası əlavə olunur.
                    </p>
                  </div>
                </div>

                <div className="tt-guide-step">
                  <div className="tt-step-num">3</div>
                  <div className="tt-step-content">
                    <h4>{t('tt_step3_title', 'TikTok Studio Veb İnterfeysi ilə Yükləyin')}</h4>
                    <p>
                      <strong>Vacib Qayda:</strong> Videonu telefonun standart TikTok tətbiqindən YÜKLƏMƏYİN! Telefon tətbiqi yükləyərkən videonu sıxır.
                    </p>
                    <div className="tt-guide-callout">
                      <p>
                        <strong>Kompüterdə:</strong> Brauzerdə <a href="https://www.tiktok.com/tiktokstudio/upload" target="_blank" rel="noopener noreferrer">tiktok.com/tiktokstudio/upload</a> ünvanına girib patch olunmuş videonu seçin.
                      </p>
                      <p>
                        <strong>Telefonda:</strong> Kiwi Browser və ya Chrome-da "Desktop Site" (Kompüter versiyası) rejimini aktiv edib TikTok Studio-ya daxil olun.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="tt-guide-step">
                  <div className="tt-step-num">4</div>
                  <div className="tt-step-content">
                    <h4>{t('tt_step4_title', 'Keyfiyyətin və Metodun Təsdiqi')}</h4>
                    <p>
                      TikTok videonu təxminən 5–15 dəqiqə ərzində emal edir. Saytımızda linki yapışdırdıqda <strong>Yüklənmə Metodu</strong> teqi avtomatik olaraq <code>husevndownloader.netlify.app</code> kimi görünəcək və video maksimum keyfiyyətdə nümayiş olunacaq!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
