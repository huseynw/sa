import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok', icon: 'fa-brands fa-tiktok', color: '#00f2fe' },
  { id: 'instagram', name: 'Instagram', icon: 'fa-brands fa-instagram', color: '#E1306C' },
  { id: 'youtube', name: 'YouTube', icon: 'fa-brands fa-youtube', color: '#FF0000' },
  { id: 'spotify', name: 'Spotify', icon: 'fa-brands fa-spotify', color: '#1DB954' },
  { id: 'soundcloud', name: 'SoundCloud', icon: 'fa-brands fa-soundcloud', color: '#ff5500' },
  { id: 'pinterest', name: 'Pinterest', icon: 'fa-brands fa-pinterest', color: '#E60023' },
  { id: 'general', name: 'Ümumi / Sayt', i18nKey: 'feedback_platform_general', icon: 'fa-solid fa-globe', color: '#818cf8' },
  { id: 'other', name: 'Digər', i18nKey: 'feedback_platform_other', icon: 'fa-solid fa-ellipsis', color: '#94a3b8' },
];

const CONTACT_METHODS = [
  {
    id: 'telegram',
    label: 'Telegram',
    icon: 'fa-brands fa-telegram',
    color: '#229ED9',
    placeholderKey: 'feedback_contact_ph_telegram',
    fallbackPlaceholder: 'məsələn: @istifadeci_adi',
    prefix: '@',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: 'fa-brands fa-whatsapp',
    color: '#25D366',
    placeholderKey: 'feedback_contact_ph_whatsapp',
    fallbackPlaceholder: 'məsələn: +994 50 123 45 67',
    prefix: '+',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: 'fa-brands fa-instagram',
    color: '#E1306C',
    placeholderKey: 'feedback_contact_ph_instagram',
    fallbackPlaceholder: 'məsələn: @istifadeci_adi',
    prefix: '@',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: 'fa-brands fa-tiktok',
    color: '#00f2fe',
    placeholderKey: 'feedback_contact_ph_tiktok',
    fallbackPlaceholder: 'məsələn: @istifadeci_adi',
    prefix: '@',
  },
  {
    id: 'other',
    label: 'Digər',
    icon: 'fa-solid fa-at',
    color: '#94a3b8',
    placeholderKey: 'feedback_contact_ph_other',
    fallbackPlaceholder: 'Nömrə, email və ya profil linki',
    prefix: '',
  },
];

function FeedbackForm() {
  const { t } = useTranslation();
  const [type, setType] = useState('complaint'); // 'complaint' | 'suggestion'
  const [platform, setPlatform] = useState('tiktok');
  const [contactMethod, setContactMethod] = useState('telegram');
  const [contactValue, setContactValue] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error

  const currentContactConfig =
    CONTACT_METHODS.find((m) => m.id === contactMethod) || CONTACT_METHODS[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus('loading');

    try {
      const res = await fetch('/.netlify/functions/send-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          platform,
          contactMethod,
          contactValue: contactValue.trim(),
          message: message.trim(),
        }),
      });

      if (!res.ok) throw new Error('Network response was not ok');

      setStatus('success');
      setMessage('');
      setContactValue('');
      setTimeout(() => setStatus('idle'), 6000);
    } catch (error) {
      console.error('Error sending feedback:', error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 6000);
    }
  };

  return (
    <div className="feedback-container">
      {/* Header */}
      <div className="feedback-header">
        <i className="fa-solid fa-headset" />
        <div>
          <h3>{t('feedback_title', 'Şikayət və Təkliflər')}</h3>
          <p>{t('feedback_desc', 'Fikriniz var və ya xəta tapdınız? Bizə bildirin!')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="feedback-form">
        {/* Type Selector (Complaint vs Suggestion) */}
        <div className="feedback-options">
          <label className={`feedback-radio ${type === 'complaint' ? 'active complaint' : ''}`}>
            <input
              type="radio"
              value="complaint"
              checked={type === 'complaint'}
              onChange={() => setType('complaint')}
            />
            <i className="fa-solid fa-triangle-exclamation" />
            <span>{t('feedback_type_complaint', 'Şikayət / Xəta')}</span>
          </label>
          <label className={`feedback-radio ${type === 'suggestion' ? 'active suggestion' : ''}`}>
            <input
              type="radio"
              value="suggestion"
              checked={type === 'suggestion'}
              onChange={() => setType('suggestion')}
            />
            <i className="fa-regular fa-lightbulb" />
            <span>{t('feedback_type_suggestion', 'Təklif / İdeya')}</span>
          </label>
        </div>

        {/* Platform Selection */}
        <div className="feedback-field-group">
          <div className="feedback-field-label">
            <i className="fa-solid fa-layer-group" />
            <span>{t('feedback_platform_label', 'Hansı platforma ilə bağlıdır?')}</span>
          </div>
          <div className="feedback-platforms-grid">
            {PLATFORMS.map((plat) => {
              const isSelected = platform === plat.id;
              const displayName = plat.i18nKey ? t(plat.i18nKey, plat.name) : plat.name;
              return (
                <button
                  type="button"
                  key={plat.id}
                  className={`feedback-platform-chip ${isSelected ? 'active' : ''}`}
                  onClick={() => setPlatform(plat.id)}
                >
                  <i className={plat.icon} style={{ color: isSelected ? '#fff' : plat.color }} />
                  <span>{displayName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contact Method & Info */}
        <div className="feedback-field-group">
          <div className="feedback-field-label">
            <i className="fa-solid fa-address-book" />
            <span>{t('feedback_contact_label', 'Əlaqə vasitəniz (cavab verməyimiz üçün, istəyə görə):')}</span>
          </div>

          {/* Contact Method Selector */}
          <div className="feedback-contact-methods">
            {CONTACT_METHODS.map((method) => {
              const isSelected = contactMethod === method.id;
              return (
                <button
                  type="button"
                  key={method.id}
                  className={`feedback-contact-method-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => setContactMethod(method.id)}
                >
                  <i className={method.icon} style={{ color: isSelected ? '#fff' : method.color }} />
                  <span>{method.label}</span>
                </button>
              );
            })}
          </div>

          {/* Contact Value Input Field */}
          <div className="feedback-contact-input-wrap">
            <div className="feedback-contact-input-icon">
              <i className={currentContactConfig.icon} style={{ color: currentContactConfig.color }} />
            </div>
            <input
              type="text"
              className="feedback-contact-input"
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
              placeholder={t(currentContactConfig.placeholderKey, currentContactConfig.fallbackPlaceholder)}
              maxLength={100}
            />
          </div>
        </div>

        {/* Message Textarea */}
        <div className="feedback-field-group">
          <div className="feedback-field-label">
            <i className="fa-solid fa-pen-to-square" />
            <span>{t('feedback_message_label', 'Müraciət mətni:')}</span>
            <span className="feedback-char-count">{message.length}/1000</span>
          </div>
          <textarea
            className="feedback-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              type === 'complaint'
                ? t(
                    'feedback_placeholder_complaint',
                    'Xətanı və ya problemi ətraflı təsvir edin (məs: video yüklənmir, səs açılmır və s.)...'
                  )
                : t(
                    'feedback_placeholder_suggestion',
                    'Təklif və ya ideyanızı yazın (məs: yeni funksiya, dizayn, yeni platforma)...'
                  )
            }
            rows={4}
            maxLength={1000}
            required
          />
        </div>

        {/* Footer & Submit */}
        <div className="feedback-footer">
          <AnimatePresence mode="wait">
            {status === 'success' && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="feedback-status success"
              >
                <i className="fa-solid fa-circle-check" />
                <span>{t('feedback_success', 'Təşəkkürlər! Müraciətiniz qeydə alındı və göndərildi.')}</span>
              </motion.div>
            )}
            {status === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="feedback-status error"
              >
                <i className="fa-solid fa-circle-xmark" />
                <span>{t('feedback_error', 'Göndərilərkən xəta baş verdi. Yenidən cəhd edin.')}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {status !== 'success' && status !== 'error' && <div />}

          <button
            type="submit"
            className="feedback-submit-btn"
            disabled={status === 'loading' || !message.trim()}
          >
            {status === 'loading' ? (
              <>
                <span className="spinner" style={{ width: '16px', height: '16px' }} />
                <span>{t('feedback_sending', 'Göndərilir...')}</span>
              </>
            ) : (
              <>
                <i className="fa-regular fa-paper-plane" />
                <span>{t('feedback_submit', 'Mesajı Göndər')}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FeedbackForm;
