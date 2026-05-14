import React, { useState } from 'react';
import Header from './components/Header';
import SearchBox from './components/SearchBox';
import PlatformIcons from './components/PlatformIcons';
import ResultCard from './components/ResultCard';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [currentUrl, setCurrentUrl] = useState('');

  const handleSearch = async (url) => {
    try {
      setLoading(true);
      setResult(null);
      setCurrentUrl(url);

      const res = await fetch('/.netlify/functions/fetch-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await res.json();
      
      if (data.status === 'error') {
        alert(data.text || 'Error fetching data');
      } else {
        setResult(data);
      }
    } catch (error) {
      console.error(error);
      alert('Network or Server Error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 20px',
        paddingTop: '80px',
        position: 'relative',
        zIndex: 1
      }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ textAlign: 'center', marginBottom: '40px' }}
        >
          <h1 style={{ fontSize: '3rem', fontWeight: 700, marginBottom: '16px' }}>
            Download Any Media
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
            Fast, secure, and free. Download high-quality videos, audio, and images from your favorite platforms.
          </p>
        </motion.div>

        <SearchBox onSearch={handleSearch} loading={loading} />
        
        <PlatformIcons />

        <AnimatePresence>
          {result && (
            <ResultCard result={result} url={currentUrl} />
          )}
        </AnimatePresence>
      </main>

      {/* Decorative Background Elements */}
      <div style={{
        position: 'fixed',
        top: '-20%',
        left: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%',
        zIndex: 0,
        pointerEvents: 'none'
      }}></div>
      <div style={{
        position: 'fixed',
        bottom: '-20%',
        right: '-10%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, rgba(0,0,0,0) 70%)',
        borderRadius: '50%',
        zIndex: 0,
        pointerEvents: 'none'
      }}></div>
    </>
  );
}

export default App;
