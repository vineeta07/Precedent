import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../lib/icons';
import { avatarColour, initials } from '../lib/format';
import { useApp } from '../lib/store';

export const EASE = [0.22, 0.8, 0.26, 1] as const;

export function Avatar({ name, size }: { name: string | null; size?: 'lg' }) {
  const n = name ?? 'Unassigned';
  return (
    <span className="avatar" data-size={size} style={{ background: name ? avatarColour(n) : 'var(--ink-faint)' }} aria-hidden>
      {name ? initials(n) : '?'}
    </span>
  );
}

export function Person({ name }: { name: string | null }) {
  return (
    <span className="person">
      <Avatar name={name} />
      <span>{name ?? 'No owner'}</span>
    </span>
  );
}

export function Lozenge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className="loz" data-tone={tone}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  const id = useId();
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {value === o.value ? <motion.i layoutId={`seg-${id}`} className="seg-pill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} /> : null}
          <span>
            {o.label}
            {o.count !== undefined ? <span className="n">{o.count}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 16, padding: '16px 20px', borderBottom: i < rows - 1 ? '1px solid var(--rule)' : 0, alignItems: 'center' }}>
          <Skeleton w={56} h={20} />
          <div style={{ flex: 1, display: 'grid', gap: 8 }}>
            <Skeleton w={`${62 - i * 5}%`} h={14} />
            <Skeleton w={`${82 - i * 6}%`} h={11} />
          </div>
          <Skeleton w={90} h={20} />
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, body, children, art }: { title: string; body: string; children?: ReactNode; art?: ReactNode }) {
  return (
    <motion.div className="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      {art ?? <EmptyArt />}
      <h3>{title}</h3>
      <p>{body}</p>
      {children ? <div className="actions">{children}</div> : null}
    </motion.div>
  );
}

function EmptyArt() {
  return (
    <svg width="132" height="96" viewBox="0 0 132 96" fill="none" aria-hidden>
      <rect x="22" y="18" width="64" height="70" rx="6" fill="var(--surface-sunken)" stroke="var(--rule-strong)" />
      <rect x="34" y="10" width="64" height="70" rx="6" fill="var(--surface-raised)" stroke="var(--rule-strong)" />
      <path d="M46 28h34M46 40h40M46 52h26" stroke="var(--rule-strong)" strokeWidth="3" strokeLinecap="round" />
      <path d="M82 4h10v22l-5-4-5 4z" fill="var(--brass-line)" />
      <circle cx="104" cy="66" r="15" fill="var(--paper)" stroke="var(--ink-faint)" strokeWidth="2" />
      <path d="m115 77 9 9" stroke="var(--ink-faint)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="banner" data-tone="error" role="alert">
      <Icon.alert />
      <div style={{ flex: 1 }}>
        <b>We could not load this.</b>
        <div>{message}</div>
      </div>
      {retry ? (
        <button className="btn btn-sm" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Animated number. Counts up once when it scrolls into view. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const prev = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!inView || reduce) {
      el.textContent = value.toFixed(decimals);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 1.1,
      ease: EASE,
      onUpdate: (v) => {
        el.textContent = v.toFixed(decimals);
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, inView, decimals, reduce]);
  return (
    <span ref={ref} className="num">
      {value.toFixed(decimals)}
    </span>
  );
}

/** Fade-and-rise on scroll. Used across pages so everything arrives with the same motion. */
export function Reveal({ children, delay = 0, y = 18, className, as = 'div' }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'section' | 'li' }) {
  const Tag = motion[as];
  return (
    <Tag className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -8% 0px' }} transition={{ duration: 0.6, delay, ease: EASE }}>
      {children}
    </Tag>
  );
}

export const listMotion = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};
export const itemMotion = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

function useEscape(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, active]);
}

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose, open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
          <motion.aside
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className="drawer"
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>{title}</div>
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                <Icon.close />
              </button>
            </div>
            <div className="drawer-body">{children}</div>
            {footer ? <div className="drawer-foot">{footer}</div> : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEscape(onClose, open);
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div className="scrim" data-top="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="modal"
            initial={{ opacity: 0, scale: 0.96, x: '-50%', y: '-46%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.97, x: '-50%', y: '-48%' }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <h3 className="serif" style={{ fontSize: 22, fontWeight: 480 }}>
              {title}
            </h3>
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <i />
    </button>
  );
}

export function Busy({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <>
      {on ? <span className="spinner" aria-hidden /> : null}
      {children}
    </>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} layout className="toast" data-tone={t.tone} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ duration: 0.25, ease: EASE }}>
            {t.tone === 'error' ? <Icon.alert /> : <Icon.check />}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function SourceQuote({ snippet, sourceUrl, sourceLabel, restricted, who, when }: { snippet: string; sourceUrl: string | null; sourceLabel: string; restricted?: boolean; who?: string | null; when?: string | null }) {
  const { api } = useApp();
  if (restricted) {
    return (
      <div className="banner">
        <Icon.lock />
        <div>The source is restricted. Ask its owner for access to read the original quote.</div>
      </div>
    );
  }
  return (
    <blockquote className="quote">
      “{snippet}”
      <footer>
        {who ? <Person name={who} /> : null}
        {when ? <span>{when}</span> : null}
        <span>{sourceLabel}</span>
        {sourceUrl ? (
          <button className="btn btn-ghost btn-sm" onClick={() => api.openUrl(sourceUrl)}>
            View source <Icon.external />
          </button>
        ) : null}
      </footer>
    </blockquote>
  );
}

export function useConfirmState<T>() {
  const [target, setTarget] = useState<T | null>(null);
  return { target, open: (t: T) => setTarget(t), close: () => setTarget(null) };
}
