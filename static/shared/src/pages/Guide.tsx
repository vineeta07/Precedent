import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Lozenge, Reveal, EASE } from '../components/ui';
import { Icon } from '../lib/icons';
import { useApp } from '../lib/store';

const SECTIONS = [
  { id: 'start', title: 'Get started in 3 steps' },
  { id: 'words', title: 'The words we use' },
  { id: 'panel', title: 'The panel in Jira' },
  { id: 'confluence', title: 'Confirming on Confluence' },
  { id: 'ledger', title: 'Using the ledger' },
  { id: 'changed', title: 'When a decision changes' },
  { id: 'assistant', title: 'Ask Rovo or your AI tool' },
  { id: 'admin', title: 'For administrators' },
  { id: 'faq', title: 'Questions' },
];

const FAQ = [
  { q: 'Can Precedent make up a decision?', a: 'No. Every decision and promise must carry an exact quote from the page it came from. If the quote is not really in the text, the item is thrown away before it reaches the ledger. Decisions also start as “proposed” until a person confirms them, unless the source is very explicit.' },
  { q: 'Will it spam my work items with comments?', a: 'No. By default it never comments; it only shows the panel. If an administrator turns comments on, it posts one comment, only for flags it is more than 80% sure about, and never twice for the same decision on the same work item. Edits made within 60 seconds are grouped into one check.' },
  { q: 'I pressed “Not related”. Will the flag come back?', a: 'No. A dismissed flag stays dismissed for that work item, even when the work item is edited again.' },
  { q: 'Who can see what?', a: 'The panel and the ledger read as you. If you cannot open a Confluence page, you see that a decision exists but not its quote or link.' },
  { q: 'How is a promise marked as kept?', a: 'When the linked Jira work item is done, the promise is kept. If it is closed as “Won’t do”, or it is long past due and nobody started it, it is broken. Past due but in progress is overdue. Without a linked work item you can mark it by hand.' },
  { q: 'What does the keep rate count?', a: 'Kept promises divided by all promises whose outcome is known or that are already past due. Promises that are not due yet do not count against you.' },
  { q: 'What happens to a superseded decision?', a: 'It stays in the ledger, crossed out, and points to the decision that replaced it. It never raises a flag again.' },
  { q: 'Does it work without the AI?', a: 'Yes, in a simpler way. If Forge LLMs are not available on your site, Precedent falls back to careful rules: it only picks up clearly worded lines and only flags a conflict when a work item proposes something a decision names as rejected.' },
];

export function Guide() {
  const { go, param } = useApp();
  const [active, setActive] = useState('start');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const main = document.querySelector('.main');
    if (!main) return;
    const onScroll = () => {
      let current = SECTIONS[0]?.id ?? 'start';
      for (const s of SECTIONS) {
        const el = document.getElementById(`g-${s.id}`);
        if (el && el.getBoundingClientRect().top < 160) current = s.id;
      }
      setActive(current);
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (param) document.getElementById(`g-${param}`)?.scrollIntoView({ block: 'start' });
  }, [param]);

  const jump = (id: string) => document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Help</div>
          <h1 className="display">User guide</h1>
          <p>Everything you need to use Precedent, in plain words. Reading time: about five minutes.</p>
        </div>
      </div>
      <div className="guide">
        <nav className="toc" aria-label="Guide sections">
          {SECTIONS.map((s) => (
            <button key={s.id} aria-current={active === s.id} onClick={() => jump(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
        <div className="guide-body">
          <Reveal as="section" className="guide-section">
            <div id="g-start" className="guide-section">
              <div className="eyebrow">Start here</div>
              <h2 className="serif">Get started in 3 steps</h2>
              <p>Precedent needs something to remember before it can help. An administrator does this once.</p>
              <ol className="guide-steps">
                <li>
                  <div>
                    <b>Open Settings and load the sample company</b>
                    <span>One button creates “Nimbus Pay”: 14 decisions, 13 promises and 7 past incidents. Good for a first look. You can remove it later.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <b>Scan your own Confluence spaces</b>
                    <span>Pick the spaces where your team writes ADRs, postmortems and meeting notes. Precedent reads them in the background and shows live progress.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <b>Create a work item and look at the Precedent panel</b>
                    <span>Try “Migrate customer login to Firebase Auth” with the sample data loaded. Within a few seconds the panel shows the conflict with DEC-12.</span>
                  </div>
                </li>
              </ol>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary" onClick={() => go('settings')}>
                  Open Settings <Icon.arrow />
                </button>
              </div>
            </div>
          </Reveal>

          <Reveal as="section" className="guide-section">
            <div id="g-words" className="guide-section">
              <h2 className="serif">The words we use</h2>
              <p>
                A <b>decision</b> is a choice the team made that should hold for future work. A <b>promise</b> is something a person said they would do, like an action item from a postmortem.
              </p>
              <div className="legend-grid">
                {[
                  { tone: 'conflict', label: 'Conflict', text: 'The work item goes against an accepted decision.' },
                  { tone: 'deja_vu', label: 'Déjà vu', text: 'This incident looks like a past one, and fixes promised back then may still be open.' },
                  { tone: 'open_promise', label: 'Open promise', text: 'A related commitment has not been done yet.' },
                  { tone: 'revisits', label: 'Revisits', text: 'The work item openly proposes to re-open an earlier decision.' },
                  { tone: 'proposed', label: 'Proposed', text: 'Found by Precedent, waiting for a person to confirm.' },
                  { tone: 'accepted', label: 'Accepted', text: 'Confirmed. New work is checked against it.' },
                  { tone: 'superseded', label: 'Superseded', text: 'Replaced by a newer decision. Kept as history only.' },
                  { tone: 'kept', label: 'Kept', text: 'The promise was done.' },
                  { tone: 'overdue', label: 'Overdue', text: 'Past its due date, still in progress.' },
                  { tone: 'broken', label: 'Broken', text: 'Closed without doing it, or long past due and never started.' },
                ].map((l) => (
                  <div key={l.label} className="legend-item">
                    <span>
                      <Lozenge tone={l.tone}>{l.label}</Lozenge>
                    </span>
                    <p>{l.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal as="section" className="guide-section">
            <div id="g-panel" className="guide-section">
              <h2 className="serif">The panel in Jira</h2>
              <p>
                Open any work item or incident and find <b>Precedent</b> in the panels. The first line is the verdict, for example “Conflicts with 1 decision” or “Looks like INC-214 — 2 promises still open”. Below it, each card shows what was found, the exact quote, who owns it, when, and a link to the source.
              </p>
              <p>Each card has three buttons:</p>
              <ol className="guide-steps">
                <li>
                  <div>
                    <b>Still applies</b>
                    <span>You agree. The flag stays, and your answer is recorded in the decision’s history.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <b>Not related</b>
                    <span>The flag is wrong for this work item. It disappears and does not return.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <b>Decision changed</b>
                    <span>The decision is out of date. Write the new decision and why. The old one is superseded, not deleted.</span>
                  </div>
                </li>
              </ol>
              <p style={{ marginTop: 14 }}>
                The panel opens instantly because it only reads the ledger. The checking itself runs in the background, a few seconds after a work item is created and about a minute after an edit. Use <b>Check again</b> to ask for a fresh check.
              </p>
            </div>
          </Reveal>

          <Reveal as="section" className="guide-section">
            <div id="g-confluence" className="guide-section">
              <h2 className="serif">Confirming on Confluence</h2>
              <p>
                Under the title of a Confluence page you will see <b>Precedent</b> in the byline. Click it to see the decisions and promises found on that page. For each proposed decision choose <b>Confirm</b>, <b>Edit</b> (fix the wording) or <b>Reject</b> (it was not a decision). Only confirmed decisions guard new work.
              </p>
              <p>When you edit the page, Precedent re-reads only the sections that changed.</p>
            </div>
          </Reveal>

          <Reveal as="section" className="guide-section">
            <div id="g-ledger" className="guide-section">
              <h2 className="serif">Using the ledger</h2>
              <p>
                The ledger is this app. <b>Overview</b> shows the numbers. <b>Decisions</b> and <b>Promises</b> are searchable lists; click a row to open its details. <b>Repeat incidents</b> shows each past incident with the fixes promised after it. <b>Guard activity</b> lists every flag the guard has raised.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['overview', 'decisions', 'promises', 'incidents', 'activity'] as const).map((r) => (
                  <button key={r} className="btn btn-sm" onClick={() => go(r)}>
                    {r === 'incidents' ? 'Repeat incidents' : r === 'activity' ? 'Guard activity' : r[0]?.toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal as="section" className="guide-section">
            <div id="g-changed" className="guide-section">
              <h2 className="serif">When a decision changes</h2>
              <p>
                Decisions move in one direction: <b>proposed → accepted → superseded</b>. To change an accepted decision, open it and choose <b>Decision changed</b>. Precedent creates the new decision, marks the old one as superseded and links the two, so anyone can see what was true and when.
              </p>
            </div>
          </Reveal>

          <Reveal as="section" className="guide-section">
            <div id="g-assistant" className="guide-section">
              <h2 className="serif">Ask Rovo or your AI tool</h2>
              <p>
                In Rovo chat, pick the <b>Precedent</b> agent and ask in your own words: “Did we decide anything about Firebase?”, “Which promises from postmortems are overdue?”. Every answer names the decision key, owner, date and source quote.
              </p>
              <p>
                The same five actions are also published as an MCP server, so coding assistants and desktop AI apps can check precedents before they write code. In the client’s connector settings, add the Atlassian Rovo MCP server and sign in:
              </p>
              <div className="code">{`{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/sse"]
    }
  }
}`}</div>
              <p style={{ marginTop: 14 }}>
                Then ask: <i>“Check Precedent before I start: can we move auth to Firebase?”</i> The tools are <kbd>find-precedents</kbd>, <kbd>check-conflict</kbd>, <kbd>list-open-promises</kbd>, <kbd>explain-decision</kbd> and <kbd>supersede-decision</kbd>.
              </p>
            </div>
          </Reveal>

          <Reveal as="section" className="guide-section">
            <div id="g-admin" className="guide-section">
              <h2 className="serif">For administrators</h2>
              <p>
                In <b>Settings</b> you choose which spaces to scan and which projects to guard, set how sure Precedent must be before it shows a flag (default 55%) or posts a comment (default 80%, off), refresh promise statuses, and check that the database and AI models are healthy. You can also run the built-in accuracy test, which scores the AI on 46 labelled cases.
              </p>
            </div>
          </Reveal>

          <Reveal as="section" className="guide-section">
            <div id="g-faq" className="guide-section">
              <h2 className="serif">Questions</h2>
              <div className="faq">
                {FAQ.map((f, i) => (
                  <div key={f.q} className="faq-item">
                    <button className="faq-q" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                      {f.q}
                      <i>+</i>
                    </button>
                    <AnimatePresence initial={false}>
                      {openFaq === i ? (
                        <motion.div className="faq-a" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                          <p>{f.a}</p>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
