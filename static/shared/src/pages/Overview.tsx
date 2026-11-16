import { motion } from 'motion/react';
import { KeepRing, MonthBars } from '../components/charts';
import { Avatar, CountUp, Empty, ErrorState, Lozenge, Reveal, Skeleton, itemMotion, listMotion } from '../components/ui';
import { daysLate, formatDate, relative } from '../lib/format';
import { Icon } from '../lib/icons';
import { useApp, useLoad, type Route } from '../lib/store';

export function Overview() {
  const { api, go } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.summary(), []);

  if (error && !data) {
    return (
      <div className="page">
        <Head />
        <ErrorState message={error} retry={reload} />
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div className="page" aria-busy="true">
        <Head />
        <div className="grid kpis">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card kpi" style={{ cursor: 'default' }}>
              <Skeleton w={90} h={12} />
              <div style={{ height: 12 }} />
              <Skeleton w={64} h={36} />
            </div>
          ))}
        </div>
        <div className="grid two-col" style={{ marginTop: 16 }}>
          <div className="card card-pad">
            <Skeleton h={220} />
          </div>
          <div className="card card-pad">
            <Skeleton h={220} />
          </div>
        </div>
      </div>
    );
  }
  if (!data) return null;
  const s = data.summary;
  const k = s.kpis;

  if (s.empty) {
    return (
      <div className="page">
        <Head />
        <div className="card">
          <Empty title="Your ledger is empty" body="Precedent has not read anything yet. Scan a Confluence space, or load the sample company to see how it works. It takes about a minute.">
            {data.isAdmin ? (
              <button className="btn btn-primary" onClick={() => go('settings')}>
                Set up Precedent <Icon.arrow />
              </button>
            ) : (
              <span className="muted">Ask a Jira administrator to set up Precedent.</span>
            )}
            <button className="btn" onClick={() => go('guide')}>
              Read the guide
            </button>
          </Empty>
        </div>
      </div>
    );
  }

  const missed = k.promisesBroken + k.promisesOverdue;
  const kpis: { label: string; value: number; suffix?: string; decimals?: number; foot: string; tone: string; to: Route; none?: boolean }[] = [
    { label: 'Decisions tracked', value: k.decisionsTracked, foot: `${k.decisionsAccepted} accepted`, tone: 'var(--ink)', to: 'decisions' },
    { label: 'Promises open', value: k.promisesOpen + k.promisesOverdue, foot: k.promisesOverdue ? `${k.promisesOverdue} overdue` : 'none overdue', tone: 'var(--slate)', to: 'promises' },
    { label: 'Promises kept', value: k.promisesKept, foot: 'done as promised', tone: 'var(--moss)', to: 'promises' },
    { label: 'Promises broken', value: k.promisesBroken, foot: 'never done', tone: 'var(--oxblood)', to: 'promises' },
    { label: 'Keep rate', value: k.keepRate ?? 0, suffix: '%', foot: k.keepRate === null ? 'nothing due yet' : 'of promises due', tone: 'var(--chart-kept)', to: 'promises', none: k.keepRate === null },
    { label: 'Repeat incidents caught', value: k.repeatIncidentsCaught, foot: `${k.conflictsCaught} conflict${k.conflictsCaught === 1 ? '' : 's'} caught`, tone: 'var(--brass-line)', to: 'incidents' },
  ];

  return (
    <div className="page">
      <Head />
      <motion.div className="grid kpis" variants={listMotion} initial="hidden" animate="show">
        {kpis.map((kpi) => (
          <motion.button key={kpi.label} variants={itemMotion} className="card kpi" onClick={() => go(kpi.to)}>
            <motion.i className="kpi-bar" style={{ background: kpi.tone }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, delay: 0.2 }} />
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">
              {kpi.none ? '—' : <CountUp value={kpi.value} />}
              {kpi.suffix && !kpi.none ? <small>{kpi.suffix}</small> : null}
            </div>
            <div className="kpi-foot">{kpi.foot}</div>
          </motion.button>
        ))}
      </motion.div>

      <div className="grid two-col" style={{ marginTop: 16 }}>
        <Reveal className="card card-pad">
          <div className="card-head">
            <h3>Promises by due month</h3>
            <div className="chart-legend">
              <span>
                <i style={{ background: 'var(--chart-kept)' }} />
                Kept
              </span>
              <span>
                <i style={{ background: 'var(--chart-missed)' }} />
                Broken or overdue
              </span>
            </div>
          </div>
          <MonthBars months={s.months} />
        </Reveal>
        <Reveal className="card card-pad" delay={0.06}>
          <div className="card-head">
            <h3>Promise keep rate</h3>
          </div>
          <KeepRing rate={k.keepRate} kept={k.promisesKept} missed={missed} />
        </Reveal>
      </div>

      <div className="grid two-col" style={{ marginTop: 16 }}>
        <Reveal className="card">
          <div className="card-head" style={{ padding: '20px 20px 0' }}>
            <h3>Needs attention</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => go('promises')}>
              All promises <Icon.arrow />
            </button>
          </div>
          {s.needsAttention.length === 0 ? (
            <div className="muted" style={{ padding: '4px 20px 24px' }}>
              Nothing is overdue. Every promise that came due was kept.
            </div>
          ) : (
            <div className="rows">
              {s.needsAttention.map((p) => (
                <button key={p.id} className="row" style={{ gridTemplateColumns: '72px minmax(0,1fr) auto' }} onClick={() => go('promises', p.key)}>
                  <span className="keychip">{p.key}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="row-title">{p.statement}</span>
                    <span className="row-sub">
                      {p.ownerName ?? 'No owner'} · due {formatDate(p.dueDate)} · {daysLate(p.dueDate)} days late{p.originId && /^[A-Z]+-\d+$/.test(p.originId) ? ` · after ${p.originId}` : ''}
                    </span>
                  </span>
                  <Lozenge tone={p.status}>{p.status}</Lozenge>
                </button>
              ))}
            </div>
          )}
        </Reveal>

        <Reveal className="card card-pad" delay={0.06}>
          <div className="card-head">
            <h3>Who keeps their promises</h3>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {s.owners.map((o) => {
              const total = o.kept + o.open + o.missed;
              return (
                <div key={o.name} style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr)', gap: 12, alignItems: 'center' }}>
                  <Avatar name={o.name === 'Unassigned' ? null : o.name} size="lg" />
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }}>
                      <b>{o.name}</b>
                      <span className="faint num">
                        {o.kept} kept · {o.open} open · {o.missed} missed
                      </span>
                    </div>
                    <div className="meter" style={{ marginTop: 6 }} role="img" aria-label={`${o.name}: ${o.kept} kept, ${o.open} open, ${o.missed} missed`}>
                      {o.kept ? <motion.span initial={{ width: 0 }} whileInView={{ width: `${(o.kept / total) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} style={{ background: 'var(--chart-kept)' }} /> : null}
                      {o.missed ? <motion.span initial={{ width: 0 }} whileInView={{ width: `${(o.missed / total) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 }} style={{ background: 'var(--chart-missed)' }} /> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>

      <div className="grid two-col" style={{ marginTop: 16 }}>
        <Reveal className="card card-pad">
          <div className="card-head">
            <h3>Recent history</h3>
          </div>
          <div className="timeline">
            {s.activity.slice(0, 7).map((a) => (
              <div key={a.id} className="tl-item">
                <button className="keychip" onClick={() => go(a.entityType === 'decision' ? 'decisions' : 'promises', a.entityKey)}>
                  {a.entityKey}
                </button>{' '}
                {a.detail}
                <time>{relative(a.at)}</time>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal className="card card-pad" delay={0.06}>
          <div className="card-head">
            <h3>What decisions are about</h3>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {s.tags.map((t) => (
              <button key={t.tag} className="tag" onClick={() => go('decisions', `tag:${t.tag}`)}>
                {t.tag}
                <span className="mono faint" style={{ marginLeft: 6 }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}

function Head() {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">Promise Ledger</div>
        <h1 className="display">Overview</h1>
        <p>What your team has decided, what it has promised, and how much of that it has actually done.</p>
      </div>
    </div>
  );
}
