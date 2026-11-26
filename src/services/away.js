/**
 * Away flags in Forge KVS (per installation).
 * One flag per person under `away:<accountId>`:
 * { returnDate (YYYY-MM-DD or null), note, setBy, setAt }.
 * The roster of flagged people is kept in one key (`away:roster`) so listing
 * never depends on a KVS list API. Fase 1.
 */
import { kvs } from '@forge/kvs';

const ROSTER_KEY = 'away:roster';
const keyFor = (accountId) => `away:${accountId}`;

export async function getAwayFlag(accountId) {
  return (await kvs.get(keyFor(accountId))) ?? null;
}

async function getRoster() {
  return (await kvs.get(ROSTER_KEY)) ?? [];
}

async function saveRoster(ids) {
  await kvs.set(ROSTER_KEY, [...new Set(ids)]);
}

export async function setAwayFlag(accountId, { returnDate = null, note = '' } = {}, setBy = null) {
  const flag = { returnDate, note, setBy, setAt: new Date().toISOString() };
  await kvs.set(keyFor(accountId), flag);
  await saveRoster([...(await getRoster()), accountId]);
  return flag;
}

export async function clearAwayFlag(accountId) {
  await kvs.delete(keyFor(accountId));
  await saveRoster((await getRoster()).filter((id) => id !== accountId));
}

export async function getAllAwayFlags() {
  const ids = await getRoster();
  const flags = {};
  for (const id of ids) flags[id] = await getAwayFlag(id);
  return flags;
}
