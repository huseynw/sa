import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import i18nConfig from './i18n';

i18n
  .use(initReactI18next)
  .init(i18nConfig);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
