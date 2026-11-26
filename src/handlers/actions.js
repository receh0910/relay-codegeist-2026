/**
 * Rovo actions (also exposed as MCP tools via rovo:mcp).
 * Handlers return compact JSON the agent can reason over. Errors are
 * returned as `{ error }` so the agent can explain them instead of failing.
 * Identity always comes from the platform context, never from inputs.
 */
import * as orphans from '../services/orphans.js';

const wrap = (fn) => async (payload, context) => {
  try {
    return await fn(payload ?? {}, context ?? {});
  } catch (err) {
    console.error('Action failed', err);
    return { error: err?.message ?? 'Relay hit an unexpected error. Please try again.' };
  }
};

const clampInt = (v, min, max, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? def : Math.min(max, Math.max(min, n));
};

export const getOrphans = wrap(async (payload) => {
  const list = await orphans.findOrphans({
    projectKey: payload.projectKey || null,
    maxResults: clampInt(payload.maxResults, 1, 50, 20),
  });
  return { count: list.length, orphans: list };
});

export const suggestSuccessor = wrap(async (payload) => {
  const result = await orphans.suggestSuccessors({
    issueKey: payload.issueKey || null,
    accountId: payload.accountId || null,
    limit: clampInt(payload.limit, 1, 5, 3),
  });
  return result;
});

export const executeHandover = wrap(async (payload) => {
  if (!payload.issueKey || !payload.successorAccountId) {
    return { error: 'Both issueKey and successorAccountId are required.' };
  }
  return orphans.executeHandover({
    issueKey: payload.issueKey.trim().toUpperCase(),
    successorAccountId: payload.successorAccountId,
    note: payload.note || '',
  });
});

export const getHandoverPacket = wrap(async (payload) => {
  if (!payload.accountId) return { error: 'accountId is required.' };
  return orphans.getHandoverPacket({ accountId: payload.accountId });
});
