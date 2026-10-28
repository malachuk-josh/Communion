"use client";

// A Bookshelf book: its own page (cover, what it is, where you are, the
// contents) at /bookshelf?b=<slug>, and a part of it at &p=<part>.
//
// One route for the whole book rather than a route per chapter, because a
// route is a page the service worker has to have stored for the book to open
// with no signal, and one page can be stored ahead of time where twenty-five
// could not.
//
// A part is laid out the way its PDF lays it out — the small gold "Chapter 1"
// over the title, an ornament under it, the picture in its gold frame, a drop
// cap, justified text and verse set in — in the book's own typefaces (see
// lib/bookFonts), and in the reader's theme: on Parchment it is the PDF's
// page, and in Illuminated and grey it takes their colours with the same
// ornaments.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { getBook } from "@/lib/bible";
import { BOOK_FONTS } from "@/lib/bookFonts";
import {
  bookHref,
  bookUrl,
  fetchBookIndex,
  fetchBookPart,
  readPlace,
  readRefs,
  SHELF,
  shelfBook,
  syncPlace,
  writePlace,
  type Block,
  type BookImage,
  type BookIndex,
  type BookPart,
  type BookRef,
  type Place,
  type ShelfBook,
} from "@/lib/bookshelf";
import { useI18n, type MessageKey } from "@/lib/i18n";
import {
  downloadTier,
  loadManifest,
  supportsOffline,
  tierProgress,
  type Tier,
} from "@/lib/offline";
import { getPlan } from "@/lib/plans";
import { readTextPt } from "@/lib/readingText";
import { fetchChapter } from "@/lib/scripture";
import { onScroll, scroller, scrollToY } from "@/lib/scroller";
import { enqueue, readLocalState, writeLocalState } from "@/lib/sync";

export default function BookView() {
  const params = useSearchParams();
  const slug = params.get("b");
  const part = params.get("p");
  // opened from the Journal's plan card: the way back goes there, as it does
  // from a plan's chapter in The Word. An allowlist — it ends up in an href.
  const fromJournal = params.get("from") === "journal";
  const book = shelfBook(slug);
  const { t } = useI18n();
  if (!book) {
    return (
      <div className="bk-missing">
        <p>{t("shelf.missing")}</p>
        <Link href="/discover" className="btn">
          {t("shelf.backToShelf")}
        </Link>
      </div>
    );
  }
  return (
    <div className={`bk ${BOOK_FONTS}`}>
      {part ? (
        <PartView book={book} partId={part} fromJournal={fromJournal} />
      ) : (
        <BookHome book={book} />
      )}
    </div>
  );
}

/** "Chapter 5 · The Cross and the Hill Difficulty", or just the title. */
function entryName(e: { label?: string; title: string }, t: (k: MessageKey, v?: Record<string, string>) => string) {
  const n = e.label?.match(/\d+/)?.[0];
  return n ? `${t("shelf.chapter", { n })} · ${e.title}` : e.title;
}

const minutes = (words: number) => Math.max(1, Math.round(words / 220));

// ---- the book's own page ------------------------------------------------------

function BookHome({ book }: { book: ShelfBook }) {
  const { lang, t } = useI18n();
  const [index, setIndex] = useState<BookIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    let live = true;
    fetchBookIndex(book.slug)
      .then((i) => live && setIndex(i))
      .catch(() => live && setFailed(true));
    setPlace(readPlace(book.slug));
    void syncPlace(book.slug).then((p) => live && setPlace(p));
    return () => {
      live = false;
    };
  }, [book.slug]);

  const contents = index?.contents ?? [];
  const current = contents.find((c) => c.id === place?.part);
  const sequel = shelfBook(book.sequel);
  const prequel = SHELF.find((b) => b.sequel === book.slug);
  // what comes before the first chapter, the chapters, and what follows them;
  // a chapter is a numbered part, whether it is called one ("Chapter 3") or
  // only numbered (The Fall's "Book III")
  const isChapter = (c: (typeof contents)[number]) => !!c.label || /^\d+$/.test(c.id);
  const firstCh = contents.findIndex(isChapter);
  const lastCh = contents.length - 1 - [...contents].reverse().findIndex(isChapter);
  const front = firstCh > 0 ? contents.slice(0, firstCh) : [];
  const chapters = firstCh >= 0 ? contents.slice(firstCh, lastCh + 1) : contents;
  const back = firstCh >= 0 ? contents.slice(lastCh + 1) : [];

  const row = (c: (typeof chapters)[number]) => (
    <li key={c.id}>
      <Link
        href={bookHref(book.slug, c.id)}
        className={`bk-toc-row${c.id === place?.part ? " here" : ""}`}
      >
        {c.label && <span className="bk-toc-n">{c.label.match(/\d+/)?.[0]}</span>}
        <span className="bk-toc-title">{c.title}</span>
        <span className="bk-toc-min">{t("shelf.minutes", { n: String(minutes(c.words)) })}</span>
      </Link>
    </li>
  );

  return (
    <>
      <Link href="/discover" className="passage-link back-link">
        ← {t("shelf.title")}
      </Link>
      <div className="bk-home">
        <div className="bk-cover">
          {index ? (
            <img
              src={bookUrl(book.slug, index.cover.src)}
              width={index.cover.w}
              height={index.cover.h}
              alt={t("shelf.coverOf", { title: book.title })}
            />
          ) : (
            <div className="bk-cover-blank skeleton" />
          )}
        </div>
        <div className="bk-about">
          <h1 className="bk-book-title">{book.title}</h1>
          {book.subtitle && <p className="bk-book-sub">{book.subtitle}</p>}
          <p className="bk-book-author">{book.author}</p>
          {lang !== book.lang && (
            <p className="bk-lang">{t(`shelf.in.${book.lang}` as MessageKey)}</p>
          )}
          <p className="bk-blurb">{book.blurb[lang === "es" ? "es" : "en"]}</p>
          <div className="bk-actions">
            {current ? (
              <Link className="btn btn-primary" href={bookHref(book.slug, current.id)}>
                <Icon name="book" /> {t("shelf.continue")}
                <span className="bk-btn-sub">{entryName(current, t)}</span>
              </Link>
            ) : (
              index && (
                <Link className="btn btn-primary" href={bookHref(book.slug, index.contents[0].id)}>
                  <Icon name="book" /> {t("shelf.begin")}
                </Link>
              )
            )}
            {book.plan && (
              <Link className="btn" href={`/discover?plan=${book.plan}`}>
                <Icon name="plan" /> {t(book.unit === "book" ? "shelf.withPlanBooks" : "shelf.withPlan", {
                  n: String(getPlan(book.plan)?.days.length ?? ""),
                })}
              </Link>
            )}
          </div>
          <SaveOffline slug={book.slug} />
          {/* the other part of a work in two, either way round */}
          {sequel && (
            <Link className="bk-sibling" href={bookHref(sequel.slug)}>
              {t("shelf.followedBy", { title: sequel.subtitle ?? sequel.title })} →
            </Link>
          )}
          {prequel && (
            <Link className="bk-sibling" href={bookHref(prequel.slug)}>
              ← {t("shelf.follows", { title: prequel.subtitle ?? prequel.title })}
            </Link>
          )}
        </div>
      </div>

      {failed && !index && <p className="error-text">{t("shelf.offline")}</p>}
      {index && (
        <section className="bk-toc" aria-label={t("shelf.contents")}>
          <h2>{t("shelf.contents")}</h2>
          <ul>{front.map(row)}</ul>
          {index.part && chapters.length > 0 && <p className="bk-toc-part">{index.part}</p>}
          <ul>{chapters.map(row)}</ul>
          <ul>{back.map(row)}</ul>
        </section>
      )}
    </>
  );
}

/** Keep the book on this device: its text and its pictures, for no signal. */
function SaveOffline({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [tier, setTier] = useState<Tier | null>(null);
  const [have, setHave] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supportsOffline()) return;
    let live = true;
    loadManifest()
      .then(async (m) => {
        const found = m.tiers[`book:${slug}`];
        if (!found || !live) return;
        setTier(found);
        setHave(await tierProgress(found));
      })
      .catch(() => {
        // no manifest, no offline: the button simply isn't offered
      });
    return () => {
      live = false;
    };
  }, [slug]);

  if (!tier) return null;
  const mb = (tier.bytes / 1048576).toFixed(1);
  if (have >= tier.urls.length) {
    return (
      <p className="bk-saved">
        <Icon name="check" /> {t("shelf.saved")}
      </p>
    );
  }
  const save = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const done = await downloadTier(tier, (p) => setPct(Math.round((p.done / p.total) * 100)));
      setHave(done.done);
      if (done.failed > 0) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bk-offline">
      <button type="button" className="btn btn-sm" onClick={save} disabled={busy}>
        <Icon name="download" /> {busy ? `${pct}%` : t("shelf.saveOffline", { mb })}
      </button>
      {failed && <p className="cal-hint">{t("offline.failed")}</p>}
    </div>
  );
}

// ---- a part of it ---------------------------------------------------------------

function PartView({
  book,
  partId,
  fromJournal,
}: {
  book: ShelfBook;
  partId: string;
  fromJournal: boolean;
}) {
  const { lang, t } = useI18n();
  const [index, setIndex] = useState<BookIndex | null>(null);
  const [part, setPart] = useState<BookPart | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState<BookImage | null>(null);
  const [verse, setVerse] = useState<BookRef | null>(null);
  const [pt, setPt] = useState(14);
  const restored = useRef(false);

  useEffect(() => {
    setPt(readTextPt());
  }, []);

  useEffect(() => {
    let live = true;
    setPart(null);
    setFailed(false);
    restored.current = false;
    fetchBookIndex(book.slug).then((i) => live && setIndex(i)).catch(() => undefined);
    fetchBookPart(book.slug, partId)
      .then((p) => live && setPart(p))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [book.slug, partId]);

  // Open where the reader left this part, or at its top; then keep the place
  // as they read. A different part opened from the contents starts at its top.
  useEffect(() => {
    if (!part || restored.current) return;
    restored.current = true;
    const saved = readPlace(book.slug);
    const el = scroller();
    if (saved && saved.part === part.id && saved.at > 0.01 && el) {
      // after layout: the pictures carry their size, so the height is final
      requestAnimationFrame(() => {
        scrollToY(saved.at * (el.scrollHeight - el.clientHeight));
      });
    } else {
      scrollToY(0);
      writePlace(book.slug, part.id, 0);
    }
    let pending = false;
    return onScroll(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        const box = scroller();
        if (!box) return;
        const range = box.scrollHeight - box.clientHeight;
        writePlace(book.slug, part.id, range > 0 ? box.scrollTop / range : 0);
      }, 400);
    });
  }, [part, book.slug]);

  const contents = index?.contents ?? [];
  const sequel = shelfBook(book.sequel);
  const at = contents.findIndex((c) => c.id === partId);
  const prev = at > 0 ? contents[at - 1] : null;
  const next = at >= 0 && at < contents.length - 1 ? contents[at + 1] : null;

  return (
    <article className="bk-part" style={{ ["--bk-size" as string]: `${pt}pt` }}>
      <div className="bk-bar">
        {fromJournal ? (
          <Link href="/menu/journal" className="passage-link back-link">
            ← {t("nav.journal")}
          </Link>
        ) : (
          <Link href={bookHref(book.slug)} className="passage-link back-link">
            ← {t("shelf.contents")}
          </Link>
        )}
        <span className="bk-bar-title">
          {book.title}
          {book.subtitle ? ` · ${book.subtitle.replace(/:.*$/, "")}` : ""}
        </span>
      </div>

      {failed && (
        <p className="error-text">{t("shelf.offline")}</p>
      )}
      {!part && !failed && <div className="bk-loading skeleton" />}
      {part && (
        <>
          <header className={`bk-head${part.id === "note" ? " bk-head-quiet" : ""}`}>
            <Ornament />
            {part.label && <p className="bk-label">{part.label}</p>}
            {part.id !== "note" && <h1 className="bk-title">{part.title}</h1>}
            <Rule />
          </header>

          {part.image && (
            <figure className="bk-figure">
              <button
                type="button"
                className="bk-figure-btn"
                onClick={() => setViewing(part.image!)}
                aria-label={t("shelf.viewPicture")}
              >
                <img
                  src={bookUrl(book.slug, part.image.src)}
                  width={part.image.w}
                  height={part.image.h}
                  alt=""
                />
              </button>
            </figure>
          )}

          <div className="bk-text">
            {part.blocks.map((b, i) => (
              <BlockView
                key={i}
                block={b}
                slug={book.slug}
                onRef={setVerse}
                onPicture={setViewing}
              />
            ))}
          </div>

          <Ornament />
          <MarkRead slug={book.slug} partId={part.id} plan={book.plan} />
          <nav className="bk-turn" aria-label={t("shelf.turn")}>
            {prev ? (
              <Link className="bk-turn-link" href={bookHref(book.slug, prev.id)}>
                <span className="bk-turn-dir">← {t("shelf.previous")}</span>
                <span className="bk-turn-name">{entryName(prev, t)}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link className="bk-turn-link bk-turn-next" href={bookHref(book.slug, next.id)}>
                <span className="bk-turn-dir">{t("shelf.next")} →</span>
                <span className="bk-turn-name">{entryName(next, t)}</span>
              </Link>
            ) : sequel ? (
              // the last page of a book with a second part opens that part
              <Link className="bk-turn-link bk-turn-next" href={bookHref(sequel.slug)}>
                <span className="bk-turn-dir">{t("shelf.goesOn")} →</span>
                <span className="bk-turn-name">{sequel.subtitle ?? sequel.title}</span>
              </Link>
            ) : (
              <Link className="bk-turn-link bk-turn-next" href={bookHref(book.slug)}>
                <span className="bk-turn-dir">{t("shelf.theEnd")}</span>
                <span className="bk-turn-name">{t("shelf.contents")}</span>
              </Link>
            )}
          </nav>
        </>
      )}

      {viewing && (
        <PictureView src={bookUrl(book.slug, viewing.src)} onClose={() => setViewing(null)} />
      )}
      {verse && <VersePop verse={verse} lang={lang} onClose={() => setVerse(null)} />}
    </article>
  );
}

/** The fleuron at the head and foot of a part, as the PDF draws it. */
function Ornament() {
  return (
    <svg className="bk-orn" viewBox="0 0 240 14" aria-hidden="true">
      <path d="M4 7h92M144 7h92" />
      <path d="M120 7c-4-5-11-5-13 0 2 5 9 5 13 0zM120 7c4-5 11-5 13 0-2 5-9 5-13 0z" />
      <circle cx="104" cy="7" r="1.4" />
      <circle cx="136" cy="7" r="1.4" />
    </svg>
  );
}

/** The short rule with its knot under a title. */
function Rule() {
  return (
    <svg className="bk-rule" viewBox="0 0 160 12" aria-hidden="true">
      <path d="M2 6h62M96 6h62" />
      <path d="M80 6c-3-4-9-4-11 0 2 4 8 4 11 0zM80 6c3-4 9-4 11 0-2 4-8 4-11 0z" />
    </svg>
  );
}

// ---- the text ---------------------------------------------------------------------

function BlockView({
  block,
  slug,
  onRef,
  onPicture,
}: {
  block: Block;
  slug: string;
  onRef: (r: BookRef) => void;
  onPicture: (img: BookImage) => void;
}) {
  const { t } = useI18n();
  if ("p" in block) {
    if (block.drop) {
      // the first letter, set large in its frame, and the rest of the word
      // running on from it
      const first = block.p.match(/^((?:<[ib]>)*)(.)([\s\S]*)$/);
      if (first) {
        return (
          <p className="bk-p bk-first">
            <span className="bk-drop">{first[2]}</span>
            <Inline html={first[1] + first[3]} onRef={onRef} />
          </p>
        );
      }
    }
    return (
      <p className={`bk-p${block.style ? ` bk-${block.style}` : ""}`}>
        <Inline html={block.p} onRef={onRef} />
      </p>
    );
  }
  if ("img" in block) {
    // an engraving where it stands in the verse, opened full size as a
    // chapter's picture is
    return (
      <figure className="bk-plate">
        <button
          type="button"
          className="bk-figure-btn"
          onClick={() => onPicture(block.img)}
          aria-label={t("shelf.viewPicture")}
        >
          <img
            src={bookUrl(slug, block.img.src)}
            width={block.img.w}
            height={block.img.h}
            alt=""
            loading="lazy"
          />
        </button>
      </figure>
    );
  }
  if ("section" in block) {
    return <h2 className="bk-section">{block.section}</h2>;
  }
  if ("v" in block) {
    return (
      <div className="bk-verse">
        {block.v.map((stanza, i) => (
          <p key={i} className="bk-stanza">
            {stanza.map((line, j) => (
              <span key={j} className="bk-line">
                <Inline html={line} onRef={onRef} />
              </span>
            ))}
          </p>
        ))}
      </div>
    );
  }
  if ("h" in block) {
    return <p className="bk-h">{block.h}</p>;
  }
  return (
    <div className="bk-table-wrap">
      <table className="bk-table">
        <thead>
          <tr>
            {block.table.head.map((h, i) => (
              <th key={i}>
                <Inline html={h} onRef={onRef} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>
                  <Inline html={cell} onRef={onRef} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A run of text with its italics and bold, and its Bible references as
 * buttons. The markup is the build script's own two tags and nothing else,
 * so it is read here rather than handed to the DOM as HTML.
 */
function Inline({ html, onRef }: { html: string; onRef: (r: BookRef) => void }) {
  const nodes = useMemo(() => {
    const out: React.ReactNode[] = [];
    let italic = false;
    let bold = false;
    let key = 0;
    const wrap = (node: React.ReactNode) => {
      let n = node;
      if (italic) n = <i key={`i${key++}`}>{n}</i>;
      if (bold) n = <b key={`b${key++}`}>{n}</b>;
      return n;
    };
    for (const piece of html.split(/(<\/?[ib]>)/)) {
      if (piece === "<i>") italic = true;
      else if (piece === "</i>") italic = false;
      else if (piece === "<b>") bold = true;
      else if (piece === "</b>") bold = false;
      else if (piece) {
        // the references, in their brackets, as printed
        for (const part of piece.split(/(\[[^\]]+\])/)) {
          const inside = part.match(/^\[([^\]]+)\]$/);
          if (!inside) {
            if (part) out.push(wrap(<Fragment key={key++}>{part}</Fragment>));
            continue;
          }
          const refs = readRefs(inside[1]);
          out.push(
            <span key={key++} className="bk-refs">
              {refs.map((r, i) => (
                <Fragment key={i}>
                  {i > 0 && " "}
                  {/* each reference keeps its own bracket or semicolon with
                      it, so a line never ends on a bare "[" */}
                  <span className="bk-ref-piece">
                    {i === 0 && "["}
                    {typeof r === "string" ? (
                      r
                    ) : (
                      <button type="button" className="bk-ref" onClick={() => onRef(r)}>
                        {r.text}
                      </button>
                    )}
                    {i === refs.length - 1 ? "]" : ";"}
                  </span>
                </Fragment>
              ))}
            </span>
          );
        }
      }
    }
    return out;
  }, [html, onRef]);
  return <>{nodes}</>;
}

// ---- over the page ------------------------------------------------------------------

/** A picture on its own, as large as the screen allows. */
function PictureView({ src, onClose }: { src: string; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="bk-viewer" role="dialog" aria-modal="true" aria-label={t("shelf.viewPicture")} onClick={onClose}>
      <img src={src} alt="" />
      <button type="button" className="lex-close bk-viewer-close" onClick={onClose} aria-label={t("common.close")}>
        ✕
      </button>
    </div>
  );
}

/**
 * The verse a bracket points to, over the book, without leaving it — and the
 * way into The Word for anyone who wants the chapter round it.
 */
function VersePop({ verse, lang, onClose }: { verse: BookRef; lang: string; onClose: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState<Array<{ verse: number; text: string }> | null>(null);
  const [missing, setMissing] = useState(false);
  const translation = lang === "es" ? "valera" : "kjv";
  const book = getBook(verse.b);
  const name = book ? (lang === "es" ? book.es : book.en) : "";
  const label = `${name} ${verse.c}${
    verse.v
      ? `:${verse.v}${verse.ve ? `–${verse.ve}` : ""}${verse.more ? `, ${verse.more.join(", ")}` : ""}`
      : ""
  }`;

  useEffect(() => {
    let live = true;
    fetchChapter(translation, verse.b, verse.c)
      .then((data) => {
        if (!live) return;
        // a verse, a range, a verse and a few more — or the whole chapter
        const from = verse.v ?? 1;
        const to = verse.ve ?? verse.v ?? data.verses.length;
        setText(
          data.verses.filter(
            (v) => (v.verse >= from && v.verse <= to) || verse.more?.includes(v.verse)
          )
        );
      })
      .catch(() => live && setMissing(true));
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => {
      live = false;
      window.removeEventListener("keydown", key);
    };
  }, [verse, translation, onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass modal bk-verse-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bk-verse-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mh-head">
          <h2 id="bk-verse-title">
            {label} <span className="bk-pop-tr">{translation === "kjv" ? "KJV" : "RV1909"}</span>
          </h2>
          <button type="button" className="lex-close" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>
        {missing ? (
          <p className="cal-hint">{t("shelf.verseOffline")}</p>
        ) : text ? (
          <p className="bk-pop-text">
            {text.map((v) => (
              <Fragment key={v.verse}>
                {text.length > 1 && <sup>{v.verse}</sup>}
                {v.text}{" "}
              </Fragment>
            ))}
          </p>
        ) : (
          <div className="skeleton bk-pop-wait" />
        )}
        <div className="modal-actions">
          <Link
            className="btn btn-primary"
            href={`/?b=${verse.b}&c=${verse.c}${verse.v ? `&v=${verse.v}` : ""}`}
          >
            <Icon name="book" /> {t("shelf.openInWord")}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---- the plan ---------------------------------------------------------------------

/**
 * At the end of a chapter that is today's reading in the book's plan, the
 * plan's own button — the same act as the Journal's, written the same way.
 */
function MarkRead({ slug, partId, plan: planId }: { slug: string; partId: string; plan?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState<number | null>(null);
  const [marked, setMarked] = useState<number | null>(null);
  const plan = planId ? getPlan(planId) : undefined;

  useEffect(() => {
    if (!plan) return;
    let live = true;
    readLocalState().then((s) => {
      if (!live) return;
      const plans = s?.plans ?? {};
      setDone(plan.id in plans ? plans[plan.id] : null);
    });
    return () => {
      live = false;
    };
  }, [plan]);

  if (marked !== null) {
    return (
      <p className="bk-mark bk-marked">
        <Icon name="check" /> {t("shelf.markedDay", { n: String(marked) })}
      </p>
    );
  }
  if (!plan || done === null || done >= plan.days.length) return null;
  const today = plan.days[done].readings[0];
  if (today.shelf !== slug || today.part !== partId) return null;

  const mark = async () => {
    const next = done + 1;
    setDone(next);
    setMarked(next);
    const plans = (await readLocalState())?.plans ?? {};
    await writeLocalState({ plans: { ...plans, [plan.id]: next } });
    let on: string;
    try {
      on = new Intl.DateTimeFormat("en-CA").format(new Date());
    } catch {
      on = new Date().toISOString().slice(0, 10);
    }
    void enqueue({ kind: "plan.set", id: plan.id, done: next, on, ts: Date.now() });
  };

  return (
    <div className="bk-mark">
      <button type="button" className="btn btn-primary" onClick={mark}>
        ✓ {t("shelf.markDay", { n: String(done + 1) })}
      </button>
    </div>
  );
}
