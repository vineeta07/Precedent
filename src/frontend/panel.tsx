import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  Heading,
  Inline,
  Link,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  Textfield,
  TextArea,
  User,
  xcss,
} from '@forge/react';
import type { FlagCard, PanelView } from '../ledger/views';
import type { FeedbackVerdict } from '../ledger/types';
import { call, formatDate } from './api';

const cardStyle = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'radius.large',
  backgroundColor: 'elevation.surface.raised',
});
const quoteStyle = xcss({
  padding: 'space.150',
  borderRadius: 'radius.medium',
  backgroundColor: 'color.background.neutral',
});
const skeletonStyle = xcss({ height: '72px', borderRadius: 'radius.large', backgroundColor: 'color.background.neutral' });

const KIND: Record<FlagCard['kind'], { label: string; appearance: 'removed' | 'moved' | 'inprogress' | 'new' }> = {
  conflict: { label: 'Conflict', appearance: 'removed' },
  deja_vu: { label: 'Déjà vu', appearance: 'moved' },
  open_promise: { label: 'Open promise', appearance: 'inprogress' },
  revisits: { label: 'Revisits', appearance: 'new' },
};

const VERDICT_ICON: Record<PanelView['verdict']['tone'], string> = { conflict: '⚠', dejavu: '↺', promise: '◷', clear: '✓' };
const VERDICT_APPEARANCE: Record<PanelView['verdict']['tone'], 'error' | 'warning' | 'information' | 'success'> = {
  conflict: 'error',
  dejavu: 'warning',
  promise: 'information',
  clear: 'success',
};

function Card({ card, onDone }: { card: FlagCard; onDone: () => void }) {
  const [busy, setBusy] = useState<FeedbackVerdict | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [superseding, setSuperseding] = useState(false);
  const [statement, setStatement] = useState('');
  const [reason, setReason] = useState('');
  const kind = KIND[card.kind];
  const t = card.target;

  const send = async (verdict: FeedbackVerdict) => {
    setBusy(verdict);
    setError(null);
    try {
      if (verdict === 'superseded') {
        await call('decision.supersede', { id: t.id, statement, reason });
      }
      await call('flag.feedback', { flagId: card.flagId, verdict });
      setDone(verdict === 'still_applies' ? 'Thanks. Recorded as still applying.' : verdict === 'not_related' ? 'Dismissed. This will not be shown again here.' : 'Recorded. The old decision is kept in the chain.');
      if (verdict !== 'still_applies') onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answer.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box xcss={cardStyle}>
      <Stack space="space.150">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Lozenge appearance={kind.appearance} isBold>
            {kind.label}
          </Lozenge>
          <Text weight="bold">{t.key}</Text>
          <Text color="color.text.subtlest">{Math.round(card.confidence * 100)}% sure</Text>
        </Inline>
        <Heading as="h4" size="small">
          {t.title}
        </Heading>
        <Text>{card.explanation}</Text>
        {t.restricted ? (
          <Text color="color.text.subtlest">The source is restricted. Ask its owner for access to read the quote.</Text>
        ) : t.snippet ? (
          <Box xcss={quoteStyle}>
            <Text color="color.text.subtle">“{t.snippet}”</Text>
          </Box>
        ) : null}
        <Inline space="space.100" alignBlock="center" shouldWrap>
          {t.ownerAccountId ? <User accountId={t.ownerAccountId} /> : <Text color="color.text.subtle">{t.ownerName ?? 'Owner not recorded'}</Text>}
          <Text color="color.text.subtlest">
            {t.type === 'promise' ? `due ${formatDate(t.date)}` : formatDate(t.date)} · {t.sourceLabel}
          </Text>
          {t.sourceUrl ? (
            <Link href={t.sourceUrl} openNewTab>
              View source
            </Link>
          ) : null}
        </Inline>
        {error ? <SectionMessage appearance="error">{<Text>{error}</Text>}</SectionMessage> : null}
        {done ? (
          <Text color="color.text.success">{done}</Text>
        ) : superseding ? (
          <Stack space="space.100">
            <Textfield placeholder="The new decision, in one sentence" value={statement} onChange={(e) => setStatement(e.target.value)} />
            <TextArea placeholder="Why did it change?" value={reason} onChange={(e) => setReason(e.target.value)} />
            <ButtonGroup>
              <LoadingButton appearance="primary" isLoading={busy === 'superseded'} isDisabled={statement.trim().length < 8 || reason.trim().length < 3} onClick={() => void send('superseded')}>
                Supersede {t.key}
              </LoadingButton>
              <Button appearance="subtle" onClick={() => setSuperseding(false)}>
                Cancel
              </Button>
            </ButtonGroup>
          </Stack>
        ) : (
          <ButtonGroup>
            <LoadingButton isLoading={busy === 'still_applies'} onClick={() => void send('still_applies')}>
              Still applies
            </LoadingButton>
            <LoadingButton isLoading={busy === 'not_related'} onClick={() => void send('not_related')}>
              Not related
            </LoadingButton>
            {t.type === 'decision' ? (
              <Button appearance="subtle" onClick={() => setSuperseding(true)}>
                Decision changed
              </Button>
            ) : null}
          </ButtonGroup>
        )}
      </Stack>
    </Box>
  );
}

function Panel() {
  const [view, setView] = useState<PanelView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [queued, setQueued] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await call<PanelView>('panel.get'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load precedents.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recheck = async () => {
    setRechecking(true);
    try {
      await call('panel.recheck');
      setQueued(true);
      // The check runs in the background; look again shortly without blocking the panel.
      setTimeout(() => void load().then(() => setQueued(false)), 9000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the check.');
    } finally {
      setRechecking(false);
    }
  };

  if (error && !view) {
    return (
      <SectionMessage appearance="error" title="Precedent could not load">
        <Stack space="space.100">
          <Text>{error}</Text>
          <Button onClick={() => void load()}>Try again</Button>
        </Stack>
      </SectionMessage>
    );
  }
  if (!view) {
    return (
      <Stack space="space.150">
        <Box xcss={skeletonStyle} />
        <Box xcss={skeletonStyle} />
      </Stack>
    );
  }

  return (
    <Stack space="space.200">
      <SectionMessage appearance={VERDICT_APPEARANCE[view.verdict.tone]}>
        <Inline spread="space-between" alignBlock="center">
          <Text weight="bold">
            {VERDICT_ICON[view.verdict.tone]} {view.verdict.text}
          </Text>
        </Inline>
      </SectionMessage>
      {view.cards.map((card) => (
        <Card key={card.flagId} card={card} onDone={() => void load()} />
      ))}
      {view.cards.length === 0 ? (
        <Text color="color.text.subtle">
          {view.ledgerEmpty
            ? 'The ledger is empty. Ask a Jira admin to scan a Confluence space or load the sample data in Precedent settings.'
            : 'Nothing in the ledger goes against this work item, and no related promise is open.'}
        </Text>
      ) : null}
      <Inline space="space.100" alignBlock="center">
        <LoadingButton appearance="subtle" isLoading={rechecking} onClick={() => void recheck()}>
          Check again
        </LoadingButton>
        {queued ? (
          <Inline space="space.050" alignBlock="center">
            <Spinner size="small" />
            <Text color="color.text.subtlest">Checking in the background…</Text>
          </Inline>
        ) : null}
      </Inline>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>,
);
