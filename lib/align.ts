// Lining another translation's words up against the King James's tagged text.
//
// Only the King James is tagged word by word with Strong's numbers. Nobody
// licenses a tagged ESV or NIV, so a reader of one of those could tap nothing
// — the study sheet was reachable only by the verse. This closes that gap by
// matching the two renderings of the same verse against each other, and it is
// honest about how each match was arrived at, because the two kinds are not
// worth the same.
//
// Anchors come first: a word in the new translation whose stem is a stem the
// King James used in the same verse. "Nicodemus" is "Nicodemus"; "believes" and
// "believeth" are both "believ". Those matches are as good as tagging, because
// they are the same word. Only content words may anchor — let "the" match and
// it will match the first "the" it meets, dragging everything after it out of
// step.
//
// Everything between two anchors is then spread out proportionally. Those are
// guesses. They are usually close, because two translations of one verse follow
// the same clauses in the same order, and they are sometimes wrong. They are
// marked, and the reader is told.

export type Nums = string[] | null;
/** The King James, as it is stored: the text of a word and what it renders. */
export type KjvToken = [string, Nums];
/** The same for another translation, plus whether the match was a real one. */
export type AlignedToken = [string, Nums, boolean];

/**
 * Words too common to anchor on.
 *
 * Not a stopword list for its own sake — the test is whether matching this
 * word tells you anything about where you are in the verse, and these do not.
 */
const COMMON = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "by",
  "for", "with", "from", "as", "that", "this", "these", "those", "is", "was",
  "are", "were", "be", "been", "am", "it", "he", "she", "they", "them", "him",
  "her", "his", "their", "its", "you", "your", "ye", "thee", "thou", "thy",
  "thine", "we", "us", "our", "i", "my", "me", "who", "whom", "which", "what",
  "not", "no", "nor", "so", "then", "than", "there", "here", "when", "where",
  "shall", "will", "may", "can", "do", "did", "have", "has", "had", "unto",
  "upon", "into", "out", "up", "down", "all", "any", "every", "some", "one",
  "also", "if", "because", "therefore", "now", "yet", "even", "s",
]);

/** A word reduced to something two translations might spell the same way. */
export function stem(word: string): string {
  const bare = word.toLowerCase().replace(/[^a-zÀ-ɏ]/g, "");
  if (bare.length <= 3) return bare;
  for (const suffix of ["eth", "est", "ings", "ing", "edst", "ed", "es", "s"]) {
    if (bare.endsWith(suffix) && bare.length - suffix.length >= 3) {
      return bare.slice(0, bare.length - suffix.length);
    }
  }
  return bare;
}

/**
 * Split a verse into tokens that put back together into exactly the verse.
 *
 * Each token carries whatever space and punctuation ran up to its word, the
 * same shape the tagged King James is stored in, so one renderer draws both.
 */
export function tokenize(text: string): { raw: string; word: string }[] {
  const out: { raw: string; word: string }[] = [];
  const parts = text.split(/(\s+)/);
  let pending = "";
  for (const part of parts) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) {
      pending += part;
      continue;
    }
    out.push({ raw: pending + part, word: part });
    pending = "";
  }
  // trailing space belongs to the last token rather than to nothing
  if (pending && out.length > 0) out[out.length - 1].raw += pending;
  else if (pending) out.push({ raw: pending, word: "" });
  return out;
}

/** Where the King James tokens that carry a number actually sit. */
function taggedPositions(kjv: KjvToken[]): number[] {
  const at: number[] = [];
  kjv.forEach((token, i) => {
    if (token[1] && token[1].length > 0) at.push(i);
  });
  return at;
}

/**
 * Line one verse up against the King James rendering of it.
 *
 * Returns a token per word of `text`, each with the Strong's numbers behind it
 * and whether that came from a matched word (true) or from spreading the gap
 * between two matches (false).
 */
export function alignVerse(text: string, kjv: KjvToken[]): AlignedToken[] {
  const target = tokenize(text);
  if (target.length === 0 || kjv.length === 0) {
    return target.map((t) => [t.raw, null, false] as AlignedToken);
  }

  // ---- anchors: the same word in both, in order ----------------------------
  // A King James token can hold several words — " the world", " not perish" —
  // because the tagging groups whatever one original was rendered as. So a
  // token answers to any of the words in it, not to the run as a whole.
  const kjvStems = kjv.map(
    (token) => new Set(tokenize(token[0]).map((t) => stem(t.word)).filter(Boolean))
  );
  const anchors: { at: number; to: number }[] = [];
  let from = 0;
  target.forEach((token, i) => {
    const want = stem(token.word);
    if (!want || want.length < 3 || COMMON.has(want)) return;
    for (let k = from; k < kjv.length; k++) {
      if (kjvStems[k].has(want)) {
        anchors.push({ at: i, to: k });
        from = k + 1;
        return;
      }
    }
  });

  // ---- everything else: spread between them --------------------------------
  const ratio = kjv.length / target.length;
  const mapped = target.map((_, i) => {
    if (anchors.length === 0) return Math.min(kjv.length - 1, Math.round(i * ratio));
    let before: { at: number; to: number } | null = null;
    let after: { at: number; to: number } | null = null;
    for (const a of anchors) {
      if (a.at <= i) before = a;
      if (a.at >= i && !after) after = a;
    }
    if (before && after && before.at !== after.at) {
      const span = after.at - before.at;
      const step = (after.to - before.to) / span;
      return Math.round(before.to + (i - before.at) * step);
    }
    if (before && after) return before.to; // the anchor itself
    if (before) return Math.min(kjv.length - 1, before.to + (i - before.at));
    return Math.max(0, after!.to - (after!.at - i));
  });

  const exact = new Set(anchors.map((a) => a.at));
  const tagged = taggedPositions(kjv);

  return target.map((token, i) => {
    if (!token.word) return [token.raw, null, false] as AlignedToken;
    let k = Math.min(kjv.length - 1, Math.max(0, mapped[i]));
    // The King James carries words no original stands behind — "unto" is often
    // one — and landing on one of those would leave the tap dead. Step to the
    // nearest word that does have an original rather than offering nothing.
    if (!kjv[k]?.[1]?.length) {
      let best = -1;
      let bestGap = Infinity;
      for (const p of tagged) {
        const gap = Math.abs(p - k);
        if (gap < bestGap) {
          bestGap = gap;
          best = p;
        }
      }
      if (best === -1) return [token.raw, null, false] as AlignedToken;
      k = best;
    }
    // A word only counts as matched if it matched AND landed where it matched
    const matched = exact.has(i) && k === mapped[i];
    return [token.raw, kjv[k][1], matched] as AlignedToken;
  });
}
