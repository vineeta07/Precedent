import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { FeedbackVerdict, FlagCard } from '../api';
import { Busy, Empty, ErrorState, Lozenge, RowsSkeleton, Segmented, SourceQuote, EASE } from '../components/ui';
import { errorMessage, formatDate, KIND_LABEL } from '../lib/format';
import { useApp, useLoad } from '../lib/store';

type Filter = 'all' | FlagCard['kind'];

export function Activity() {
  const { api, go } = useApp();
  const [kind, setKind] = useState<Filter>('all');
  const { data, error, loading, reload } = useLoad(() => api.flags(), []);
  const shown = (data ?? []).filter((f) => kind === 'all' || f.kind === kind);
  const n = (k: Filter) => (data ? (k === 'all' ? data.length : data.filter((f) => f.kind === k).length) : undefined);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Promise Ledger</div>
          <h1 className="display">Guard activity</h1>
          <p>Every time Precedent spoke up on a work item. This is exactly what people see in the Precedent panel in Jira, with the same buttons.</p>
        </div>
      </div>
      <div className="toolbar">
        <Segmented
          label="Filter by kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'All', count: n('all') },
            { value: 'conflict', label: 'Conflicts', count: n('conflict') },
            { value: 'deja_vu', label: 'Déjà vu', count: n('deja_vu') },
            { value: 'open_promise', label: 'Open promises', count: n('open_promise') },
          ]}
        />
      </div>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading && !data ? (
        <RowsSkeleton rows={4} />
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty title={data && data.length ? 'Nothing of this kind' : 'The guard has been quiet'} body={data && data.length ? 'Pick another filter to see the other flags.' : 'When a new work item goes against a decision, or an incident repeats, it will show up here and in the Jira panel.'}>
            {data && data.length ? null : (
              <button className="btn" onClick={() => go('guide')}>
                How the guard works
              </button>
            )}
          </Empty>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <AnimatePresence initial={false}>
            {shown.map((f, i) => (
              <motion.div key={f.flagId} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, height: 0, marginBottom: -12 }} transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.04, ease: EASE }}>
                <FlagView card={f} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export function FlagView({ card }: { card: FlagCard }) {
  const { api, toast, touch, go } = useApp();
  const [busy, setBusy] = useState<FeedbackVerdict | null>(null);
  const [answered, setAnswered] = useState(false);
  const t = card.target;

  const send = async (verdict: FeedbackVerdict) => {
    setBusy(verdict);
    try {
      await api.feedback(card.flagId, verdict);
      if (verdict === 'not_related') {
        toast('Dismissed. It will not be shown on this work item again.');
        touch();
      } else {
        toast('Thanks. Recorded as still applying.');
        setAnswered(true);
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="card flag" data-kind={card.kind}>
      <div className="flag-top">
        <Lozenge tone={card.kind}>{KIND_LABEL[card.kind]}</Lozenge>
        <button className="keychip" onClick={() => api.openIssue(card.workItemKey)} title="Open the work item">
          {card.workItemKey}
        </button>
        <span className="faint">against</span>
        <button className="keychip" onClick={() => (t.type === 'decision' ? go('decisions', t.key) : t.type === 'promise' ? go('promises', t.key) : go('incidents'))}>
          {t.key}
        </button>
        <span className="conf" title="How sure the guard is">
          <i>
            <b style={{ width: `${Math.round(card.confidence * 100)}%` }} />
          </i>
          {Math.round(card.confidence * 100)}% sure
        </span>
      </div>
      <h4>{t.title}</h4>
      <p className="muted">{card.explanation}</p>
      <SourceQuote
        snippet={t.snippet}
        sourceUrl={t.sourceUrl}
        sourceLabel={t.sourceLabel}
        restricted={t.restricted}
        who={t.ownerName}
        when={t.date ? (t.type === 'promise' ? `due ${formatDate(t.date)}` : formatDate(t.date)) : null}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" disabled={busy !== null || answered} onClick={() => void send('still_applies')}>
          <Busy on={busy === 'still_applies'}>{answered ? 'Recorded' : 'Still applies'}</Busy>
        </button>
        <button className="btn btn-sm" disabled={busy !== null} onClick={() => void send('not_related')}>
          <Busy on={busy === 'not_related'}>Not related</Busy>
        </button>
        {t.type === 'decision' ? (
          <button className="btn btn-ghost btn-sm" onClick={() => go('decisions', t.key)}>
            Decision changed → supersede
          </button>
        ) : null}
      </div>
    </article>
  );
}
