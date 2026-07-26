import SharedCollection from "@/components/SharedCollection";
import { getBook } from "@/lib/bible";

// One verse, shared as itself rather than as a stored snapshot: /shared/verse
// ?b=19&c=23&v=1&l=…. It sits beside /shared/[token], and can never be
// mistaken for one — a token is sixteen hex characters, and "verse" is not.

export default async function SharedVersePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const b = Number(one("b"));
  const c = Number(one("c"));
  const v = Number(one("v"));
  // a run shares as a run: "e" is the verse it reaches, absent for the one
  const e = Number(one("e") ?? v);
  const book = getBook(b);
  // a mistyped or truncated link should say so, not render an empty page
  if (
    !book ||
    !(c >= 1 && c <= book.chapters) ||
    !(v >= 1 && v <= 200) ||
    !(e >= v && e <= 200)
  ) {
    return <SharedCollection />;
  }
  const label = one("l")?.slice(0, 80);
  const sharedBy = one("by")?.slice(0, 60);
  return (
    <SharedCollection
      verse={{
        b,
        c,
        v,
        ...(e > v ? { end: e } : {}),
        ...(label ? { label } : {}),
        ...(sharedBy ? { sharedBy } : {}),
      }}
    />
  );
}
