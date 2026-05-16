import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

function FeedbackForm() {
  const { t } = useTranslation();
  const [type, setType] = useState('suggestion');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus('loading');

    try {
      const res = await fetch('/.netlify/functions/send-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message }),
      });

      if (!res.ok) throw new Error('Network response was not ok');

      setStatus('success');
      setMessage('');
      setTimeout(() => setStatus('idle'), 5000);
    } catch (error) {
      console.error('Error sending feedback:', error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  return (
    <div className="feedback-container">
      <div className="feedback-header">
        <i className="fa-solid fa-comment-dots" />
        <div>
          <h3>{t('feedback_title')}</h3>
          <p>{t('feedback_desc')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="feedback-form">
        <div className="feedback-options">
          <label className={`feedback-radio ${type === 'suggestion' ? 'active' : ''}`}>
            <input
              type="radio"
              value="suggestion"
              checked={type === 'suggestion'}
              onChange={() => setType('suggestion')}
            />
            <i className="fa-regular fa-lightbulb" />
            {t('feedback_type_suggestion')}
          </label>
          <label className={`feedback-radio ${type === 'complaint' ? 'active' : ''}`}>
            <input
              type="radio"
              value="complaint"
              checked={type === 'complaint'}
              onChange={() => setType('complaint')}
            />
            <i className="fa-solid fa-triangle-exclamation" />
            {t('feedback_type_complaint')}
          </label>
        </div>

        <textarea
          className="feedback-textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('feedback_placeholder')}
          rows={4}
          required
        />

        <div className="feedback-footer">
          {status === 'success' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="feedback-status success">
              <i className="fa-solid fa-circle-check" /> {t('feedback_success')}
            </motion.div>
          )}
          {status === 'error' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="feedback-status error">
              <i className="fa-solid fa-circle-xmark" /> {t('feedback_error')}
            </motion.div>
          )}
          {status !== 'success' && status !== 'error' && <div />} {/* Spacer */}

          <button
            type="submit"
            className="feedback-submit-btn"
            disabled={status === 'loading' || !message.trim()}
          >
            {status === 'loading' ? (
              <span className="spinner" style={{ width: '16px', height: '16px' }} />
            ) : (
              <><i className="fa-regular fa-paper-plane" /> {t('feedback_submit')}</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default FeedbackForm;
