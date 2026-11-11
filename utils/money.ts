/**
 * All money in the system is an INTEGER number of piasters (1 EGP = 100 piasters),
 * e.g. 149.99 EGP is stored as 14999. This avoids IEEE-754 float rounding errors.
 */
export type Piasters = number;

export function assertPiasters(value: number, label = 'amount'): Piasters {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of piasters, got ${value}`);
  }
  return value;
}

/** `percent` is an integer 0–100. Rounds half-up to the nearest piaster. */
export function percentOf(amount: Piasters, percent: number): Piasters {
  return Math.round((amount * percent) / 100);
}

export function toEgp(piasters: Piasters): number {
  return piasters / 100;
}
