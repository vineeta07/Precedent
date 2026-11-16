import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Toasts, EASE } from './components/ui';
import { Icon } from './lib/icons';
import { useApp, useLoad, type Route } from './lib/store';
import { Home } from './pages/Home';
import { Overview } from './pages/Overview';
import { Decisions } from './pages/Decisions';
import { Promises } from './pages/Promises';
import { Incidents } from './pages/Incidents';
import { Activity } from './pages/Activity';
import { Guide } from './pages/Guide';
import { Settings } from './pages/Settings';

interface NavEntry {
  route: Route;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
}

const GROUPS: { title: string; items: NavEntry[] }[] = [
  { title: 'Start', items: [{ route: 'home', label: 'Home', icon: Icon.home }] },
  {
    title: 'Ledger',
    items: [
      { route: 'overview', label: 'Overview', icon: Icon.overview },
      { route: 'decisions', label: 'Decisions', icon: Icon.decision },
      { route: 'promises', label: 'Promises', icon: Icon.promise },
      { route: 'incidents', label: 'Repeat incidents', icon: Icon.incident },
      { route: 'activity', label: 'Guard activity', icon: Icon.guard },
    ],
  },
  {
    title: 'Help',
    items: [
      { route: 'guide', label: 'User guide', icon: Icon.guide },
      { route: 'settings', label: 'Settings', icon: Icon.settings },
    ],
  },
];

const TITLES: Record<Route, string> = {
  home: 'Home',
  overview: 'Overview',
  decisions: 'Decisions',
  promises: 'Promises',
  incidents: 'Repeat incidents',
  activity: 'Guard activity',
  guide: 'User guide',
  settings: 'Settings',
};

const PAGES: Record<Route, () => ReactNode> = {
  home: () => <Home />,
  overview: () => <Overview />,
  decisions: () => <Decisions />,
  promises: () => <Promises />,
  incidents: () => <Incidents />,
  activity: () => <Activity />,
  guide: () => <Guide />,
  settings: () => <Settings />,
};

export function App() {
  const { route, go, theme, setTheme, api } = useApp();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1100);
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const summary = useLoad(() => api.summary(), []);
  const k = summary.data?.summary.kpis;
  const counts: Partial<Record<Route, { n: number; tone?: 'alert' }>> = k
    ? {
        decisions: { n: k.decisionsTracked },
        promises: { n: k.promisesOpen + k.promisesOverdue + k.promisesBroken, tone: k.promisesOverdue + k.promisesBroken > 0 ? 'alert' : undefined },
        incidents: { n: k.repeatIncidentsCaught, tone: k.repeatIncidentsCaught > 0 ? 'alert' : undefined },
      }
    : {};

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 8);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar" data-collapsed={collapsed} aria-label="Precedent navigation">
        <button className="brand" onClick={() => go('home')} aria-label="Precedent home">
          <img src="./mark.svg" alt="" />
          <span className="brand-word">
            Precedent<span>.</span>
          </span>
        </button>
        <nav className="nav">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="nav-group">{g.title}</div>
              {g.items.map((item) => {
                const active = route === item.route;
                const count = counts[item.route];
                return (
                  <button key={item.route} className="nav-item" aria-current={active ? 'page' : undefined} onClick={() => go(item.route)} title={collapsed ? item.label : undefined}>
                    {active ? <motion.i layoutId="nav-pill" className="nav-pill" transition={{ type: 'spring', stiffness: 480, damping: 40 }} /> : null}
                    {item.icon({})}
                    <span className="nav-label">{item.label}</span>
                    {count && count.n > 0 ? (
                      <span className="nav-count" data-tone={count.tone}>
                        {count.n}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          {api.preview ? (
            <button className="nav-item" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Switch theme">
              {theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
              <span className="nav-label side-foot-text">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
            </button>
          ) : null}
          <button className="nav-item" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
            <Icon.collapse />
            <span className="nav-label side-foot-text">Collapse</span>
          </button>
        </div>
      </aside>

      <div className="main" ref={mainRef}>
        <header className="topbar" data-scrolled={scrolled}>
          <div className="crumbs">
            <span>Precedent</span>
            <span aria-hidden>/</span>
            <b>{TITLES[route]}</b>
          </div>
          {api.preview ? <span className="tag" title="You are looking at the local preview with sample data">Preview · sample data</span> : null}
          {summary.data?.summary.hasSample && !api.preview ? (
            <button className="tag" onClick={() => go('settings')} title="Sample data is loaded. Remove it in Settings.">
              Sample data loaded
            </button>
          ) : null}
          {route !== 'guide' ? (
            <button className="btn btn-ghost btn-sm" onClick={() => go('guide')}>
              <Icon.guide /> Guide
            </button>
          ) : null}
        </header>
        <AnimatePresence mode="wait">
          <motion.main key={route} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.28, ease: EASE }}>
            {PAGES[route]()}
          </motion.main>
        </AnimatePresence>
      </div>
      <Toasts />
    </div>
  );
}
