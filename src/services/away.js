/**
 * Away flags in Forge storage (per installation).
 * One flag per person under `away-<accountId>`:
 * { returnDate (YYYY-MM-DD or null), note, setBy, setAt }.
 * The roster of flagged people is kept in one key (`away-roster`) so listing
 * never depends on a storage list API. Fase 1.
 *
 * Plan B (26 Nov 2026, bug kritis #4): storage backend switched from
 * `@forge/kvs` to the legacy `storage` from `@forge/api`. The modern KVS
 * service returned 403 PRINCIPAL_NOT_AUTHORIZED on the very first `get`
 * for this installation — even after a full uninstall + reinstall — so the
 * fault is in the KVS authorization path, not in provisioning. The legacy
 * storage API goes through a different authorization path. Keys avoid
 * `:` etc. (accountIds contain `:`) so the key charset is always safe.
 */
import { storage } from '@forge/api';

const ROSTER_KEY = 'away-roster';
const keyFor = (accountId) => `away-${String(accountId).replace(/[^A-Za-z0-9]/g, '_')}`;

export async function getAwayFlag(accountId) {
  return (await storage.get(keyFor(accountId))) ?? null;
}

async function getRoster() {
  return (await storage.get(ROSTER_KEY)) ?? [];
}

async function saveRoster(ids) {
  await storage.set(ROSTER_KEY, [...new Set(ids)]);
}

export async function setAwayFlag(accountId, { returnDate = null, note = '' } = {}, setBy = null) {
  const flag = { returnDate, note, setBy, setAt: new Date().toISOString() };
  await storage.set(keyFor(accountId), flag);
  await saveRoster([...(await getRoster()), accountId]);
  return flag;
}

export async function clearAwayFlag(accountId) {
  await storage.delete(keyFor(accountId));
  await saveRoster((await getRoster()).filter((id) => id !== accountId));
}

export async function getAllAwayFlags() {
  const ids = await getRoster();
  const flags = {};
  for (const id of ids) flags[id] = await getAwayFlag(id);
  return flags;
}
