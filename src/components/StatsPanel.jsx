import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/* ── Animated counter hook ── */
function useCountUp(target, duration = 2000, start = false) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);
  const startTimeRef = useRef(null);
  const prevTargetRef = useRef(0);

  useEffect(() => {
    if (!start) return;
    cancelAnimationFrame(frameRef.current);
    startTimeRef.current = null;
    const from = prevTargetRef.current;
    const to = target;

    if (to === from) { setValue(to); return; }

    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(from + eased * (to - from)));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setValue(to);
        prevTargetRef.current = to;
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration, start]);

  return value;
}


/* ── Format large numbers ── */
function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

/* ── Single stat card ── */
function StatCard({ icon, label, value, color, delay, started }) {
  const animated = useCountUp(value, 2200, started);
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      style={{ '--stat-color': color }}
    >
      <div className="stat-icon-wrap">
        <i className={icon} />
      </div>
      <div className="stat-value">{formatNumber(animated)}</div>
      <div className="stat-label">{label}</div>
    </motion.div>
  );
}

/* ── Platform row ── */
function PlatformRow({ icon, label, value, color, maxVal, delay, started }) {
  const animated = useCountUp(value, 2000, started);
  const pct = maxVal > 0 ? Math.round((value / maxVal) * 100) : 0;
  const animatedPct = maxVal > 0 ? Math.round((animated / maxVal) * 100) : 0;

  return (
    <motion.div
      className="platform-stat-row"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay }}
    >
      <div className="psr-left">
        <i className={icon} style={{ color }} />
        <span className="psr-name">{label}</span>
      </div>
      <div className="psr-bar-wrap">
        <div className="psr-bar-track">
          <div
            className="psr-bar-fill"
            style={{ width: `${animatedPct}%`, background: color }}
          />
        </div>
      </div>
      <div className="psr-count" style={{ color }}>{formatNumber(animated)}</div>
    </motion.div>
  );
}

/* ── Main StatsPanel ── */
const PLATFORM_META = [
  { id: 'youtube',   label: 'YouTube',   icon: 'fa-brands fa-youtube',   color: '#ff4444' },
  { id: 'tiktok',    label: 'TikTok',    icon: 'fa-brands fa-tiktok',    color: '#69c9d0' },
  { id: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram', color: '#dd2a7b' },
  { id: 'pinterest', label: 'Pinterest', icon: 'fa-brands fa-pinterest', color: '#e60023' },
  { id: 'facebook',  label: 'Facebook',  icon: 'fa-brands fa-facebook',  color: '#1877f2' },
];

export default function StatsPanel() {
  const [stats, setStats] = useState({
    totalVisits: 0,
    totalDownloads: 0,
    platformDownloads: { youtube: 0, tiktok: 0, instagram: 0, pinterest: 0, facebook: 0 },
  });
  const [started, setStarted] = useState(false);
  const panelRef = useRef(null);

  /* Fetch stats once on mount */
  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => { if (d && !d.error) setStats(d); })
      .catch(() => {}); // stays at zeros if unreachable (local dev)
  }, []);

  /* Start animation when panel enters viewport — independent of stats loading */
  useEffect(() => {
    if (started) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.15 }
    );
    if (panelRef.current) observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [started]);

  const pd = stats?.platformDownloads || {};
  const maxPlatform = Math.max(...PLATFORM_META.map(p => pd[p.id] || 0), 1);


  return (
    <section ref={panelRef} className="stats-panel">
      {/* Section header */}
      <div className="stats-header">
        <div className="stats-header-badge">
          <span className="stats-live-dot" />
          Canlı Statistika
        </div>
        <h2 className="stats-title">Rəqəmlər Özü Danışır</h2>
        <p className="stats-subtitle">HUSEVN DOWNLOADER ilə istifadəçilər tərəfindən yüklənmiş məlumatlar</p>
      </div>

      {/* Top 3 main metrics */}
      <div className="stats-cards-grid">
        <StatCard
          icon="fa-solid fa-users"
          label="Ümumi Ziyarətçi"
          value={stats?.totalVisits || 0}
          color="#818cf8"
          delay={0}
          started={started}
        />
        <StatCard
          icon="fa-solid fa-download"
          label="Ümumi Yükləmə"
          value={stats?.totalDownloads || 0}
          color="#34d399"
          delay={0.1}
          started={started}
        />
        <StatCard
          icon="fa-solid fa-globe"
          label="Aktif Platforma"
          value={5}
          color="#f59e0b"
          delay={0.2}
          started={started}
        />
      </div>

      {/* Platform breakdown */}
      <motion.div
        className="stats-platforms-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="stats-platforms-header">
          <i className="fa-solid fa-chart-bar" />
          <span>Platforma Üzrə Yükləmələr</span>
        </div>
        <div className="stats-platforms-list">
          {PLATFORM_META.map((p, i) => (
            <PlatformRow
              key={p.id}
              icon={p.icon}
              label={p.label}
              value={pd[p.id] || 0}
              color={p.color}
              maxVal={maxPlatform}
              delay={0.35 + i * 0.08}
              started={started}
            />
          ))}
        </div>
      </motion.div>
    </section>
  );
}
