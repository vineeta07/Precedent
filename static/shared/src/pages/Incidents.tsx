import { motion } from 'motion/react';
import { Empty, ErrorState, Lozenge, Person, Reveal, Skeleton } from '../components/ui';
import { formatDate } from '../lib/format';
import { Icon } from '../lib/icons';
import { useApp, useLoad } from '../lib/store';

export function Incidents() {
  const { api, go } = useApp();
  const { data, error, loading, reload } = useLoad(() => api.incidents(), []);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Promise Ledger</div>
          <h1 className="display">Repeat incidents</h1>
          <p>Past incidents, the fixes that were promised after each one, and whether the same failure has come back. Incidents with a recurrence are listed first.</p>
        </div>
      </div>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading && !data ? (
        <div style={{ display: 'grid', gap: 16 }} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card incident">
              <Skeleton w="40%" h={22} />
              <Skeleton h={14} />
              <Skeleton h={14} w="70%" />
            </div>
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <div className="card">
          <Empty title="No incidents recorded yet" body="Precedent learns incidents from post-incident reviews in Confluence and from incident work items in Jira Service Management.">
            <button className="btn btn-primary" onClick={() => go('settings')}>
              Go to setup
            </button>
          </Empty>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {(data ?? []).map((row, i) => {
            const done = row.promises.length - row.openPromises;
            return (
              <Reveal key={row.incident.key} delay={Math.min(i, 5) * 0.05} className="card incident">
                <div className="incident-top">
                  <span className="keychip">{row.incident.key}</span>
                  <h3 className="serif">{row.incident.summary}</h3>
                  <span className="faint" style={{ marginLeft: 'auto' }}>
                    {formatDate(row.incident.occurredAt)}
                  </span>
                  {row.recurrences.length > 0 ? <Lozenge tone="deja_vu">came back</Lozenge> : null}
                </div>
                <p className="muted" style={{ maxWidth: '90ch' }}>
                  {row.incident.description}
                </p>
                <div className="incident-grid">
                  <div>
                    <div className="section-title">
                      Promised fixes · {done} of {row.promises.length} done
                    </div>
                    {row.promises.length === 0 ? (
                      <p className="faint">No promises were recorded for this incident.</p>
                    ) : (
                      <>
                        <div className="meter" style={{ marginBottom: 6 }}>
                          <motion.span initial={{ width: 0 }} whileInView={{ width: `${(done / row.promises.length) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9 }} style={{ background: 'var(--chart-kept)' }} />
                          {row.openPromises ? <motion.span initial={{ width: 0 }} whileInView={{ width: `${(row.openPromises / row.promises.length) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.1 }} style={{ background: 'var(--chart-missed)' }} /> : null}
                        </div>
                        {row.promises.map((p) => (
                          <div key={p.id} className="mini-promise">
                            <button className="keychip" onClick={() => go('promises', p.key)}>
                              {p.key}
                            </button>
                            <span>
                              {p.statement}
                              <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                                <Person name={p.ownerName} />
                              </span>
                            </span>
                            <Lozenge tone={p.status}>{p.status}</Lozenge>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  <div>
                    <div className="section-title">Did it come back?</div>
                    {row.recurrences.length === 0 ? (
                      <p className="faint">No similar incident has been seen since.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {row.recurrences.map((r) => (
                          <div key={r.workItemKey} className="recur">
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <Icon.incident style={{ width: 16, height: 16 }} />
                              <button className="keychip" onClick={() => api.openIssue(r.workItemKey)}>
                                {r.workItemKey}
                              </button>
                              <span className="faint" style={{ fontSize: 12 }}>
                                {Math.round(r.confidence * 100)}% sure · {formatDate(r.at)}
                              </span>
                            </div>
                            <div>{r.explanation}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.incident.postmortemUrl ? (
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, marginLeft: -10 }} onClick={() => api.openUrl(row.incident.postmortemUrl as string)}>
                        Open the postmortem <Icon.external />
                      </button>
                    ) : null}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
