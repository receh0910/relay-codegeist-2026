/**
 * Relay issue panel — handover status for the issue being viewed.
 * Shows the top successor and a one-click handover. Fase 1.
 *
 * BUG #5 (26 Nov 2026): the first version destructured the return value of
 * `useProductContext()` on the first render — but that hook is async (it
 * only fills in after view.getContext() resolves) and its type is
 * `FullContext | undefined`, so on the first render the destructure threw
 * "Cannot destructure property 'extension' of '(0, t.useProductContext)(...)'
 * as it is undefined" and the panel crashed deterministically. Fixed by
 * reading the context with view.getContext() directly (safe catch, no throw
 * on failure) and letting the resolver derive the issue key from its own
 * request context as a fallback.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
} from '@forge/react';
import { view } from '@forge/bridge';
import { call, riskAppearance, useResolver } from './shared.jsx';

const App = () => {
  // undefined = view.getContext() not settled yet; null = settled, no key.
  const [ctxKey, setCtxKey] = useState(undefined);
  useEffect(() => {
    let cancelled = false;
    view
      .getContext()
      .then((ctx) => {
        if (!cancelled) setCtxKey(ctx?.extension?.issue?.key ?? null);
      })
      .catch(() => {
        // Context unreadable here — the resolver derives the issue key from
        // its own request context, so the panel still works.
        if (!cancelled) setCtxKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // No issueKey yet: the resolver derives it from the request context.
  const { loading, data, error } = useResolver(
    'suggestSuccessors',
    ctxKey ? { issueKey: ctxKey } : {}
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [handOverError, setHandOverError] = useState(null);

  const issueKey = ctxKey || data?.issueKey || null;
  const top = data?.successors?.[0];

  const handOver = async () => {
    if (!top || !issueKey) return;
    setBusy(true);
    setHandOverError(null);
    try {
      const result = await call('executeHandover', {
        issueKey,
        successorAccountId: top.accountId,
      });
      setDone(result.successor);
    } catch (err) {
      setHandOverError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  if (ctxKey === undefined && loading) {
    return (
      <Stack space="space.200">
        <Heading as="h2">Relay Handover</Heading>
        <Spinner size="medium" />
      </Stack>
    );
  }

  if (!issueKey && !loading) {
    return <Text>Open an issue to see its Relay handover status.</Text>;
  }

  return (
    <Stack space="space.200">
      <Heading as="h2">Relay Handover</Heading>
      {error ? (
        <SectionMessage appearance="error" title="Could not load successors">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}
      {handOverError ? (
        <SectionMessage appearance="warning" title="Handover failed">
          <Text>{handOverError}</Text>
        </SectionMessage>
      ) : null}
      {loading ? <Spinner size="medium" /> : null}
      {!loading && data && (!data.successors || data.successors.length === 0) ? (
        <Text>No successor found yet — nobody else has resolved related work in this project.</Text>
      ) : null}
      {!loading && top ? (
        <Box padding="space.200" backgroundColor="color.background.neutral">
          <Stack space="space.100">
            <Inline space="space.050" alignBlock="center" shouldWrap>
              <Text>Best successor:</Text>
              <Text weight="bold">{top.name}</Text>
              <Text>(score {top.score})</Text>
            </Inline>
            {top.reasons.map((r) => (
              <Text key={r} size="small">· {r}</Text>
            ))}
            {done ? (
              <Lozenge appearance="success" isBold>Handed over to {done}</Lozenge>
            ) : (
              <Button appearance="primary" isDisabled={busy} onClick={handOver}>
                {busy ? 'Handing over…' : `Hand over ${issueKey} to ${top.name}`}
              </Button>
            )}
          </Stack>
        </Box>
      ) : null}
      {data?.teamworkGraph && !data.teamworkGraph.available ? (
        <Text size="small">Teamwork Graph enrichment not available yet (Fase 4).</Text>
      ) : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
