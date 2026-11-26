/**
 * UI Kit resolvers. Every resolver returns `{ ok: true, data }` or
 * `{ ok: false, error }` so the frontend can render friendly errors.
 * Pattern mirrors the reference Codegeist 2026 app.
 *
 * NOTE (Fase 2 fix, 26 Nov 2026): `import Resolver from '@forge/resolver'`
 * + `new Resolver()` THROWS at load in the deployed bundle
 * ("out_namespaceObject is not a constructor") — @forge/resolver@1.8.0
 * default-export interop is broken under Forge's webpack bundler.
 * Use the named export `makeResolver` instead: it constructs the
 * Resolver internally (inside the CJS module, no interop involved)
 * and returns the same definitions handler.
 */
import { makeResolver } from '@forge/resolver';
import { NeedsAuthenticationError } from '@forge/api';
import * as orphans from '../services/orphans.js';
import * as away from '../services/away.js';

const run = (fn) => async (req) => {
  try {
    const data = await fn(req.payload ?? {}, {
      accountId: req.context?.accountId,
      context: req.context,
    });
    return { ok: true, data };
  } catch (err) {
    // Let Forge show its "Allow access" consent screen instead of a generic error.
    if (err instanceof NeedsAuthenticationError || err?.name === 'NeedsAuthenticationError') throw err;
    console.error('Resolver failed', err);
    return { ok: false, error: err?.message ?? 'Something went wrong. Please try again.' };
  }
};

export const handler = makeResolver({
  getOrphans: run(async (payload) => orphans.findOrphans(payload)),

  // BUG #5 (26 Nov 2026): the issue panel crashed because
  // `useProductContext()` returns `undefined` on its first render. The
  // frontend now reads the context via view.getContext(), and the resolver
  // ALSO derives the issue key from req.context.extension.issue.key when the
  // payload carries none — Forge passes the product context to resolvers
  // invoked from UI Kit. The derived key is returned so the frontend can
  // display it and use it for the handover call.
  suggestSuccessors: run(async (payload, { context }) => {
    const issueKey = payload.issueKey ?? issueKeyFromContext(context);
    const result = await orphans.suggestSuccessors({ ...payload, issueKey });
    return { ...result, issueKey };
  }),

  executeHandover: run(async (payload, { context }) => {
    const issueKey = payload.issueKey ?? issueKeyFromContext(context);
    return orphans.executeHandover({ ...payload, issueKey });
  }),

  getHandoverPacket: run(async (payload) => orphans.getHandoverPacket(payload)),

  getAwayFlags: run(async () => away.getAllAwayFlags()),

  // BUG #5: roster behind the Radar "mark away" UI.
  getTeamMembers: run(async (payload, { accountId }) =>
    orphans.listTeamMembers({ viewerAccountId: accountId })
  ),

  setAwayFlag: run(async (payload, { accountId }) =>
    away.setAwayFlag(payload.accountId, { returnDate: payload.returnDate, note: payload.note }, accountId)
  ),

  clearAwayFlag: run(async (payload) => {
    await away.clearAwayFlag(payload.accountId);
    return { cleared: payload.accountId };
  }),
});

// BUG #5: Forge passes the product context (incl. extension.issue.key for
// jira:issuePanel) on the resolver request — use it when the payload has no
// issue key. Safe when context is absent (harness / Rovo calls).
const issueKeyFromContext = (context) => context?.extension?.issue?.key ?? null;
