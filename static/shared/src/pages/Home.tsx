import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { CountUp, EASE, Reveal } from '../components/ui';
import { Icon } from '../lib/icons';
import { useApp, useLoad } from '../lib/store';
import { ArtExtract, ArtGuard, ArtTrack, HeroArt } from './art';

const PILLARS = [
  {
    n: '01',
    title: 'It reads what you already wrote',
    body: 'Precedent scans Confluence pages, post-incident reviews and Jira comments, and lifts out every decision and every promise, each with the exact sentence it came from. It never invents one.',
    art: <ArtExtract />,
  },
  {
    n: '02',
    title: 'It speaks up at the right moment',
    body: 'When someone creates a work item that goes against an accepted decision, or an incident that looks like an old one, the Precedent panel says so, with the quote, the owner and the date.',
    art: <ArtGuard />,
  },
  {
    n: '03',
    title: 'It keeps score on promises',
    body: 'Every action item from a postmortem lands in a ledger with an owner and a due date. Status follows the linked Jira work item, and the keep rate tells you how often your team does what it said.',
    art: <ArtTrack />,
  },
];

const STEPS = [
  { t: 'A page is written', d: 'An ADR, a postmortem, meeting notes. Nothing changes about how you write.' },
  { t: 'Precedent extracts', d: 'Decisions and promises are pulled out with the source quote, owner and date.' },
  { t: 'A human confirms', d: 'On the Confluence page, one click confirms, edits or rejects each decision.' },
  { t: 'New work is checked', d: 'Each new or edited work item is compared with the ledger in the background.' },
  { t: 'You see it in Jira', d: 'Conflict, déjà vu or open promise, right in the work item, with the source.' },
];

export function Home() {
  const { go, api } = useApp();
  const { data } = useLoad(() => api.summary(), []);
  const k = data?.summary.kpis;
  const empty = data?.summary.empty ?? false;
  const reduce = useReducedMotion();
  // Parallax for the hero illustration, driven by the app's own scroll container.
  const progress = useMotionValue(0);
  useEffect(() => {
    const main = document.querySelector('.main');
    if (!main) return;
    const onScroll = () => progress.set(Math.min(1, main.scrollTop / Math.max(1, window.innerHeight * 0.9)));
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, [progress]);
  const artY = useTransform(progress, [0, 1], [0, reduce ? 0 : 70]);
  const artFade = useTransform(progress, [0, 0.9], [1, 0.25]);

  const scrollToStory = () => document.getElementById('what')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <motion.div className="eyebrow" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            The memory your team keeps losing
          </motion.div>
          <h1 className="display hero-title">
            {['You already', 'decided this.'].map((line, i) => (
              <span key={line} className="line">
                <motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 0.85, delay: 0.08 + i * 0.1, ease: EASE }}>
                  {i === 1 ? <em>{line}</em> : line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p className="hero-lede" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.35, ease: EASE }}>
            Precedent remembers what your team decided and what it promised, then checks every new Jira work item and incident against it. So the same bad idea, and the same outage, do not come back.
          </motion.p>
          <motion.div className="hero-actions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.45, ease: EASE }}>
            <button className="btn btn-primary btn-lg" onClick={() => go(empty ? 'settings' : 'overview')}>
              {empty ? 'Set up Precedent' : 'Open the ledger'} <Icon.arrow />
            </button>
            <button className="btn btn-lg" onClick={() => go('guide')}>
              Read the guide
            </button>
          </motion.div>
          <motion.div className="hero-stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.7 }}>
            <button onClick={() => go('decisions')}>
              <b className="serif">{k ? <CountUp value={k.decisionsTracked} /> : '—'}</b>
              <span>decisions remembered</span>
            </button>
            <button onClick={() => go('promises')}>
              <b className="serif">{k ? <CountUp value={k.promisesOpen + k.promisesOverdue + k.promisesBroken} /> : '—'}</b>
              <span>promises not done yet</span>
            </button>
            <button onClick={() => go('incidents')}>
              <b className="serif">{k ? <CountUp value={k.repeatIncidentsCaught} /> : '—'}</b>
              <span>repeat incidents caught</span>
            </button>
          </motion.div>
        </div>
        <motion.div className="hero-art" style={{ y: artY, opacity: artFade }}>
          <HeroArt />
        </motion.div>
        <motion.button className="scroll-cue" onClick={scrollToStory} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} aria-label="Scroll to learn what Precedent is">
          <span>Scroll to see how it works</span>
          <motion.i animate={reduce ? undefined : { y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
            <Icon.down />
          </motion.i>
        </motion.button>
      </section>

      <section className="band" id="what">
        <Reveal>
          <div className="eyebrow">What it is</div>
          <h2 className="display band-title">Three jobs, done quietly in the background.</h2>
        </Reveal>
        <div className="pillars">
          {PILLARS.map((p, i) => (
            <Reveal key={p.n} delay={i * 0.08} className="pillar card">
              <div className="pillar-art">{p.art}</div>
              <div className="pillar-n mono">{p.n}</div>
              <h3 className="serif">{p.title}</h3>
              <p>{p.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="band story">
        <Reveal className="story-copy">
          <div className="eyebrow">A true-to-life story</div>
          <h2 className="display band-title">Nimbus Pay had the same outage twice.</h2>
          <p>
            In July, checkout payments timed out for 47 minutes. The postmortem promised three fixes. One was done. In November it happened again, for the same reason.
          </p>
          <p>
            With Precedent, the second incident opens with a note already on it: <b>“Looks like INC-214 — 2 promises still open.”</b>
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn" onClick={() => go('incidents')}>
              See the repeat incident <Icon.arrow />
            </button>
            <button className="btn btn-ghost" onClick={() => go('decisions', 'DEC-12')}>
              See the Firebase decision
            </button>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="story-card card">
          <div className="verdict" data-tone="dejavu">
            <Icon.incident style={{ width: 18, height: 18 }} /> Looks like INC-214 — 2 promises still open
          </div>
          <div className="story-line">
            <span className="loz" data-tone="deja_vu">Déjà vu</span>
            <span className="keychip">INC-214</span>
            <span className="faint">14 Jul 2026</span>
          </div>
          <p className="story-q serif">“…our checkout service had no timeout on acquirer calls, the connection pool was exhausted and every checkout request queued until it failed.”</p>
          {[
            { k: 'PRM-31', s: 'kept', t: 'Add a 3 second timeout and circuit breaker' },
            { k: 'PRM-32', s: 'broken', t: 'Alert on connection pool saturation' },
            { k: 'PRM-33', s: 'broken', t: 'Load test against a slow acquirer' },
          ].map((p, i) => (
            <motion.div key={p.k} className="story-promise" initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.25 + i * 0.12, duration: 0.5, ease: EASE }}>
              <span className="keychip">{p.k}</span>
              <span style={{ flex: 1 }}>{p.t}</span>
              <span className="loz" data-tone={p.s}>
                {p.s}
              </span>
            </motion.div>
          ))}
        </Reveal>
      </section>

      <section className="band">
        <Reveal>
          <div className="eyebrow">How it works</div>
          <h2 className="display band-title">From a sentence on a page to a warning in Jira.</h2>
        </Reveal>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.t} delay={i * 0.07} className="step">
              <span className="step-n serif">{i + 1}</span>
              <h4>{s.t}</h4>
              <p>{s.d}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="band">
        <Reveal>
          <div className="eyebrow">Where you will meet it</div>
          <h2 className="display band-title">Inside the tools you already have open.</h2>
        </Reveal>
        <div className="places">
          {[
            { icon: <Icon.guard />, t: 'Jira work item panel', d: 'One line at the top tells you if there is a conflict, a repeat incident or an open promise. Cards below show the proof.', to: 'activity' as const, cta: 'See guard activity' },
            { icon: <Icon.page />, t: 'Confluence page byline', d: '“3 decisions on this page.” Confirm, edit or reject each one where it was written.', to: 'guide' as const, cta: 'How confirming works' },
            { icon: <Icon.overview />, t: 'Promise Ledger', d: 'Every decision and promise in one place, with filters, the supersede chain and history.', to: 'overview' as const, cta: 'Open the overview' },
            { icon: <Icon.spark />, t: 'Rovo and your AI tools', d: 'Ask the Precedent agent in Rovo, or connect an MCP client, and get the same cited answers.', to: 'guide' as const, cta: 'Connect an assistant' },
          ].map((p, i) => (
            <Reveal key={p.t} delay={i * 0.06} className="place card">
              <span className="place-icon">{p.icon}</span>
              <h4>{p.t}</h4>
              <p>{p.d}</p>
              <button className="btn btn-ghost btn-sm" onClick={() => go(p.to)}>
                {p.cta} <Icon.arrow />
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal as="section" className="closing">
        <img src="./mark.svg" alt="" width="56" height="56" />
        <h2 className="display">Stop deciding the same thing twice.</h2>
        <p>{empty ? 'Load the sample company to try it in a minute, or scan your own Confluence spaces.' : 'Your ledger is ready. Start with what needs attention today.'}</p>
        <div className="hero-actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn-brass btn-lg" onClick={() => go(empty ? 'settings' : 'overview')}>
            {empty ? 'Get started' : 'Go to the overview'} <Icon.arrow />
          </button>
          <button className="btn btn-lg" onClick={() => go('guide')}>
            User guide
          </button>
        </div>
      </Reveal>
    </div>
  );
}
