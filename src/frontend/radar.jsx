/**
 * Orphan Radar — the Relay global page in Jira.
 * Lists open issues of people flagged away, ranked by risk, with a
 * one-click handover to the top suggested successor. Fase 1.
 */
import React, { useState } from 'react';
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
import { call, riskAppearance, useResolver } from './shared.jsx';

const App = () => {
  const { loading, data, error } = useResolver('getOrphans', {});
  const [busyKey, setBusyKey] = useState(null);
  const [done, setDone] = useState({});
  const [handOverError, setHandOverError] = useState(null);

  const handOver = async (orphan) => {
    setBusyKey(orphan.key);
    setHandOverError(null);
    try {
      const { successors } = await call('suggestSuccessors', { issueKey: orphan.key, limit: 1 });
      if (!successors?.length) throw new Error('No successor found for this issue yet.');
      const result = await call('executeHandover', {
        issueKey: orphan.key,
        successorAccountId: successors[0].accountId,
      });
      setDone((d) => ({ ...d, [orphan.key]: result.successor }));
    } catch (err) {
      setHandOverError(String(err?.message ?? err));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Stack space="space.200">
      <Heading as="h1">Relay — Handover Radar</Heading>
      <Text>
        Work left hanging while someone is away. Highest risk first — hand it
        over in one click to the best successor.
      </Text>
      {error ? (
        <SectionMessage appearance="error" title="Could not load orphaned issues">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}
      {handOverError ? (
        <SectionMessage appearance="warning" title="Handover failed">
          <Text>{handOverError}</Text>
        </SectionMessage>
      ) : null}
      {loading ? <Spinner size="medium" /> : null}
      {!loading && data && data.length === 0 ? (
        <SectionMessage appearance="confirmation" title="Nothing hanging">
          <Text>No open issues belong to people who are away. Enjoy the calm.</Text>
        </SectionMessage>
      ) : null}
      {!loading && data
        ? data.map((orphan) => (
          <Box key={orphan.key} padding="space.200" backgroundColor="color.background.neutral">
            <Stack space="space.100">
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <Lozenge appearance={riskAppearance(orphan.risk.level)} isBold>
                  {orphan.risk.level} risk · {orphan.risk.score}
                </Lozenge>
                <Text>
                  <strong>{orphan.key}</strong> — {orphan.summary}
                </Text>
              </Inline>
              <Text size="small">
                {orphan.assigneeName} · {orphan.status} · {orphan.priority} · stale {orphan.daysStale}d
                {orphan.returnDate ? ` · back ${orphan.returnDate}` : ' · no return date'}
              </Text>
              {done[orphan.key] ? (
                <Text>Handed over to {done[orphan.key]}.</Text>
              ) : (
                <Button
                  appearance="primary"
                  isDisabled={busyKey === orphan.key}
                  onClick={() => handOver(orphan)}
                >
                  {busyKey === orphan.key ? 'Handing over…' : 'Hand over to best successor'}
                </Button>
              )}
            </Stack>
          </Box>
        ))
        : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
