// Communion's icons are drawn, not typed. Emoji are colour bitmaps the
// browser paints from the system font — they cannot be tinted, so they always
// arrived in somebody else's palette, looking like a text message dropped into
// the page. These are line drawings on a 24-grid that stroke in currentColor,
// so an icon is gold on a heading, dim on an inactive tab, and brown in light
// mode, without ever being told which.

export type IconName = keyof typeof PATHS;

/** A full circle as a path — two half arcs, so it strokes like everything else. */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

/** Every icon: a list of <path d="..."> strings, drawn on a 24x24 grid. */
const PATHS = {
  // ---- reading ----
  book: [
    "M12 7C10.2 5.6 8 5 5.5 5c-.9 0-1.7.1-2.5.2v13c.8-.1 1.6-.2 2.5-.2 2.5 0 4.7.6 6.5 2",
    "M12 7c1.8-1.4 4-2 6.5-2 .9 0 1.7.1 2.5.2v13c-.8-.1-1.6-.2-2.5-.2-2.5 0-4.7.6-6.5 2",
    "M12 7v13",
  ],
  books: [
    "M4 4h4v16H4z",
    "M10 4h4v16h-4z",
    "M16.2 4.6l3.6.9-3.7 15-3.6-1",
  ],
  scroll: [
    "M8 4h9.5a1.5 1.5 0 0 1 1.5 1.5V18a3 3 0 0 1-3 3H7",
    "M8 4a2 2 0 0 0-2 2v1.5h2.8",
    "M7 21a3 3 0 0 0 3-3v-1.5H6.6",
    "M11.5 9h4.5M11.5 12.5h4.5"
  ],
  news: ["M3 5h14v15H3z", "M17 9h4v9a2 2 0 0 1-4 0z", "M6 9h8M6 13h8M6 17h5"],
  letters: [
    "M3 18l4-10 4 10",
    "M4.4 14.8h5.2",
    "M20.5 11.5v6.5",
    "M20.5 14.5a3 3 0 1 0 0 3.2"
  ],

  // ---- faith ----
  church: [
    "M12 2v5M10 4h4",
    "M4 12l8-5 8 5",
    "M6 12v9h12v-9",
    "M10 21v-4a2 2 0 0 1 4 0v4",
  ],
  cross: ["M12 3v18", "M6.5 8.5h11"],
  prayer: [
    "M9.7 21.2c-1.7 0-3-1.3-3-3.1 0-3.2 1.1-6.1 2-9 .4-1.3.8-2.4 1.5-2.4.6 0 1 .9 1.2 2.1",
    "M14.3 21.2c1.7 0 3-1.3 3-3.1 0-3.2-1.1-6.1-2-9-.4-1.3-.8-2.4-1.5-2.4-.6 0-1 .9-1.2 2.1",
    "M12 8.4v12.8",
    "M8.3 17.8h7.4"
  ],
  dove: [
    "M3.5 20l2.2-3.2C10 16.5 13.6 14 15.7 10.4 16.9 8.3 17.6 6 20.5 4c0 3-.4 4.6-1.3 6.6-2.2 4.9-6.6 8-11.4 8.2z",
    "M8.5 13.6c2 1.1 4.2 1.2 6.2.3",
  ],
  candle: [
    "M12 3.2c1.4 1.9 2 3 2 4a2 2 0 0 1-4 0c0-1 .6-2.1 2-4z",
    "M9.5 10.5h5V21h-5z",
    "M9.5 14h5",
  ],
  bread: [
    "M4 13.5C4 10.4 7.6 8 12 8s8 2.4 8 5.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
    "M8.5 11.5l-1.5 3M12 11.5l-1.5 3M15.5 11.5L14 14.5",
  ],
  grapes: [
    "M12 3.2v3.4",
    "M12.6 4.2c1.6-.6 3 0 3.7 1.2",
    circle(9.4, 9.4, 2.1),
    circle(14.6, 9.4, 2.1),
    circle(12, 13.2, 2.1),
    circle(8.2, 16.4, 2.1),
    circle(15.8, 16.4, 2.1),
    circle(12, 19.6, 2.1)
  ],
  wheat: [
    "M12 21V8.5",
    "M12 12.5c-2.6 0-4.2-1.7-4.2-4.2 2.6 0 4.2 1.7 4.2 4.2z",
    "M12 12.5c2.6 0 4.2-1.7 4.2-4.2-2.6 0-4.2 1.7-4.2 4.2z",
    "M12 17.5c-2.6 0-4.2-1.7-4.2-4.2 2.6 0 4.2 1.7 4.2 4.2z",
    "M12 17.5c2.6 0 4.2-1.7 4.2-4.2-2.6 0-4.2 1.7-4.2 4.2z",
    "M12 8.5c-1.4-1.4-1.8-2.8-1.8-4.5 1.4 1.1 1.8 2.4 1.8 4.5z"
  ],
  fish: [
    "M6 12c2.6-3.7 6-5.6 9-5.6s5.8 1.9 7.5 5.6c-1.7 3.7-4.5 5.6-7.5 5.6S8.6 15.7 6 12z",
    "M6 12L2.2 8.2v7.6z",
    circle(16.4, 10.4, 0.85)
  ],
  sheep: [
    "M7.5 16.5a3.2 3.2 0 0 1 .4-6.3 3.2 3.2 0 0 1 5.2-2.1 3.3 3.3 0 0 1 4.9 1.6 3.2 3.2 0 0 1-.5 6.8z",
    "M9 16.5v3.8M15 16.5v3.8",
    circle(19.4, 9.6, 2.2),
    "M18.4 8.2l-1.2-1.4M20.6 8.2l1.2-1.4"
  ],
  crown: ["M4 18h16", "M4 18l-1.2-9.5L8 12l4-7 4 7 5.2-3.5L20 18"],
  anchor: [
    "M12 8.5V21",
    "M12 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M8.5 11h7",
    "M3.5 15c0 3.3 3.8 6 8.5 6s8.5-2.7 8.5-6",
  ],

  // ---- the reader ----
  bookmark: ["M7 3.5h10a1 1 0 0 1 1 1V21l-6-4.2L6 21V4.5a1 1 0 0 1 1-1z"],
  collection: [
    "M5 6.5h6l1.5 2H19a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1z",
  ],
  note: ["M4 20h4L18.2 9.8a2.7 2.7 0 0 0-3.8-3.8L4 16.2z", "M13.6 6.8l3.6 3.6"],
  link: [
    "M10.2 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M13.8 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M16.2 16.2L21 21"],
  sparkle: ["M12 3l1.9 5.4 5.4 1.9-5.4 1.9L12 18l-1.9-5.8-5.4-1.9 5.4-1.9z"],
  jar: [
    "M9 3.2h6",
    "M9.8 3.2C7.4 5.1 6 7.9 6 11.4 6 16 8.7 20.5 12 20.5s6-4.5 6-9.1c0-3.5-1.4-6.3-3.8-8.2",
    "M6.3 9c-1.6.2-2.6 1.2-2.6 2.4s1 2.2 2.6 2.4",
    "M17.7 9c1.6.2 2.6 1.2 2.6 2.4s-1 2.2-2.6 2.4"
  ],
  quote: ["M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-5 4V6a1 1 0 0 1 1-1z"],

  // ---- gatherings and people ----
  people: [
    "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11z",
    "M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6",
    "M16 5.2a3.2 3.2 0 0 1 0 6",
    "M17.5 14.8c2.4.6 4 2.4 4 5.2",
  ],
  person: [
    "M12 11.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z",
    "M4.5 20.5c0-3.9 3.4-6.4 7.5-6.4s7.5 2.5 7.5 6.4",
  ],
  handshake: [
    "M2.5 11.5l4-2.5 5.5 3 5.5-3 4 2.5-4.6 5-4.9-2-4.9 2z",
    "M12 12v5",
  ],
  /**
   * A reading plan: days in a list, the first of them done.
   *
   * It borrowed the scroll before this, which is the Journal's own icon — so
   * one segment of the Journal wore the badge of the screen it was sitting
   * on. Deliberately not the calendar either: that belongs to a different
   * destination, and a plan is a sequence you work through rather than a
   * month you look at.
   */
  plan: [
    "M3.2 6.3l1.8 1.8 3.3-3.5",
    "M11.4 6.4h9.4",
    "M3.9 12.4h4.4",
    "M11.4 12.4h9.4",
    "M3.9 18.4h4.4",
    "M11.4 18.4h9.4",
  ],
  /**
   * The Table: a table seen from above, with three gathered round it.
   *
   * The places sit outside the rim rather than on it, so what is drawn is
   * people at a table rather than plates on one — which is what the tab is
   * for. It replaced a single speech bubble, which said "messages" and said
   * nothing about a table at all.
   */
  table: [
    circle(12, 13, 5.4),
    circle(12, 3.6, 2),
    circle(4.2, 17.6, 2),
    circle(19.8, 17.6, 2),
  ],
  chat: ["M5 4.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"],
  thought: [
    "M8 5.5h9a3 3 0 0 1 0 8H9l-4 3v-3a3 3 0 0 1-1-8z",
    circle(6.2, 19, 1.1),
    circle(9.4, 21.2, 0.8)
  ],
  envelope: ["M3 6h18v12H3z", "M3 7l9 6.2L21 7"],
  bell: [
    "M12 3.2A5.3 5.3 0 0 0 6.7 8.5c0 5-2.2 7.3-2.2 7.3h15s-2.2-2.3-2.2-7.3A5.3 5.3 0 0 0 12 3.2z",
    "M9.8 19a2.2 2.2 0 0 0 4.4 0",
  ],
  calendar: ["M4 6.5h16V20H4z", "M4 10.5h16", "M8.5 3.5v4M15.5 3.5v4"],
  video: ["M3.5 7h11.5v10H3.5z", "M15 10.5l5.5-3v9l-5.5-3"],
  share: ["M12 16V3.5", "M7.5 8L12 3.5 16.5 8", "M4.5 14v5.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V14"],
  download: ["M12 3.5V16", "M7.5 11.5L12 16l4.5-4.5", "M4.5 14v5.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V14"],
  clipboard: [
    "M9 4.5H6.5a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1H15",
    "M9.5 3h5a.8.8 0 0 1 .8.8v2.4H8.7V3.8A.8.8 0 0 1 9.5 3z",
  ],
  phone: ["M7.5 2.5h9a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z", "M12 18.3a.7.7 0 1 0 0-.1"],

  // ---- settings and chrome ----
  menu: ["M4 7h16M4 12h16M4 17h16"],
  gear: [
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z",
    "M12 2.8l1.3 2.4 2.7-.4 .4 2.7 2.4 1.3-1.2 2.4 1.2 2.4-2.4 1.3-.4 2.7-2.7-.4L12 21.2l-1.3-2.4-2.7.4-.4-2.7-2.4-1.3 1.2-2.4-1.2-2.4 2.4-1.3.4-2.7 2.7.4z",
  ],
  tools: [
    "M14.5 3.5a4.5 4.5 0 0 1 5 6.2l-9 9a2.4 2.4 0 0 1-3.4-3.4l9-9a4.5 4.5 0 0 1-1.6-2.8z",
    "M5 5l3.5 3.5",
  ],
  lock: ["M7 10.5V8a5 5 0 0 1 10 0v2.5", "M5.5 10.5h13V20h-13z", "M12 14v2.5"],
  globe: [
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    "M3.2 12h17.6",
    "M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z",
  ],
  trash: ["M4.5 7h15", "M9.5 7V4h5v3", "M6.5 7l1 13.5a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9L17.5 7"],
  sun: [
    "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z",
    "M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8M19.1 19.1l-1.8-1.8M6.7 6.7L4.9 4.9",
  ],
  moon: ["M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"],
  sunrise: ["M12 15.5a4 4 0 0 1 8 0", "M4 15.5a4 4 0 0 1 4-4", "M2.5 19.5h19", "M12 3v4M5.5 6.5l1.8 1.8M18.5 6.5l-1.8 1.8"],
  hourglass: [
    "M6.5 3h11M6.5 21h11",
    "M8.5 3c0 4.2 3.5 6.4 3.5 6.4S15.5 7.2 15.5 3",
    "M8.5 21c0-4.2 3.5-6.4 3.5-6.4s3.5 2.2 3.5 6.4",
  ],
  check: ["M4.5 12.5l5 5 10-11"],
  close: ["M5.5 5.5l13 13M18.5 5.5l-13 13"],
  // the way back from wherever a reference took you: an arrow that turns round
  back: ["M9 5.5L3.5 11 9 16.5", "M3.5 11h11a6 6 0 0 1 6 6v1.5"],

  // ---- growth and nature ----
  seedling: [
    "M12 21v-7.5",
    "M12 13.5c-4 0-6.5-2.6-6.5-6.5 4 0 6.5 2.6 6.5 6.5z",
    "M12 13.5c4 0 6.5-2.6 6.5-6.5-4 0-6.5 2.6-6.5 6.5z",
  ],
  leaf: ["M4 20C4 11 9.5 4.5 20 3.5c1 10.5-5.5 16-14.5 16z", "M4.5 19.5L13 11"],
  flower: [
    circle(12, 12, 2.3),
    circle(12, 7.2, 2.5),
    circle(16.6, 10.6, 2.5),
    circle(14.8, 16, 2.5),
    circle(9.2, 16, 2.5),
    circle(7.4, 10.6, 2.5)
  ],
  mountain: ["M2 19.5l6.5-11 4 6 3-4.5 6.5 9.5z", "M8.5 8.5l2.5 4"],
  wave: ["M2.5 9.5c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 3.5-1.2 4.5 0", "M2.5 15.5c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 3.5-1.2 4.5 0"],
  fire: [
    "M12.4 2.5C13 7.1 7.2 8.8 7.2 13.6a4.8 4.8 0 0 0 9.6 0c0-2.1-1.1-3.6-2.4-4.7",
    "M12 13.2c.4 1.8-.4 3-1.6 3.4a2.4 2.4 0 0 0 3.8 1.4c.7-.6 1-1.6.7-2.6"
  ],
  rainbow: [
    "M2.5 20a9.5 9.5 0 0 1 19 0",
    "M6 20a6 6 0 0 1 12 0",
    "M9.5 20a2.5 2.5 0 0 1 5 0",
  ],
  heart: ["M12 20.5C5.5 16.4 3 13 3 9.6A4.6 4.6 0 0 1 12 7.4a4.6 4.6 0 0 1 9 2.2c0 3.4-2.5 6.8-9 10.9z"],
  shield: ["M12 3l8 3v6.2C20 17.4 16.4 20.5 12 21.5 7.6 20.5 4 17.4 4 12.2V6z"],
  party: ["M3 21l5-13 8 8z", "M8 8a3 3 0 0 1 3-4M16 5.5a2 2 0 0 1 3 1.5M19 12.5a2 2 0 0 1 2-1.5", "M13.5 4.5v.1M20 17.5v.1M9.5 2.5v.1"],
  music: [
    "M9 17.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z",
    "M20.5 15.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z",
    "M9 17.5V6.2l11.5-2.2v11.5",
    "M9 9.5l11.5-2.2",
  ],
  runner: [
    "M14.5 5.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z",
    "M6 21l3.5-5 2-4-1-4-3.5 2-1.5 3",
    "M11.5 12l3.5 2 1 7",
    "M12.5 8.5l4 1 2.5-2.5",
  ],
  owl: [
    "M12 21.2c-4 0-6.6-3.2-6.6-7.6 0-5 2.6-9.2 6.6-9.2s6.6 4.2 6.6 9.2c0 4.4-2.6 7.6-6.6 7.6z",
    circle(9.5, 11.4, 1.9),
    circle(14.5, 11.4, 1.9),
    "M12 13.8l-1.2 1.6h2.4z",
    "M6.6 6.6L4.8 3.4M17.4 6.6l1.8-3.2"
  ],
  lion: [
    circle(12, 12.6, 5.4),
    circle(10.2, 11.6, 0.75),
    circle(13.8, 11.6, 0.75),
    "M12 14.2l-1.1 1.3h2.2z",
    "M12 15.5v1.4",
    "M12 7.2V4M12 18v3M6.6 12.6H3.4M20.6 12.6h-3.2M8.2 8.8L5.9 6.5M15.8 8.8l2.3-2.3M8.2 16.4l-2.3 2.3M15.8 16.4l2.3 2.3"
  ],
  eagle: [
    "M12 10.2L8.2 12.6 2.6 9.8c1.6 4.6 5.1 7.6 9.4 7.6s7.8-3 9.4-7.6l-5.6 2.8z",
    "M12 10.2v7.2",
    "M10.6 7.6h2.8L12 5.2z",
    "M12 7.6v2.6"
  ],
};

/** Icons whose shape needs a filled counter to read at text size. */
const FILLED = new Set<IconName>([]);

export default function Icon({
  name,
  className,
  title,
  filled,
}: {
  name: IconName;
  className?: string;
  title?: string;
  /** Fill the shape rather than outline it — a bookmark that is set, say. */
  filled?: boolean;
}) {
  const paths = PATHS[name];
  return (
    <svg
      className={`ic${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={filled || FILLED.has(name) ? "currentColor" : "none"}
        />
      ))}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

/** What each kind of gathering is drawn as, shared by every screen that lists one. */
export const SESSION_ICON = {
  bible_study: "book",
  prayer: "prayer",
  communion: "bread",
  praise_worship: "music",
  fellowship: "handshake",
  custom: "sparkle",
} as const satisfies Record<string, IconName>;
