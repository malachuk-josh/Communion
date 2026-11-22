// What each era's map on the Maps tab shows beyond its ground: the realms of
// that age, shaded; the story of the age, a step at a time; and where each of
// the passages on its card happened. Written by hand, and drawn onto each
// era's map by scripts/build-era-story.mjs, which checks every name and
// reference in here against the maps and the two Bibles the app carries.
//
// LANDS     the realms, each a rough outline in longitude and latitude. The
//           map clips every one to its coastline, so an outline only has to
//           be right where it crosses land; out at sea it can run anywhere.
//           Borders between ancient realms were never surveyed and seldom
//           agreed — these follow the usual Bible atlases, and the map says
//           they are approximate. `tone` picks one of eight colours (no two
//           neighbours alike); `sub` marks a realm paying tribute to another,
//           drawn fainter; `at` is where its name is written, if it has one.
// SHOW      the realms an era's map opens with.
// KEEP      the era's own region names (public/maps/eras.json) still written
//           while the realms are shown; the rest give way to the realms' names.
// STORY     the steps of "Play this era": a caption in each language, the
//           verse that tells it, the places that light up, the way anyone
//           went (`go`), and, where the map changed, the realms at that step.
// PASSAGE_PLACES
//           places to light for a passage on the era's card, besides those the
//           chapter's own map already puts at that verse.
//
// A place is a name on the era's map; where the map has two of a name,
// "Name#id" says which. A point the map has no name for is [lon, lat]. A way
// travelled is a list of places, or a journey already drawn — { j, from, to }
// takes its legs from..to (leg n runs from stop n to stop n + 1).

// ---------------------------------------------------------------------------
// The Levant, shared by the conquest, the kingdom and the divided kingdom.
// The corners are named so that neighbours share them and never overlap.

const L = {
  // Asher, Naphtali and the north
  A: [34.6, 33.55], B: [35.35, 33.55], C: [35.35, 33.05], D: [35.25, 32.85],
  E: [35.1, 32.72], F: [34.6, 32.72], G: [35.68, 33.45], H: [35.62, 33.1],
  I: [35.55, 32.85], J: [35.58, 32.7], K: [35.45, 32.72], LL: [35.4, 32.82],
  // Zebulun, Issachar, Manasseh
  M: [35.42, 32.68], N: [35.25, 32.62], O: [35.55, 32.42], P: [35.3, 32.48],
  Q: [35.54, 32.1], R: [35.25, 32.12], S: [34.95, 32.18], T: [34.6, 32.18],
  // Ephraim, Benjamin, Dan, Philistia
  U: [35.52, 31.95], V: [35.3, 31.93], W: [35.05, 31.95], X: [34.6, 32.05],
  Y: [35.08, 31.8], Z: [34.85, 31.75], AA: [34.6, 31.85], AB: [34.88, 31.6],
  AC: [34.55, 31.25], AD: [34.2, 31.25], AE: [34.2, 31.85],
  // Judah, Simeon, and the south
  AF: [35.5, 31.78], AG: [35.2, 31.77], AI: [35.45, 30.95], AJ: [35.25, 30.6],
  AK: [34.5, 30.65], AM: [35.0, 31.35], AN: [35.05, 31.05], AO: [34.45, 30.95],
  // beyond the Jordan
  AP: [35.57, 31.78], AQ: [35.85, 31.8], AR: [35.9, 31.47], AS: [35.55, 31.47],
  AT: [35.58, 32.42], AU: [35.95, 32.05], AV: [35.9, 32.45], AW: [35.6, 32.7],
  AX: [36.4, 32.5], AY: [36.4, 33.2], AZ: [35.75, 33.3], BA: [35.65, 33.1],
  BB: [35.65, 32.85], BC: [36.1, 31.4], BD: [36.0, 30.95], BE: [35.55, 31.0],
  BF: [36.4, 32.1], BG: [36.4, 31.65], BH: [35.8, 30.2], BI: [35.45, 29.55],
  BJ: [34.95, 29.5],
  // the kingdoms' northern edge: Israel, Phoenicia, Aram
  N1: [34.3, 33.08], N2: [35.15, 33.08], N3: [35.35, 33.15], N4: [35.62, 33.3],
  N5: [35.85, 33.3], N6: [36.2, 33.0], N7: [36.9, 32.5], N8: [36.9, 33.9],
  N9: [35.8, 33.9], N10: [35.85, 33.5], N11: [34.3, 33.9],
  // the line between Israel and Judah after Solomon
  D1: [34.3, 32.08], D2: [34.75, 32.08], D3: [35.05, 31.9], D4: [35.22, 31.86],
  D5: [35.4, 31.86], D6: [35.5, 31.8],
};
const at = (...keys) => keys.map((k) => L[k]);

const PHILISTIA = { id: "philistia", en: "Philistia", es: "Filistea", tone: 6, at: [34.55, 31.55], ll: at("AA", "Z", "AB", "AC", "AD", "AE") };
const MOAB = { id: "moab", en: "Moab", es: "Moab", tone: 5, at: [35.8, 31.2], ll: at("AS", "AR", "BC", "BD", "BE") };
const AMMON = { id: "ammon", en: "Ammon", es: "Amón", tone: 7, at: [36.15, 31.9], ll: at("AU", "BF", "BG", "BC", "AR", "AQ") };
const EDOM = { id: "edom", en: "Edom", es: "Edom", tone: 6, at: [35.55, 30.4], ll: at("AI", "BE", "BD", "BH", "BI", "BJ", "AJ") };
const PHOENICIA = { id: "phoenicia", en: "Phoenicia", es: "Fenicia", tone: 2, at: [35.35, 33.5], ll: at("N1", "N2", "N3", "N4", "N5", "N10", "N9", "N11") };
const ARAM = { id: "aram", en: "Aram", es: "Siria", tone: 3, at: [36.35, 33.45], ll: at("N5", "N6", "AX", "N7", "N8", "N9", "N10") };
const sub = (land) => ({ ...land, sub: 1 });

// Egypt on the wide window of the Near East: the Nile, the delta, and the
// desert either side, as far as the Sinai.
const EGYPT_WIDE = { id: "egypt", en: "Egypt", es: "Egipto", tone: 6, at: [31.0, 27.0], ll: [[25, 31.6], [29, 31.0], [32.3, 31.3], [34.25, 31.3], [34.9, 29.5], [34.2, 27.6], [35.8, 23.5], [25, 23.5]] };

export const LANDS = {
  patriarchs: [
    { id: "canaan", en: "Canaan", es: "Canaán", tone: 0, at: [35.15, 32.1], ll: [[34.2, 31.25], [33.9, 31.6], [34.5, 33.6], [35.45, 33.6], [35.7, 33.3], [35.6, 31.8], [35.5, 31.0], [35.25, 30.6], [34.5, 30.7]] },
    EGYPT_WIDE,
  ],
  exodus: [
    { id: "egypt", en: "Egypt", es: "Egipto", tone: 6, at: [30.6, 28.6], ll: [[29.4, 31.6], [32.6, 31.2], [32.6, 30.0], [32.45, 29.5], [32.65, 28.8], [33.3, 28.0], [34.2, 27.0], [34.2, 26.8], [29.4, 26.8]] },
    { id: "midian", en: "Midian", es: "Madián", tone: 2, at: [35.6, 28.3], ll: [[34.9, 29.5], [35.4, 29.5], [36.6, 29.5], [36.6, 26.8], [34.8, 26.8]] },
    { id: "edom", en: "Edom", es: "Edom", tone: 3, at: [35.55, 30.45], ll: [[34.9, 29.5], [35.4, 29.5], [36.1, 29.9], [36.1, 30.95], [35.55, 31.0], [35.45, 30.95], [35.25, 30.6], [34.95, 30.3]] },
    { id: "moab", en: "Moab", es: "Moab", tone: 5, at: [35.85, 31.25], ll: [[35.55, 31.0], [36.1, 30.95], [36.2, 31.45], [35.9, 31.47], [35.55, 31.47]] },
    { id: "canaan", en: "Canaan", es: "Canaán", tone: 0, at: [35.0, 31.9], ll: [[34.25, 31.25], [34.2, 32.6], [35.55, 32.6], [35.55, 31.47], [35.45, 31.0], [35.25, 30.6], [34.6, 30.7]] },
  ],
  // the twelve tribes, as Joshua 13–19 portions the land
  conquest: [
    { id: "asher", en: "Asher", es: "Aser", tone: 2, at: [35.22, 33.2], ll: at("A", "B", "C", "D", "E", "F") },
    { id: "naphtali", en: "Naphtali", es: "Neftalí", tone: 0, at: [35.5, 33.15], ll: at("B", "G", "H", "I", "J", "K", "LL", "D", "C") },
    { id: "zebulun", en: "Zebulun", es: "Zabulón", tone: 4, at: [35.28, 32.75], ll: at("D", "LL", "M", "N", "E") },
    { id: "issachar", en: "Issachar", es: "Isacar", tone: 6, at: [35.45, 32.58], ll: at("LL", "K", "J", "O", "P", "N", "M") },
    { id: "manasseh", en: "Manasseh", es: "Manasés", tone: 3, at: [35.15, 32.4], ll: at("F", "E", "N", "P", "O", "Q", "R", "S", "T") },
    { id: "ephraim", en: "Ephraim", es: "Efraín", tone: 5, at: [35.25, 32.03], ll: at("T", "S", "R", "Q", "U", "V", "W", "X") },
    { id: "dan", en: "Dan", es: "Dan", tone: 7, at: [34.88, 31.88], ll: at("X", "W", "Y", "Z", "AA") },
    { id: "benjamin", en: "Benjamin", es: "Benjamín", tone: 1, at: [35.3, 31.85], ll: at("W", "V", "U", "AF", "AG", "Y") },
    { id: "judah", en: "Judah", es: "Judá", tone: 0, at: [35.1, 31.5], ll: at("Z", "Y", "AG", "AF", "AI", "AJ", "AK", "AO", "AN", "AM", "AC", "AB") },
    { id: "simeon", en: "Simeon", es: "Simeón", tone: 3, at: [34.78, 31.15], ll: at("AC", "AM", "AN", "AO") },
    { id: "reuben", en: "Reuben", es: "Rubén", tone: 4, at: [35.72, 31.64], ll: at("AP", "AQ", "AR", "AS") },
    { id: "gad", en: "Gad", es: "Gad", tone: 2, at: [35.73, 32.15], ll: at("AT", "AV", "AU", "AQ", "AP") },
    { id: "manassehE", en: "Manasseh", es: "Manasés", tone: 3, at: [35.98, 32.85], ll: at("AW", "AT", "AV", "AX", "AY", "AZ", "BA", "BB") },
    PHILISTIA,
    MOAB,
    AMMON,
    EDOM,
  ],
  // David and Solomon's kingdom, and the peoples who paid it tribute
  kingdom: [
    { id: "israel", en: "Israel", es: "Israel", tone: 0, at: [35.25, 32.3], ll: at("N1", "N2", "N3", "N4", "N5", "N6", "AX", "BF", "AU", "AQ", "AR", "AS", "AI", "AJ", "AK", "AO", "AC", "AB", "Z", "AA", "AE") },
    PHOENICIA,
    PHILISTIA,
    sub(ARAM),
    sub(AMMON),
    sub(MOAB),
    sub(EDOM),
  ],
  // the two kingdoms; and, after 722 BC, Assyria where Israel and Aram were
  divided: [
    { id: "israel", en: "Israel", es: "Israel", tone: 0, at: [35.3, 32.45], ll: [...at("D1", "N1", "N2", "N3", "N4", "N5", "N6", "AX", "BF", "AU", "AQ", "AR", "AS", "AP", "D6", "D5", "D4", "D3", "D2")] },
    { id: "judah", en: "Judah", es: "Judá", tone: 1, at: [35.05, 31.45], ll: [...at("D2", "D3", "D4", "D5", "D6", "AF", "AI", "AJ", "AK", "AO", "AC", "AB", "Z", "AA", "AE", "D1")] },
    PHOENICIA,
    PHILISTIA,
    ARAM,
    AMMON,
    MOAB,
    EDOM,
    { id: "assyria", en: "Assyria", es: "Asiria", tone: 7, at: [35.9, 33.1], ll: [...at("D1", "D2", "D3", "D4", "D5", "D6", "AP", "AS", "AR", "AQ", "AU", "BF", "AX", "N7", "N8", "N9", "N10", "N5", "N4", "N3", "N2", "N1")] },
  ],
  exile: [
    { id: "assyria", en: "The Assyrian empire", es: "El imperio asirio", tone: 7, at: [42.6, 35.6], ll: [[34.25, 31.3], [33.8, 31.3], [33.8, 36.0], [34.3, 37.3], [36.0, 37.6], [37.5, 37.8], [39.0, 37.9], [41.0, 37.8], [42.5, 37.4], [43.5, 37.3], [44.5, 36.8], [45.5, 35.8], [46.0, 35.0], [46.3, 34.0], [47.0, 33.0], [47.6, 32.0], [48.0, 31.0], [48.6, 30.0], [49.0, 29.5], [47.0, 30.0], [46.0, 30.6], [44.5, 31.3], [43.0, 32.3], [41.5, 33.5], [40.0, 34.5], [38.3, 34.0], [37.3, 33.0], [36.8, 32.0], [36.3, 31.0], [35.8, 30.3], [35.0, 29.6], [34.9, 29.5]] },
    { id: "babylon", en: "The Babylonian empire", es: "El imperio babilónico", tone: 0, at: [43.6, 32.6], ll: [[34.25, 31.3], [33.8, 31.3], [33.8, 36.0], [35.9, 36.0], [36.3, 36.6], [37.5, 37.2], [39.0, 37.2], [40.5, 37.0], [42.0, 36.6], [43.1, 35.9], [44.2, 35.0], [45.5, 34.3], [46.5, 33.2], [47.5, 32.0], [48.2, 30.6], [48.6, 30.0], [49.0, 29.5], [47.0, 30.0], [46.0, 30.6], [44.5, 31.3], [43.0, 32.0], [41.5, 33.3], [40.5, 34.2], [38.3, 34.0], [37.3, 33.0], [36.8, 32.0], [36.3, 31.0], [35.8, 30.3], [35.0, 29.6], [34.9, 29.5]] },
    { id: "media", en: "The Medes", es: "Los medos", tone: 3, at: [47.5, 36.2], ll: [[36.0, 41.7], [34.2, 40.8], [33.8, 39.3], [35.0, 38.3], [36.8, 37.8], [37.5, 37.2], [39.0, 37.2], [40.5, 37.0], [42.0, 36.6], [43.1, 35.9], [44.2, 35.0], [45.5, 34.3], [46.5, 33.2], [47.5, 32.0], [48.2, 30.6], [48.6, 30.0], [50.5, 29.0], [50.5, 42.5], [41.5, 42.5], [41.6, 41.6]] },
    EGYPT_WIDE,
  ],
  return: [
    { id: "persia", en: "The Persian empire", es: "El imperio persa", tone: 4, at: [44.5, 34.0], ll: [[25, 23.5], [25, 32.0], [26.0, 35.5], [26.0, 42.5], [50.5, 42.5], [50.5, 29.0], [48.0, 29.9], [46.0, 30.6], [44.5, 31.3], [43.0, 32.0], [41.5, 33.3], [40.5, 34.2], [38.3, 34.0], [37.3, 33.0], [36.8, 32.0], [36.3, 31.0], [35.8, 30.3], [35.0, 29.5], [35.8, 23.5]] },
    { id: "yehud", en: "Judah", es: "Judá", tone: 0, at: [35.2, 31.3], ll: [[34.85, 31.95], [35.5, 31.95], [35.45, 31.4], [34.95, 31.45]] },
  ],
  // Herod's kingdom shared among his sons, and the realms round it
  gospels: [
    { id: "galilee", en: "Galilee", es: "Galilea", tone: 0, at: [35.35, 32.85], ll: [[35.08, 32.75], [35.2, 32.9], [35.25, 33.12], [35.6, 33.15], [35.62, 33.0], [35.56, 32.88], [35.56, 32.7], [35.52, 32.6], [35.3, 32.57], [35.1, 32.65]] },
    { id: "samaria", en: "Samaria", es: "Samaria", tone: 3, at: [35.2, 32.3], ll: [[34.3, 32.62], [35.1, 32.65], [35.3, 32.57], [35.52, 32.6], [35.54, 32.1], [35.3, 32.05], [35.0, 32.05], [34.3, 32.1]] },
    { id: "judea", en: "Judea", es: "Judea", tone: 1, at: [35.0, 31.75], ll: [[34.3, 32.1], [35.0, 32.05], [35.3, 32.05], [35.54, 32.1], [35.52, 31.78], [35.45, 31.45], [35.0, 31.45], [34.6, 31.65], [34.3, 31.65]] },
    { id: "idumea", en: "Idumea", es: "Idumea", tone: 5, at: [34.95, 31.2], ll: [[34.6, 31.65], [35.0, 31.45], [35.45, 31.45], [35.42, 31.05], [35.1, 30.85], [34.6, 31.0], [34.45, 31.3]] },
    { id: "perea", en: "Perea", es: "Perea", tone: 4, at: [35.7, 31.95], ll: [[35.57, 32.4], [35.8, 32.38], [35.85, 32.1], [35.82, 31.55], [35.55, 31.55], [35.57, 31.78]] },
    { id: "decapolis", en: "Decapolis", es: "Decápolis", tone: 2, at: [36.05, 32.45], ll: [[35.56, 32.7], [35.65, 32.85], [35.8, 32.8], [36.25, 32.65], [36.3, 32.1], [35.95, 31.95], [35.85, 32.1], [35.8, 32.38], [35.57, 32.4]] },
    { id: "philip", en: "Iturea and Trachonitis", es: "Iturea y Traconite", tone: 6, at: [36.25, 33.05], ll: [[35.62, 33.0], [35.6, 33.15], [35.7, 33.35], [36.5, 33.35], [36.9, 33.3], [36.9, 32.7], [36.25, 32.65], [35.8, 32.8], [35.65, 32.85]] },
    { id: "nabatea", en: "Nabatea", es: "Nabatea", tone: 7, at: [35.9, 30.6], ll: [[35.42, 31.05], [35.55, 31.55], [35.82, 31.55], [35.95, 31.95], [36.3, 32.1], [36.25, 32.65], [36.9, 32.7], [36.9, 29.3], [34.3, 29.3], [34.3, 30.6], [34.6, 31.0], [35.1, 30.85]] },
    { id: "syria", en: "Syria", es: "Siria", tone: 5, at: [35.75, 33.65], ll: [[34.3, 32.75], [35.08, 32.75], [35.2, 32.9], [35.25, 33.12], [35.6, 33.15], [35.7, 33.35], [36.5, 33.35], [36.9, 33.3], [36.9, 33.9], [34.3, 33.9]] },
  ],
  // Rome under Nero, and Parthia across the Euphrates
  apostles: [
    { id: "rome", tone: 0, ll: [[8, 45.5], [19.0, 45.5], [19.2, 45.2], [20.5, 44.8], [22.5, 44.6], [23.0, 43.8], [25.0, 43.6], [27.5, 44.1], [29.7, 45.2], [31.0, 45.5], [38.0, 45.5], [41.6, 41.6], [39.8, 41.0], [39.5, 40.0], [38.8, 39.0], [38.5, 38.2], [38.0, 37.1], [38.3, 36.0], [38.3, 34.5], [37.5, 33.3], [36.6, 32.5], [36.3, 32.4], [35.95, 31.9], [35.9, 31.6], [35.55, 31.3], [35.4, 30.9], [34.9, 30.6], [34.3, 31.0], [34.2, 30.0], [33.6, 28.3], [34.0, 27.5], [34.4, 26.5], [28.5, 26.5], [28.0, 29.0], [25.0, 30.8], [22.0, 31.2], [20.0, 30.2], [19.0, 29.8], [15.5, 31.0], [13.0, 32.0], [11.0, 32.5], [10.0, 33.5], [8, 34.5]] },
    { id: "parthia", en: "Parthia", es: "Partia", tone: 7, at: [45.5, 34.5], ll: [[38.0, 37.1], [39.5, 37.6], [42.0, 37.5], [44.5, 38.0], [47.0, 39.0], [48.5, 39.5], [50.5, 39.5], [50.5, 26.5], [48.5, 29.8], [47.5, 30.5], [46.0, 31.0], [44.4, 32.5], [43.0, 33.6], [41.5, 34.3], [40.5, 34.5], [39.5, 35.2], [38.3, 36.0]] },
  ],
  // the province the seven churches stood in, and its neighbours
  churches: [
    { id: "asia", tone: 0, ll: [[26.3, 40.1], [26.8, 40.6], [27.5, 40.6], [28.4, 40.4], [28.9, 40.0], [29.8, 39.6], [30.6, 39.3], [31.2, 38.8], [31.0, 38.0], [30.6, 37.5], [29.8, 37.0], [28.7, 36.7], [28.0, 36.3], [25.4, 36.3], [25.4, 40.0]] },
    { id: "bithynia", en: "Bithynia", es: "Bitinia", tone: 4, at: [30.4, 40.25], ll: [[27.5, 40.6], [28.4, 40.4], [28.9, 40.0], [29.8, 39.6], [31.6, 39.8], [31.6, 40.6]] },
    { id: "galatia", en: "Galatia", es: "Galacia", tone: 3, at: [31.2, 38.6], ll: [[29.8, 39.6], [30.6, 39.3], [31.2, 38.8], [31.0, 38.0], [30.6, 37.5], [31.6, 37.3], [31.6, 39.8]] },
    { id: "lycia", en: "Lycia and Pamphylia", es: "Licia y Panfilia", tone: 6, at: [30.0, 36.6], ll: [[28.7, 36.7], [29.8, 37.0], [30.6, 37.5], [31.6, 37.3], [31.6, 36.2], [28.6, 36.2]] },
  ],
};

export const SHOW = {
  patriarchs: ["canaan", "egypt"],
  exodus: ["egypt", "midian", "edom", "moab", "canaan"],
  conquest: ["asher", "naphtali", "zebulun", "issachar", "manasseh", "ephraim", "dan", "benjamin", "judah", "simeon", "reuben", "gad", "manassehE", "philistia", "moab", "ammon", "edom"],
  kingdom: ["israel", "phoenicia", "philistia", "aram", "ammon", "moab", "edom"],
  divided: ["israel", "judah", "phoenicia", "philistia", "aram", "ammon", "moab", "edom"],
  exile: ["babylon", "media", "egypt"],
  return: ["persia", "yehud"],
  gospels: ["galilee", "samaria", "judea", "idumea", "perea", "decapolis", "philip", "nabatea", "syria"],
  apostles: ["rome", "parthia"],
  churches: ["asia", "bithynia", "galatia", "lycia"],
};

export const KEEP = {
  patriarchs: ["Mesopotamia", "Arabia", "The Great Sea"],
  exodus: ["Goshen", "The Wilderness of Sinai", "The Red Sea"],
  conquest: ["The Great Sea", "The Salt Sea"],
  kingdom: ["The Great Sea"],
  divided: ["The Great Sea"],
  exile: ["Judah", "The Great Sea"],
  return: ["Egypt", "Asia Minor", "The Great Sea"],
  gospels: ["The Great Sea", "The Sea of Galilee", "The Dead Sea"],
  apostles: ["Italy", "Macedonia", "Achaia", "Asia", "Galatia", "Syria", "Judea", "Egypt", "The Great Sea"],
  churches: ["Asia", "Mysia", "Lydia", "Phrygia", "The Aegean Sea"],
};

// before Shiloh, Canaan has not yet been shared out
const NATIONS = ["philistia", "moab", "ammon", "edom"];
// after Samaria falls
const AFTER_722 = ["judah", "phoenicia", "philistia", "assyria", "ammon", "moab", "edom"];

export const STORY = {
  patriarchs: [
    {
      en: "Terah takes Abram, Sarai and Lot out of Ur of the Chaldees, bound for Canaan, and they settle in Haran.",
      es: "Taré saca a Abram, a Sarai y a Lot de Ur de los caldeos rumbo a Canaán, y se quedan a vivir en Harán.",
      ref: [1, 11, 31],
      places: ["Ur", "Haran"],
      go: [{ j: "abraham", from: 0, to: 0 }],
    },
    {
      en: "At seventy-five, at God’s word, Abram leaves Haran for Canaan. At Shechem God promises the land to his seed, and at Bethel he builds an altar.",
      es: "A los setenta y cinco años, por la palabra de Dios, Abram sale de Harán hacia Canaán. En Siquem Dios promete la tierra a su descendencia, y en Bet-el edifica un altar.",
      ref: [1, 12, 7],
      places: ["Haran", "Shechem", "Bethel#a64f355"],
      go: [{ j: "abraham", from: 1, to: 2 }],
    },
    {
      en: "A famine drives Abram down into Egypt. He comes back very rich in cattle, in silver and in gold, and returns to Bethel.",
      es: "El hambre lleva a Abram a Egipto. Vuelve muy rico en ganado, en plata y en oro, y regresa a Bet-el.",
      ref: [1, 13, 1, 2],
      places: ["Egypt", "Bethel#a64f355"],
      go: [{ j: "abraham", from: 3, to: 6 }],
    },
    {
      en: "Abraham dwells by Hebron and Beersheba. Isaac is born, and on a mountain in the land of Moriah God provides a ram in his place.",
      es: "Abraham habita junto a Hebrón y Beerseba. Nace Isaac, y en un monte de la tierra de Moriah Dios provee un carnero en su lugar.",
      ref: [1, 22, 13],
      places: ["Hebron", "Beersheba", "Moriah"],
      go: [{ j: "abraham", from: 7, to: 11 }],
    },
    {
      en: "Abraham’s servant goes back to the city of Nahor in Mesopotamia, and brings Rebekah home to be Isaac’s wife.",
      es: "El siervo de Abraham vuelve a la ciudad de Nacor, en Mesopotamia, y trae a Rebeca para que sea mujer de Isaac.",
      ref: [1, 24, 10],
      places: ["Haran", "Beersheba"],
      go: [["Beersheba", "Damascus", [37.6, 35.8], "Haran"]],
    },
    {
      en: "Jacob flees to Laban in Haran, serves him twenty years, and comes home by Penuel, where he is named Israel.",
      es: "Jacob huye a Labán en Harán, le sirve veinte años y vuelve por Penuel, donde recibe el nombre de Israel.",
      ref: [1, 31, 41],
      places: ["Haran", "Bethel#a64f355"],
      go: [{ j: "jacob", from: 0, to: 9 }],
    },
    {
      en: "Joseph, sold into Egypt, rises to rule it. In the famine Jacob goes down with all his house, and they settle in Goshen.",
      es: "José, vendido a Egipto, llega a gobernarlo. En el hambre Jacob baja con toda su casa, y se establecen en Gosén.",
      ref: [1, 45, 9],
      places: ["Goshen#a60f092", "Beersheba"],
      go: [{ j: "jacob", from: 10, to: 11 }],
    },
  ],

  exodus: [
    {
      en: "In Egypt the children of Israel are made slaves, and build Pharaoh the treasure cities Pithom and Raamses.",
      es: "En Egipto los hijos de Israel son hechos esclavos, y edifican para Faraón las ciudades de almacenaje Pitón y Ramesés.",
      ref: [2, 1, 11],
      places: ["Pithom", "Rameses", "Goshen#a60f092"],
    },
    {
      en: "Moses flees to Midian. Keeping sheep at Horeb, he sees the bush that burns and is not consumed, and God sends him back to Pharaoh.",
      es: "Moisés huye a Madián. Apacentando ovejas en Horeb, ve la zarza que arde y no se consume, y Dios lo envía de nuevo a Faraón.",
      ref: [2, 3, 2],
      places: ["Midian", "Mount Horeb"],
      go: [["Goshen#a60f092", [33.1, 30.15], [34.3, 29.85], "Midian"]],
    },
    {
      en: "After the tenth plague Israel goes out from Rameses to Succoth, about six hundred thousand men on foot, besides children.",
      es: "Tras la décima plaga, Israel parte de Ramesés hacia Sucot: unos seiscientos mil hombres de a pie, sin contar los niños.",
      ref: [2, 12, 37],
      places: ["Rameses", "Succoth#aa28709"],
      go: [{ j: "exodus", from: 0, to: 1 }],
    },
    {
      en: "Shut in between Pi-hahiroth and the sea, Israel goes through on dry ground as God parts the waters.",
      es: "Encerrado entre Pi-hahirot y el mar, Israel pasa en seco cuando Dios divide las aguas.",
      ref: [2, 14, 22],
      places: ["Pi-hahiroth", "Migdol"],
      go: [{ j: "exodus", from: 2, to: 3 }],
    },
    {
      en: "By Marah and Elim, fed with manna, they come to Mount Sinai, where God gives the law.",
      es: "Pasando por Mara y Elim, alimentados con maná, llegan al monte Sinaí, donde Dios da la ley.",
      ref: [2, 19, 20],
      places: ["Marah", "Elim", "Mount Sinai"],
      go: [{ j: "exodus", from: 4, to: 7 }],
    },
    {
      en: "From Kadesh-barnea twelve spies search out Canaan. The people will not go up, and are turned back to wander forty years.",
      es: "Desde Cades-barnea doce espías reconocen Canaán. El pueblo no quiere subir, y vuelve a andar errante cuarenta años.",
      ref: [4, 32, 8],
      places: ["Kadesh-barnea"],
      go: [{ j: "exodus", from: 8, to: 10 }],
    },
    {
      en: "Going round Edom, they come to the plains of Moab. From Pisgah on Mount Nebo, God shows Moses all the land.",
      es: "Rodeando Edom, llegan a las llanuras de Moab. Desde el Pisga, en el monte Nebo, Dios muestra a Moisés toda la tierra.",
      ref: [5, 34, 1],
      places: ["Mount Hor", "Mount Nebo"],
      go: [{ j: "exodus", from: 11, to: 19 }],
    },
  ],

  conquest: [
    {
      en: "Under Joshua, Israel crosses the Jordan on dry ground and camps at Gilgal, on the east border of Jericho.",
      es: "Bajo Josué, Israel cruza el Jordán en seco y acampa en Gilgal, al oriente de Jericó.",
      ref: [6, 4, 19],
      places: ["Gilgal#ab94aea", "the Jordan"],
      go: [["Abel-shittim", "Gilgal#ab94aea"]],
      lands: NATIONS,
    },
    {
      en: "The walls of Jericho fall down flat, and the city is taken.",
      es: "Los muros de Jericó caen a plomo, y la ciudad es tomada.",
      ref: [6, 6, 20],
      places: ["Jericho"],
      lands: NATIONS,
    },
    {
      en: "Joshua goes up from Gilgal to save Gibeon. The sun stands still over Gibeon and the moon over the valley of Ajalon, and the kings of the south are routed.",
      es: "Josué sube de Gilgal a socorrer a Gabaón. El sol se detiene sobre Gabaón y la luna sobre el valle de Ajalón, y los reyes del sur son derrotados.",
      ref: [6, 10, 12],
      places: ["Gibeon", "Beth-horon", "Aijalon#a1c600b"],
      go: [["Gilgal#ab94aea", "Gibeon", "Beth-horon", "Aijalon#a1c600b"]],
      lands: NATIONS,
    },
    {
      en: "In the north Joshua defeats the kings at the waters of Merom, and burns Hazor, the head of all those kingdoms.",
      es: "En el norte Josué derrota a los reyes junto a las aguas de Merom, y quema Hazor, cabeza de todos aquellos reinos.",
      ref: [6, 11, 10],
      places: ["Merom", "Hazor#a6f33c5"],
      go: [["Gilgal#ab94aea", [35.56, 32.45], "Merom", "Hazor#a6f33c5"]],
      lands: NATIONS,
    },
    {
      en: "The tabernacle is set up at Shiloh, and there Joshua divides the land among the tribes by lot.",
      es: "El tabernáculo se levanta en Silo, y allí Josué reparte la tierra entre las tribus por suertes.",
      ref: [6, 18, 10],
      places: ["Shiloh"],
    },
    {
      en: "In the days of the judges, Deborah sends Barak down from Mount Tabor, and Sisera’s army is swept away by the river Kishon.",
      es: "En los días de los jueces, Débora envía a Barac desde el monte Tabor, y el torrente de Cisón arrastra al ejército de Sísara.",
      ref: [7, 5, 21],
      places: ["Mount Tabor", "the Kishon", "Megiddo"],
      go: [["Mount Tabor", "the Kishon"]],
    },
    {
      en: "Ruth the Moabitess comes home with Naomi to Bethlehem, and marries Boaz; their great-grandson is David.",
      es: "Rut la moabita vuelve con Noemí a Belén y se casa con Booz; su bisnieto es David.",
      ref: [8, 4, 13],
      places: ["Moab#aa0b1d6", "Bethlehem#a112427"],
      go: [{ j: "naomi", from: 0, to: 0 }],
    },
  ],

  kingdom: [
    {
      en: "Israel asks for a king. Samuel anoints Saul, and at Mizpeh the people shout, God save the king.",
      es: "Israel pide un rey. Samuel unge a Saúl, y en Mizpa el pueblo aclama: ¡Viva el rey!",
      ref: [9, 10, 24],
      places: ["Ramah#a6d57ed", "Mizpeh#afc2466", "Gibeah#ac24f5f"],
      glow: ["israel"],
    },
    {
      en: "In the valley of Elah young David, the shepherd from Bethlehem, kills Goliath of Gath with a sling and a stone.",
      es: "En el valle de Ela, el joven David, pastor de Belén, mata a Goliat de Gat con una honda y una piedra.",
      ref: [9, 17, 50],
      places: ["Bethlehem#a112427", "the Valley of Elah", "Socoh#a39a6b9", "Azekah", "Gath#a18873f"],
      go: [["Bethlehem#a112427", "the Valley of Elah"]],
    },
    {
      en: "Saul turns against David, and David flees from place to place, until the Philistine king of Gath gives him Ziklag.",
      es: "Saúl se vuelve contra David, y David huye de lugar en lugar, hasta que el rey filisteo de Gat le da Siclag.",
      ref: [9, 23, 14],
      places: [],
      go: [{ j: "david" }],
    },
    {
      en: "Saul and his sons fall on Mount Gilboa, fighting the Philistines.",
      es: "Saúl y sus hijos caen en el monte Gilboa, peleando contra los filisteos.",
      ref: [9, 31, 6],
      places: ["Mount Gilboa", "Beth-shan"],
    },
    {
      en: "David reigns seven years at Hebron, then takes the stronghold of Zion and makes Jerusalem his city.",
      es: "David reina siete años en Hebrón; después toma la fortaleza de Sion y hace de Jerusalén su ciudad.",
      ref: [10, 5, 5],
      places: ["Hebron", "Jerusalem"],
      go: [["Hebron", "Jerusalem"]],
    },
    {
      en: "David subdues his neighbours: Edom, Moab, Ammon and the Syrians of Zobah and Damascus become his servants.",
      es: "David somete a sus vecinos: Edom, Moab, Amón y los sirios de Soba y de Damasco pasan a ser sus siervos.",
      ref: [10, 8, 14],
      places: ["Damascus", "Rabbah#ae067b5"],
      glow: ["aram", "ammon", "moab", "edom"],
    },
    {
      en: "Solomon builds the temple with cedars of Lebanon, which Hiram king of Tyre sends by sea in floats to Joppa, to be carried up to Jerusalem.",
      es: "Salomón edifica el templo con cedros del Líbano, que Hiram, rey de Tiro, le envía por mar en balsas hasta Jope, para subirlos a Jerusalén.",
      ref: [14, 2, 16],
      places: ["Tyre", "Joppa", "Jerusalem"],
      go: [{ p: ["Tyre", [34.95, 32.85], [34.65, 32.3], "Joppa"], sea: 1 }, ["Joppa", "Jerusalem"]],
    },
  ],

  divided: [
    {
      date: ["931 BC", "931 a. C."],
      en: "At Shechem the ten northern tribes reject Solomon’s son Rehoboam and make Jeroboam king of Israel. Only Judah and Benjamin stay with the house of David.",
      es: "En Siquem las diez tribus del norte rechazan a Roboam, hijo de Salomón, y hacen rey de Israel a Jeroboam. Solo Judá y Benjamín quedan con la casa de David.",
      ref: [11, 12, 20],
      places: ["Shechem", "Jerusalem"],
      glow: ["israel", "judah"],
    },
    {
      en: "Jeroboam sets up golden calves at Bethel and at Dan, so that Israel will not go up to worship at Jerusalem.",
      es: "Jeroboam pone becerros de oro en Bet-el y en Dan, para que Israel no suba a adorar a Jerusalén.",
      ref: [11, 12, 28, 29],
      places: ["Bethel#a64f355", "Dan", "Jerusalem"],
    },
    {
      en: "King Omri buys the hill of Samaria and builds there a new capital for Israel.",
      es: "El rey Omri compra el monte de Samaria y edifica allí una nueva capital para Israel.",
      ref: [11, 16, 24],
      places: ["Samaria"],
    },
    {
      en: "On Mount Carmel the fire of the Lord answers Elijah, and he runs before Ahab’s chariot all the way to Jezreel.",
      es: "En el monte Carmelo el fuego de Dios responde a Elías, y él corre delante del carro de Acab hasta Jezreel.",
      ref: [11, 18, 46],
      places: ["Mount Carmel", "Jezreel#ae0bf4a"],
      go: [["Mount Carmel", "Jezreel#ae0bf4a"]],
    },
    {
      en: "Ben-hadad king of Syria comes down from Damascus and besieges Samaria, and there is a great famine in the city.",
      es: "Ben-adad, rey de Siria, baja de Damasco y sitia Samaria, y hay gran hambre en la ciudad.",
      ref: [12, 6, 24, 25],
      places: ["Damascus", "Samaria"],
      go: [["Damascus", [35.75, 32.95], "Samaria"]],
    },
    {
      date: ["722 BC", "722 a. C."],
      en: "Assyria takes Samaria after a siege of three years, and carries Israel away. The northern kingdom is no more.",
      es: "Asiria toma Samaria tras un sitio de tres años y lleva cautivo a Israel. El reino del norte deja de existir.",
      ref: [12, 17, 5, 6],
      places: ["Samaria"],
      go: [["Samaria", [35.8, 32.95], "Damascus", [36.9, 33.9]]],
      lands: AFTER_722,
      glow: ["assyria"],
    },
    {
      date: ["701 BC", "701 a. C."],
      en: "Sennacherib of Assyria takes Lachish and the fenced cities of Judah, but Jerusalem is delivered: the angel of the Lord smites his camp.",
      es: "Senaquerib de Asiria toma Laquis y las ciudades fortificadas de Judá, pero Jerusalén es librada: el ángel del Señor hiere su campamento.",
      ref: [12, 19, 35],
      places: ["Lachish", "Jerusalem"],
      go: [[[35.75, 33.0], [35.3, 32.5], [34.95, 31.95], "Lachish"]],
      lands: AFTER_722,
    },
  ],

  exile: [
    {
      date: ["722 BC", "722 a. C."],
      en: "Assyria carries the northern tribes away from Samaria to Halah, to Habor by the river of Gozan, and to the cities of the Medes.",
      es: "Asiria lleva a las tribus del norte desde Samaria a Halah, a Habor junto al río Gozán y a las ciudades de los medos.",
      ref: [12, 17, 6],
      places: ["Samaria", "Gozan", "Halah", "Nineveh"],
      go: [["Samaria", "Damascus", "Hamath", [37.6, 36.6], "Haran", "Gozan"]],
      lands: ["assyria", "egypt"],
    },
    {
      date: ["701 BC", "701 a. C."],
      en: "Sennacherib comes against Judah, but the angel of the Lord smites his camp, and he goes home to Nineveh.",
      es: "Senaquerib viene contra Judá, pero el ángel del Señor hiere su campamento, y él vuelve a Nínive.",
      ref: [12, 19, 36],
      places: ["Lachish", "Jerusalem", "Nineveh"],
      go: [["Lachish", "Damascus", "Hamath", [37.6, 36.6], "Haran", [41.2, 36.6], "Nineveh"]],
      lands: ["assyria", "egypt"],
    },
    {
      date: ["612 BC", "612 a. C."],
      en: "Nineveh, the great city of Assyria, falls to the Babylonians and the Medes, as Nahum had said.",
      es: "Nínive, la gran ciudad de Asiria, cae ante los babilonios y los medos, como había dicho Nahúm.",
      ref: [34, 3, 7],
      places: ["Nineveh", "Babylon", "Ecbatana"],
      go: [["Babylon", [44.2, 34.3], "Nineveh"], ["Ecbatana", [46.3, 35.8], "Nineveh"]],
    },
    {
      date: ["605 BC", "605 a. C."],
      en: "At Carchemish on the Euphrates Nebuchadnezzar defeats Pharaoh Necho, and all that was Egypt’s, from the river of Egypt to the Euphrates, passes to Babylon.",
      es: "En Carquemis, junto al Éufrates, Nabucodonosor derrota a Faraón Necao, y todo lo que era de Egipto, desde el río de Egipto hasta el Éufrates, pasa a Babilonia.",
      ref: [24, 46, 2],
      places: ["Carchemish", "Babylon"],
      go: [[[31.3, 30.1], [33.6, 31.05], [34.7, 32.0], [35.6, 33.4], "Hamath", "Carchemish"], ["Babylon", [42.0, 34.3], [40.3, 35.2], "Carchemish"]],
    },
    {
      date: ["597 BC", "597 a. C."],
      en: "Nebuchadnezzar takes Jerusalem and carries King Jehoiachin to Babylon with ten thousand captives, Ezekiel among them.",
      es: "Nabucodonosor toma Jerusalén y lleva a Babilonia al rey Joaquín con diez mil cautivos, entre ellos Ezequiel.",
      ref: [12, 24, 14],
      places: ["Jerusalem", "Babylon"],
      go: [["Jerusalem", "Damascus", "Hamath", [38.2, 36.2], [40.3, 35.2], [42.6, 33.9], "Babylon"]],
    },
    {
      date: ["586 BC", "586 a. C."],
      en: "Jerusalem rebels and is destroyed. Zedekiah is blinded at Riblah, the temple is burned, and the people are led away to Babylon.",
      es: "Jerusalén se rebela y es destruida. Sedequías es cegado en Ribla, el templo es quemado y el pueblo es llevado a Babilonia.",
      ref: [12, 25, 9],
      places: ["Jerusalem", "Riblah#ab2bde8", "Babylon"],
      go: [{ j: "exile" }],
    },
    {
      en: "By the rivers of Babylon the exiles weep for Zion. Daniel prays toward Jerusalem three times a day, and waits for the seventy years Jeremiah foretold.",
      es: "Junto a los ríos de Babilonia los desterrados lloran por Sion. Daniel ora hacia Jerusalén tres veces al día y espera los setenta años que anunció Jeremías.",
      ref: [27, 9, 2],
      places: ["Babylon", "Jerusalem"],
    },
  ],

  return: [
    {
      date: ["539 BC", "539 a. C."],
      en: "Cyrus the Persian takes Babylon. Belshazzar is slain that night, and the kingdom passes to the Medes and Persians.",
      es: "Ciro el persa toma Babilonia. Esa misma noche muere Belsasar, y el reino pasa a los medos y los persas.",
      ref: [27, 5, 30, 31],
      places: ["Babylon", "Susa"],
      go: [["Susa", [46.3, 32.9], "Babylon"]],
      lands: ["persia"],
    },
    {
      date: ["538 BC", "538 a. C."],
      en: "Cyrus lets the Jews go home. With Zerubbabel nearly fifty thousand go up from Babylon to Jerusalem and Judah.",
      es: "Ciro deja volver a los judíos. Con Zorobabel, casi cincuenta mil suben de Babilonia a Jerusalén y a Judá.",
      ref: [15, 2, 1],
      places: ["Babylon", "Jerusalem"],
      go: [{ j: "return" }],
    },
    {
      date: ["516 BC", "516 a. C."],
      en: "After years of opposition the house of God is finished, in the sixth year of King Darius, and dedicated with joy.",
      es: "Tras años de oposición, la casa de Dios se termina en el sexto año del rey Darío, y se dedica con gozo.",
      ref: [15, 6, 15],
      places: ["Jerusalem"],
      glow: ["yehud"],
    },
    {
      en: "In Shushan the palace, Queen Esther goes in to King Ahasuerus unbidden, and the Jews of his hundred and twenty-seven provinces are saved.",
      es: "En Susán, residencia real, la reina Ester entra sin ser llamada ante el rey Asuero, y los judíos de sus ciento veintisiete provincias son salvados.",
      ref: [17, 4, 16],
      places: ["Susa"],
    },
    {
      date: ["458 BC", "458 a. C."],
      en: "Ezra the scribe goes up from Babylon with the king’s letter, to teach Israel the law of God.",
      es: "Esdras el escriba sube de Babilonia con la carta del rey, para enseñar a Israel la ley de Dios.",
      ref: [15, 7, 6],
      places: ["Babylon", "Jerusalem"],
      go: [{ j: "return" }],
    },
    {
      date: ["445 BC", "445 a. C."],
      en: "Nehemiah, cupbearer at Shushan, comes to Jerusalem and rebuilds its wall in fifty-two days.",
      es: "Nehemías, copero en Susán, llega a Jerusalén y reedifica su muro en cincuenta y dos días.",
      ref: [16, 6, 15],
      places: ["Susa", "Jerusalem"],
      go: [{ j: "nehemiah" }],
    },
  ],

  gospels: [
    {
      en: "Joseph and Mary go up from Nazareth to Bethlehem, the city of David, and there Jesus is born.",
      es: "José y María suben de Nazaret a Belén, la ciudad de David, y allí nace Jesús.",
      ref: [42, 2, 7],
      places: ["Nazareth", "Bethlehem#a112427"],
      go: [{ j: "childhood", from: 0, to: 0 }],
    },
    {
      en: "Warned in a dream, Joseph flees by night into Egypt with the child and his mother, and after Herod’s death settles in Nazareth.",
      es: "Avisado en sueños, José huye de noche a Egipto con el niño y su madre, y tras la muerte de Herodes se establece en Nazaret.",
      ref: [40, 2, 14],
      places: ["Bethlehem#a112427", "Nazareth"],
      go: [{ j: "egypt" }],
    },
    {
      en: "Jesus comes from Nazareth to the Jordan and is baptized of John, and a voice from heaven says, This is my beloved Son.",
      es: "Jesús viene de Nazaret al Jordán y es bautizado por Juan, y una voz del cielo dice: Este es mi Hijo amado.",
      ref: [40, 3, 17],
      places: ["Nazareth", "the Jordan"],
      go: [["Nazareth", [35.56, 32.45], [35.55, 31.95], "the Jordan"]],
    },
    {
      en: "Leaving Nazareth, he makes his home at Capernaum, and preaches in the synagogues throughout all Galilee.",
      es: "Dejando Nazaret, hace su morada en Capernaum, y predica en las sinagogas por toda Galilea.",
      ref: [41, 1, 39],
      places: ["Capernaum", "Cana", "Nain"],
      go: [["Nazareth", "Capernaum"]],
      glow: ["galilee"],
    },
    {
      en: "At Caesarea Philippi, far in the north, Peter confesses him: Thou art the Christ, the Son of the living God.",
      es: "En Cesarea de Filipo, en el extremo norte, Pedro lo confiesa: Tú eres el Cristo, el Hijo del Dios viviente.",
      ref: [40, 16, 16],
      places: ["Caesarea Philippi"],
      go: [["Capernaum", "Caesarea Philippi"]],
    },
    {
      en: "He sets his face to go to Jerusalem, by the Jordan and Jericho, and rides into the city from Bethany and the Mount of Olives.",
      es: "Afirma su rostro para ir a Jerusalén, por el Jordán y Jericó, y entra en la ciudad desde Betania y el monte de los Olivos.",
      ref: [42, 19, 38],
      places: ["Jericho", "Bethany#a4f35bc", "Jerusalem"],
      go: [["Capernaum", [35.58, 32.5], [35.58, 32.0], "Jericho", "Bethany#a4f35bc", "Jerusalem"]],
    },
    {
      en: "He is crucified at Jerusalem and rises the third day. He walks with two disciples to Emmaus, and is carried up into heaven from Bethany.",
      es: "Es crucificado en Jerusalén y resucita al tercer día. Camina con dos discípulos hasta Emaús, y es llevado al cielo desde Betania.",
      ref: [40, 28, 6],
      places: ["Jerusalem", "Emmaus", "Bethany#a4f35bc"],
      go: [["Jerusalem", "Emmaus"]],
    },
  ],

  apostles: [
    {
      en: "At Pentecost the apostles speak with other tongues, and Jews out of every nation under heaven hear in their own language: from Media and Elam, Mesopotamia and Asia, Egypt, Crete, Arabia and Rome.",
      es: "En Pentecostés los apóstoles hablan en otras lenguas, y judíos de todas las naciones oyen cada uno en su propia lengua: de Media y Elam, Mesopotamia y Asia, Egipto, Creta, Arabia y Roma.",
      ref: [44, 2, 9, 11],
      places: ["Jerusalem", "Media", "Elam", "Mesopotamia", "Cappadocia", "Pontus", "Asia", "Phrygia", "Pamphylia", "Egypt", "Libya", "Crete", "Arabia", "Rome"],
    },
    {
      en: "Saul is stopped by a light from heaven on the road to Damascus. Later Barnabas brings him to Antioch, where the disciples are first called Christians.",
      es: "Una luz del cielo detiene a Saulo en el camino de Damasco. Más tarde Bernabé lo trae a Antioquía, donde los discípulos son llamados cristianos por primera vez.",
      ref: [44, 11, 26],
      places: ["Damascus", "Tarsus", "Antioch#ae41ab4"],
      go: [{ j: "saul" }],
    },
    {
      en: "Sent out from Antioch, Paul and Barnabas preach in Cyprus and in the cities of Galatia: the first journey.",
      es: "Enviados desde Antioquía, Pablo y Bernabé predican en Chipre y en las ciudades de Galacia: el primer viaje.",
      ref: [44, 13, 4],
      places: ["Cyprus", "Lystra"],
      go: [{ j: "paul1" }],
    },
    {
      en: "On the second journey a vision at Troas calls Paul over into Macedonia, and the gospel comes to Philippi, Thessalonica, Athens and Corinth.",
      es: "En el segundo viaje, una visión en Troas llama a Pablo a Macedonia, y el evangelio llega a Filipos, Tesalónica, Atenas y Corinto.",
      ref: [44, 16, 9],
      places: ["Troas", "Philippi", "Athens", "Corinth"],
      go: [{ j: "paul2" }],
    },
    {
      en: "On the third, Paul spends three years at Ephesus, warning every one night and day with tears.",
      es: "En el tercero, Pablo pasa tres años en Éfeso, amonestando con lágrimas a cada uno de noche y de día.",
      ref: [44, 20, 31],
      places: ["Ephesus"],
      go: [{ j: "paul3" }],
    },
    {
      en: "Sent to Caesar as a prisoner, Paul is shipwrecked on Malta, and comes at last to Rome.",
      es: "Enviado preso al César, Pablo naufraga en Malta y llega al fin a Roma.",
      ref: [44, 28, 14],
      places: ["Malta", "Rome"],
      go: [{ j: "rome" }],
    },
    {
      en: "For two whole years Paul lives at Rome in his own hired house, preaching the kingdom of God, no man forbidding him.",
      es: "Durante dos años enteros Pablo vive en Roma en una casa alquilada, predicando el reino de Dios sin impedimento.",
      ref: [44, 28, 30, 31],
      places: ["Rome"],
    },
  ],

  churches: [
    {
      en: "John, exiled on Patmos for the word of God, hears on the Lord’s day a great voice, as of a trumpet.",
      es: "Juan, desterrado en Patmos por la palabra de Dios, oye en el día del Señor una gran voz, como de trompeta.",
      ref: [66, 1, 10],
      places: ["Patmos"],
    },
    {
      en: "He is told to write what he sees and send it to the seven churches, which stand on a road that runs round the province of Asia.",
      es: "Se le manda escribir lo que ve y enviarlo a las siete iglesias, que están en un camino que rodea la provincia de Asia.",
      ref: [66, 1, 11],
      places: ["Ephesus", "Smyrna", "Pergamum", "Thyatira", "Sardis", "Philadelphia", "Laodicea"],
      go: [{ p: ["Patmos", [26.9, 37.6], "Ephesus"], sea: 1 }, ["Ephesus", "Smyrna", "Pergamum", "Thyatira", "Sardis", "Philadelphia", "Laodicea"]],
    },
    {
      en: "Ephesus, the great port and chief city of the province, has laboured and not fainted, but has left its first love.",
      es: "Éfeso, el gran puerto y la ciudad principal de la provincia, ha trabajado sin desmayar, pero ha dejado su primer amor.",
      ref: [66, 2, 4],
      places: ["Ephesus"],
    },
    {
      en: "Smyrna, poor and persecuted, is told: Be thou faithful unto death, and I will give thee a crown of life.",
      es: "A Esmirna, pobre y perseguida, se le dice: Sé fiel hasta la muerte, y yo te daré la corona de la vida.",
      ref: [66, 2, 10],
      places: ["Smyrna"],
    },
    {
      en: "Pergamos, where Satan’s seat is, has held fast his name, even where Antipas his faithful martyr was slain.",
      es: "Pérgamo, donde está el trono de Satanás, ha retenido su nombre, aun donde fue muerto Antipas, su testigo fiel.",
      ref: [66, 2, 13],
      places: ["Pergamum"],
    },
    {
      en: "Thyatira, a town of trades and guilds, is praised for its works, charity, service, faith and patience.",
      es: "Tiatira, ciudad de oficios y gremios, es alabada por sus obras, su caridad, su servicio, su fe y su paciencia.",
      ref: [66, 2, 19],
      places: ["Thyatira"],
    },
    {
      en: "Sardis, once the capital of Lydia, has a name that it lives, and is dead: Be watchful.",
      es: "Sardis, antigua capital de Lidia, tiene nombre de que vive, y está muerta: Sé vigilante.",
      ref: [66, 3, 1, 2],
      places: ["Sardis"],
    },
    {
      en: "Philadelphia, which has but a little strength and has kept his word, is told: I have set before thee an open door.",
      es: "A Filadelfia, que tiene poca fuerza y ha guardado su palabra, se le dice: He puesto delante de ti una puerta abierta.",
      ref: [66, 3, 8],
      places: ["Philadelphia"],
    },
    {
      en: "Rich Laodicea, between the hot springs of Hierapolis and the cold water of Colossae, is neither cold nor hot.",
      es: "La rica Laodicea, entre las aguas termales de Hierápolis y el agua fría de Colosas, no es ni fría ni caliente.",
      ref: [66, 3, 15, 16],
      places: ["Laodicea", "Hierapolis", "Colossae"],
    },
  ],
};

/** "book.chapter.verse" of a passage on an era's card → more places to light. */
export const PASSAGE_PLACES = {
  "1.12.1": ["Haran"],
  "1.28.13": ["Bethel#a64f355"],
  "1.46.3": ["Beersheba", "Goshen#a60f092"],
  "2.3.7": ["Mount Horeb"],
  "2.14.21": ["Pi-hahiroth", "Migdol"],
  "2.20.1": ["Mount Sinai"],
  "5.8.2": ["Mount Sinai", "Kadesh-barnea"],
  "6.6.20": ["Jericho"],
  "6.21.43": ["Shiloh"],
  "7.2.16": ["Mount Tabor", "Harod#ae3cace", "Zorah"],
  "8.1.16": ["Moab#aa0b1d6", "Bethlehem#a112427"],
  "9.8.5": ["Ramah#a6d57ed"],
  "10.7.12": ["Jerusalem"],
  "11.6.14": ["Jerusalem"],
  "11.12.16": ["Shechem"],
  "11.18.21": ["Mount Carmel"],
  "30.5.24": ["Bethel#a64f355", "Tekoa"],
  "12.17.6": ["Samaria"],
  "12.25.8": ["Jerusalem", "Babylon"],
  "24.29.10": ["Babylon", "Jerusalem"],
  "27.6.10": ["Babylon"],
  "15.6.14": ["Jerusalem"],
  "16.6.15": ["Jerusalem"],
  "17.4.14": ["Susa"],
  "41.1.14": ["Galilee", "Capernaum"],
  "40.4.23": ["Galilee", "Capernaum"],
  "42.24.5": ["Jerusalem"],
  "44.1.8": ["Jerusalem"],
  "44.2.41": ["Jerusalem"],
  "44.13.2": ["Antioch#ae41ab4"],
  "44.16.9": ["Troas"],
  "44.28.30": ["Rome"],
  "66.2.7": ["Ephesus"],
  "66.3.20": ["Laodicea"],
};

// ---------------------------------------------------------------------------
// The journeys' own maps play too, a stop at a time: the leg to each stop
// drawn on, and the verse that names the stop shown — the verse the chapter's
// own map puts that place at (public/maps/<book>.json). Where the chapter
// tells of a stop without naming it there (Malta is Melita; Capernaum is
// "his own city"), the verse is chosen here, by journey and stop, counting
// from 0 in the order of atlas.json's visits.

export const STOP_VERSES = {
  "exodus#13": [4, 21, 10], // pitched in Oboth
  "exodus#14": [4, 21, 11], // pitched at Ije-abarim
  "exodus#15": [4, 21, 12], // the valley of Zared
  "exodus#17": [4, 21, 16], // from thence they went to Beer
  "david#0": [9, 19, 12], // Michal let David down through a window
  "david#9": [9, 23, 24], // in the wilderness of Maon
  // dwelt in strong holds at En-gedi: the last verse of 1 Samuel 23 in the
  // King James, and the first of 24 in the Reina-Valera
  "david#10": { en: [9, 23, 29], es: [9, 24, 1] },
  "exodus#11": [4, 32, 8], // sent from Kadesh-barnea (Numbers 13 is numbered apart)
  "elijah#0": [11, 17, 1], // Elijah said unto Ahab
  "return#0": [15, 8, 1], // went up with me from Babylon
  "nehemiah#0": [16, 1, 1], // as I was in Shushan the palace
  "jesusMatthew#0": [40, 3, 13], // from Galilee to Jordan
  "jesusMatthew#4": [40, 8, 28], // the country of the Gergesenes
  "jesusMatthew#5": [40, 9, 1], // came into his own city
  "jesusMatthew#7": [40, 14, 13], // departed thence by ship into a desert place
  "jesusMark#3": [41, 5, 1], // the country of the Gadarenes
  "jesusMark#4": [41, 5, 21], // passed over again by ship
  "jesusLuke#0": [42, 3, 23], // about thirty years of age
  "jesusLuke#5": [42, 8, 26], // the country of the Gadarenes
  "jesusLuke#6": [42, 8, 40], // when Jesus was returned
  "jesusJohn#0": [43, 1, 28], // Bethabara beyond Jordan
  "jesusJohn#7": [43, 6, 1], // over the sea of Galilee
  "jesusJohn#10": [43, 10, 40], // beyond Jordan, where John at first baptized
  "paul2#0": [44, 15, 40], // Paul chose Silas, and departed
  "paul2#13": [44, 18, 18], // shorn his head in Cenchrea
  "paul3#0": [44, 18, 23], // went over all the country of Galatia
  "paul3#3": [44, 20, 2], // he came into Greece
  "rome#0": [44, 27, 2], // entering into a ship of Adramyttium
  "rome#2": [44, 27, 5], // we came to Myra, a city of Lycia
  "rome#6": [44, 28, 1], // the island was called Melita

  // And where the first verse to name a stop is not the one that tells it —
  // or is the same verse as the stop before, the second time through a place.
  "abraham#0": [1, 15, 7], // brought thee out of Ur of the Chaldees
  "abraham#10": [1, 21, 33], // planted a grove in Beer-sheba
  "exodus#0": [2, 1, 11], // they built for Pharaoh treasure cities
  "naomi#1": [8, 1, 22], // came to Bethlehem in the beginning of barley harvest
  "elijah2#4": [12, 2, 18], // he tarried at Jericho
  "elijah2#5": [12, 2, 23], // he went up from thence unto Beth-el
  "exile#2": [12, 25, 7], // carried him to Babylon
  "return#1": [15, 8, 32], // we came to Jerusalem
  "childhood#1": [42, 2, 7], // she brought forth her firstborn son
  "childhood#3": [42, 2, 39], // returned into Galilee, to their own city Nazareth
  "childhood#4": [42, 2, 42], // they went up to Jerusalem after the custom
  "childhood#5": [42, 2, 51], // he went down with them, and came to Nazareth
  "jesusMark#17": [41, 11, 11], // Jesus entered into Jerusalem
  "jesusMark#18": [41, 14, 3], // being in Bethany in the house of Simon
  "jesusLuke#3": [42, 4, 31], // came down to Capernaum
  "jesusLuke#11": [42, 19, 41], // he beheld the city, and wept over it
  "jesusLuke#13": [42, 24, 33], // returned to Jerusalem
  "jesusJohn#14": [43, 12, 12], // Jesus was coming to Jerusalem
  "philip#1": [44, 8, 5], // went down to the city of Samaria
  "saul#1": [44, 9, 8], // brought him into Damascus
  "saul#2": [44, 9, 26], // when Saul was come to Jerusalem
  "saul#4": [44, 11, 25], // Barnabas to Tarsus, for to seek Saul
  "saul#5": [44, 11, 26], // called Christians first in Antioch
  "paul1#8": [44, 14, 20], // he departed with Barnabas to Derbe
  "paul1#9": [44, 14, 21], // they returned again to Lystra
  "paul1#10": [44, 14, 22], // confirming the souls of the disciples
  "paul1#11": [44, 14, 23], // ordained them elders in every church
  "paul3#2": [44, 20, 1], // departed for to go into Macedonia
  "paul3#17": [44, 21, 17], // when we were come to Jerusalem
  "rome#12": [44, 28, 16], // when we came to Rome
};

/**
 * "book.chapter.verse" of a passage on a journey's card → places on that
 * journey's map to light, where the verse names none of them itself.
 */
export const JOURNEY_PASSAGE_PLACES = {
  "58.11.8": ["Ur", "Haran"],
  "1.47.27": ["Goshen#a60f092"],
  "4.14.33": ["Kadesh-barnea"],
  "8.4.17": ["Bethlehem#a112427"],
  "24.29.5": ["Babylon"],
  "15.3.11": ["Jerusalem"],
  "15.7.9": ["Babylon", "Jerusalem"],
  "16.1.3": ["Jerusalem"],
  "16.4.17": ["Jerusalem"],
  "16.6.15": ["Jerusalem"],
  "44.15.36": ["Antioch#ae41ab4"],
};
