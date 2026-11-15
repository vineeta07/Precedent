import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  Heading,
  Inline,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  Textfield,
  xcss,
} from '@forge/react';
import type { Commitment, Decision } from '../ledger/types';
import { call, formatDate } from './api';

interface BylineData {
  pageId: string;
  decisions: Decision[];
  promises: Commitment[];
}

const rowStyle = xcss({ padding: 'space.150', borderColor: 'color.border', borderWidth: 'border.width', borderStyle: 'solid', borderRadius: 'radius.large' });
const wrapStyle = xcss({ padding: 'space.200', width: '420px' });

const STATUS: Record<Decision['status'], 'new' | 'success' | 'default' | 'removed'> = { proposed: 'new', accepted: 'success', superseded: 'default', rejected: 'removed' };

function DecisionRow({ d, reload }: { d: Decision; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(d.statement);
  const [error, setError] = useState<string | null>(null);
  const run = async (name: string, action: string, payload: Record<string, unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await call(action, payload);
      setEditing(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Box xcss={rowStyle}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <Lozenge appearance={STATUS[d.status]}>{d.status}</Lozenge>
          <Text weight="bold">{d.key}</Text>
          <Text color="color.text.subtlest">{formatDate(d.decidedAt)}</Text>
        </Inline>
        {editing ? <Textfield value={statement} onChange={(e) => setStatement(e.target.value)} /> : <Text>{d.statement}</Text>}
        <Text color="color.text.subtle">“{d.sourceSnippet}”</Text>
        {error ? <Text color="color.text.danger">{error}</Text> : null}
        {editing ? (
          <ButtonGroup>
            <LoadingButton appearance="primary" isLoading={busy === 'edit'} onClick={() => void run('edit', 'decision.edit', { id: d.id, statement })}>
              Save
            </LoadingButton>
            <Button appearance="subtle" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </ButtonGroup>
        ) : d.status === 'proposed' ? (
          <ButtonGroup>
            <LoadingButton appearance="primary" isLoading={busy === 'accept'} onClick={() => void run('accept', 'decision.setStatus', { id: d.id, status: 'accepted' })}>
              Confirm
            </LoadingButton>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <LoadingButton appearance="subtle" isLoading={busy === 'reject'} onClick={() => void run('reject', 'decision.setStatus', { id: d.id, status: 'rejected' })}>
              Reject
            </LoadingButton>
          </ButtonGroup>
        ) : d.status === 'accepted' ? (
          <Button appearance="subtle" onClick={() => setEditing(true)}>
            Edit wording
          </Button>
        ) : null}
      </Stack>
    </Box>
  );
}

function Byline() {
  const [data, setData] = useState<BylineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await call<BylineData>('byline.get'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const rescan = async () => {
    setScanning(true);
    try {
      await call('byline.rescan');
      setTimeout(() => void load().then(() => setScanning(false)), 12000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the scan.');
      setScanning(false);
    }
  };

  if (error && !data) {
    return (
      <Box xcss={wrapStyle}>
        <SectionMessage appearance="error" title="Precedent could not load">
          <Text>{error}</Text>
        </SectionMessage>
      </Box>
    );
  }
  if (!data) {
    return (
      <Box xcss={wrapStyle}>
        <Spinner size="medium" />
      </Box>
    );
  }
  const live = data.decisions.filter((d) => d.status !== 'rejected');
  return (
    <Box xcss={wrapStyle}>
      <Stack space="space.200">
        <Heading as="h3" size="small">
          {live.length} decision{live.length === 1 ? '' : 's'} and {data.promises.length} promise{data.promises.length === 1 ? '' : 's'} on this page
        </Heading>
        {live.length === 0 && data.promises.length === 0 ? (
          <Text color="color.text.subtle">Precedent has not found any decision or promise here yet. Scan the page after you record one.</Text>
        ) : null}
        {live.map((d) => (
          <DecisionRow key={d.id} d={d} reload={() => void load()} />
        ))}
        {data.promises.map((p) => (
          <Box key={p.id} xcss={rowStyle}>
            <Stack space="space.050">
              <Inline space="space.100" alignBlock="center">
                <Lozenge appearance={p.status === 'kept' ? 'success' : p.status === 'open' ? 'inprogress' : 'removed'}>{p.status}</Lozenge>
                <Text weight="bold">{p.key}</Text>
                <Text color="color.text.subtlest">
                  {p.ownerName ?? 'no owner'} · due {formatDate(p.dueDate)}
                </Text>
              </Inline>
              <Text>{p.statement}</Text>
            </Stack>
          </Box>
        ))}
        <LoadingButton appearance="subtle" isLoading={scanning} onClick={() => void rescan()}>
          Scan this page again
        </LoadingButton>
      </Stack>
    </Box>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Byline />
  </React.StrictMode>,
);
