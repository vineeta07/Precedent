/**
 * Forge SQL (MySQL-compatible) schema. Written in a portable subset so the
 * same statements also run on SQLite in unit tests.
 * `key` is reserved in MySQL, so ledger keys are stored as dkey / pkey / ikey.
 */
export const MIGRATIONS: { name: string; statement: string }[] = [
  {
    name: 'v001_create_decisions',
    statement: `CREATE TABLE IF NOT EXISTS decisions (
      id VARCHAR(64) PRIMARY KEY,
      dkey VARCHAR(32) NOT NULL,
      title VARCHAR(512) NOT NULL,
      statement TEXT NOT NULL,
      rationale TEXT,
      alternatives_rejected TEXT,
      scope_tags TEXT,
      owner_account_id VARCHAR(128),
      owner_name VARCHAR(255),
      decided_at VARCHAR(32),
      status VARCHAR(16) NOT NULL,
      superseded_by VARCHAR(64),
      source_type VARCHAR(32) NOT NULL,
      source_id VARCHAR(128),
      source_url TEXT,
      source_snippet TEXT,
      content_hash VARCHAR(64) NOT NULL,
      confidence DOUBLE NOT NULL,
      sample TINYINT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )`,
  },
  {
    name: 'v002_create_promises',
    statement: `CREATE TABLE IF NOT EXISTS promises (
      id VARCHAR(64) PRIMARY KEY,
      pkey VARCHAR(32) NOT NULL,
      statement TEXT NOT NULL,
      origin_type VARCHAR(32) NOT NULL,
      origin_id VARCHAR(128),
      owner_account_id VARCHAR(128),
      owner_name VARCHAR(255),
      due_date VARCHAR(10),
      linked_issue_key VARCHAR(64),
      status VARCHAR(16) NOT NULL,
      source_url TEXT,
      source_snippet TEXT,
      scope_tags TEXT,
      content_hash VARCHAR(64) NOT NULL,
      sample TINYINT NOT NULL,
      created_at VARCHAR(32) NOT NULL,
      updated_at VARCHAR(32) NOT NULL
    )`,
  },
  {
    name: 'v003_create_incidents',
    statement: `CREATE TABLE IF NOT EXISTS incidents (
      ikey VARCHAR(64) PRIMARY KEY,
      summary VARCHAR(512) NOT NULL,
      description TEXT,
      occurred_at VARCHAR(32),
      postmortem_url TEXT,
      scope_tags TEXT,
      sample TINYINT NOT NULL
    )`,
  },
  {
    name: 'v004_create_flags',
    statement: `CREATE TABLE IF NOT EXISTS flags (
      id VARCHAR(64) PRIMARY KEY,
      work_item_key VARCHAR(64) NOT NULL,
      target_type VARCHAR(16) NOT NULL,
      target_id VARCHAR(64) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      confidence DOUBLE NOT NULL,
      explanation TEXT,
      dismissed TINYINT NOT NULL,
      commented TINYINT NOT NULL,
      created_at VARCHAR(32) NOT NULL
    )`,
  },
  {
    name: 'v005_create_feedback',
    statement: `CREATE TABLE IF NOT EXISTS feedback (
      id VARCHAR(64) PRIMARY KEY,
      flag_id VARCHAR(64) NOT NULL,
      account_id VARCHAR(128) NOT NULL,
      verdict VARCHAR(32) NOT NULL,
      note TEXT,
      created_at VARCHAR(32) NOT NULL
    )`,
  },
  {
    name: 'v006_create_links',
    statement: `CREATE TABLE IF NOT EXISTS links (
      entity_id VARCHAR(64) NOT NULL,
      target_type VARCHAR(32) NOT NULL,
      target_id VARCHAR(128) NOT NULL,
      relation VARCHAR(32) NOT NULL,
      PRIMARY KEY (entity_id, target_type, target_id, relation)
    )`,
  },
  {
    name: 'v007_create_history',
    statement: `CREATE TABLE IF NOT EXISTS history (
      id VARCHAR(64) PRIMARY KEY,
      entity_id VARCHAR(64) NOT NULL,
      kind VARCHAR(32) NOT NULL,
      actor_account_id VARCHAR(128),
      detail TEXT,
      at VARCHAR(32) NOT NULL
    )`,
  },
  {
    name: 'v008_create_counters',
    statement: `CREATE TABLE IF NOT EXISTS counters (
      name VARCHAR(32) PRIMARY KEY,
      value BIGINT NOT NULL
    )`,
  },
  {
    name: 'v009_create_source_sections',
    statement: `CREATE TABLE IF NOT EXISTS source_sections (
      source_id VARCHAR(128) NOT NULL,
      section_hash VARCHAR(64) NOT NULL,
      seen_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (source_id, section_hash)
    )`,
  },
  {
    name: 'v010_create_llm_cache',
    statement: `CREATE TABLE IF NOT EXISTS llm_cache (
      hash VARCHAR(64) PRIMARY KEY,
      response TEXT NOT NULL,
      created_at VARCHAR(32) NOT NULL
    )`,
  },
  { name: 'v011_idx_decisions_source', statement: 'CREATE INDEX idx_decisions_source ON decisions (source_id)' },
  { name: 'v012_idx_decisions_hash', statement: 'CREATE INDEX idx_decisions_hash ON decisions (content_hash)' },
  { name: 'v013_idx_promises_issue', statement: 'CREATE INDEX idx_promises_issue ON promises (linked_issue_key)' },
  { name: 'v014_idx_promises_origin', statement: 'CREATE INDEX idx_promises_origin ON promises (origin_id)' },
  { name: 'v015_idx_flags_item', statement: 'CREATE INDEX idx_flags_item ON flags (work_item_key)' },
  { name: 'v016_idx_history_entity', statement: 'CREATE INDEX idx_history_entity ON history (entity_id)' },
];
