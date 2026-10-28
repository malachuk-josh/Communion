import { Suspense } from "react";
import BookView from "@/components/BookView";

// The Bookshelf's books: /bookshelf?b=<slug> for a book's own page, and
// &p=<part> for a part of it. See components/BookView for why it is one route.
export default function BookshelfPage() {
  return (
    <Suspense fallback={null}>
      <BookView />
    </Suspense>
  );
}
