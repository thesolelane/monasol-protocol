import { ethers } from "ethers";
import { storage } from "../storage";
import { getLocker } from "./contracts";
import { logger } from "./logger";

let lastSyncedAt: Date | null = null;
let syncInFlight = false;

/**
 * Reads live state from every Monad locker contract that has a monadAddress
 * and persists the updated usedSlots / status / minDepositSol into the DB.
 *
 * Safe to call concurrently — a second call while one is running is a no-op.
 */
export async function syncLockers(): Promise<void> {
  if (syncInFlight) return;
  syncInFlight = true;

  const start = Date.now();
  try {
    const rows = await storage.getLockers();
    const addressedLockers = rows.filter((l) => l.monadAddress);

    await Promise.all(
      addressedLockers.map(async (locker) => {
        try {
          const contract = getLocker(locker.monadAddress!);

          const [capacityBig, availableBig, feeBig] = await Promise.all([
            contract.capacity() as Promise<bigint>,
            contract.available_slots() as Promise<bigint>,
            contract.move_in_fee() as Promise<bigint>,
          ]);

          const capacity = Number(capacityBig);
          const available = Number(availableBig);
          const usedSlots = capacity - available;

          const status =
            usedSlots === 0
              ? "healthy"
              : usedSlots >= capacity
              ? "full"
              : "filling";

          const minDepositSol = ethers.formatEther(feeBig);

          await storage.updateLockerState(locker.monadAddress!, {
            usedSlots,
            status,
            minDepositSol,
          });
        } catch (err) {
          logger.warn({ err, lockerId: locker.externalId }, "locker-sync: failed to read contract");
        }
      })
    );

    lastSyncedAt = new Date();
    logger.info({ ms: Date.now() - start, count: addressedLockers.length }, "locker-sync: complete");
  } catch (err) {
    logger.error({ err }, "locker-sync: unexpected error");
  } finally {
    syncInFlight = false;
  }
}

/** Returns the timestamp of the last successful sync, or null if never run. */
export function getLastSyncedAt(): Date | null {
  return lastSyncedAt;
}

/**
 * Starts a background loop that syncs locker state from chain every `intervalMs`.
 * Default: 12 000 ms (12 s) to match the admin panel refresh cadence.
 */
export function startLockerSyncWorker(intervalMs = 12_000): void {
  syncLockers().catch(() => {});
  setInterval(() => {
    syncLockers().catch(() => {});
  }, intervalMs);
  logger.info({ intervalMs }, "locker-sync: worker started");
}
