import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ShortcutModal from './ShortcutModal';

const Header = () => {
  const { i18n, t } = useTranslation();
  const [theme, setTheme] = useState('dark');
  const [scrolled, setScrolled] = useState(false);
  const [showShortcut, setShowShortcut] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    let ticking = false;
    let isScrolled = false;

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const next = window.scrollY > 25;
          if (next !== isScrolled) {
            isScrolled = next;
            setScrolled(next);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <>
      <header className={`header ${scrolled ? 'scrolled' : ''}`}>
        <div className="logo">
          <i className="fa-solid fa-bolt-lightning" />
          <span>HUSEVN</span>
        </div>

        <div className="header-right">
          <button
            type="button"
            onClick={() => setShowShortcut(true)}
            className="btn-shortcut-header"
            title="iPhone Kəstirməsi"
          >
            <i className="fa-brands fa-apple" />
            <span>{t('ios_shortcut_btn', 'Kəstirmə')}</span>
          </button>

          <select
            className="select-clean"
            value={(i18n.language || 'AZ').toUpperCase()}
            onChange={e => {
              const lang = e.target.value;
              i18n.changeLanguage(lang);
              try {
                localStorage.setItem('user_lang', lang);
              } catch {}
            }}
          >
            <option value="AZ">🇦🇿 AZ</option>
            <option value="TR">🇹🇷 TR</option>
            <option value="EN">🇬🇧 EN</option>
            <option value="RU">🇷🇺 RU</option>
          </select>

          <button
            onClick={toggleTheme}
            className="btn btn-icon"
            title="Toggle theme"
          >
            <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
          </button>
        </div>
      </header>

      <ShortcutModal isOpen={showShortcut} onClose={() => setShowShortcut(false)} />
    </>
  );
};

export default Header;

