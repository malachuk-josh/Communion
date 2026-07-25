// Curated profile icons — no photo uploads, just a warm, faith-flavored
// set every user picks from. Shared by the picker UI and server validation.

export const PROFILE_ICONS = [
  "dove",
  "cross",
  "book",
  "prayer",
  "sheep",
  "fish",
  "wheat",
  "grapes",
  "candle",
  "sparkle",
  "sunrise",
  "mountain",
  "wave",
  "leaf",
  "flower",
  "lion",
  "eagle",
  "heart",
  "music",
  "jar",
  "crown",
  "fire",
  "rainbow",
  "anchor",
] as const;

export function isProfileIcon(value: string): boolean {
  return (PROFILE_ICONS as readonly string[]).includes(value);
}
