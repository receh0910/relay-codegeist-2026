/**
 * Thin Jira wrappers. All reads run as the user (asUser), so Jira enforces
 * the viewer's own permissions. Fase 1.
 *
 * BUG KRITIS #3 (ditemukan & diperbaiki Fase 3, 26 Nov 2026):
 * `route`${path}`` dengan path lengkap sebagai SATU interpolasi SELALU
 * melempar "Disallowing path manipulation attempt" — `route` menolak
 * parameter yang mengandung '/' dalam mode path (safeUrl.js). Akibatnya
 * SEMUA panggilan Jira app (semua resolver + semua action Rovo) gagal.
 * Perbaikan: bangun Route dengan literal yang berisi '/', interpolasi
 * HANYA untuk segmen dinamis (issueKey, accountId) — pola resmi Forge.
 *
 * BUG #7 (ditemukan & diperbaiki 26 Nov 2026): FIELDS tidak memuat
 * `project`, padahal Jira hanya mengembalikan field yang diminta
 * (POST /search/jql `fields` / GET /issue `?fields=`). Akibatnya
 * `fields.project` selalu undefined: relatedWorkHistory() mengembalikan
 * [] (Hop 1 mati) dan suggestSuccessors() membangun projectKeys = []
 * (Hop 2 mati, Hop 3 tanpa seed) — panel selalu "No successor found yet"
 * meski Budi sudah resolve RELAY-5. Harness tidak menangkap ini karena
 * Jira palsu mengembalikan objek lengkap tanpa meniru penyaringan field
 * (lihat stub @forge/api + §10 di test-actions.mjs — kini diperbaiki).
 */
import api, { route } from '@forge/api';

export const FIELDS = 'key,summary,status,priority,assignee,updated,components,issuetype,project';

async function requestJira(routeObj, options = {}) {
  const res = await api.asUser().requestJira(routeObj, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira API ${res.status} on ${routeObj.value}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function searchIssues(jql, maxResults = 50) {
  // NOTE (Fase 2 fix, 26 Nov 2026): GET /rest/api/3/search was REMOVED by
  // Atlassian (CHANGE-2046) — it now returns 410. Use POST /search/jql.
  const data = await requestJira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql, fields: FIELDS.split(','), maxResults }),
  });
  return data.issues ?? [];
}

export async function getIssue(issueKey) {
  return requestJira(route`/rest/api/3/issue/${issueKey}?fields=${FIELDS}`);
}

export async function getUser(accountId) {
  return requestJira(route`/rest/api/3/user?accountId=${accountId}`);
}

/** Open (unresolved) issues currently assigned to one person. */
export async function openIssuesFor(accountId, projectKey) {
  const project = projectKey ? ` AND project = ${projectKey}` : '';
  return searchIssues(
    `assignee = ${accountId}${project} AND resolution = Unresolved ORDER BY updated ASC`
  );
}

/** Issues in the same project/components resolved by other people — the
 *  raw material for successor ranking (Fase 2 refines the score). */
export async function relatedWorkHistory(issue) {
  const projectKey = issue.fields?.project?.key;
  if (!projectKey) return [];
  const component = issue.fields?.components?.[0]?.name;
  const componentClause = component ? ` AND component = "${component}"` : '';
  return searchIssues(
    `project = ${projectKey}${componentClause} AND resolution != Unresolved ORDER BY updated DESC`,
    50
  );
}

/**
 * Work one person resolved, most recent first — the raw material for the
 * multi-hop collaboration graph (Fase 4): whose projects did this person
 * work in, and who else resolved work there.
 */
export async function resolvedWorkBy(accountId, maxResults = 50) {
  return searchIssues(
    `assignee = ${accountId} AND resolution != Unresolved ORDER BY updated DESC`,
    maxResults
  );
}

/** Everyone who resolved work in one project, most recent first. */
export async function resolvedWorkInProject(projectKey, maxResults = 50) {
  return searchIssues(
    `project = ${projectKey} AND resolution != Unresolved ORDER BY updated DESC`,
    maxResults
  );
}

export async function assignIssue(issueKey, accountId) {
  await requestJira(route`/rest/api/3/issue/${issueKey}/assignee`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
}

export async function addComment(issueKey, adfBody) {
  return requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: adfBody }),
  });
}
