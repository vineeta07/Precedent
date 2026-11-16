import { motion, useReducedMotion } from 'motion/react';
import { EASE } from '../components/ui';

/* Original illustrations, drawn in SVG with the app's own colour tokens so they follow light and dark mode. */

const draw = (delay: number, duration = 1) => ({
  initial: { pathLength: 0, opacity: 0 },
  whileInView: { pathLength: 1, opacity: 1 },
  viewport: { once: true },
  transition: { duration, delay, ease: EASE },
});

export function HeroArt() {
  const reduce = useReducedMotion();
  const float = (dy: number, d: number) => (reduce ? {} : { animate: { y: [0, dy, 0] }, transition: { duration: d, repeat: Infinity, ease: 'easeInOut' as const } });
  return (
    <svg viewBox="0 0 520 470" width="100%" role="img" aria-label="A decision written on a page is remembered and later flags a conflicting work item">
      <defs>
        <pattern id="ruled" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 7.5h8" stroke="var(--rule)" strokeWidth="1" />
        </pattern>
      </defs>
      {/* back page */}
      <motion.g {...float(-6, 7)}>
        <motion.g initial={{ opacity: 0, y: 30, rotate: -9 }} animate={{ opacity: 1, y: 0, rotate: -7 }} transition={{ duration: 0.9, delay: 0.25, ease: EASE }} style={{ transformOrigin: '150px 200px' }}>
          <rect x="34" y="52" width="230" height="290" rx="10" fill="var(--surface-sunken)" stroke="var(--rule-strong)" />
          <rect x="54" y="80" width="110" height="10" rx="5" fill="var(--rule-strong)" />
          <rect x="54" y="108" width="186" height="190" fill="url(#ruled)" />
        </motion.g>
      </motion.g>
      {/* front page: the ADR */}
      <motion.g {...float(5, 6)}>
        <motion.g initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.4, ease: EASE }}>
          <rect x="76" y="34" width="250" height="316" rx="12" fill="var(--surface-raised)" stroke="var(--rule-strong)" />
          <path d="M276 24h26v52l-13-11-13 11z" fill="var(--brass-line)" />
          <text x="98" y="72" style={{ font: '600 10px var(--font-body)', letterSpacing: '0.14em', fill: 'var(--ink-faint)' }}>
            ADR-012 · ACCEPTED
          </text>
          <text x="98" y="100" style={{ font: '460 19px var(--font-display)', fill: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Keep auth in-house
          </text>
          <rect x="98" y="118" width="190" height="7" rx="3.5" fill="var(--rule)" />
          <rect x="98" y="134" width="160" height="7" rx="3.5" fill="var(--rule)" />
          <motion.rect x="92" y="158" width="218" height="52" rx="6" fill="var(--brass-soft)" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, delay: 1.1, ease: EASE }} style={{ transformOrigin: '92px 184px' }} />
          <text x="100" y="180" style={{ font: 'italic 420 13px var(--font-display)', fill: 'var(--ink)' }}>
            “We decided NOT to move
          </text>
          <text x="100" y="199" style={{ font: 'italic 420 13px var(--font-display)', fill: 'var(--ink)' }}>
            authentication to Firebase.”
          </text>
          <rect x="98" y="228" width="182" height="7" rx="3.5" fill="var(--rule)" />
          <rect x="98" y="244" width="140" height="7" rx="3.5" fill="var(--rule)" />
          <circle cx="110" cy="300" r="12" fill="#8a2d3b" />
          <text x="110" y="304" textAnchor="middle" style={{ font: '700 9px var(--font-body)', fill: '#fff' }}>
            PR
          </text>
          <text x="130" y="297" style={{ font: '600 11px var(--font-body)', fill: 'var(--ink)' }}>
            Priya Raman
          </text>
          <text x="130" y="312" style={{ font: '500 10px var(--font-body)', fill: 'var(--ink-faint)' }}>
            12 Mar 2026
          </text>
        </motion.g>
      </motion.g>
      {/* thread from the quote to the work item */}
      <motion.path d="M310 184C372 184 352 300 414 318" fill="none" stroke="var(--brass-line)" strokeWidth="2" strokeDasharray="3 6" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.1, delay: 1.7, ease: EASE }} />
      {/* the work item card */}
      <motion.g {...float(-5, 5.5)}>
        <motion.g initial={{ opacity: 0, y: 30, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, delay: 2.2, ease: EASE }} style={{ transformOrigin: '380px 360px' }}>
          <rect x="256" y="308" width="238" height="146" rx="14" fill="#141822" opacity="0.1" />
          <rect x="250" y="296" width="250" height="150" rx="12" fill="var(--surface-raised)" stroke="var(--rule-strong)" />
          <rect x="250" y="296" width="4" height="150" rx="2" fill="var(--oxblood)" />
          <rect x="268" y="312" width="216" height="30" rx="7" fill="var(--oxblood-soft)" />
          <path d="M283 320.5 290 333h-14z" fill="none" stroke="var(--oxblood)" strokeWidth="1.6" strokeLinejoin="round" />
          <text x="298" y="331" style={{ font: '650 11.500px var(--font-body)', fill: 'var(--oxblood)' }}>
            Conflicts with 1 decision
          </text>
          <text x="268" y="366" style={{ font: '500 10px var(--font-mono)', fill: 'var(--ink-faint)' }}>
            PAY-482
          </text>
          <text x="268" y="386" style={{ font: '620 13px var(--font-body)', fill: 'var(--ink)' }}>
            Migrate customer login to
          </text>
          <text x="268" y="403" style={{ font: '620 13px var(--font-body)', fill: 'var(--ink)' }}>
            Firebase Auth
          </text>
          <rect x="268" y="418" width="68" height="18" rx="5" fill="var(--stone-soft)" />
          <text x="302" y="430" textAnchor="middle" style={{ font: '500 10px var(--font-mono)', fill: 'var(--ink)' }}>
            DEC-12
          </text>
          <text x="344" y="431" style={{ font: '500 10.500px var(--font-body)', fill: 'var(--ink-faint)' }}>
            View source ↗
          </text>
        </motion.g>
      </motion.g>
      {/* small seal */}
      <motion.g initial={{ opacity: 0, scale: 0.4, rotate: -30 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 13, delay: 2.7 }} style={{ transformOrigin: '430px 110px' }}>
        <circle cx="430" cy="110" r="44" fill="none" stroke="var(--rule-strong)" strokeDasharray="2 5" />
        <circle cx="430" cy="110" r="33" fill="var(--ink)" />
        <path d="M419 92h7v36l-3.5-3.600L419 128z" fill="var(--paper)" />
        <path d="M428 96h3.500a8 8 0 0 1 0 16h-1" fill="none" stroke="var(--brass-line)" strokeWidth="4.5" />
        <path d="M432.5 107.500v9l-5.5-4.500z" fill="var(--brass-line)" />
      </motion.g>
    </svg>
  );
}

export function ArtExtract() {
  return (
    <svg viewBox="0 0 220 120" width="100%" aria-hidden>
      <rect x="14" y="14" width="92" height="96" rx="8" fill="var(--surface-raised)" stroke="var(--rule-strong)" />
      <rect x="26" y="28" width="52" height="6" rx="3" fill="var(--rule-strong)" />
      <rect x="26" y="44" width="68" height="5" rx="2.5" fill="var(--rule)" />
      <motion.rect x="22" y="56" width="76" height="16" rx="4" fill="var(--brass-soft)" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.3, ease: EASE }} style={{ transformOrigin: '22px 64px' }} />
      <rect x="26" y="61" width="60" height="5" rx="2.5" fill="var(--brass-line)" />
      <rect x="26" y="80" width="64" height="5" rx="2.5" fill="var(--rule)" />
      <rect x="26" y="92" width="44" height="5" rx="2.5" fill="var(--rule)" />
      <motion.path d="M100 64h28" stroke="var(--brass-line)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 5" {...draw(0.8, 0.6)} />
      <motion.g initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 1.2, ease: EASE }}>
        <rect x="132" y="42" width="76" height="44" rx="8" fill="var(--ink)" />
        <rect x="142" y="52" width="34" height="12" rx="4" fill="var(--brass-line)" />
        <text x="159" y="61" textAnchor="middle" style={{ font: '600 8px var(--font-mono)', fill: '#1b2333' }}>
          DEC-12
        </text>
        <rect x="142" y="70" width="54" height="5" rx="2.5" fill="var(--paper)" opacity="0.5" />
      </motion.g>
    </svg>
  );
}

export function ArtGuard() {
  return (
    <svg viewBox="0 0 220 120" width="100%" aria-hidden>
      <rect x="20" y="22" width="180" height="78" rx="9" fill="var(--surface-raised)" stroke="var(--rule-strong)" />
      <rect x="34" y="36" width="64" height="6" rx="3" fill="var(--rule-strong)" />
      <rect x="34" y="50" width="110" height="5" rx="2.5" fill="var(--rule)" />
      <motion.g initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.5, ease: EASE }}>
        <rect x="34" y="66" width="152" height="22" rx="6" fill="var(--oxblood-soft)" />
        <path d="M46 71.5 51.5 82h-11z" fill="none" stroke="var(--oxblood)" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="58" y="74.5" width="86" height="5" rx="2.5" fill="var(--oxblood)" opacity="0.7" />
      </motion.g>
      <motion.g initial={{ scale: 0, rotate: -20 }} whileInView={{ scale: 1, rotate: 0 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.9 }} style={{ transformOrigin: '186px 26px' }}>
        <path d="M186 8 170 14v12c0 9 6 15.5 16 20 10-4.5 16-11 16-20V14z" fill="var(--ink)" />
        <path d="M186 17v9M186 31v.500" stroke="var(--brass-line)" strokeWidth="2.6" strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

export function ArtTrack() {
  const rows = [
    { w: 70, tone: 'var(--moss)', soft: 'var(--moss-soft)' },
    { w: 54, tone: 'var(--oxblood)', soft: 'var(--oxblood-soft)' },
    { w: 62, tone: 'var(--slate)', soft: 'var(--slate-soft)' },
  ];
  return (
    <svg viewBox="0 0 220 120" width="100%" aria-hidden>
      <rect x="16" y="14" width="132" height="94" rx="9" fill="var(--surface-raised)" stroke="var(--rule-strong)" />
      {rows.map((r, i) => (
        <motion.g key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: 0.25 + i * 0.15, ease: EASE }}>
          <circle cx="32" cy={36 + i * 26} r="6" fill={r.soft} stroke={r.tone} strokeWidth="1.5" />
          {i === 0 ? <path d={`M29 ${36}l2.2 2.2 4-4.4`} fill="none" stroke={r.tone} strokeWidth="1.5" strokeLinecap="round" /> : null}
          <rect x="46" y={33 + i * 26} width={r.w} height="6" rx="3" fill="var(--rule-strong)" />
          <rect x="118" y={31 + i * 26} width="22" height="10" rx="3" fill={r.soft} />
        </motion.g>
      ))}
      <circle cx="180" cy="62" r="26" fill="none" stroke="var(--chart-track)" strokeWidth="7" />
      <motion.circle cx="180" cy="62" r="26" fill="none" stroke="var(--chart-kept)" strokeWidth="7" strokeLinecap="round" strokeDasharray="163.4" transform="rotate(-90 180 62)" initial={{ strokeDashoffset: 163.4 }} whileInView={{ strokeDashoffset: 59 }} viewport={{ once: true }} transition={{ duration: 1.1, delay: 0.5, ease: EASE }} />
      <text x="180" y="66" textAnchor="middle" style={{ font: '460 13px var(--font-display)', fill: 'var(--ink)' }}>
        64%
      </text>
    </svg>
  );
}
