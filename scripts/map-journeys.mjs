// The journeys drawn on the chapter maps, for scripts/build-maps.mjs.
//
// A journey is where it starts and then its steps, each to a stop: the place
// as OpenBible.info names it ("Antioch 1" is Syria's, "Antioch 2" Pisidia's —
// the numbers are the dataset's own), the chapter that tells of arriving
// there, and whether it was by sea. `via` bends a step through places the
// text implies but does not stop at, or through open water, so that a voyage
// keeps to the sea and an overland road does not cross a desert it went
// round: OpenBible names, or [longitude, latitude] for a point at sea. Those
// are drawn as part of the line and never numbered.
//
// A chapter that tells of a step shows the journey: its own steps bold,
// the ones before faded, the rest not yet. `whole` chapters retell the
// journey (Numbers 33 lists every camp) and show all of it as their own.
//
// The lines are approximate, and say so on the map: the stops are the
// dataset's best identifications, and where a road ran between them is
// largely unknown. The exodus is drawn by the traditional route, with Sinai
// at Jebel Musa, which the place cards mark as one possibility among several.
//
// Jesus' journeys are drawn a Gospel at a time, each as its own Gospel tells
// them, rather than harmonised into one: Matthew, Mark, Luke and John do not
// order the journeys alike, and a map of Mark 7 should be Mark's. Where the
// boat comes ashore among the Gadarenes or the Gerasenes, the stop is Kursi on
// the eastern shore, the traditional site: the dataset puts the Gerasenes at
// Jerash, fifty kilometres inland, which is the region's city and not where a
// herd ran down a steep place into the lake.


/** From Judah's hills round the north of the Dead Sea and up into Moab. */
const TO_MOAB = [[35.43, 31.85], [35.6, 31.8], "Medeba"];
/** Down the Jordan valley on its east side, through Perea, to the fords at Jericho. */
const PEREA = [[35.6, 32.65], [35.6, 32.2], [35.56, 31.95]];
/** The coast road between Egypt and Gaza, across the north of Sinai. */
const SINAI_COAST = [[32.6, 30.95], [33.8, 31.1], "Gaza"];

export const JOURNEYS = [
  {
    id: "abraham",
    start: "Ur 1",
    steps: [
      // up the Euphrates, round the edge of the desert rather than across it
      { to: "Haran", at: [1, 11], via: [[45.2, 31.9], [44.3, 32.8], [42.4, 34.2], [40.89, 34.55], [39.1, 35.9]] },
      { to: "Shechem", at: [1, 12], via: ["Carchemish", "Hamath 1", "Damascus"] },
      { to: "Bethel 1", at: [1, 12] },
      { to: "Negeb", at: [1, 12] },
      { to: "Egypt", at: [1, 12], via: ["Shur"] },
      { to: "Negeb", at: [1, 13], via: ["Shur"] },
      { to: "Bethel 1", at: [1, 13] },
      { to: "Hebron", at: [1, 13] },
      { to: "Gerar", at: [1, 20] },
      { to: "Beersheba 2", at: [1, 21] },
      { to: "Moriah", at: [1, 22] },
      { to: "Beersheba 2", at: [1, 22] },
    ],
  },
  {
    id: "jacob",
    start: "Beersheba 2",
    steps: [
      { to: "Bethel 1", at: [1, 28] },
      { to: "Haran", at: [1, 29], via: ["Damascus", "Hamath 1", "Carchemish"] },
      { to: "Gilead 1", at: [1, 31], via: ["Carchemish", "Hamath 1", "Damascus"] },
      { to: "Mahanaim", at: [1, 32] },
      { to: "Penuel", at: [1, 32] },
      { to: "Succoth 1", at: [1, 33] },
      { to: "Shechem", at: [1, 33] },
      { to: "Bethel 1", at: [1, 35] },
      { to: "Ephrath", at: [1, 35] },
      { to: "Mamre", at: [1, 35] },
      { to: "Beersheba 2", at: [1, 46] },
      { to: "Goshen 1", at: [1, 46], via: ["Shur"] },
    ],
  },
  {
    id: "exodus",
    start: "Rameses",
    steps: [
      { to: "Succoth 2", at: [2, 12] },
      { to: "Etham", at: [2, 13] },
      { to: "Pi-hahiroth", at: [2, 14] },
      // through the sea, on foot
      { to: "Marah", at: [2, 15] },
      { to: "Elim", at: [2, 15] },
      { to: "Sin", at: [2, 16] },
      // Dophkah and Alush, the camps Numbers 33 adds between
      { to: "Rephidim", at: [2, 17], via: ["Dophkah", "Alush"] },
      { to: "Mount Sinai", at: [2, 19] },
      { to: "Kibroth-hattaavah", at: [4, 11] },
      { to: "Hazeroth", at: [4, 11] },
      { to: "Kadesh-barnea", at: [4, 13], via: ["Paran"] },
      { to: "Mount Hor 1", at: [4, 20] },
      // "by the way of the Red Sea, to compass the land of Edom"
      { to: "Oboth", at: [4, 21], via: ["Elath"] },
      { to: "Iye-abarim", at: [4, 21] },
      { to: "Zered", at: [4, 21] },
      { to: "Arnon", at: [4, 21] },
      { to: "Beer 1", at: [4, 21] },
      { to: "Pisgah", at: [4, 21] },
      { to: "Moab 2", at: [4, 22] },
      { to: "Mount Nebo", at: [5, 34] },
    ],
    whole: [[4, 33]],
  },
  {
    id: "naomi",
    start: "Moab 1",
    steps: [
      // "they two went until they came to Bethlehem"
      { to: "Bethlehem 1", at: [8, 1], via: [...TO_MOAB].reverse() },
    ],
  },
  {
    id: "david",
    start: "Gibeah 1",
    steps: [
      { to: "Naioth", at: [9, 19] },
      { to: "Nob", at: [9, 21] },
      { to: "Gath 1", at: [9, 21] },
      { to: "Adullam", at: [9, 22] },
      // round the south of the Dead Sea to Mizpeh of Moab, and back
      { to: "Mizpeh 3", at: [9, 22], via: [[35.25, 31.25], [35.47, 31.0]] },
      { to: "Hereth", at: [9, 22], via: [[35.47, 31.0], [35.25, 31.25]] },
      { to: "Keilah", at: [9, 23] },
      { to: "Ziph 1", at: [9, 23] },
      { to: "Maon", at: [9, 23] },
      { to: "Engedi", at: [9, 23] },
      { to: "Carmel 1", at: [9, 25] },
      { to: "Hachilah", at: [9, 26] },
      { to: "Gath 1", at: [9, 27] },
      { to: "Ziklag", at: [9, 27] },
    ],
  },
  {
    id: "elijah",
    // before Ahab, in Samaria: his own Tishbe is barely located
    start: "Samaria 1",
    steps: [
      { to: "Cherith", at: [11, 17] },
      { to: "Zarephath", at: [11, 17] },
      { to: "Mount Carmel", at: [11, 18] },
      // he ran before Ahab's chariot to Jezreel
      { to: "Jezreel 2", at: [11, 18] },
      { to: "Beersheba 1", at: [11, 19] },
      // forty days and forty nights unto Horeb
      { to: "Mount Horeb", at: [11, 19] },
      // Elisha, found at Abel-meholah
      { to: "Abel-meholah", at: [11, 19] },
    ],
  },
  {
    id: "elijah2",
    start: "Gilgal 2",
    steps: [
      { to: "Bethel 1", at: [12, 2] },
      { to: "Jericho 1", at: [12, 2] },
      // over Jordan on dry ground, and the chariot of fire
      { to: "Jordan", at: [12, 2] },
      // Elisha, alone, the way they came, and on
      { to: "Jericho 1", at: [12, 2] },
      { to: "Bethel 1", at: [12, 2] },
      { to: "Mount Carmel", at: [12, 2] },
      { to: "Samaria 1", at: [12, 2] },
    ],
  },
  {
    id: "exile",
    start: "Jerusalem",
    steps: [
      { to: "Riblah 1", at: [12, 25] },
      // north to the Euphrates and down it: the way armies and exiles went
      {
        to: "Babylon 1",
        at: [12, 25],
        via: ["Hamath 1", [37.16, 36.2], "Carchemish", [39.1, 35.9], [40.89, 34.55], [42.4, 34.2], [44.0, 33.0]],
      },
    ],
    whole: [
      [12, 24],
      [14, 36],
      [24, 39],
      [24, 52],
    ],
  },
  {
    id: "return",
    start: "Babylon 1",
    steps: [
      {
        to: "Jerusalem",
        at: [15, 8],
        via: [[44.0, 33.0], [42.4, 34.2], [40.89, 34.55], [39.1, 35.9], [37.16, 36.2], "Hamath 1", "Damascus"],
      },
    ],
    whole: [
      [15, 1],
      [15, 2],
      [15, 7],
    ],
  },
  {
    id: "nehemiah",
    start: "Susa",
    steps: [
      {
        to: "Jerusalem",
        at: [16, 2],
        via: ["Babylon 1", [44.0, 33.0], [42.4, 34.2], [40.89, 34.55], [39.1, 35.9], [37.16, 36.2], "Hamath 1", "Damascus"],
      },
    ],
  },
  {
    id: "egypt",
    start: "Bethlehem 1",
    steps: [
      { to: "Egypt", at: [40, 2], via: ["Gaza", ...[...SINAI_COAST].reverse().slice(1)] },
      // "he turned aside into the parts of Galilee"
      { to: "Nazareth", at: [40, 2], via: [...SINAI_COAST, [34.75, 32.1]] },
    ],
  },
  {
    id: "childhood",
    start: "Nazareth",
    steps: [
      { to: "Bethlehem 1", at: [42, 2] },
      { to: "Jerusalem", at: [42, 2] },
      { to: "Nazareth", at: [42, 2] },
      // at twelve, to the feast
      { to: "Jerusalem", at: [42, 2] },
      { to: "Nazareth", at: [42, 2] },
    ],
  },
  {
    id: "jesusMatthew",
    start: "Nazareth",
    steps: [
      { to: "Jordan", at: [40, 3] },
      // "leaving Nazareth, he came and dwelt in Capernaum"
      { to: "Nazareth", at: [40, 4] },
      { to: "Capernaum", at: [40, 4] },
      { to: "Gergesa", at: [40, 8], sea: true },
      { to: "Capernaum", at: [40, 9], sea: true },
      { to: "Nazareth", at: [40, 13] },
      { to: "Bethsaida 2", at: [40, 14] },
      { to: "Gennesaret", at: [40, 14], sea: true },
      { to: "Tyre", at: [40, 15] },
      { to: "Magadan", at: [40, 15], via: [[35.62, 32.95]] },
      { to: "Caesarea Philippi", at: [40, 16] },
      { to: "Capernaum", at: [40, 17] },
      // "into the coasts of Judaea beyond Jordan"
      { to: "Jericho 2", at: [40, 20], via: PEREA },
      { to: "Bethphage", at: [40, 21] },
      { to: "Jerusalem", at: [40, 21] },
      { to: "Bethany 1", at: [40, 21] },
    ],
  },
  {
    id: "jesusMark",
    start: "Nazareth",
    steps: [
      { to: "Jordan", at: [41, 1] },
      { to: "Capernaum", at: [41, 1] },
      { to: "Gergesa", at: [41, 5], sea: true },
      { to: "Capernaum", at: [41, 5], sea: true },
      { to: "Nazareth", at: [41, 6] },
      { to: "Bethsaida 2", at: [41, 6] },
      { to: "Gennesaret", at: [41, 6], sea: true },
      { to: "Tyre", at: [41, 7] },
      // "through Sidon, unto the sea of Galilee, through the midst of the coasts of Decapolis"
      { to: "Sidon", at: [41, 7] },
      { to: "Decapolis", at: [41, 7], via: [[35.65, 33.2]] },
      { to: "Dalmanutha", at: [41, 8], sea: true },
      { to: "Bethsaida 2", at: [41, 8], sea: true },
      { to: "Caesarea Philippi", at: [41, 8] },
      { to: "Capernaum", at: [41, 9] },
      { to: "Jericho 2", at: [41, 10], via: PEREA },
      { to: "Bethphage", at: [41, 11] },
      { to: "Jerusalem", at: [41, 11] },
      { to: "Bethany 1", at: [41, 11] },
    ],
  },
  {
    id: "jesusLuke",
    start: "Nazareth",
    steps: [
      { to: "Jordan", at: [42, 3] },
      { to: "Nazareth", at: [42, 4] },
      { to: "Capernaum", at: [42, 4] },
      { to: "Nain", at: [42, 7] },
      { to: "Gergesa", at: [42, 8], sea: true },
      { to: "Capernaum", at: [42, 8], sea: true },
      { to: "Bethsaida 2", at: [42, 9] },
      // "through the midst of Samaria and Galilee"
      { to: "Samaria 2", at: [42, 17] },
      { to: "Jericho 2", at: [42, 18] },
      { to: "Bethphage", at: [42, 19] },
      { to: "Jerusalem", at: [42, 19] },
      { to: "Emmaus", at: [42, 24] },
      { to: "Jerusalem", at: [42, 24] },
      { to: "Bethany 1", at: [42, 24] },
    ],
  },
  {
    id: "jesusJohn",
    // "Bethabara beyond Jordan, where John was baptizing"
    start: "Bethany 2",
    steps: [
      { to: "Cana", at: [43, 2] },
      { to: "Capernaum", at: [43, 2] },
      { to: "Jerusalem", at: [43, 2] },
      { to: "Sychar", at: [43, 4] },
      { to: "Cana", at: [43, 4] },
      { to: "Jerusalem", at: [43, 5] },
      { to: "Bethsaida 2", at: [43, 6] },
      { to: "Capernaum", at: [43, 6], sea: true },
      { to: "Jerusalem", at: [43, 7] },
      { to: "Bethany 2", at: [43, 10] },
      { to: "Bethany 1", at: [43, 11] },
      { to: "Ephraim 2", at: [43, 11] },
      { to: "Bethany 1", at: [43, 12] },
      { to: "Jerusalem", at: [43, 12] },
    ],
  },
  {
    id: "philip",
    start: "Jerusalem",
    steps: [
      { to: "Samaria 1", at: [44, 8] },
      // "the way that goeth down from Jerusalem unto Gaza", and found at Azotus
      { to: "Ashdod", at: [44, 8], via: [[35.1, 31.75], [34.85, 31.6]] },
      { to: "Caesarea", at: [44, 8] },
    ],
  },
  {
    id: "saul",
    start: "Jerusalem",
    steps: [
      { to: "Damascus", at: [44, 9] },
      { to: "Jerusalem", at: [44, 9] },
      { to: "Caesarea", at: [44, 9] },
      { to: "Tarsus", at: [44, 9], sea: true, via: [[34.75, 33.3], [35.2, 34.6], [35.6, 35.9], [35.0, 36.6]] },
      // Barnabas "brought him unto Antioch"
      { to: "Antioch 1", at: [44, 11], via: [[36.15, 36.85]] },
    ],
  },
  {
    id: "paul1",
    start: "Antioch 1",
    steps: [
      { to: "Seleucia", at: [44, 13] },
      { to: "Salamis", at: [44, 13], sea: true },
      { to: "Paphos", at: [44, 13] },
      { to: "Perga", at: [44, 13], sea: true },
      { to: "Antioch 2", at: [44, 13] },
      { to: "Iconium", at: [44, 13] },
      { to: "Lystra", at: [44, 14] },
      { to: "Derbe", at: [44, 14] },
      { to: "Lystra", at: [44, 14] },
      { to: "Iconium", at: [44, 14] },
      { to: "Antioch 2", at: [44, 14] },
      { to: "Perga", at: [44, 14] },
      { to: "Attalia", at: [44, 14] },
      { to: "Antioch 1", at: [44, 14], sea: true, via: [[32.6, 36.0], [35.3, 36.3]] },
    ],
  },
  {
    id: "paul2",
    start: "Antioch 1",
    steps: [
      // "through Syria and Cilicia", and over the Taurus
      { to: "Derbe", at: [44, 16], via: ["Tarsus", [34.75, 37.3]] },
      { to: "Lystra", at: [44, 16] },
      // through Phrygia and Galatia, past Mysia, down to Troas
      { to: "Troas", at: [44, 16], via: ["Phrygia", "Mysia"] },
      { to: "Samothrace", at: [44, 16], sea: true },
      { to: "Neapolis", at: [44, 16], sea: true },
      { to: "Philippi", at: [44, 16] },
      { to: "Amphipolis", at: [44, 17] },
      { to: "Apollonia", at: [44, 17] },
      { to: "Thessalonica", at: [44, 17] },
      { to: "Berea", at: [44, 17] },
      // "to go as it were to the sea": round Euboea to Athens
      { to: "Athens", at: [44, 17], sea: true, via: [[22.65, 40.35], [23.5, 39.6], [24.2, 38.9], [24.4, 38.1], [24.05, 37.6]] },
      { to: "Corinth", at: [44, 18] },
      { to: "Cenchreae", at: [44, 18] },
      { to: "Ephesus", at: [44, 18], sea: true, via: [[24.4, 37.55], [26.0, 37.8]] },
      { to: "Caesarea", at: [44, 18], sea: true, via: [[27.0, 37.5], [27.4, 36.75], [28.3, 36.2]] },
      { to: "Antioch 1", at: [44, 18], via: ["Tyre", "Sidon"] },
    ],
  },
  {
    id: "paul3",
    start: "Antioch 1",
    steps: [
      // "the country of Galatia and Phrygia in order", and the upper coasts
      { to: "Ephesus", at: [44, 19], via: [[34.75, 37.3], "Galatia", "Phrygia"] },
      { to: "Philippi", at: [44, 20], via: ["Troas", "Neapolis"] },
      // "Greece": Corinth, where he wintered
      { to: "Corinth", at: [44, 20], via: ["Thessalonica", [22.4, 39.3]] },
      { to: "Philippi", at: [44, 20], via: [[22.4, 39.3], "Thessalonica"] },
      { to: "Troas", at: [44, 20], sea: true, via: ["Neapolis"] },
      { to: "Assos", at: [44, 20] },
      { to: "Mitylene", at: [44, 20], sea: true },
      { to: "Chios", at: [44, 20], sea: true },
      { to: "Samos", at: [44, 20], sea: true },
      { to: "Miletus", at: [44, 20], sea: true },
      { to: "Cos", at: [44, 21], sea: true },
      { to: "Rhodes 1", at: [44, 21], sea: true },
      { to: "Patara", at: [44, 21], sea: true },
      // "we left Cyprus on the left hand"
      { to: "Tyre", at: [44, 21], sea: true },
      { to: "Ptolemais", at: [44, 21], sea: true },
      { to: "Caesarea", at: [44, 21] },
      { to: "Jerusalem", at: [44, 21] },
    ],
  },
  {
    id: "rome",
    start: "Caesarea",
    steps: [
      { to: "Sidon", at: [44, 27], sea: true },
      // "under Cyprus", then across the sea of Cilicia and Pamphylia
      { to: "Myra", at: [44, 27], sea: true, via: [[34.75, 35.75], [33.0, 36.15], [31.0, 36.3]] },
      { to: "Cnidus", at: [44, 27], sea: true, via: [[28.4, 36.4]] },
      // "under Crete, over against Salmone"
      { to: "Fair Havens", at: [44, 27], sea: true, via: [[26.5, 35.4], "Salmone", [25.6, 34.85]] },
      { to: "Cauda", at: [44, 27], sea: true },
      // driven fourteen days across Adria, and wrecked
      { to: "Malta", at: [44, 27], sea: true },
      { to: "Syracuse", at: [44, 28], sea: true },
      { to: "Rhegium", at: [44, 28], sea: true },
      { to: "Puteoli", at: [44, 28], sea: true, via: [[15.55, 38.6], [14.9, 39.6]] },
      { to: "Forum of Appius", at: [44, 28] },
      { to: "Three Taverns", at: [44, 28] },
      { to: "Rome", at: [44, 28] },
    ],
  },
];
