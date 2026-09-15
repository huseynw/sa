import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const Header = () => {
  const { i18n } = useTranslation();
  const [theme, setTheme] = useState('dark');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 25);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      <div className="logo">
        <i className="fa-solid fa-bolt-lightning" />
        <span>HUSEVN</span>
      </div>

      <div className="header-right">
        <select
          className="select-clean"
          value={i18n.language}
          onChange={e => i18n.changeLanguage(e.target.value)}
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
  );
};

export default Header;
