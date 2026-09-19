import React from 'react';
import { motion } from 'framer-motion';

const platforms = [
  { key: 'yt',  icon: 'fa-brands fa-youtube',   label: 'YouTube',   cls: 'pc-yt' },
  { key: 'tt',  icon: 'fa-brands fa-tiktok',     label: 'TikTok',    cls: 'pc-tt' },
  { key: 'ig',  icon: 'fa-brands fa-instagram',  label: 'Instagram', cls: 'pc-ig' },
  { key: 'pi',  icon: 'fa-brands fa-pinterest',  label: 'Pinterest', cls: 'pc-pi' },
  { key: 'fb',  icon: 'fa-brands fa-facebook',   label: 'Facebook',  cls: 'pc-fb' },
];

const PlatformIcons = () => (
  <motion.div
    className="platforms"
    initial="hidden"
    animate="show"
    variants={{ show: { transition: { staggerChildren: 0.08 } } }}
  >
    {platforms.map(p => (
      <motion.div
        key={p.key}
        className={`platform-card ${p.cls}`}
        variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 300 }}
      >
        <i className={p.icon} />
        <span>{p.label}</span>
      </motion.div>
    ))}
  </motion.div>
);

export default PlatformIcons;
