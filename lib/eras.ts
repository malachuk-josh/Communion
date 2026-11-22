// The ten ages the maps are drawn for, as scripture tells them: for each,
// the passages that say what that age was. Shown with the era's map on the
// Maps tab (components/AtlasMap), each opening its verses over the map. The
// words about each age are in lib/i18n.tsx, under map.eraAbout.<era>.
//
// The eras themselves, and the regions each names, are public/maps/eras.json;
// the order here is theirs.

/** A passage: book number, chapter, first verse and, for a range, the last. */
export type EraRef = [book: number, chapter: number, verse: number, last?: number];

export const ERA_REFS: Record<string, EraRef[]> = {
  // Ur and the call; the promise of the land; Bethel; Jacob told to go down
  patriarchs: [
    [1, 12, 1, 3],
    [1, 15, 5, 7],
    [1, 28, 13, 15],
    [1, 46, 3, 4],
  ],
  // the cry heard; the sea parted; the law given; forty years
  exodus: [
    [2, 3, 7, 10],
    [2, 14, 21, 22],
    [2, 20, 1, 3],
    [5, 8, 2],
  ],
  // the land given; Jericho; every promise kept; judges raised up; Ruth
  conquest: [
    [6, 1, 2, 3],
    [6, 6, 20],
    [6, 21, 43, 45],
    [7, 2, 16],
    [8, 1, 16],
  ],
  // a king asked for; Zion taken; the throne promised; Dan to Beersheba; the temple
  kingdom: [
    [9, 8, 5],
    [10, 5, 7],
    [10, 7, 12, 13],
    [11, 4, 25],
    [11, 6, 14],
  ],
  // the kingdom torn; Samaria bought; Carmel; Amos; Samaria carried away
  divided: [
    [11, 12, 16, 20],
    [11, 16, 24],
    [11, 18, 21],
    [30, 5, 24],
    [12, 17, 6],
  ],
  // the temple burned; the rivers of Babylon; seventy years; Daniel's window
  exile: [
    [12, 25, 8, 11],
    [19, 137, 1],
    [24, 29, 10, 11],
    [27, 6, 10],
  ],
  // Cyrus' decree; the house finished; the wall finished; Esther
  return: [
    [15, 1, 1, 3],
    [15, 6, 14, 15],
    [16, 6, 15],
    [17, 4, 14],
  ],
  // Bethlehem; the kingdom preached; Galilee; the empty tomb
  gospels: [
    [42, 2, 4, 7],
    [41, 1, 14, 15],
    [40, 4, 23],
    [42, 24, 5, 7],
  ],
  // to the ends of the earth; Pentecost; Paul sent; Macedonia; Rome
  apostles: [
    [44, 1, 8],
    [44, 2, 41],
    [44, 13, 2, 3],
    [44, 16, 9, 10],
    [44, 28, 30, 31],
  ],
  // Patmos; the seven named; the tree of life; the door
  churches: [
    [66, 1, 9],
    [66, 1, 11],
    [66, 2, 7],
    [66, 3, 20],
  ],
};
