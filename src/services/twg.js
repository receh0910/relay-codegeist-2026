/**
 * Teamwork Graph layer — Fase 4.
 *
 * Two layers, kept strictly separate so nothing is ever misrepresented:
 *
 * 1. NATIVE Teamwork Graph API (@forge/teamwork-graph SDK).
 *    It is a connector API, not a read API for Atlassian's own graph:
 *    every call needs a `connectionId` (created by an org admin in Rovo
 *    Studio / admin console) and only reads back objects THIS app indexed
 *    under that connection; there is no traversal/query endpoint for
 *    "who works with whom". `getRelatedPeople` therefore attempts the
 *    real SDK read ONLY when a connection id is configured in storage
 *    (`twg-connection-id`); otherwise it returns `{ available: false }`
 *    with the reason — never fake data. The SDK is loaded with a dynamic
 *    import inside try/catch so a load failure degrades gracefully
 *    instead of killing the whole function module at startup.
 *
 *    Storage note (Plan B, 26 Nov 2026, bug kritis #4): the connection id
 *    is read via the legacy `storage` from `@forge/api`, not `@forge/kvs`
 *    — the KVS service 403'd on this installation (see away.js).
 *
 * 2. DERIVED multi-hop collaboration graph (the working enrichment).
 *    Built deterministically from Jira data — the observable teamwork
 *    graph of the site: who resolved work with whom, in which projects.
 *    Hop 1 = direct related work (scored in orphans.js: 10, +5 recent).
 *    Hop 2 = collaborators of the away person: people who resolved work
 *    in the same projects as the away person's open issues (6, +3 recent).
 *    Hop 3 = teammates of the best candidates so far: for each seed, its
 *    most recent resolved project, then the other resolvers there — this
 *    hop crosses into projects the away person never touched (3, +1 recent).
 *    Every candidate carries the hop and the evidence in its reason, so
 *    the Rovo agent can quote it honestly. Scores never stack across
 *    hops for one person: the highest hop wins, reasons are unioned.
 */
import { storage } from '@forge/api';
import * as jira from './jira.js';
import { daysSince } from '../lib/orphans.js';

const CONNECTION_KEY = 'twg-connection-id';
const RECENT_DAYS = 30;
const HOP2_BASE = 6;
const HOP2_RECENT = 3;
const HOP3_BASE = 3;
const HOP3_RECENT = 1;
const MAX_PROJECTS = 3;
const MAX_HOP3_SEEDS = 3;

/** Native Teamwork Graph status — honest by construction (see header). */
export async function getRelatedPeople(accountId) {
  const fallback = {
    available: false,
    source: 'jira-collaboration-graph',
    reason:
      'No Teamwork Graph connection is configured for this site (an org admin creates one in Rovo Studio); ranking uses the multi-hop collaboration graph derived from Jira instead.',
  };
  if (!accountId) return { ...fallback, reason: 'No person given; no graph data was consulted.' };
  let connectionId = null;
  try {
    connectionId = await storage.get(CONNECTION_KEY);
  } catch {
    connectionId = null; // Storage read failed — degrade to the derived graph.
  }
  if (!connectionId) return fallback;
  try {
    const { graph } = await import('@forge/teamwork-graph');
    const res = await graph.getUserByExternalId({ externalId: accountId, connectionId });
    if (res?.success && res?.user) {
      return { available: true, source: 'teamwork-graph', user: res.user };
    }
    return {
      ...fallback,
      reason: `Teamwork Graph connection is configured but the person is not indexed in it (${res?.error ?? 'no user returned'}); ranking uses the multi-hop collaboration graph derived from Jira instead.`,
    };
  } catch (err) {
    return {
      ...fallback,
      reason: `Teamwork Graph read failed (${err?.message ?? 'unknown error'}); ranking uses the multi-hop collaboration graph derived from Jira instead.`,
    };
  }
}

function addCandidate(map, accountId, name, score, reason) {
  if (!accountId) return;
  const entry = map.get(accountId) ?? { accountId, name, score: 0, reasons: new Set() };
  if (score > entry.score) entry.score = score;
  entry.reasons.add(reason);
  map.set(accountId, entry);
}

/**
 * Hop 2 — collaborators of the away person: everyone who resolved work in
 * the projects where the away person has open issues. Returns a Map of
 * accountId -> { accountId, name, score, reasons: Set }.
 */
export async function findCollaborators({ awayId, awayName, projectKeys, excludeIds = new Set() }) {
  const found = new Map();
  const projects = [...new Set(projectKeys ?? [])].filter(Boolean).slice(0, MAX_PROJECTS);
  for (const projectKey of projects) {
    let resolved = [];
    try {
      resolved = await jira.resolvedWorkInProject(projectKey);
    } catch {
      continue; // One bad project must not kill the whole ranking.
    }
    for (const past of resolved) {
      const a = past.fields?.assignee;
      if (!a?.accountId || a.accountId === awayId || excludeIds.has(a.accountId)) continue;
      const d = daysSince(past.fields?.updated) ?? 999;
      const score = HOP2_BASE + (d <= RECENT_DAYS ? HOP2_RECENT : 0);
      addCandidate(
        found,
        a.accountId,
        a.displayName,
        score,
        `Resolved work in ${projectKey}, where ${awayName} also has open work`
      );
    }
  }
  return found;
}

/**
 * Hop 3 — teammates of the best candidates so far: for each seed, its most
 * recent resolved project, then the other resolvers in that project.
 * Returns a Map of accountId -> { accountId, name, score, reasons: Set }.
 */
export async function findTeammatesOf(seeds, excludeIds = new Set()) {
  const found = new Map();
  for (const seed of (seeds ?? []).slice(0, MAX_HOP3_SEEDS)) {
    let mine = [];
    try {
      mine = await jira.resolvedWorkBy(seed.accountId);
    } catch {
      continue;
    }
    // Do not trust JQL/stub ordering: pick the most recent explicitly.
    const recent = [...mine].sort(
      (a, b) => new Date(b.fields?.updated ?? 0) - new Date(a.fields?.updated ?? 0)
    )[0];
    const projectKey = recent?.fields?.project?.key;
    if (!projectKey) continue;
    let others = [];
    try {
      others = await jira.resolvedWorkInProject(projectKey);
    } catch {
      continue;
    }
    for (const past of others) {
      const a = past.fields?.assignee;
      if (!a?.accountId || a.accountId === seed.accountId || excludeIds.has(a.accountId)) continue;
      const d = daysSince(past.fields?.updated) ?? 999;
      const score = HOP3_BASE + (d <= RECENT_DAYS ? HOP3_RECENT : 0);
      addCandidate(
        found,
        a.accountId,
        a.displayName,
        score,
        `Teammate of ${seed.name} — both resolved work in ${projectKey}`
      );
    }
  }
  return found;
}
