import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { EvalReport, Health, LedgerSettings, SampleResult, ScanProgress } from '../api';
import { Busy, ErrorState, Reveal, Skeleton, Switch, EASE } from '../components/ui';
import { errorMessage, formatDate } from '../lib/format';
import { Icon } from '../lib/icons';
import { useApp, useLoad } from '../lib/store';

export function Settings() {
  const { api, toast, touch, go } = useApp();
  const summary = useLoad(() => api.summary(), []);
  const isAdmin = summary.data?.isAdmin ?? null;
  const options = useLoad(() => (isAdmin ? api.options() : Promise.resolve(null)), [isAdmin]);

  const [settings, setSettings] = useState<LedgerSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<string[]>([]);
  const [sampleProject, setSampleProject] = useState('');
  const [sampleSpace, setSampleSpace] = useState('');
  const [sample, setSample] = useState<SampleResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [report, setReport] = useState<EvalReport | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const poll = useRef<number | null>(null);

  useEffect(() => {
    if (summary.data && !settings) {
      setSettings(summary.data.settings);
      setSpaces(summary.data.settings.scanSpaces);
    }
  }, [summary.data, settings]);

  const refreshProgress = async () => {
    try {
      const p = await api.scanProgress();
      setProgress(p);
      if (!p.running && poll.current) {
        window.clearInterval(poll.current);
        poll.current = null;
        if (p.total > 0) {
          toast(`Scan finished: ${p.counts.decisions} decisions and ${p.counts.promises} promises in the ledger`);
          touch();
        }
      }
    } catch {
      /* keep the last known progress */
    }
  };
  useEffect(() => {
    if (isAdmin) {
      void refreshProgress();
      api.health().then(setHealth).catch((e: unknown) => setHealthError(errorMessage(e)));
    }
    return () => {
      if (poll.current) window.clearInterval(poll.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const run = async <T,>(name: string, fn: () => Promise<T>, done?: (r: T) => string) => {
    setBusy(name);
    try {
      const r = await fn();
      if (done) toast(done(r));
      return r;
    } catch (e) {
      toast(errorMessage(e), 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const patch = (p: Partial<LedgerSettings>) => {
    setSettings((s) => (s ? { ...s, ...p } : s));
    setDirty(true);
  };

  if (summary.error) {
    return (
      <div className="page">
        <Head />
        <ErrorState message={summary.error} retry={summary.reload} />
      </div>
    );
  }
  if (isAdmin === null || !settings) {
    return (
      <div className="page" aria-busy="true">
        <Head />
        <div className="settings">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card set-card">
              <Skeleton w="40%" h={22} />
              <Skeleton h={14} />
              <Skeleton h={80} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="page">
        <Head />
        <div className="banner">
          <Icon.lock />
          <div>
            <b>Settings are for Jira administrators.</b>
            <div className="muted">You can use everything else in Precedent. Ask an administrator if a space should be scanned or a threshold changed.</div>
          </div>
        </div>
      </div>
    );
  }

  const counts = progress?.counts ?? health?.counts ?? null;
  const pct = progress && progress.total > 0 ? Math.round(((progress.done + progress.failed) / progress.total) * 100) : 0;
  const hasSample = (counts?.sample ?? 0) > 0 || Boolean(sample);

  return (
    <div className="page">
      <Head />
      <div className="settings">
        {counts ? (
          <Reveal className="card card-pad">
            <div className="stat-line">
              <span>
                <b>{counts.decisions}</b>decisions
              </span>
              <span>
                <b>{counts.promises}</b>promises
              </span>
              <span>
                <b>{counts.incidents}</b>incidents
              </span>
              <span>
                <b>{counts.flags}</b>flags raised
              </span>
              <span className="muted" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                {counts.decisions + counts.promises === 0 ? 'The ledger is empty. Start with step 1 or 2.' : 'in the ledger right now'}
              </span>
            </div>
          </Reveal>
        ) : null}

        <Reveal className="card set-card">
          <div className="set-head">
            <span className="set-step">1</span>
            <div>
              <h3 className="serif">Try it with the sample company</h3>
              <p>Loads “Nimbus Pay”: 14 decisions, 13 promises and 7 past incidents, including the Firebase decision and the checkout outage that came back. No AI calls, so it is instant and free.</p>
            </div>
          </div>
          <div className="set-grid">
            <div className="field">
              <label htmlFor="s-project">Also create example work items in (optional)</label>
              <select id="s-project" className="select" value={sampleProject} onChange={(e) => setSampleProject(e.target.value)}>
                <option value="">Ledger only, do not create work items</option>
                {(options.data?.projects ?? []).map((p) => (
                  <option key={p.id} value={p.key}>
                    {p.name} ({p.key})
                  </option>
                ))}
              </select>
              <span className="help">Creates 6 work items so the Jira panel shows live results.</span>
            </div>
            <div className="field">
              <label htmlFor="s-space">Also create source pages in (optional)</label>
              <select id="s-space" className="select" value={sampleSpace} onChange={(e) => setSampleSpace(e.target.value)}>
                <option value="">Ledger only, do not create pages</option>
                {(options.data?.spaces ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.key})
                  </option>
                ))}
              </select>
              <span className="help">Creates 3 Confluence pages so “View source” opens the real text.</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={async () => {
                const r = await run('sample', () => api.loadSample({ projectKey: sampleProject || undefined, spaceId: sampleSpace || undefined }), (res) => `Sample loaded: ${res.decisions} decisions, ${res.promises} promises`);
                if (r) {
                  setSample(r);
                  touch();
                  void refreshProgress();
                }
              }}
            >
              <Busy on={busy === 'sample'}>{hasSample ? 'Load sample data again' : 'Load sample data (Nimbus Pay demo)'}</Busy>
            </button>
            {hasSample ? (
              confirmClear ? (
                <>
                  <span className="muted">Remove all sample rows?</span>
                  <button
                    className="btn btn-danger"
                    disabled={busy !== null}
                    onClick={async () => {
                      const r = await run('clear', () => api.clearSample(), () => 'Sample data removed');
                      if (r) {
                        setSample(null);
                        setConfirmClear(false);
                        touch();
                        void refreshProgress();
                      }
                    }}
                  >
                    <Busy on={busy === 'clear'}>Yes, remove</Busy>
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirmClear(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={() => setConfirmClear(true)}>
                  Remove sample data
                </button>
              )
            ) : null}
          </div>
          <AnimatePresence>
            {sample ? (
              <motion.div className="banner" data-tone="sample" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }} style={{ overflow: 'hidden' }}>
                <Icon.check />
                <div style={{ display: 'grid', gap: 6 }}>
                  <b>The sample company is ready. Try these next:</b>
                  {sample.tryKeys.map((t) => (
                    <div key={t.slug}>
                      {t.real ? (
                        <button className="keychip" onClick={() => api.openIssue(t.key)}>
                          {t.key}
                        </button>
                      ) : (
                        <span className="keychip">{t.key}</span>
                      )}{' '}
                      {t.slug === 'firebase' ? 'conflicts with DEC-12 (the Firebase decision)' : t.slug === 'checkout-again' ? 'looks like INC-214, with 2 promises still open' : 'is clean: no precedents found'}
                    </div>
                  ))}
                  {sample.warnings.map((w) => (
                    <div key={w} className="muted">
                      Note: {w}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="btn btn-sm" onClick={() => go('activity')}>
                      See guard activity
                    </button>
                    <button className="btn btn-sm" onClick={() => go('overview')}>
                      Open the overview
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Reveal>

        <Reveal className="card set-card">
          <div className="set-head">
            <span className="set-step">2</span>
            <div>
              <h3 className="serif">Scan Confluence spaces</h3>
              <p>Choose the spaces where decisions and postmortems live. Precedent reads up to 250 pages per space in the background. New and edited pages in these spaces are read automatically from then on.</p>
            </div>
          </div>
          {options.loading ? (
            <Skeleton h={90} />
          ) : options.error ? (
            <ErrorState message={options.error} retry={options.reload} />
          ) : (options.data?.spaces.length ?? 0) === 0 ? (
            <div className="banner">
              <Icon.info />
              <div>No Confluence spaces were found for your account. Create a space, or use the sample data above.</div>
            </div>
          ) : (
            <div className="set-grid" role="group" aria-label="Spaces to scan">
              {options.data?.spaces.map((s) => {
                const on = spaces.includes(s.id);
                return (
                  <button key={s.id} type="button" className="check" role="checkbox" aria-checked={on} onClick={() => setSpaces((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}>
                    <span className="check-box">{on ? <Icon.check /> : null}</span>
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <span className="keychip">{s.key}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={spaces.length === 0 || busy !== null || Boolean(progress?.running)}
              onClick={async () => {
                const r = await run('scan', () => api.startScan(spaces), (res) => (res.total ? `Scanning ${res.total} pages in the background` : 'Those spaces have no pages yet'));
                if (r && r.total) {
                  await refreshProgress();
                  if (!poll.current) poll.current = window.setInterval(() => void refreshProgress(), 2500);
                }
              }}
            >
              <Busy on={busy === 'scan' || Boolean(progress?.running)}>{progress?.running ? 'Scanning…' : `Scan ${spaces.length || ''} space${spaces.length === 1 ? '' : 's'}`}</Busy>
            </button>
            {spaces.length === 0 ? <span className="help">Select at least one space.</span> : null}
          </div>
          {progress && progress.total > 0 ? (
            <div style={{ display: 'grid', gap: 8 }} aria-live="polite">
              <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="help">
                {progress.running ? `${progress.done} of ${progress.total} pages read` : `Finished: ${progress.done} of ${progress.total} pages read`}
                {progress.failed ? ` · ${progress.failed} could not be read` : ''} · {progress.counts.decisions} decisions and {progress.counts.promises} promises so far
              </div>
            </div>
          ) : null}
        </Reveal>

        <Reveal className="card set-card">
          <div className="set-head">
            <span className="set-step">3</span>
            <div>
              <h3 className="serif">How loudly should the guard speak?</h3>
              <p>Precedent gives each finding a confidence from 0 to 100%. These settings decide what people see.</p>
            </div>
          </div>
          <div>
            <div className="set-row">
              <div>
                <b>Show in the panel when at least</b>
                <div className="help">Findings below this are ignored completely. Lower shows more, with more false alarms.</div>
              </div>
              <div className="range-wrap">
                <output>{Math.round(settings.ignoreBelow * 100)}%</output>
                <input type="range" min={40} max={90} step={1} value={Math.round(settings.ignoreBelow * 100)} aria-label="Panel threshold" onChange={(e) => patch({ ignoreBelow: Number(e.target.value) / 100, commentAbove: Math.max(settings.commentAbove, Number(e.target.value) / 100) })} />
              </div>
            </div>
            <div className="set-row">
              <div>
                <b>Post a Jira comment for strong findings</b>
                <div className="help">Off by default. One comment per work item and decision, never repeated.</div>
              </div>
              <Switch checked={settings.postComments} onChange={(v) => patch({ postComments: v })} label="Post Jira comments" />
            </div>
            <div className="set-row" style={{ opacity: settings.postComments ? 1 : 0.5 }}>
              <div>
                <b>Comment only when above</b>
                <div className="help">Applies when comments are on.</div>
              </div>
              <div className="range-wrap">
                <output>{Math.round(settings.commentAbove * 100)}%</output>
                <input type="range" min={Math.round(settings.ignoreBelow * 100)} max={98} step={1} disabled={!settings.postComments} value={Math.round(settings.commentAbove * 100)} aria-label="Comment threshold" onChange={(e) => patch({ commentAbove: Number(e.target.value) / 100 })} />
              </div>
            </div>
            <div className="set-row">
              <div>
                <b>Guard only these projects</b>
                <div className="help">Leave empty to guard every project.</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 360 }}>
                {(options.data?.projects ?? []).map((p) => {
                  const on = settings.guardProjects.includes(p.key);
                  return (
                    <button key={p.id} className="tag" aria-pressed={on} onClick={() => patch({ guardProjects: on ? settings.guardProjects.filter((k) => k !== p.key) : [...settings.guardProjects, p.key] })}>
                      {p.key}
                    </button>
                  );
                })}
                {(options.data?.projects.length ?? 0) === 0 ? <span className="faint">No projects found</span> : null}
              </div>
            </div>
            <div className="set-row">
              <div>
                <b>Use the Teamwork Graph for context</b>
                <div className="help">Early access. If it is not available on your site, Precedent quietly uses Jira links instead.</div>
              </div>
              <Switch checked={settings.useTeamworkGraph} onChange={(v) => patch({ useTeamworkGraph: v })} label="Use Teamwork Graph" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              disabled={!dirty || busy !== null}
              onClick={async () => {
                const r = await run('save', () => api.saveSettings(settings), () => 'Settings saved');
                if (r) {
                  setSettings(r);
                  setDirty(false);
                }
              }}
            >
              <Busy on={busy === 'save'}>Save settings</Busy>
            </button>
            {dirty ? <span className="help">You have unsaved changes.</span> : null}
          </div>
        </Reveal>

        <Reveal className="card set-card">
          <div className="set-head">
            <span className="set-step" style={{ background: 'var(--brass-line)', color: '#1b2333' }}>
              <Icon.guard style={{ width: 18, height: 18 }} />
            </span>
            <div>
              <h3 className="serif">Diagnostics</h3>
              <p>Check that the pieces Precedent depends on are working on this site.</p>
            </div>
          </div>
          {healthError ? (
            <ErrorState message={healthError} />
          ) : !health ? (
            <Skeleton h={64} />
          ) : (
            <div className="health">
              <div className="health-item">
                <b>
                  <span className="dot" data-ok={health.sql} />
                  Ledger database
                </b>
                <span className="help">{health.sql ? 'Forge SQL is ready' : 'Not reachable'}</span>
              </div>
              <div className="health-item">
                <b>
                  <span className="dot" data-ok={health.llm} />
                  AI models
                </b>
                <span className="help">{health.llm ? `${health.small} for reading, ${health.large} for explanations` : health.llmError ?? 'Not available. Rule-based fallback is active.'}</span>
              </div>
              <div className="health-item">
                <b>
                  <span className="dot" data-ok={true} />
                  Promise sync
                </b>
                <span className="help">{health.lastSync ? `Last run ${formatDate(health.lastSync.at)}: ${health.lastSync.checked} checked, ${health.lastSync.changed} changed` : 'Runs daily. Not run yet.'}</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={async () => {
                const r = await run('sync', () => api.sync(), (res) => `Checked ${res.checked} promises, ${res.changed} changed`);
                if (r) {
                  touch();
                  api.health().then(setHealth).catch(() => undefined);
                }
              }}
            >
              <Busy on={busy === 'sync'}>
                <Icon.refresh /> Sync promise statuses now
              </Busy>
            </button>
            <button
              className="btn"
              disabled={busy !== null}
              onClick={async () => {
                const r = await run('eval', () => api.runEval(12));
                if (r) setReport(r);
              }}
            >
              <Busy on={busy === 'eval'}>
                <Icon.spark /> Run AI accuracy test
              </Busy>
            </button>
          </div>
          <AnimatePresence>
            {report ? (
              <motion.div className="banner" data-tone="info" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Icon.info />
                <div>
                  <b>
                    Precision {(report.precision * 100).toFixed(0)}% · Recall {(report.recall * 100).toFixed(0)}% on {report.cases} labelled cases
                  </b>
                  <div className="muted">
                    Judge used: {report.judge === 'llm' ? 'AI model' : report.judge === 'mixed' ? 'AI model with rule-based fallback' : 'rule-based fallback'}. {report.truePositives} conflicts caught, {report.falsePositives} false alarm{report.falsePositives === 1 ? '' : 's'}, {report.falseNegatives} missed.
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Reveal>
      </div>
    </div>
  );
}

function Head() {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">Administration</div>
        <h1 className="display">Settings</h1>
        <p>Fill the ledger, decide how loudly the guard speaks, and check that everything is healthy.</p>
      </div>
    </div>
  );
}
