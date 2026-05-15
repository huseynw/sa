import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const Header = () => {
  const { i18n } = useTranslation();
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <header className="header">
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
