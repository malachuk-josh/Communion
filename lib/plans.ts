// Reading plans: fixed sequences of chapters. Names/descriptions live in
// the i18n dictionaries under plan.<id> / plan.<id>.desc. Per-user progress
// (count of completed days) is stored server-side.

export interface Plan {
  id: string;
  emoji: string;
  days: { b: number; c: number }[];
}

const john21: Plan = {
  id: "john21",
  emoji: "📖",
  days: Array.from({ length: 21 }, (_, i) => ({ b: 43, c: i + 1 })),
};

const psalms14: Plan = {
  id: "psalms14",
  emoji: "🕊️",
  days: [23, 27, 34, 46, 91, 121, 139, 42, 62, 63, 103, 116, 130, 145].map(
    (c) => ({ b: 19, c })
  ),
};

const nt30: Plan = {
  id: "nt30",
  emoji: "✝️",
  days: [
    { b: 40, c: 5 },
    { b: 40, c: 6 },
    { b: 40, c: 7 },
    { b: 42, c: 15 },
    { b: 43, c: 1 },
    { b: 43, c: 3 },
    { b: 43, c: 14 },
    { b: 43, c: 15 },
    { b: 44, c: 2 },
    { b: 45, c: 8 },
    { b: 45, c: 12 },
    { b: 46, c: 13 },
    { b: 46, c: 15 },
    { b: 48, c: 5 },
    { b: 49, c: 2 },
    { b: 49, c: 6 },
    { b: 50, c: 4 },
    { b: 51, c: 3 },
    { b: 52, c: 4 },
    { b: 58, c: 11 },
    { b: 58, c: 12 },
    { b: 59, c: 1 },
    { b: 60, c: 1 },
    { b: 61, c: 1 },
    { b: 62, c: 4 },
    { b: 66, c: 21 },
    { b: 66, c: 22 },
    { b: 40, c: 28 },
    { b: 42, c: 24 },
    { b: 44, c: 1 },
  ],
};

export const PLANS: Plan[] = [john21, psalms14, nt30];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
