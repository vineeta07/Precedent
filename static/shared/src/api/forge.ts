// The bridge throws when loaded outside Atlassian, so it is only imported on demand.
const bridge = () => import('@forge/bridge');
import type { Api } from './types';

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export class ApiFailure extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function call<T>(name: string, payload?: Record<string, unknown>): Promise<T> {
  let res: Envelope<T>;
  try {
    const { invoke } = await bridge();
    res = (await invoke(name, payload)) as Envelope<T>;
  } catch {
    throw new ApiFailure('Precedent could not be reached. Check your connection and try again.', 'network');
  }
  if (!res || res.ok !== true) throw new ApiFailure(res?.error?.message ?? 'Something went wrong.', res?.error?.code ?? 'failed');
  return res.data;
}

export const forgeApi: Api = {
  preview: false,
  summary: () => call('ledger.summary'),
  decisions: (filter) => call('ledger.decisions', filter),
  decision: (id) => call('ledger.decision', { id }),
  promises: (filter) => call('ledger.promises', filter),
  incidents: () => call('ledger.incidents'),
  flags: () => call('ledger.flags'),
  setDecisionStatus: (id, status) => call('decision.setStatus', { id, status }),
  supersede: (id, input) => call('decision.supersede', { id, ...input }),
  explain: (id) => call('decision.explain', { id }),
  setPromiseStatus: (id, status) => call('promise.setStatus', { id, status }),
  linkPromise: (id, issueKey) => call('promise.link', { id, issueKey }),
  feedback: (flagId, verdict) => call('flag.feedback', { flagId, verdict }),
  saveSettings: (patch) => call('admin.settings.save', patch),
  options: () => call('admin.options'),
  startScan: (spaceIds) => call('admin.scan.start', { spaceIds }),
  scanProgress: () => call('admin.scan.progress'),
  loadSample: (input) => call('admin.sample.load', input),
  clearSample: () => call('admin.sample.clear'),
  sync: () => call('admin.sync'),
  health: () => call('admin.health'),
  runEval: (limit) => call('admin.eval', { limit }),
  openIssue: (key) => void bridge().then(({ router }) => router.open(`/browse/${key}`)),
  openUrl: (url) => void bridge().then(({ router }) => router.open(url)),
};
