import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Commitment, PromiseStatus } from '../api';
import { Busy, Drawer, Empty, ErrorState, Lozenge, Person, RowsSkeleton, Segmented, SourceQuote, itemMotion, listMotion } from '../components/ui';
import { daysLate, errorMessage, formatDate } from '../lib/format';
import { Icon } from '../lib/icons';
import { useApp, useDebounced, useLoad } from '../lib/store';

type Filter = PromiseStatus | 'all';
const ORIGIN_LABEL: Record<string, string> = { confluence: 'Confluence page', jsm_pir: 'Post-incident review', jira_comment: 'Jira comment', manual: 'Recorded by hand', sample: 'Sample data' };

export function Promises() {
  const { api, param, go, toast, touch } = useApp();
  const [status, setStatus] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Commitment | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [issueKey, setIssueKey] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const q = useDebounced(search);
  const all = useLoad(() => api.promises({}), []);
  const { data, error, loading, reload } = useLoad(() => api.promises({ status, search: q }), [status, q]);

  useEffect(() => {
    if (param && all.data) {
      const hit = all.data.find((p) => p.key === param);
      if (hit) setOpen(hit);
    }
  }, [param, all.data]);
  useEffect(() => {
    setIssueKey('');
    setLinkError(null);
  }, [open?.id]);
  // keep the open drawer in sync after an edit
  useEffect(() => {
    if (open && all.data) {
      const fresh = all.data.find((p) => p.id === open.id);
      if (fresh && (fresh.status !== open.status || fresh.linkedIssueKey !== open.linkedIssueKey)) setOpen(fresh);
    }
  }, [all.data, open]);

  const count = (s: Filter) => (all.data ? (s === 'all' ? all.data.length : all.data.filter((p) => p.status === s).length) : undefined);

  const setPromiseStatus = async (p: Commitment, s: PromiseStatus) => {
    setBusy(s);
    try {
      await api.setPromiseStatus(p.id, s);
      toast(`${p.key} marked as ${s}`);
      touch();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };
  const link = async (p: Commitment) => {
    setBusy('link');
    setLinkError(null);
    try {
      await api.linkPromise(p.id, issueKey.trim());
      toast(`${p.key} now follows ${issueKey.trim().toUpperCase()}`);
      setIssueKey('');
      touch();
    } catch (e) {
      setLinkError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Promise Ledger</div>
          <h1 className="display">Promises</h1>
          <p>Action items and commitments, each with an owner and a due date. Status follows the linked Jira work item and is refreshed every day.</p>
        </div>
      </div>
      <div className="toolbar">
        <Segmented
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All', count: count('all') },
            { value: 'open', label: 'Open', count: count('open') },
            { value: 'overdue', label: 'Overdue', count: count('overdue') },
            { value: 'broken', label: 'Broken', count: count('broken') },
            { value: 'kept', label: 'Kept', count: count('kept') },
          ]}
        />
        <div className="search">
          <Icon.search />
          <input className="input" placeholder="Search promises, owners or PAY-123" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search promises" />
        </div>
      </div>

      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading && !data ? (
        <RowsSkeleton />
      ) : data && data.length === 0 ? (
        <div className="card">
          {q || status !== 'all' ? (
            <Empty title="No promises match" body="Try a different status, or clear the search.">
              <button className="btn" onClick={() => { setStatus('all'); setSearch(''); }}>
                Clear filters
              </button>
            </Empty>
          ) : (
            <Empty title="No promises yet" body="When Precedent reads a postmortem or a page with action items, the promises land here with owner and due date.">
              <button className="btn btn-primary" onClick={() => go('settings')}>
                Go to setup
              </button>
            </Empty>
          )}
        </div>
      ) : data ? (
        <div className="card" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <div className="row-head cols-promises">
            <span>Key</span>
            <span>Promise</span>
            <span>Owner</span>
            <span>Due</span>
            <span>Tracked by</span>
            <span>Status</span>
          </div>
          <motion.div className="rows" variants={listMotion} initial="hidden" animate="show" key={`${status}-${q}`}>
            {data.map((p) => (
              <motion.button key={p.id} variants={itemMotion} className="row cols-promises" onClick={() => setOpen(p)}>
                <span className="keychip" style={{ justifySelf: 'start' }}>
                  {p.key}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="row-title">{p.statement}</span>
                  <span className="row-sub">{p.originId && /^[A-Z]+-\d+$/.test(p.originId) ? `Promised after ${p.originId}` : ORIGIN_LABEL[p.originType]}</span>
                </span>
                <Person name={p.ownerName} />
                <span className="muted num">{formatDate(p.dueDate)}</span>
                <span>{p.linkedIssueKey ? <span className="keychip">{p.linkedIssueKey}</span> : <span className="faint">not linked</span>}</span>
                <span>
                  <Lozenge tone={p.status}>{p.status}</Lozenge>
                </span>
              </motion.button>
            ))}
          </motion.div>
        </div>
      ) : null}

      <Drawer
        open={Boolean(open)}
        onClose={() => { setOpen(null); if (param) go('promises'); }}
        title={
          open ? (
            <>
              <span className="keychip">{open.key}</span>
              <Lozenge tone={open.status}>{open.status}</Lozenge>
            </>
          ) : null
        }
        footer={
          open ? (
            <>
              {open.status !== 'kept' ? (
                <button className="btn btn-primary" disabled={busy !== null} onClick={() => void setPromiseStatus(open, 'kept')}>
                  <Busy on={busy === 'kept'}>
                    <Icon.check /> Mark as kept
                  </Busy>
                </button>
              ) : null}
              {open.status !== 'broken' && open.status !== 'kept' ? (
                <button className="btn btn-danger" disabled={busy !== null} onClick={() => void setPromiseStatus(open, 'broken')}>
                  <Busy on={busy === 'broken'}>Mark as broken</Busy>
                </button>
              ) : null}
              {open.status === 'kept' || open.status === 'broken' ? (
                <button className="btn" disabled={busy !== null} onClick={() => void setPromiseStatus(open, 'open')}>
                  <Busy on={busy === 'open'}>Reopen</Busy>
                </button>
              ) : null}
            </>
          ) : null
        }
      >
        {open ? (
          <>
            <div>
              <h2 className="serif" style={{ fontSize: 24, fontWeight: 450, lineHeight: 1.25 }}>
                {open.statement}
              </h2>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 14, flexWrap: 'wrap', fontSize: 13 }}>
                <Person name={open.ownerName} />
                <span className="muted">
                  Due {formatDate(open.dueDate)}
                  {open.status !== 'kept' && daysLate(open.dueDate) > 0 ? ` · ${daysLate(open.dueDate)} days late` : ''}
                </span>
                {open.originId && /^[A-Z]+-\d+$/.test(open.originId) ? (
                  <button className="tag" onClick={() => go('incidents')}>
                    after {open.originId}
                  </button>
                ) : null}
              </div>
            </div>
            <section>
              <div className="section-title">Source</div>
              <SourceQuote snippet={open.sourceSnippet} sourceUrl={open.sourceUrl} sourceLabel={ORIGIN_LABEL[open.originType] ?? open.originType} />
            </section>
            <section>
              <div className="section-title">Tracking work item</div>
              {open.linkedIssueKey ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button className="keychip" onClick={() => api.openIssue(open.linkedIssueKey as string)}>
                    {open.linkedIssueKey}
                  </button>
                  <span className="muted">Status follows this work item. Synced daily.</span>
                </div>
              ) : (
                <div className="field">
                  <p className="muted">Link a Jira work item and Precedent keeps the status up to date for you.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" placeholder="PAY-123" value={issueKey} onChange={(e) => setIssueKey(e.target.value)} aria-label="Work item key" style={{ maxWidth: 180 }} onKeyDown={(e) => { if (e.key === 'Enter' && issueKey.trim()) void link(open); }} />
                    <button className="btn" disabled={!issueKey.trim() || busy !== null} onClick={() => void link(open)}>
                      <Busy on={busy === 'link'}>
                        <Icon.link /> Link
                      </Busy>
                    </button>
                  </div>
                  {linkError ? <div className="error-text" role="alert">{linkError}</div> : null}
                </div>
              )}
            </section>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
