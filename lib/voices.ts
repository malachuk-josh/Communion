// The scholars Ask can answer as, in the Commentary pop-up.
//
// Names only — what each one believed and how he wrote is in
// lib/voicePrompts.ts, which the server alone reads. Two of them are in the
// app in their own words: Matthew Henry on every book, and Spurgeon on the
// Psalms. When the reader is looking at one of those, what he actually wrote
// goes with the question and the answer is drawn from it. The rest answer
// from what is known of their writings, and say so.

export const VOICES = [
  {
    id: "henry",
    name: { en: "Matthew Henry", es: "Matthew Henry" },
    short: { en: "Henry", es: "Henry" },
  },
  {
    id: "spurgeon",
    name: { en: "Charles Spurgeon", es: "Charles Spurgeon" },
    short: { en: "Spurgeon", es: "Spurgeon" },
  },
  {
    id: "calvin",
    name: { en: "John Calvin", es: "Juan Calvino" },
    short: { en: "Calvin", es: "Calvino" },
  },
  {
    id: "luther",
    name: { en: "Martin Luther", es: "Martín Lutero" },
    short: { en: "Luther", es: "Lutero" },
  },
  {
    id: "wesley",
    name: { en: "John Wesley", es: "John Wesley" },
    short: { en: "Wesley", es: "Wesley" },
  },
  {
    id: "augustine",
    name: { en: "Augustine", es: "Agustín" },
    short: { en: "Augustine", es: "Agustín" },
  },
  {
    id: "chrysostom",
    name: { en: "John Chrysostom", es: "Juan Crisóstomo" },
    short: { en: "Chrysostom", es: "Crisóstomo" },
  },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export function isVoice(id: unknown): id is VoiceId {
  return VOICES.some((v) => v.id === id);
}

export function voiceOf(id: VoiceId) {
  return VOICES.find((v) => v.id === id)!;
}

/** The ones whose own commentary the app carries, and can send along. */
export const HAS_SOURCE: readonly VoiceId[] = ["henry", "spurgeon"];
