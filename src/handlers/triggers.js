/**
 * Product event triggers. Fase 1: log only — the Radar is computed on read,
 * so no write is needed when an issue changes. Fase 2 may add a nudge
 * (e.g. comment when an away person's issue is updated by someone else).
 */
export async function onIssueUpdated(event) {
  const issueKey = event?.issue?.key ?? 'unknown';
  console.log(`Relay: issue updated: ${issueKey} (no action in Fase 1)`);
  return { issueKey, action: 'none' };
}
