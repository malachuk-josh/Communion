// The study pictures: reconstructions of the Tabernacle and the Temples, their
// measured diagrams, and the houses, farms, clothes and objects of the Bible
// world, each tied to the chapters it shows. Written by
// scripts/build-study-art.mjs into one small index, public/art/study.json,
// which is fetched the first time a chapter's context is opened and kept.

export interface StudyArt {
  id: string;
  /** which library: the Tabernacle and Temples, or daily life */
  set: "architecture" | "world";
  /** a painted reconstruction, a vector drawing of one, or a measured diagram */
  type: "picture" | "drawing" | "diagram";
  title: string;
  /** the passages it illustrates, as the library gives them */
  refs: string[];
  period: string;
  /** what is reconstructed or uncertain — shown with the picture, always */
  note: string;
  alt: string;
  sources: { t: string; u: string }[];
  src: string;
  full: string;
  w: number;
  h: number;
}

interface Index {
  note: string;
  items: Record<string, Omit<StudyArt, "id">>;
  chapters: Record<string, string[]>;
}

let loading: Promise<Index | null> | null = null;

function load(): Promise<Index | null> {
  loading ??= fetch("/art/study.json")
    .then((r) => (r.ok ? (r.json() as Promise<Index>) : null))
    .catch(() => {
      // offline before it was ever fetched: try again next time
      loading = null;
      return null;
    });
  return loading;
}

/** The study pictures for a chapter, in the order the libraries give them. */
export async function studyArtFor(bookNr: number, chapter: number): Promise<StudyArt[]> {
  const index = await load();
  if (!index) return [];
  return (index.chapters[`${bookNr}:${chapter}`] ?? [])
    .map((id) => (index.items[id] ? { id, ...index.items[id] } : null))
    .filter((a): a is StudyArt => a !== null);
}
