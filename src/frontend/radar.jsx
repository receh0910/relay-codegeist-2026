/**
 * Orphan Radar — the Relay global page in Jira.
 * Lists open issues of people flagged away, ranked by risk, with a
 * one-click handover to the top suggested successor. Fase 1.
 *
 * BUG #5 (26 Nov 2026): the page had NO way to mark anyone away — the only
 * surface that could write an away flag was the issue panel, which crashed
 * (see issuePanel.jsx). Added the "Who is away?" roster here: every person
 * with open work, a return-date picker, Mark away / Update away / Back now.
 * Flags are written through the same legacy-storage-backed resolvers as
 * Plan B, so getOrphans reads them back immediately.
 */
import React, { useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  DatePicker,
  Heading,
  Inline,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
} from '@forge/react';
import { call, riskAppearance, useResolver } from './shared.jsx';

const DEFAULT_RETURN_DATE = '2026-12-05';

const App = () => {
  const [refreshTick, setRefreshTick] = useState(0);
  const { loading, data, error } = useResolver('getOrphans', { _t: refreshTick });
  const { loading: teamLoading, data: team, error: teamError } = useResolver(
    'getTeamMembers',
    { _t: refreshTick }
  );
  const [busyKey, setBusyKey] = useState(null);
  const [done, setDone] = useState({});
  const [handOverError, setHandOverError] = useState(null);
  const [awayBusy, setAwayBusy] = useState(null);
  const [awayMsg, setAwayMsg] = useState(null);
  const [awayError, setAwayError] = useState(null);
  const [returnDates, setReturnDates] = useState({});

  const refresh = () => setRefreshTick((t) => t + 1);

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

  const pickedDate = (member) =>
    returnDates[member.accountId] ?? member.returnDate ?? DEFAULT_RETURN_DATE;

  const markAway = async (member) => {
    const date = pickedDate(member);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setAwayError(`Pick a return date for ${member.name} first.`);
      return;
    }
    setAwayBusy(member.accountId);
    setAwayError(null);
    setAwayMsg(null);
    try {
      await call('setAwayFlag', {
        accountId: member.accountId,
        returnDate: date,
        note: 'Marked away from the Radar',
      });
      setAwayMsg(`${member.name} is away until ${date} — their open issues now show below.`);
      refresh();
    } catch (err) {
      setAwayError(String(err?.message ?? err));
    } finally {
      setAwayBusy(null);
    }
  };

  const clearAway = async (member) => {
    setAwayBusy(member.accountId);
    setAwayError(null);
    setAwayMsg(null);
    try {
      await call('clearAwayFlag', { accountId: member.accountId });
      setAwayMsg(`${member.name} is back — their issues no longer show as orphaned.`);
      refresh();
    } catch (err) {
      setAwayError(String(err?.message ?? err));
    } finally {
      setAwayBusy(null);
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

      <Heading as="h2">Who is away?</Heading>
      <Text>
        Mark someone away with their return date — their open issues appear in
        the Radar below.
      </Text>
      {teamError ? (
        <SectionMessage appearance="error" title="Could not load team">
          <Text>{teamError}</Text>
        </SectionMessage>
      ) : null}
      {awayMsg ? (
        <SectionMessage appearance="confirmation" title="Away status updated">
          <Text>{awayMsg}</Text>
        </SectionMessage>
      ) : null}
      {awayError ? (
        <SectionMessage appearance="error" title="Could not update away status">
          <Text>{awayError}</Text>
        </SectionMessage>
      ) : null}
      {teamLoading ? <Spinner size="medium" /> : null}
      {!teamLoading && team
        ? team.map((member, i) => (
          <Box key={member.accountId} padding="space.200" backgroundColor="color.background.neutral">
            <Stack space="space.100">
              <Inline space="space.100" alignBlock="center" shouldWrap>
                {member.away ? (
                  <Lozenge appearance="moved" isBold>
                    Away until {member.returnDate ?? '—'}
                  </Lozenge>
                ) : (
                  <Lozenge appearance="success" isBold>Available</Lozenge>
                )}
                <Text weight="bold">{member.name}</Text>
                <Text>
                  · {member.openCount} open{' '}
                  {member.openCount === 1 ? 'issue' : 'issues'}
                </Text>
              </Inline>
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <DatePicker
                  name={`return-date-${i}`}
                  label="Back on"
                  defaultValue={member.returnDate ?? DEFAULT_RETURN_DATE}
                  onChange={(v) =>
                    setReturnDates((d) => ({ ...d, [member.accountId]: v }))
                  }
                />
                <Button
                  appearance="primary"
                  isDisabled={awayBusy === member.accountId}
                  onClick={() => markAway(member)}
                >
                  {awayBusy === member.accountId
                    ? 'Saving…'
                    : member.away
                      ? 'Update away'
                      : 'Mark away'}
                </Button>
                {member.away ? (
                  <Button
                    isDisabled={awayBusy === member.accountId}
                    onClick={() => clearAway(member)}
                  >
                    Back now
                  </Button>
                ) : null}
              </Inline>
            </Stack>
          </Box>
        ))
        : null}

      <Heading as="h2">Orphaned issues</Heading>
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
                <Text weight="bold">{orphan.key}</Text>
                <Text>— {orphan.summary}</Text>
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
