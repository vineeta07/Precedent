import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Explanation } from '../api';
import { errorMessage, formatDate, KIND_LABEL } from '../lib/format';
import { Icon } from '../lib/icons';
import { useApp, useLoad } from '../lib/store';
import { Busy, Drawer, ErrorState, Lozenge, Modal, Person, Skeleton, SourceQuote } from './ui';

const SOURCE_LABEL: Record<string, string> = {
  confluence: 'Confluence page',
  jsm_pir: 'Post-incident review',
  jira_comment: 'Jira comment',
  manual: 'Recorded by hand',
  sample: 'Sample data',
};

export function DecisionDrawer({ id, onClose, onNavigate }: { id: string | null; onClose: () => void; onNavigate: (id: string) => void }) {
  const { api, toast, touch } = useApp();
  const { data, error, loading, reload } = useLoad(() => (id ? api.decision(id) : Promise.resolve(null)), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [superseding, setSuperseding] = useState(false);
  const [statement, setStatement] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);

  useEffect(() => {
    setExplanation(null);
    setSuperseding(false);
    setStatement('');
    setReason('');
    setFormError(null);
  }, [id]);

  const d = data && data.decision.id === id ? data.decision : null;

  const act = async (name: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(name);
    try {
      await fn();
      toast(done);
      touch();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const submitSupersede = async () => {
    if (!d) return;
    if (statement.trim().length < 8) return setFormError('Write the new decision as one full sentence.');
    if (reason.trim().length < 3) return setFormError('Say why the decision changed.');
    setFormError(null);
    setBusy('supersede');
    try {
      const res = await api.supersede(d.id, { statement: statement.trim(), reason: reason.trim() });
      toast(`${res.old.key} is now superseded by ${res.next.key}`);
      setSuperseding(false);
      touch();
      onNavigate(res.next.id);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const explain = async () => {
    if (!d) return;
    setBusy('explain');
    try {
      setExplanation(await api.explain(d.id));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Drawer
        open={Boolean(id)}
        onClose={onClose}
        title={
          d ? (
            <>
              <span className="keychip">{d.key}</span>
              <Lozenge tone={d.status}>{d.status}</Lozenge>
              <span className="faint" style={{ fontSize: 12.5 }}>
                {Math.round(d.confidence * 100)}% extraction confidence
              </span>
            </>
          ) : (
            <Skeleton w={160} h={20} />
          )
        }
        footer={
          d ? (
            <>
              {d.status === 'proposed' ? (
                <>
                  <button className="btn btn-primary" disabled={busy !== null} onClick={() => void act('accept', () => api.setDecisionStatus(d.id, 'accepted'), `${d.key} accepted. It now guards new work.`)}>
                    <Busy on={busy === 'accept'}>Confirm decision</Busy>
                  </button>
                  <button className="btn btn-danger" disabled={busy !== null} onClick={() => void act('reject', () => api.setDecisionStatus(d.id, 'rejected'), `${d.key} rejected`)}>
                    <Busy on={busy === 'reject'}>Not a decision</Busy>
                  </button>
                </>
              ) : null}
              {d.status === 'accepted' ? (
                <button className="btn" onClick={() => setSuperseding(true)}>
                  Decision changed…
                </button>
              ) : null}
              <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void explain()}>
                <Busy on={busy === 'explain'}>
                  <Icon.spark /> Explain
                </Busy>
              </button>
            </>
          ) : null
        }
      >
        {error ? (
          <ErrorState message={error} retry={reload} />
        ) : !d || !data || (loading && data.decision.id !== id) ? (
          <div style={{ display: 'grid', gap: 14 }} aria-busy="true">
            <Skeleton h={30} w="80%" />
            <Skeleton h={14} />
            <Skeleton h={14} w="90%" />
            <Skeleton h={90} />
            <Skeleton h={60} />
          </div>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={d.id}>
              <h2 className="serif" style={{ fontSize: 26, fontWeight: 450, lineHeight: 1.2 }}>
                {d.title}
              </h2>
              <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.6 }}>{d.statement}</p>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 14, flexWrap: 'wrap', fontSize: 13 }}>
                <Person name={d.ownerName} />
                <span className="muted">Decided {formatDate(d.decidedAt)}</span>
                {d.scopeTags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            </motion.div>

            <AnimatePresence>
              {explanation ? (
                <motion.div className="banner" data-tone="info" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                  <Icon.spark />
                  <div style={{ whiteSpace: 'pre-wrap' }}>{explanation.summary.replace(/\*\*/g, '')}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <section>
              <div className="section-title">Source</div>
              <SourceQuote snippet={d.sourceSnippet} sourceUrl={d.sourceUrl} sourceLabel={SOURCE_LABEL[d.sourceType] ?? d.sourceType} restricted={data.restricted} />
            </section>

            {d.rationale ? (
              <section>
                <div className="section-title">Why</div>
                <p style={{ lineHeight: 1.65 }}>{d.rationale}</p>
              </section>
            ) : null}

            {d.alternativesRejected.length ? (
              <section>
                <div className="section-title">Rejected alternatives</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {d.alternativesRejected.map((a) => (
                    <div key={a} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <Icon.close style={{ width: 14, height: 14, color: 'var(--oxblood)', flex: 'none' }} />
                      {a}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {data.chain.length > 1 ? (
              <section>
                <div className="section-title">Supersede chain</div>
                <div className="chain">
                  {data.chain.map((c, i) => (
                    <div key={c.id} style={{ display: 'flex' }}>
                      {i > 0 ? (
                        <span className="chain-arrow">
                          <Icon.arrow style={{ width: 16, height: 16 }} />
                        </span>
                      ) : null}
                      <button className="chain-node" data-current={c.id === d.id} data-status={c.status} onClick={() => onNavigate(c.id)}>
                        <span className="keychip">{c.key}</span> <Lozenge tone={c.status}>{c.status}</Lozenge>
                        <div className="chain-title">{c.title}</div>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <div className="section-title">Linked work</div>
              {data.flaggedWork.length === 0 && data.promises.length === 0 ? (
                <p className="muted">No work item has been flagged against this decision.</p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.flaggedWork.map((f) => (
                    <div key={f.workItemKey + f.kind} className="card" style={{ padding: '12px 14px', display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Lozenge tone={f.kind}>{KIND_LABEL[f.kind]}</Lozenge>
                        <button className="keychip" onClick={() => api.openIssue(f.workItemKey)}>
                          {f.workItemKey}
                        </button>
                        <span className="faint" style={{ fontSize: 12 }}>
                          {Math.round(f.confidence * 100)}% sure{f.dismissed ? ' · dismissed' : ''}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 13.5 }}>
                        {f.explanation}
                      </div>
                    </div>
                  ))}
                  {data.promises.map((p) => (
                    <div key={p.id} className="card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span className="keychip">{p.key}</span>
                      <span style={{ flex: 1 }}>{p.statement}</span>
                      <Lozenge tone={p.status}>{p.status}</Lozenge>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="section-title">History</div>
              <div className="timeline">
                {data.history.map((h) => (
                  <div key={h.id} className="tl-item">
                    {h.detail}
                    <time>{formatDate(h.at)}</time>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </Drawer>

      <Modal open={superseding && Boolean(d)} onClose={() => setSuperseding(false)} title={`Supersede ${d?.key ?? ''}`}>
        <p className="muted">The old decision is kept in the chain and stops raising flags. The new one takes its place.</p>
        <div className="field">
          <label htmlFor="sup-statement">The new decision</label>
          <textarea id="sup-statement" className="textarea" placeholder="We will … (one sentence)" value={statement} onChange={(e) => setStatement(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="sup-reason">Why did it change?</label>
          <input id="sup-reason" className="input" placeholder="What is different now" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {formError ? <div className="error-text" role="alert">{formError}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setSuperseding(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy === 'supersede'} onClick={() => void submitSupersede()}>
            <Busy on={busy === 'supersede'}>Supersede</Busy>
          </button>
        </div>
      </Modal>
    </>
  );
}
