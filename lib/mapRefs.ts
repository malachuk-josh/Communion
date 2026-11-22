// The passages each map on the Maps tab opens with (components/AtlasMap):
// for each of the ten ages the maps are drawn for, those that say what that
// age was; for each of the journeys, those that tell it. The words about each
// are in lib/i18n.tsx, under map.eraAbout.<era> and map.journeyAbout.<id>.
//
// The eras are public/maps/eras.json and the journeys public/maps/atlas.json;
// the order here is theirs. Every reference is numbered alike in the King
// James and the Reina-Valera (1 Samuel 24 is not, so David's is from 26).

/** A passage: book number, chapter, first verse and, for a range, the last. */
export type MapRef = [book: number, chapter: number, verse: number, last?: number];

export const ERA_REFS: Record<string, MapRef[]> = {
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

export const JOURNEY_REFS: Record<string, MapRef[]> = {
  // Ur to Haran; on into Canaan; Mamre; Moriah; by faith
  abraham: [[1, 11, 31], [1, 12, 4, 5], [1, 13, 18], [1, 22, 2], [58, 11, 8]],
  // Bethel's ladder; seven years for Rachel; Israel; Ephrath; Goshen
  jacob: [[1, 28, 10, 12], [1, 29, 20], [1, 32, 28], [1, 35, 19], [1, 47, 27]],
  // Rameses to Succoth; the pillar; manna; forty years; the land seen
  exodus: [[2, 12, 37], [2, 13, 21], [2, 16, 35], [4, 14, 33], [5, 34, 4]],
  // to Moab; bread again; whither thou goest; barley harvest; Obed
  naomi: [[8, 1, 1], [8, 1, 6], [8, 1, 16], [8, 1, 22], [8, 4, 17]],
  // to Samuel; Adullam; the wilderness of Ziph; the Lord's anointed; Ziklag
  david: [[9, 19, 18], [9, 22, 1, 2], [9, 23, 14], [9, 26, 9], [9, 27, 6]],
  // no rain; the ravens; the fire on Carmel; the still small voice; Elisha
  elijah: [[11, 17, 1], [11, 17, 6], [11, 18, 38, 39], [11, 19, 11, 12], [11, 19, 19]],
  // from Gilgal; the Jordan parted; the chariot; the mantle; home to Samaria
  elijah2: [[12, 2, 1, 2], [12, 2, 8], [12, 2, 11], [12, 2, 13, 14], [12, 2, 25]],
  // Riblah; carried away; the city solitary; build houses
  exile: [[12, 25, 6, 7], [12, 25, 21], [25, 1, 1], [24, 29, 5, 7]],
  // the foundation laid; Ezra goes up; the fast at Ahava; Jerusalem; like them that dream
  return: [[15, 3, 11, 12], [15, 7, 9, 10], [15, 8, 21], [15, 8, 31, 32], [19, 126, 1]],
  // the wall broken down; send me; let us build; a hand on a weapon; finished
  nehemiah: [[16, 1, 3, 4], [16, 2, 5], [16, 2, 17, 18], [16, 4, 17], [16, 6, 15, 16]],
  // flee into Egypt; by night; out of Egypt; Nazareth
  egypt: [[40, 2, 13], [40, 2, 14, 15], [28, 11, 1], [40, 2, 22, 23]],
  // presented; home to Nazareth; twelve years old; among the doctors; increased
  childhood: [[42, 2, 22], [42, 2, 39], [42, 2, 41, 42], [42, 2, 46, 47], [42, 2, 52]],
  // to Jordan; Capernaum; Thou art the Christ; Hosanna; Bethany
  jesusMatthew: [[40, 3, 13], [40, 4, 13], [40, 16, 15, 16], [40, 21, 9], [40, 21, 17]],
  // from Nazareth; by Decapolis; Caesarea Philippi; Bartimaeus; the Mount of Olives
  jesusMark: [[41, 1, 9], [41, 7, 31], [41, 8, 27], [41, 10, 46], [41, 11, 1]],
  // Nazareth; the widow's son; his face set; Emmaus; Bethany
  jesusLuke: [[42, 4, 16], [42, 7, 14, 15], [42, 9, 51], [42, 24, 30, 31], [42, 24, 50, 51]],
  // Cana; the passover; Jacob's well; Lazarus; six days before
  jesusJohn: [[43, 2, 11], [43, 2, 13], [43, 4, 5, 6], [43, 11, 43, 44], [43, 12, 1]],
  // Samaria; the road to Gaza; preached Jesus; Azotus; Caesarea
  philip: [[44, 8, 4, 5], [44, 8, 26], [44, 8, 35], [44, 8, 40], [44, 21, 8]],
  // the light; straightway preached; the basket; Tarsus; Christians
  saul: [[44, 9, 3, 4], [44, 9, 20], [44, 9, 25], [44, 9, 30], [44, 11, 25, 26]],
  // to Cyprus; to the Gentiles; stoned; confirming; the door of faith
  paul1: [[44, 13, 4], [44, 13, 46], [44, 14, 19], [44, 14, 21, 22], [44, 14, 27]],
  // go again; Lydia; midnight; the unknown god; much people in this city
  paul2: [[44, 15, 36], [44, 16, 14], [44, 16, 25, 26], [44, 17, 22, 23], [44, 18, 9, 11]],
  // all Asia heard; Troas; my course; more blessed; ready to die
  paul3: [[44, 19, 10], [44, 20, 7], [44, 20, 24], [44, 20, 35], [44, 21, 13]],
  // to Italy; fear not; safe to land; the viper; took courage
  rome: [[44, 27, 1], [44, 27, 23, 24], [44, 27, 44], [44, 28, 3, 5], [44, 28, 15]],
};
