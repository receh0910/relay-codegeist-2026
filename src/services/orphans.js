/**
 * Orphan detection + successor ranking + handover execution.
 * Deterministic core: no LLM, works from Jira data + KVS away flags alone.
 * Successor ranking is multi-hop over the collaboration graph derived
 * from Jira (Fase 4, see services/twg.js); the native Teamwork Graph API
 * is consulted only when an admin configures a TWG connection.
 */
import * as jira from './jira.js';
import * as away from './away.js';
import { getRelatedPeople, findCollaborators, findTeammatesOf } from './twg.js';
import { daysSince, riskScore, sortOrphans } from '../lib/orphans.js';

/** Merge one hop's candidates into the running score map: highest hop
 *  score wins per person, reasons are unioned (never double-counted). */
function mergeHop(scores, hop) {
  for (const c of hop.values()) {
    const entry = scores.get(c.accountId) ?? {
      accountId: c.accountId,
      name: c.name,
      score: 0,
      reasons: new Set(),
    };
    if (c.score > entry.score) entry.score = c.score;
    for (const r of c.reasons) entry.reasons.add(r);
    scores.set(c.accountId, entry);
  }
}

/**
 * Rank successors for one issue. Multi-hop signals (Fase 4):
 *  hop 1 — resolved related work in the same project/component (10, +5 if
 *          active in the last 30 days);
 *  hop 2 — collaborators of the away person: resolved work in the projects
 *          where the away person has open issues (6, +3 recent);
 *  hop 3 — teammates of the best candidates so far: resolved work in a
 *          project where a top candidate also resolved work (3, +1 recent).
 * The away assignee is never suggested. `teamworkGraph` reports the native
 * Teamwork Graph status honestly (available:false until an admin configures
 * a TWG connection) plus the hop counts of the derived Jira graph actually
 * used — see services/twg.js.
 */
export async function suggestSuccessors({ issueKey = null, accountId = null, limit = 3 } = {}) {
  let issue = null;
  if (issueKey) issue = await jira.getIssue(issueKey);
  const awayId = accountId ?? issue?.fields?.assignee?.accountId ?? null;
  // Always return the same shape ({ successors, teamworkGraph }) so the
  // Rovo agent and the UI resolver never have to guess the type.
  const twg = await getRelatedPeople(awayId);
  const hops = { direct: 0, collaborators: 0, teammates: 0 };
  const teamworkGraph = { ...twg, hops };
  if (!issue && !awayId) return { successors: [], teamworkGraph };

  const scores = new Map(); // accountId -> { score, reasons: Set, name }

  // Hop 1 — direct: resolved related work in this project/component.
  const history = issue ? await jira.relatedWorkHistory(issue) : [];
  const hop1 = new Map();
  for (const past of history) {
    const a = past.fields?.assignee;
    if (!a?.accountId || a.accountId === awayId) continue;
    const entry = hop1.get(a.accountId) ?? { accountId: a.accountId, name: a.displayName, score: 0, reasons: new Set() };
    entry.score = Math.max(entry.score, 10);
    entry.reasons.add('Resolved related work in this project');
    const d = daysSince(past.fields?.updated) ?? 999;
    if (d <= 30) {
      entry.score = Math.max(entry.score, 15);
      entry.reasons.add('Active in the last 30 days');
    }
    hop1.set(a.accountId, entry);
  }
  hops.direct = hop1.size;
  mergeHop(scores, hop1);

  // Hop 2 — collaborators: resolved work in the away person's projects.
  let awayName = issue?.fields?.assignee?.displayName ?? null;
  if (!awayName && awayId) {
    try {
      awayName = (await jira.getUser(awayId)).displayName ?? null;
    } catch {
      awayName = null;
    }
  }
  const projectKeys = [];
  if (issue?.fields?.project?.key) projectKeys.push(issue.fields.project.key);
  if (awayId) {
    const open = await jira.openIssuesFor(awayId);
    for (const o of open) if (o.fields?.project?.key) projectKeys.push(o.fields.project.key);
  }
  const hop2 = await findCollaborators({
    awayId,
    awayName: awayName ?? 'the away person',
    projectKeys,
    excludeIds: new Set([awayId]),
  });
  hops.collaborators = hop2.size;
  mergeHop(scores, hop2);

  // Hop 3 — teammates of the best candidates so far (crosses projects).
  // Only NEW people count here: anyone already found in hop 1/2 is
  // excluded, so each hop strictly widens the net.
  const seeds = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  const hop3 = await findTeammatesOf(seeds, new Set([awayId, ...scores.keys()]));
  hops.teammates = hop3.size;
  mergeHop(scores, hop3);

  const ranked = [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((c) => ({ accountId: c.accountId, name: c.name, score: c.score, reasons: [...c.reasons] }));
  return { successors: ranked, teamworkGraph };
}

function toOrphan(issue, flag) {
  const updated = issue.fields?.updated;
  const daysStale = daysSince(updated) ?? 0;
  const daysUntilReturn = flag?.returnDate ? daysSince(flag.returnDate) * -1 : null;
  const risk = riskScore({
    priority: issue.fields?.priority?.name ?? 'Medium',
    daysStale,
    isAway: true,
    daysUntilReturn,
  });
  return {
    key: issue.key,
    summary: issue.fields?.summary ?? '',
    status: issue.fields?.status?.name ?? '',
    priority: issue.fields?.priority?.name ?? 'Medium',
    assigneeAccountId: issue.fields?.assignee?.accountId ?? null,
    assigneeName: issue.fields?.assignee?.displayName ?? 'Unassigned',
    updated,
    daysStale,
    returnDate: flag?.returnDate ?? null,
    risk,
  };
}

/** Open issues of everyone currently flagged away. */
export async function findOrphans({ projectKey = null, maxResults = 20 } = {}) {
  const flags = await away.getAllAwayFlags();
  const orphans = [];
  for (const [accountId, flag] of Object.entries(flags)) {
    if (!flag) continue;
    const issues = await jira.openIssuesFor(accountId, projectKey);
    for (const issue of issues) orphans.push(toOrphan(issue, flag));
  }
  return sortOrphans(orphans).slice(0, maxResults);
}

/**
 * People with open work + their away status — the roster for the Radar
 * "mark away" UI (BUG #5, 26 Nov 2026). The viewer is included even with no
 * open issues so they can mark themselves away. Sorted by open-issue count.
 */
export async function listTeamMembers({ viewerAccountId = null } = {}) {
  const flags = await away.getAllAwayFlags();
  const open = await jira.searchIssues('resolution = Unresolved ORDER BY updated DESC', 50);
  const byId = new Map();
  for (const issue of open) {
    const a = issue.fields?.assignee;
    if (!a?.accountId) continue;
    const entry = byId.get(a.accountId) ?? {
      accountId: a.accountId,
      name: a.displayName ?? a.accountId,
      openCount: 0,
    };
    entry.openCount += 1;
    byId.set(a.accountId, entry);
  }
  if (viewerAccountId && !byId.has(viewerAccountId)) {
    try {
      const me = await jira.getUser(viewerAccountId);
      byId.set(viewerAccountId, {
        accountId: viewerAccountId,
        name: me.displayName ?? viewerAccountId,
        openCount: 0,
      });
    } catch {
      // Viewer lookup is best-effort; the roster still works without them.
    }
  }
  return [...byId.values()]
    .map((m) => {
      const flag = flags[m.accountId] ?? null;
      return {
        ...m,
        away: Boolean(flag),
        returnDate: flag?.returnDate ?? null,
        note: flag?.note ?? '',
      };
    })
    .sort((a, b) => b.openCount - a.openCount);
}

/** Reassign + post a handover comment (ADF) with the context. */
export async function executeHandover({ issueKey, successorAccountId, note = '' }) {
  const issue = await jira.getIssue(issueKey);
  const successor = await jira.getUser(successorAccountId);
  const prevAssignee = issue.fields?.assignee?.displayName ?? 'Unassigned';
  await jira.assignIssue(issueKey, successorAccountId);

  const lines = [
    { type: 'paragraph', content: [{ type: 'text', text: `Relay handover: ${prevAssignee} → ${successor.displayName}`, marks: [{ type: 'strong' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: `Work: ${issue.fields?.summary ?? issueKey} (status: ${issue.fields?.status?.name ?? '?'}, priority: ${issue.fields?.priority?.name ?? '?'})` }] },
  ];
  if (note) lines.push({ type: 'paragraph', content: [{ type: 'text', text: `Note: ${note}` }] });
  lines.push({ type: 'paragraph', content: [{ type: 'text', text: 'Handed over by Relay (Codegeist 2026).', marks: [{ type: 'em' }] }] });
  await jira.addComment(issueKey, { type: 'doc', version: 1, content: lines });
  return { issueKey, previousAssignee: prevAssignee, successor: successor.displayName };
}

/** Full packet for one away person: their open issues + successor each. */
export async function getHandoverPacket({ accountId }) {
  const flag = await away.getAwayFlag(accountId);
  const user = await jira.getUser(accountId);
  const issues = await jira.openIssuesFor(accountId);
  const items = [];
  for (const issue of issues) {
    const orphan = toOrphan(issue, flag);
    const { successors } = await suggestSuccessors({ issueKey: issue.key, limit: 1 });
    items.push({ ...orphan, suggestedSuccessor: successors[0] ?? null });
  }
  return {
    person: { accountId, name: user.displayName, returnDate: flag?.returnDate ?? null, note: flag?.note ?? '' },
    openIssues: sortOrphans(items),
  };
}
