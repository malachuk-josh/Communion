// The shape of a reader's own plan, on both sides of the wire.
//
// Kept apart from lib/customPlans.ts because that one reaches for node's
// crypto and for the Redis client, and the builder and the journal are
// browser code. A type has no runtime, so it can be shared where the module
// holding it cannot.

/** A reading, stored as a pair to keep a year-long plan small. */
export type Ref = [book: number, chapter: number];

/** A custom plan as it travels to and from the client. */
export interface CustomPlanRow {
  id: string;
  name: string;
  days: Ref[][];
  createdAt: number;
  /** the share token, once one has been minted */
  share?: string;
  /** whose plan this was, when it arrived from somebody else's link */
  fromName?: string;
  /** and which link, so following the same one twice is not two copies */
  fromToken?: string;
  /** listed in the public directory for anyone to find */
  listed?: boolean;
}

/**
 * Whether an id names a plan somebody wrote rather than one from the
 * catalogue. Shared with the server (lib/customPlans.ts keeps the canonical
 * copy) because the browser has to recognise one too — a reminder's deep link
 * arrives as a bare id with nothing else to tell them apart.
 */
/** A plan as it appears in the public directory. */
export interface PublicPlanCard {
  token: string;
  name: string;
  sharedBy: string;
  days: number;
  at: number;
}

export function isCustomPlanId(id: string): boolean {
  return /^custom-[a-f0-9]{12}$/.test(id);
}
