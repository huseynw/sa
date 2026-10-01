import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { patchMp4, probeMp4Metadata, ENCODER_TAG, COMMENT_TAG } from '../utils/mp4Patcher';

export default function TikTokUploadModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('patcher'); // 'patcher' | 'guide'

  // Live statistics state
  const [statsCount, setStatsCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          const count = d.tiktokMethodCount || d.platformDownloads?.tiktok_method || 0;
          setStatsCount(count);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Patcher states
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [preset, setPreset] = useState('husevn'); // 'husevn' | 'faststart'
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, stage: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Clean up object URL when component unmounts or previewUrl changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Clean up states when modal is closed
  useEffect(() => {
    if (!isOpen) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setFile(null);
      setResult(null);
      setMeta(null);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    // Detect if the file is a video (handles iOS Safari Photos picker quirks where type can be empty or video/quicktime)
    const name = (selectedFile.name || '').toLowerCase();
    const type = (selectedFile.type || '').toLowerCase();
    const isVideoExt = /\.(mp4|mov|m4v|qt|webm|mkv|avi|3gp)$/i.test(name);
    const isVideoMime = type.startsWith('video/') || type.includes('quicktime');
    const isLikelyVideo = isVideoMime || isVideoExt || (type === '' && selectedFile.size > 0) || type === 'application/octet-stream';
    const isImage = type.startsWith('image/') && !type.includes('quicktime');

    if (isImage || !isLikelyVideo) {
      setError(t('tt_modal_err_mp4_only', 'Zəhmət olmasa video faylı seçin (MP4 / MOV).'));
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const newPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(newPreviewUrl);

    setError('');
    setResult(null);
    setFile(selectedFile);
    setMeta(null);
    setMetaLoading(true);

    // 1. Binary MP4 header probe
    probeMp4Metadata(selectedFile)
      .then((m) => {
        if (m) {
          setMeta((prev) => ({ ...prev, ...m }));
        }
        setMetaLoading(false);
      })
      .catch(() => {
        setMetaLoading(false);
      });

    // 2. HTML5 video metadata probe fallback (iOS Safari safe)
    try {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');

      v.onloadedmetadata = () => {
        setMeta((prev) => ({
          ...prev,
          width: prev?.width || v.videoWidth,
          height: prev?.height || v.videoHeight,
          duration: prev?.duration || Math.round(v.duration * 10) / 10,
        }));
        setMetaLoading(false);
      };
      v.onerror = () => {
        setMetaLoading(false);
      };
      v.src = newPreviewUrl;
      v.load();

      // Fallback timeout to ensure spinner never stays stuck on iOS
      setTimeout(() => {
        setMetaLoading(false);
      }, 3000);
    } catch {
      setMetaLoading(false);
    }
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

      // Record TikTok method statistic
      setStatsCount((prev) => prev + 1);
      fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tiktok_method', platform: 'tiktok_method' }),
        keepalive: true,
      }).catch(() => {});
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
                  {statsCount > 0 && (
                    <span className="tt-stats-pill" title={t('tt_stats_label', 'Bu metodla hazırlanan videolar:') + ' ' + statsCount}>
                      <i className="fa-solid fa-bolt" /> {statsCount} video
                    </span>
                  )}
                </div>
                <p className="shortcut-subtitle">
                  {t('tt_modal_sub', 'HUSEVN 120 FPS Method & FastStart Optimizer')}
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
                    'HUSEVN 120 FPS metodunu (husevndownloader.netlify.app) birbaşa cihazınızda tətbiq edir. Video kadrlarına və sürətinə toxunmur, audio sample cədvəli və mvhd optimizasiyası ilə TikTok-un ən yüksək keyfiyyət kanalını işə salır.'
                  )}
                </p>

                {/* Live Counter Banner */}
                <div className="tt-stats-counter-banner">
                  <div className="tt-stats-counter-icon">
                    <i className="fa-solid fa-bolt-lightning" />
                  </div>
                  <div className="tt-stats-counter-text">
                    <span className="tt-stats-counter-label">{t('tt_stats_label', 'Bu metodla hazırlanan videolar:')}</span>
                    <strong className="tt-stats-counter-num">{statsCount}</strong>
                  </div>
                </div>

                {/* Dropzone */}
                {!file ? (
                  <div className="tt-dropzone-wrapper">
                    {error && (
                      <div className="tt-error-box" style={{ marginBottom: '14px' }}>
                        <i className="fa-solid fa-triangle-exclamation" />
                        <span>{error}</span>
                      </div>
                    )}
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
                        accept="video/*,video/mp4,video/quicktime,.mp4,.mov,.m4v"
                        className="tt-file-input-overlay"
                        onClick={(e) => { e.target.value = ''; }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) handleFileSelect(f);
                        }}
                      />
                      <div className="tt-dropzone-icon">
                        <i className="fa-solid fa-cloud-arrow-up" />
                      </div>
                      <h4>{t('tt_drop_title', 'MP4 Videonuzu Bura Atın')}</h4>
                      <p>{t('tt_drop_hint', 'və ya cihazdan fayl seçmək üçün klikləyin')}</p>
                    </div>
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
                        onClick={() => {
                          if (previewUrl) {
                            URL.revokeObjectURL(previewUrl);
                            setPreviewUrl(null);
                          }
                          setFile(null);
                          setResult(null);
                          setMeta(null);
                        }}
                        disabled={processing}
                        title="Faylı dəyiş"
                      >
                        <i className="fa-solid fa-arrow-rotate-left" />
                      </button>
                    </div>

                    {/* Video Preview */}
                    {(result?.url || previewUrl) && (
                      <div className="tt-preview-container">
                        <div className="tt-preview-box">
                          <video
                            key={result?.url || previewUrl}
                            src={result?.url || previewUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="tt-preview-video"
                          />
                          <div className={`tt-preview-badge ${result?.url ? 'patched' : ''}`}>
                            <i className={result?.url ? 'fa-solid fa-bolt-lightning text-green' : 'fa-solid fa-circle-play'} />
                            <span>
                              {result?.url
                                ? t('tt_preview_patched', 'Hazırlanmış Video (120 FPS)')
                                : t('tt_preview_badge', 'Video Önizləmə')}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Diagnostics Card */}
                    {(meta || metaLoading) && (
                      <div className="tt-meta-card">
                        <div className="tt-meta-header">
                          <i className="fa-solid fa-bolt text-cyan" />
                          <span>{t('tt_meta_title', 'Video Diaqnostikası')}</span>
                          {metaLoading && <span className="spinner spinner-sm" />}
                        </div>
                        {meta && (
                          <>
                            <div className="tt-meta-grid">
                              <div className="tt-meta-item">
                                <span className="tt-meta-lbl">{t('tt_meta_res', 'Rezolyusiya')}</span>
                                <span className="tt-meta-val">
                                  {meta.width && meta.height ? `${meta.width} × ${meta.height}` : '1080 × 1920'}
                                </span>
                              </div>
                              <div className="tt-meta-item">
                                <span className="tt-meta-lbl">{t('tt_meta_fps', 'Kadr Tezliyi')}</span>
                                <span className={`tt-meta-val ${meta.fps && meta.fps >= 50 ? 'text-green font-bold' : ''}`}>
                                  {meta.fps ? `${meta.fps} FPS` : '60 FPS'}
                                </span>
                              </div>
                              <div className="tt-meta-item">
                                <span className="tt-meta-lbl">{t('tt_meta_dur', 'Müddət')}</span>
                                <span className="tt-meta-val">
                                  {meta.duration ? `${meta.duration} san` : '-'}
                                </span>
                              </div>
                              <div className="tt-meta-item">
                                <span className="tt-meta-lbl">{t('tt_meta_bitrate', 'Bitrate')}</span>
                                <span className="tt-meta-val">
                                  {meta.bitrate ? `${meta.bitrate} Mbps` : '-'}
                                </span>
                              </div>
                            </div>

                            {meta.fps && meta.fps >= 50 ? (
                              <div className="tt-meta-alert good">
                                <i className="fa-solid fa-circle-check" />
                                <span>{t('tt_meta_fps_good', '60 FPS aşkarlandı. Metodumuz TikTok-un videonu 30-a salmasının qarşısını alır.')}</span>
                              </div>
                            ) : meta.fps ? (
                              <div className="tt-meta-alert warn">
                                <i className="fa-solid fa-circle-info" />
                                <span>
                                  {t(
                                    'tt_meta_fps_warn',
                                    `Məlumat: Videonuz ${meta.fps} FPS-dir. Əsl 60 FPS axıcılığı üçün videonuzu CapCut və ya Premiere-də 60 FPS olaraq export edin.`
                                  ).replace('{fps}', meta.fps)}
                                </span>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    )}

                    {/* Presets */}
                    <div className="tt-presets-group">
                      <label className="tt-preset-label">{t('tt_select_preset', 'Yüklənmə Metodu Rejimi:')}</label>
                      <div className="tt-preset-grid two-col">
                        <div
                          className={`tt-preset-card ${preset === 'husevn' || preset === 'parsmazi' ? 'active' : ''}`}
                          onClick={() => !processing && setPreset('husevn')}
                        >
                          <div className="tt-preset-header">
                            <span className="tt-preset-badge">120 FPS</span>
                            <span className="tt-preset-title">{t('tt_preset_husevn_title', 'HUSEVN 120 FPS Method (Tövsiyə olunur)')}</span>
                          </div>
                          <p className="tt-preset-desc">
                            {t(
                              'tt_preset_husevn_desc',
                              'HUSEVN metodu (husevndownloader.netlify.app): Video kadrları və 60/120 FPS axıcılığı 100% toxunulmaz qalır (kəsilmə və ya yavaşlama olmur). Audio sample cədvəli 10× genişləndirilir və mvhd naməlum edilir ki, TikTok videonu sıxmadan ən yüksək keyfiyyətlə emal etsin.'
                            )}
                          </p>
                        </div>

                        <div
                          className={`tt-preset-card ${preset === 'faststart' ? 'active' : ''}`}
                          onClick={() => !processing && setPreset('faststart')}
                        >
                          <div className="tt-preset-header">
                            <span className="tt-preset-badge green">FastStart</span>
                            <span className="tt-preset-title">{t('tt_preset_faststart_title', 'Lossless FastStart')}</span>
                          </div>
                          <p className="tt-preset-desc">
                            {t(
                              'tt_preset_faststart_desc',
                              'Videonun daxili kadrlarına toxunmadan faylı veb və TikTok üçün anında açılan FastStart formatına keçirir və teqləyir.'
                            )}
                          </p>
                        </div>
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
                          <div className="tt-success-stats-badge">
                            <i className="fa-solid fa-bolt-lightning" />
                            <span>{t('tt_stats_label', 'Bu metodla hazırlanan videolar:')} <strong>{statsCount}</strong></span>
                          </div>
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
                      onLoadedMetadata={(e) => {
                        e.currentTarget.style.display = 'block';
                        const ph = e.currentTarget.parentElement?.querySelector('.tt-video-placeholder');
                        if (ph) ph.style.display = 'none';
                      }}
                      onCanPlay={(e) => {
                        e.currentTarget.style.display = 'block';
                        const ph = e.currentTarget.parentElement?.querySelector('.tt-video-placeholder');
                        if (ph) ph.style.display = 'none';
                      }}
                      onLoadedData={(e) => {
                        e.currentTarget.style.display = 'block';
                        const ph = e.currentTarget.parentElement?.querySelector('.tt-video-placeholder');
                        if (ph) ph.style.display = 'none';
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const ph = e.currentTarget.parentElement?.querySelector('.tt-video-placeholder');
                        if (ph) ph.style.display = 'flex';
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
                      Videonuzu montajdan (CapCut, Premiere Pro, After Effects) çıxararkən aşağıdakı parametrləri seçin:
                    </p>
                    <ul className="tt-guide-list">
                      <li><strong>Resolution:</strong> 1080×1920 (9:16 Dikey)</li>
                      <li><strong>Frame Rate:</strong> 60 FPS (Hərəkət axıcılığı üçün mütləq 60 seçin)</li>
                      <li><strong>Format / Codec:</strong> MP4 / H.264 (AVC)</li>
                      <li><strong>Bitrate:</strong> 15 Mbps – 25 Mbps CBR (Constant Bitrate)</li>
                    </ul>
                  </div>
                </div>

                <div className="tt-guide-step">
                  <div className="tt-step-num">2</div>
                  <div className="tt-step-content">
                    <h4>{t('tt_step2_title', 'Metod ilə Videonu Patch Edin')}</h4>
                    <p>
                      Export olunmuş videonu saytımızın <strong>Brauzerdə Hazırla</strong> bölməsinə atın. Bu zaman fayl kadrlarına və müddətinə heç bir zərər dəymədən dərhal FastStart containerə çevrilir və <code>husevndownloader.netlify.app</code> encoder metadatası daxil edilir.
                    </p>
                  </div>
                </div>

                <div className="tt-guide-step">
                  <div className="tt-step-num">3</div>
                  <div className="tt-step-content">
                    <h4>{t('tt_step3_title', 'TikTok Studio Veb İnterfeysi ilə Yükləyin (Əsas Qayda)')}</h4>
                    <p>
                      <strong>Vacib Şərt:</strong> Videonu telefonun standart TikTok tətbiqindən YÜKLƏMƏYİN! Mobil tətbiq yükləmə zamanı videonu öz daxilində sıxır və 30 FPS-ə salır.
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
                      Saytımızda TikTok videosunun linkini axtarışa verdikdə <strong>Yüklənmə Metodu</strong> sütununda avtomatik olaraq <code>husevndownloader.netlify.app</code> görünəcək və video orijinal 60 FPS axıcılığında olacaq!
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
