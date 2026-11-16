import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { DecisionRow, DecisionStatus } from '../api';
import { DecisionDrawer } from '../components/DecisionDrawer';
import { Empty, ErrorState, Lozenge, Person, RowsSkeleton, Segmented, itemMotion, listMotion } from '../components/ui';
import { formatDate } from '../lib/format';
import { Icon } from '../lib/icons';
import { useApp, useDebounced, useLoad } from '../lib/store';

type Filter = DecisionStatus | 'all';

export function Decisions() {
  const { api, param, go } = useApp();
  const [status, setStatus] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounced(search);
  const all = useLoad(() => api.decisions({}), []);
  const { data, error, loading, reload } = useLoad(() => api.decisions({ status, search: q, tag: tag ?? undefined }), [status, q, tag]);

  // Deep links: "DEC-12" opens the drawer, "tag:auth" applies a filter.
  useEffect(() => {
    if (!param) return;
    if (param.startsWith('tag:')) setTag(param.slice(4));
    else if (all.data) {
      const hit = all.data.find((d) => d.key === param || d.id === param);
      if (hit) setOpenId(hit.id);
    }
  }, [param, all.data]);

  const count = (s: Filter) => (all.data ? (s === 'all' ? all.data.length : all.data.filter((d) => d.status === s).length) : undefined);
  const filtered = Boolean(q || tag || status !== 'all');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Promise Ledger</div>
          <h1 className="display">Decisions</h1>
          <p>Every decision Precedent has found, with its source. Accepted decisions guard new work. Superseded ones are kept as history and never raise a flag.</p>
        </div>
      </div>
      <div className="toolbar">
        <Segmented
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All', count: count('all') },
            { value: 'accepted', label: 'Accepted', count: count('accepted') },
            { value: 'proposed', label: 'Proposed', count: count('proposed') },
            { value: 'superseded', label: 'Superseded', count: count('superseded') },
          ]}
        />
        <div className="search">
          <Icon.search />
          <input className="input" placeholder="Search decisions or DEC-12" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search decisions" />
        </div>
        {tag ? (
          <button className="tag" aria-pressed="true" onClick={() => { setTag(null); go('decisions'); }} title="Remove tag filter">
            {tag} ✕
          </button>
        ) : null}
      </div>

      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading && !data ? (
        <RowsSkeleton />
      ) : data && data.length === 0 ? (
        <div className="card">
          {filtered ? (
            <Empty title="No decisions match" body="Try a different status, or clear the search.">
              <button className="btn" onClick={() => { setStatus('all'); setSearch(''); setTag(null); }}>
                Clear filters
              </button>
            </Empty>
          ) : (
            <Empty title="No decisions yet" body="Scan a Confluence space or load the sample data, and decisions will appear here with their sources.">
              <button className="btn btn-primary" onClick={() => go('settings')}>
                Go to setup
              </button>
            </Empty>
          )}
        </div>
      ) : data ? (
        <div className="card" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <div className="row-head cols-decisions">
            <span>Key</span>
            <span>Decision</span>
            <span>Owner</span>
            <span>Decided</span>
            <span>Status</span>
          </div>
          <motion.div className="rows" variants={listMotion} initial="hidden" animate="show" key={`${status}-${q}-${tag}`}>
            {data.map((d) => (
              <DecisionRowView key={d.id} d={d} onOpen={() => setOpenId(d.id)} />
            ))}
          </motion.div>
        </div>
      ) : null}

      <DecisionDrawer id={openId} onClose={() => { setOpenId(null); if (param) go('decisions'); }} onNavigate={setOpenId} />
    </div>
  );
}

function DecisionRowView({ d, onOpen }: { d: DecisionRow; onOpen: () => void }) {
  return (
    <motion.button variants={itemMotion} className="row cols-decisions" onClick={onOpen}>
      <span className="keychip" style={{ justifySelf: 'start' }}>
        {d.key}
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="row-title" style={d.status === 'superseded' ? { textDecoration: 'line-through', textDecorationColor: 'var(--ink-faint)', color: 'var(--ink-soft)' } : undefined}>
          {d.title}
        </span>
        <span className="row-sub">{d.statement}</span>
      </span>
      <Person name={d.ownerName} />
      <span className="muted num">{formatDate(d.decidedAt)}</span>
      <span>
        <Lozenge tone={d.status}>{d.status}</Lozenge>
      </span>
    </motion.button>
  );
}
