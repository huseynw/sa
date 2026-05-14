import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const Header = () => {
  const { i18n } = useTranslation();
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const changeLanguage = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '20px 40px',
      position: 'relative',
      zIndex: 10
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '1.5rem',
        fontWeight: 'bold',
        color: 'var(--primary-color)'
      }}>
        <i className="fa-solid fa-cloud-arrow-down"></i>
        <span>HUSEVN</span>
      </div>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <select 
          className="select-premium" 
          value={i18n.language} 
          onChange={changeLanguage}
          style={{ width: '80px', padding: '8px 12px' }}
        >
          <option value="AZ">AZ</option>
          <option value="TR">TR</option>
          <option value="EN">EN</option>
          <option value="RU">RU</option>
        </select>

        <button 
          onClick={toggleTheme} 
          className="btn btn-secondary"
          style={{ width: '40px', height: '40px', padding: 0, borderRadius: '50%' }}
        >
          <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
        </button>
      </div>
    </header>
  );
};

export default Header;
