import "server-only";

/**
 * Source of "now" for all business logic. Services receive a Clock so tests can
 * pin time precisely (cutoff boundaries, expiry). Never call `new Date()` for
 * business decisions outside this module.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export interface FixedClock extends Clock {
  set(instant: Date): void;
  advanceBy(milliseconds: number): void;
}

/** Controllable clock for tests and simulations. */
export function createFixedClock(initial: Date): FixedClock {
  let current = new Date(initial.getTime());
  return {
    now: () => new Date(current.getTime()),
    set: (instant) => {
      current = new Date(instant.getTime());
    },
    advanceBy: (milliseconds) => {
      current = new Date(current.getTime() + milliseconds);
    },
  };
}
