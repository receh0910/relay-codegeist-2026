/**
 * Relay — pure, deterministic orphan / risk logic (no Forge imports).
 * Unit-testable without a Jira site. Fase 1.
 */

export const INACTIVITY_DAYS = 7;

/** Whole days between an ISO date and now (negative = in the future). */
export function daysSince(isoDate, now = new Date()) {
  if (!isoDate) return null;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now.getTime() - then) / 86400000);
}

/**
 * Risk score 0-100 for one open issue.
 * Away assignee is the dominant signal; staleness and priority add up.
 * Returns { score, level } where level is 'high' | 'medium' | 'low'.
 */
export function riskScore({ priority = 'Medium', daysStale = 0, isAway = false, daysUntilReturn = null }) {
  let score = 0;
  if (isAway) score += 50;
  score += Math.min(30, Math.max(0, daysStale) * 2); // +2/day, cap 30
  const priorityPoints = { Highest: 20, High: 15, Medium: 8, Low: 3, Lowest: 0 };
  score += priorityPoints[priority] ?? 8;
  // Away for a long time (or no return date) is riskier than a short leave.
  if (isAway && (daysUntilReturn === null || daysUntilReturn > 14)) score += 10;
  score = Math.min(100, Math.max(0, score));
  const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  return { score, level };
}

/** Highest risk first, then stalest first. */
export function sortOrphans(orphans) {
  return [...orphans].sort(
    (a, b) => b.risk.score - a.risk.score || b.daysStale - a.daysStale
  );
}
