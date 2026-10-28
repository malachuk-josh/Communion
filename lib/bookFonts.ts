// The Bookshelf's typefaces: free cousins of the ones the books were set in.
//
// The PDFs use Goudy Old Style for the text and Baskerville Old Face for the
// titles, both commercial faces the app cannot serve. Sorts Mill Goudy is a
// revival of Goudy's own design, with its italic, and Libre Baskerville is the
// closest free Baskerville with a title's weight. Both under the SIL Open Font
// License, served from the app by next/font like the Word's typefaces.
//
// Exposed as CSS variables on the book's own container, so nothing outside a
// book is set in them, and not preloaded: their files are fetched when a book
// is opened, not on every page of the app.

import { Libre_Baskerville, Sorts_Mill_Goudy } from "next/font/google";

const text = Sorts_Mill_Goudy({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--bk-text",
});

const titles = Libre_Baskerville({
  weight: "400",
  style: ["normal"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--bk-title",
});

export const BOOK_FONTS = `${text.variable} ${titles.variable}`;
