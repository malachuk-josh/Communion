"use client";

// What the reader sees when something breaks.
//
// React unmounts the entire tree when a render throws and nothing catches it,
// so one bad row in one component took the whole app to a white screen — no
// nav, no way back, nothing to read. That is the wrong failure for this app in
// particular: almost everything here is Scripture, which is static and cached
// and was never the thing that broke.
//
// So the boundary is placed around the page rather than around the document.
// The nav bar, the theme and the background stay up, which means the reader is
// one tap from a screen that works instead of one force-quit from the app.
//
// Remounting on navigation is the other half. A class component holds its
// error until something changes it, so without a key that changes with the
// route, tapping away from a broken page would show the same apology on the
// page you moved to. `resetKey` is the pathname; when it changes, the error
// is cleared and the new page gets its chance.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** changing this clears the error — pass the current route */
  resetKey?: string;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: unknown) {
    // Nowhere to send it, and swallowing it silently would make this the
    // hardest class of bug in the app to find. The console is the only
    // reporter here, and it is enough to recover a stack from a reader who
    // says "it went blank".
    console.error("Communion: a page failed to render", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page-error" role="alert">
        <h1>Something went wrong on this page.</h1>
        <p>
          The rest of the app is still here. Scripture is stored on this device,
          so reading works even if this screen does not.
        </p>
        <div className="page-error-actions">
          <Link href="/" className="btn btn-primary">
            Back to the Word
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}

/**
 * The boundary as the layout uses it, wired to the router.
 *
 * A class cannot read a hook, so the pathname is picked up here and handed
 * down. Without it a broken page would poison every page after it: the error
 * state has nothing to clear it, and the reader would tap Gatherings, tap
 * Journal, and be told the same thing each time.
 */
export default function PageBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary resetKey={usePathname()}>{children}</ErrorBoundary>;
}
