/**
 * Sample world: "Nimbus Pay", a fictional payments company.
 * Pure fixture data with no site-specific identifiers, so it loads on any Atlassian site.
 */
import type { DecisionStatus, PromiseStatus } from '../ledger/types';

export interface SeedDecision {
  key: string;
  title: string;
  statement: string;
  rationale: string;
  rejected: string[];
  tags: string[];
  owner: string;
  decidedAt: string;
  status: DecisionStatus;
  page: string;
  snippet: string;
  supersedes?: string;
}

export interface SeedPromise {
  key: string;
  statement: string;
  owner: string;
  due: string;
  status: PromiseStatus;
  origin: string;
  page: string;
  snippet: string;
  tags: string[];
  /** Slug used to create a tracking issue when a Jira project is chosen. */
  issue?: { summary: string; done: boolean };
}

export interface SeedIncident {
  key: string;
  summary: string;
  description: string;
  occurredAt: string;
  tags: string[];
  page?: string;
}

export interface SeedPage {
  slug: string;
  title: string;
  storage: string;
}

export const SEED_DECISIONS: SeedDecision[] = [
  {
    key: 'DEC-12',
    title: 'Keep authentication in-house; do not move to Firebase',
    statement: 'We will not move customer authentication to Firebase Auth. Identity stays on our own auth service in the EU region.',
    rationale:
      'Data residency: our banking partners require EU customer identity data to stay in EU-controlled infrastructure, and Firebase Auth could not guarantee single-region storage for all identity metadata.',
    rejected: ['Firebase Auth', 'Auth0 hosted in the US region'],
    tags: ['auth', 'firebase', 'identity', 'data-residency'],
    owner: 'Priya Raman',
    decidedAt: '2026-03-12',
    status: 'accepted',
    page: 'adr-012',
    snippet: 'We decided NOT to move authentication to Firebase. EU customer identity data must stay in EU-controlled infrastructure.',
  },
  {
    key: 'DEC-7',
    title: 'PostgreSQL is the system of record for the payments ledger',
    statement: 'All money movement is recorded in PostgreSQL. We will not use DynamoDB or any eventually consistent store for the payments ledger.',
    rationale: 'Double-entry bookkeeping needs serializable transactions and foreign keys.',
    rejected: ['DynamoDB', 'MongoDB'],
    tags: ['payments', 'ledger', 'database', 'postgresql'],
    owner: 'Marcus Oyelaran',
    decidedAt: '2026-01-20',
    status: 'accepted',
    page: 'adr-007',
    snippet: 'We decided that PostgreSQL is the only system of record for money movement. DynamoDB was rejected for the ledger.',
  },
  {
    key: 'DEC-9',
    title: 'Card data never touches our servers',
    statement: 'We will not store or log raw card numbers (PAN). Card capture goes through the tokenisation vault only.',
    rationale: 'Keeps most services out of PCI DSS scope.',
    rejected: ['Encrypting PANs in our own database'],
    tags: ['pci', 'cards', 'security', 'checkout'],
    owner: 'Elena Sokolova',
    decidedAt: '2026-02-03',
    status: 'accepted',
    page: 'adr-009',
    snippet: 'We will never store or log raw card numbers. All card capture goes through the tokenisation vault.',
  },
  {
    key: 'DEC-10',
    title: 'All payment API writes must be idempotent',
    statement: 'Every write endpoint in the payments API must accept an Idempotency-Key header and be safe to retry.',
    rationale: 'Double charges during retries were our most expensive class of bug in 2025.',
    rejected: ['Client-side de-duplication only'],
    tags: ['payments', 'api', 'idempotency'],
    owner: 'Marcus Oyelaran',
    decidedAt: '2026-02-18',
    status: 'accepted',
    page: 'adr-010',
    snippet: 'Going forward, we will require an Idempotency-Key on every write endpoint in the payments API.',
  },
  {
    key: 'DEC-11',
    title: 'Use Kafka for payment events',
    statement: 'Payment events are published to Kafka. We will not add new RabbitMQ queues.',
    rationale: 'One event backbone, replayable history for reconciliation.',
    rejected: ['RabbitMQ', 'AWS SQS fan-out'],
    tags: ['events', 'kafka', 'messaging'],
    owner: 'Tom Becker',
    decidedAt: '2026-02-27',
    status: 'accepted',
    page: 'adr-011',
    snippet: 'We chose Kafka as the single event backbone. No new RabbitMQ queues will be added.',
  },
  {
    key: 'DEC-4',
    title: 'Deploy freezes on the last two business days of each month',
    statement: 'We will not deploy to production on the last two business days of the month, except for incident fixes.',
    rationale: 'Month-end settlement runs are the highest-risk window for merchants.',
    rejected: [],
    tags: ['release', 'deploy', 'settlement'],
    owner: 'Aiko Tanaka',
    decidedAt: '2025-11-05',
    status: 'accepted',
    page: 'release-policy',
    snippet: 'The team agreed that there are no production deploys on the last two business days of each month.',
  },
  {
    key: 'DEC-5',
    title: 'Monolith first for the merchant dashboard',
    statement: 'The merchant dashboard stays a single Rails application. We will not split it into microservices this year.',
    rationale: 'A team of six cannot operate ten services.',
    rejected: ['Microservices per bounded context'],
    tags: ['dashboard', 'architecture', 'rails'],
    owner: 'Diego Fernández',
    decidedAt: '2025-12-02',
    status: 'superseded',
    page: 'adr-005',
    snippet: 'We decided to keep the merchant dashboard as one Rails application.',
  },
  {
    key: 'DEC-14',
    title: 'Extract reporting from the merchant dashboard',
    statement: 'Reporting is extracted into its own service; the rest of the merchant dashboard stays in the Rails application.',
    rationale: 'Report generation was starving the web workers at month end.',
    rejected: ['Splitting the whole dashboard'],
    tags: ['dashboard', 'architecture', 'reporting'],
    owner: 'Diego Fernández',
    decidedAt: '2026-05-14',
    status: 'accepted',
    page: 'adr-014',
    snippet: 'We decided to extract reporting into its own service. This supersedes ADR-005 for reporting only.',
    supersedes: 'DEC-5',
  },
  {
    key: 'DEC-13',
    title: 'Checkout calls to the acquirer have a 3 second timeout budget',
    statement: 'Every call from checkout to an acquirer must have a 3 second timeout and at most one retry.',
    rationale: 'Unbounded waits pile up connections and take down checkout for everyone.',
    rejected: ['Per-acquirer custom timeouts set by hand'],
    tags: ['checkout', 'timeouts', 'acquirer', 'reliability'],
    owner: 'Aiko Tanaka',
    decidedAt: '2026-04-09',
    status: 'accepted',
    page: 'adr-013',
    snippet: 'We decided that all acquirer calls from checkout get a 3 second timeout budget with a single retry.',
  },
  {
    key: 'DEC-15',
    title: 'Feature flags are removed within 30 days of full rollout',
    statement: 'A feature flag must be deleted within 30 days after it reaches 100% rollout.',
    rationale: 'Stale flags caused the wrong fee table to load in May.',
    rejected: [],
    tags: ['feature-flags', 'hygiene'],
    owner: 'Tom Becker',
    decidedAt: '2026-06-02',
    status: 'accepted',
    page: 'eng-guidelines',
    snippet: 'Going forward, we will remove every feature flag within 30 days of full rollout.',
  },
  {
    key: 'DEC-16',
    title: 'Mobile SDKs support the last two major OS versions',
    statement: 'The iOS and Android SDKs support only the current and previous major OS version.',
    rationale: 'Older versions are under 2% of payment volume.',
    rejected: ['Supporting three major versions'],
    tags: ['mobile', 'sdk', 'ios', 'android'],
    owner: 'Elena Sokolova',
    decidedAt: '2026-06-20',
    status: 'accepted',
    page: 'mobile-notes',
    snippet: 'We agreed to support only the last two major OS versions in the mobile SDKs.',
  },
  {
    key: 'DEC-17',
    title: 'Adopt OpenTelemetry for tracing',
    statement: 'New services emit traces with OpenTelemetry. Vendor-specific tracing agents will not be added.',
    rationale: 'Avoids lock-in and lets SRE change backends.',
    rejected: ['Vendor APM agents'],
    tags: ['observability', 'tracing', 'opentelemetry'],
    owner: 'Aiko Tanaka',
    decidedAt: '2026-08-11',
    status: 'accepted',
    page: 'sre-standards',
    snippet: 'We decided to standardise on OpenTelemetry. No vendor-specific tracing agents in new services.',
  },
  {
    key: 'DEC-18',
    title: 'Proposal: move fraud scoring to a streaming model',
    statement: 'Fraud scoring would move from nightly batch to a streaming model on Kafka.',
    rationale: 'Would cut chargebacks from same-day card testing attacks.',
    rejected: [],
    tags: ['fraud', 'kafka', 'ml'],
    owner: 'Priya Raman',
    decidedAt: '2026-10-06',
    status: 'proposed',
    page: 'fraud-notes',
    snippet: 'Proposal: we will move fraud scoring to a streaming model, pending a cost review.',
  },
  {
    key: 'DEC-19',
    title: 'Refunds over €5,000 need a second approver',
    statement: 'Any refund above €5,000 requires approval from a second person in Finance Ops.',
    rationale: 'Control requested by the auditors after the Q2 review.',
    rejected: [],
    tags: ['refunds', 'finance', 'controls'],
    owner: 'Marcus Oyelaran',
    decidedAt: '2026-09-01',
    status: 'accepted',
    page: 'payments-notes',
    snippet: 'We decided that refunds above €5,000 need a second approver from Finance Ops.',
  },
];

export const SEED_INCIDENTS: SeedIncident[] = [
  {
    key: 'INC-214',
    summary: 'Checkout payment timeouts',
    description:
      'Card payments in checkout timed out for 47 minutes. The acquirer gateway slowed down, our checkout service had no timeout on acquirer calls, the connection pool was exhausted and every checkout request queued until it failed.',
    occurredAt: '2026-07-14',
    tags: ['checkout', 'payments', 'timeouts', 'acquirer'],
    page: 'pm-inc-214',
  },
  {
    key: 'INC-187',
    summary: 'Duplicate payouts to merchants',
    description: 'A retry storm in the payout worker sent 312 merchants their payout twice because the payout endpoint was not idempotent.',
    occurredAt: '2026-04-22',
    tags: ['payouts', 'idempotency'],
    page: 'pm-inc-187',
  },
  {
    key: 'INC-201',
    summary: 'Login outage after certificate expiry',
    description: 'The TLS certificate of the auth service expired. Customers and merchants could not sign in for 22 minutes.',
    occurredAt: '2026-06-03',
    tags: ['auth', 'certificates'],
    page: 'pm-inc-201',
  },
  {
    key: 'INC-176',
    summary: 'Webhook delivery delays',
    description: 'Merchant webhooks were delayed up to 3 hours while a Kafka consumer group was stuck rebalancing.',
    occurredAt: '2026-03-30',
    tags: ['webhooks', 'kafka'],
  },
  {
    key: 'INC-193',
    summary: 'Settlement report generated with wrong fee table',
    description: 'A stale feature flag loaded the 2025 fee table and settlement reports for May were wrong for 40 merchants.',
    occurredAt: '2026-05-19',
    tags: ['settlement', 'feature-flags'],
  },
  {
    key: 'INC-208',
    summary: 'Mobile SDK crash on app start',
    description: 'Release 4.2 of the Android SDK crashed on start for devices without Play Services.',
    occurredAt: '2026-06-25',
    tags: ['mobile', 'android', 'sdk'],
  },
  {
    key: 'INC-222',
    summary: 'Database failover took 9 minutes',
    description: 'The primary PostgreSQL node failed. Automatic failover took 9 minutes because the replica was lagging.',
    occurredAt: '2026-08-29',
    tags: ['database', 'postgresql', 'failover'],
  },
];

export const SEED_PROMISES: SeedPromise[] = [
  {
    key: 'PRM-31',
    statement: 'Add a 3 second timeout and circuit breaker to all acquirer calls in checkout.',
    owner: 'Aiko Tanaka',
    due: '2026-08-01',
    status: 'kept',
    origin: 'INC-214',
    page: 'pm-inc-214',
    snippet: 'Action item: Add a 3 second timeout and circuit breaker to all acquirer calls in checkout. Owner: Aiko Tanaka. Due 2026-08-01.',
    tags: ['checkout', 'timeouts', 'acquirer'],
    issue: { summary: 'Add timeout and circuit breaker to acquirer calls in checkout', done: true },
  },
  {
    key: 'PRM-32',
    statement: 'Add an alert on checkout connection pool saturation above 80%.',
    owner: 'Tom Becker',
    due: '2026-08-08',
    status: 'broken',
    origin: 'INC-214',
    page: 'pm-inc-214',
    snippet: 'Action item: Add an alert on checkout connection pool saturation above 80%. Owner: Tom Becker. Due 2026-08-08.',
    tags: ['checkout', 'alerting', 'connection-pool'],
    issue: { summary: 'Alert on checkout connection pool saturation', done: false },
  },
  {
    key: 'PRM-33',
    statement: 'Run a load test of checkout against a slow acquirer before every peak season.',
    owner: 'Marcus Oyelaran',
    due: '2026-09-15',
    status: 'broken',
    origin: 'INC-214',
    page: 'pm-inc-214',
    snippet: 'Action item: Run a load test of checkout against a slow acquirer before every peak season. Owner: Marcus Oyelaran. Due 2026-09-15.',
    tags: ['checkout', 'load-test', 'acquirer'],
    issue: { summary: 'Load test checkout against a slow acquirer', done: false },
  },
  {
    key: 'PRM-21',
    statement: 'Make the payout endpoint idempotent with an Idempotency-Key.',
    owner: 'Marcus Oyelaran',
    due: '2026-05-10',
    status: 'kept',
    origin: 'INC-187',
    page: 'pm-inc-187',
    snippet: 'Action item: Make the payout endpoint idempotent with an Idempotency-Key. Owner: Marcus Oyelaran. Due 2026-05-10.',
    tags: ['payouts', 'idempotency'],
  },
  {
    key: 'PRM-22',
    statement: 'Add a reconciliation job that detects duplicate payouts within one hour.',
    owner: 'Priya Raman',
    due: '2026-05-31',
    status: 'kept',
    origin: 'INC-187',
    page: 'pm-inc-187',
    snippet: 'Action item: Add a reconciliation job that detects duplicate payouts within one hour. Owner: Priya Raman. Due 2026-05-31.',
    tags: ['payouts', 'reconciliation'],
  },
  {
    key: 'PRM-26',
    statement: 'Automate certificate renewal for the auth service.',
    owner: 'Aiko Tanaka',
    due: '2026-06-20',
    status: 'kept',
    origin: 'INC-201',
    page: 'pm-inc-201',
    snippet: 'Action item: Automate certificate renewal for the auth service. Owner: Aiko Tanaka. Due 2026-06-20.',
    tags: ['auth', 'certificates'],
  },
  {
    key: 'PRM-27',
    statement: 'Add expiry alerts 30 days ahead for every production certificate.',
    owner: 'Tom Becker',
    due: '2026-07-01',
    status: 'overdue',
    origin: 'INC-201',
    page: 'pm-inc-201',
    snippet: 'Action item: Add expiry alerts 30 days ahead for every production certificate. Owner: Tom Becker. Due 2026-07-01.',
    tags: ['certificates', 'alerting'],
  },
  {
    key: 'PRM-29',
    statement: 'Delete all feature flags that have been at 100% for more than 30 days.',
    owner: 'Tom Becker',
    due: '2026-06-30',
    status: 'kept',
    origin: 'INC-193',
    page: 'eng-guidelines',
    snippet: 'Follow-up: Delete all feature flags that have been at 100% for more than 30 days. Owner: Tom Becker.',
    tags: ['feature-flags'],
  },
  {
    key: 'PRM-34',
    statement: 'Test the Android SDK on devices without Play Services in CI.',
    owner: 'Elena Sokolova',
    due: '2026-07-20',
    status: 'kept',
    origin: 'INC-208',
    page: 'mobile-notes',
    snippet: 'Action item: Test the Android SDK on devices without Play Services in CI. Owner: Elena Sokolova.',
    tags: ['mobile', 'android', 'ci'],
  },
  {
    key: 'PRM-36',
    statement: 'Alert when PostgreSQL replica lag exceeds 30 seconds.',
    owner: 'Aiko Tanaka',
    due: '2026-09-20',
    status: 'kept',
    origin: 'INC-222',
    page: 'sre-standards',
    snippet: 'Action item: Alert when PostgreSQL replica lag exceeds 30 seconds. Owner: Aiko Tanaka. Due 2026-09-20.',
    tags: ['database', 'postgresql', 'alerting'],
  },
  {
    key: 'PRM-37',
    statement: 'Run a failover drill every quarter.',
    owner: 'Aiko Tanaka',
    due: '2026-12-15',
    status: 'open',
    origin: 'INC-222',
    page: 'sre-standards',
    snippet: 'Action item: Run a failover drill every quarter. Owner: Aiko Tanaka. Due 2026-12-15.',
    tags: ['database', 'failover'],
  },
  {
    key: 'PRM-38',
    statement: 'Publish the data residency map for all customer identity fields.',
    owner: 'Priya Raman',
    due: '2026-12-01',
    status: 'open',
    origin: 'adr-012',
    page: 'adr-012',
    snippet: 'Follow-up: Publish the data residency map for all customer identity fields. Owner: Priya Raman. Due 2026-12-01.',
    tags: ['auth', 'data-residency'],
  },
  {
    key: 'PRM-39',
    statement: 'Move the last two RabbitMQ queues to Kafka.',
    owner: 'Tom Becker',
    due: '2026-10-15',
    status: 'overdue',
    origin: 'adr-011',
    page: 'adr-011',
    snippet: 'Follow-up: Move the last two RabbitMQ queues to Kafka. Owner: Tom Becker. Due 2026-10-15.',
    tags: ['kafka', 'messaging'],
  },
];

/** Work items that show the guard in action. Created as real issues when a project is chosen. */
export const SEED_WORK_ITEMS = [
  {
    slug: 'firebase',
    fallbackKey: 'PAY-482',
    summary: 'Migrate customer login to Firebase Auth',
    description:
      'Our own auth service is expensive to maintain. Move customer sign-in and sign-up to Firebase Auth so we can delete the in-house identity service. Start with the mobile app, then web checkout.',
    labels: ['auth'],
    incident: false,
  },
  {
    slug: 'checkout-again',
    fallbackKey: 'INC-231',
    summary: 'Checkout timing out for card payments',
    description:
      'Card payments in checkout are timing out again. The acquirer gateway is responding slowly and checkout requests queue until the connection pool is exhausted.',
    labels: ['checkout', 'payments'],
    incident: true,
  },
  {
    slug: 'clean',
    fallbackKey: 'PAY-490',
    summary: 'Add dark mode to the merchant dashboard',
    description: 'Merchants asked for a dark theme in the dashboard. Use the design tokens from the component library.',
    labels: ['dashboard'],
    incident: false,
  },
] as const;

const p = (t: string) => `<p>${t}</p>`;
const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

export const SEED_PAGES: SeedPage[] = [
  {
    slug: 'adr-012',
    title: 'ADR-012: Keep authentication in-house (do not move to Firebase)',
    storage:
      '<h2>Status</h2>' +
      p('Accepted on 2026-03-12. Owner: Priya Raman.') +
      '<h2>Context</h2>' +
      p('Maintaining our own auth service costs about one engineer per quarter. Firebase Auth and Auth0 were evaluated as replacements.') +
      '<h2>Decision</h2>' +
      p('We decided NOT to move authentication to Firebase. EU customer identity data must stay in EU-controlled infrastructure.') +
      p('Our banking partners require EU customer identity data to stay in EU-controlled infrastructure, and Firebase Auth could not guarantee single-region storage for all identity metadata.') +
      '<h2>Rejected options</h2>' +
      ul(['Firebase Auth: no single-region guarantee for identity metadata.', 'Auth0 hosted in the US region: same residency problem.']) +
      '<h2>Follow-ups</h2>' +
      ul(['Follow-up: Publish the data residency map for all customer identity fields. Owner: Priya Raman. Due 2026-12-01.']),
  },
  {
    slug: 'pm-inc-214',
    title: 'Postmortem INC-214: Checkout payment timeouts',
    storage:
      '<h2>Summary</h2>' +
      p('On 2026-07-14 card payments in checkout timed out for 47 minutes. The acquirer gateway slowed down, our checkout service had no timeout on acquirer calls, the connection pool was exhausted and every checkout request queued until it failed.') +
      '<h2>Root cause</h2>' +
      p('Calls from checkout to the acquirer had no timeout. A slow acquirer held every connection in the pool.') +
      '<h2>Action items</h2>' +
      ul([
        'Action item: Add a 3 second timeout and circuit breaker to all acquirer calls in checkout. Owner: Aiko Tanaka. Due 2026-08-01.',
        'Action item: Add an alert on checkout connection pool saturation above 80%. Owner: Tom Becker. Due 2026-08-08.',
        'Action item: Run a load test of checkout against a slow acquirer before every peak season. Owner: Marcus Oyelaran. Due 2026-09-15.',
      ]),
  },
  {
    slug: 'adr-007',
    title: 'ADR-007: PostgreSQL is the system of record for the payments ledger',
    storage:
      '<h2>Decision</h2>' +
      p('We decided that PostgreSQL is the only system of record for money movement. DynamoDB was rejected for the ledger.') +
      '<h2>Why</h2>' +
      p('Double-entry bookkeeping needs serializable transactions and foreign keys.'),
  },
];
