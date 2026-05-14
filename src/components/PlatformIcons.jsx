import React from 'react';
import { motion } from 'framer-motion';

const PlatformIcons = () => {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '30px', 
        marginTop: '30px',
        marginBottom: '40px'
      }}
    >
      <motion.i variants={item} className="fa-brands fa-youtube platform-icon youtube" title="YouTube"></motion.i>
      <motion.i variants={item} className="fa-brands fa-tiktok platform-icon tiktok" title="TikTok"></motion.i>
      <motion.i variants={item} className="fa-brands fa-instagram platform-icon instagram" title="Instagram"></motion.i>
      <motion.i variants={item} className="fa-brands fa-pinterest platform-icon pinterest" title="Pinterest"></motion.i>
      <motion.i variants={item} className="fa-brands fa-facebook platform-icon facebook" title="Facebook"></motion.i>
    </motion.div>
  );
};

export default PlatformIcons;
