import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type DatabaseHandle } from "@/server/db/client";
import { pickupDates } from "@/server/db/schema";
import { parseIsoDate } from "@/server/domain/time/wib";
import { capacityFactsForDates, countActiveOrders, lockPickupDate } from "@/server/services/capacity";
import { inject } from "vitest";

import { insertTestOrder } from "../support/orders";

let handle: DatabaseHandle;
const now = new Date("2026-10-02T03:00:00Z"); // 10:00 WIB
const date = parseIsoDate("2026-10-10");
const later = new Date(now.getTime() + 30 * 60_000);
const earlier = new Date(now.getTime() - 60_000);

beforeAll(() => {
  // Larger pool so the race test really runs transactions concurrently.
  handle = createDatabase(inject("databaseUrl"), { max: 20, silenceNotices: true });
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  await handle.db.execute(sql`TRUNCATE orders, pickup_dates RESTART IDENTITY CASCADE`);
});

describe("active orders occupy slots (IMPLEMENTATION-PLAN §13.2)", () => {
  it("counts Cash, paid, waiting-verification, and unexpired reservations; not cancelled or expired", async () => {
    const db = handle.db;
    await insertTestOrder(db, { pickupDate: date, paymentMethod: "CASH", paymentStatus: "UNPAID", reservationExpiresAt: null }); // counts (FD-15)
    await insertTestOrder(db, { pickupDate: date, paidAmount: 50_000, remainingAmount: 50_000, paymentStatus: "PARTIALLY_PAID", reservationExpiresAt: earlier }); // counts: paid
    await insertTestOrder(db, { pickupDate: date, paymentMethod: "BANK_TRANSFER", paymentStatus: "WAITING_VERIFICATION", reservationExpiresAt: earlier }); // counts (FD-120)
    await insertTestOrder(db, { pickupDate: date, reservationExpiresAt: later }); // counts: reservation valid
    await insertTestOrder(db, { pickupDate: date, reservationExpiresAt: earlier }); // logically expired (TD-07)
    await insertTestOrder(db, { pickupDate: date, paymentMethod: "CASH", paymentStatus: "UNPAID", orderStatus: "CANCELLED" }); // cancelled
    await insertTestOrder(db, { pickupDate: date, paidAmount: 100_000, remainingAmount: 0, paymentStatus: "PAID", orderStatus: "COMPLETED" }); // completed still counts
    await insertTestOrder(db, { pickupDate: "2026-10-11", paymentMethod: "CASH", paymentStatus: "UNPAID" }); // other date

    expect((await countActiveOrders(db, [date], now)).get(date)).toBe(5);
  });

  it("applies default capacity, per-date override, and blocking", async () => {
    await handle.db.insert(pickupDates).values([
      { date: "2026-10-10", capacityOverride: 15 },
      { date: "2026-10-11", isBlocked: true },
    ]);
    const facts = await capacityFactsForDates(handle.db, [date, parseIsoDate("2026-10-11"), parseIsoDate("2026-10-12")], 10, now);
    expect(facts.get("2026-10-10")).toEqual({ isBlocked: false, capacity: 15, used: 0 });
    expect(facts.get("2026-10-11")).toMatchObject({ isBlocked: true, capacity: 10 });
    expect(facts.get("2026-10-12")).toEqual({ isBlocked: false, capacity: 10, used: 0 });
  });
});

describe("atomic reservation (FD-05, EC-01)", () => {
  async function attempt(capacity: number): Promise<boolean> {
    return handle.db.transaction(async (tx) => {
      const facts = await lockPickupDate(tx, date, capacity, now);
      if (facts.isBlocked || facts.used >= facts.capacity) return false;
      // Widen the race window: without the lock, every attempt would see used=0 here.
      await tx.execute(sql`SELECT pg_sleep(0.01)`);
      await insertTestOrder(tx, { pickupDate: date, reservationExpiresAt: later });
      return true;
    });
  }

  it("20 concurrent checkouts for the last slot → exactly one wins", async () => {
    // Pre-existing row: the upsert must not be what serializes the race; the row lock must.
    await handle.db.insert(pickupDates).values({ date });
    const results = await Promise.all(Array.from({ length: 20 }, () => attempt(1)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await countActiveOrders(handle.db, [date], now)).get(date)).toBe(1);
  });

  it("never exceeds capacity under concurrency (capacity 3, 25 attempts)", async () => {
    await handle.db.insert(pickupDates).values({ date });
    const results = await Promise.all(Array.from({ length: 25 }, () => attempt(3)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("a slot released by reservation expiry is immediately reusable", async () => {
    await insertTestOrder(handle.db, { pickupDate: date, reservationExpiresAt: earlier });
    expect(await attempt(1)).toBe(true);
  });

  it("respects blocked dates under the lock", async () => {
    await handle.db.insert(pickupDates).values({ date, isBlocked: true });
    expect(await attempt(10)).toBe(false);
  });
});
