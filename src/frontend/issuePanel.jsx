/**
 * Relay issue panel — handover status for the issue being viewed.
 * Shows the top successor and a one-click handover. Fase 1.
 */
import React, { useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  useProductContext,
} from '@forge/react';
import { call, riskAppearance, useResolver } from './shared.jsx';

const App = () => {
  const { extension } = useProductContext();
  const issueKey = extension?.issue?.key;
  const { loading, data, error } = useResolver('suggestSuccessors', { issueKey });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [handOverError, setHandOverError] = useState(null);

  if (!issueKey) {
    return <Text>Open an issue to see its Relay handover status.</Text>;
  }

  const top = data?.successors?.[0];

  const handOver = async () => {
    if (!top) return;
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
            <Text>
              Best successor: <strong>{top.name}</strong> (score {top.score})
            </Text>
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
