import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { LanguageProvider } from "@/lib/i18n";
import { ReadingProvider } from "@/lib/reading";
import Nav from "@/components/Nav";
import PullToRefresh from "@/components/PullToRefresh";
import ViewportInsets from "@/lib/viewport";
import PushPrompt from "@/components/PushPrompt";
import Welcome from "@/components/Welcome";
import OfflineReady from "@/components/OfflineReady";
import ActingAs from "@/components/ActingAs";
import PageBoundary from "@/components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://communion-mu.vercel.app"),
  title: "Communion — Read the Word. Gather in His name.",
  description:
    "A Bible app with a social heart: Scripture in multiple translations and languages, and Gatherings — small groups that worship together. Matthew 18:20.",
  openGraph: {
    title: "Communion",
    description: "Read the Word. Gather in His name.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Communion",
    description: "Read the Word. Gather in His name.",
    images: ["/og.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Communion",
    // transparent status bar: the app's live background paints the strip,
    // so it follows theme switches instead of freezing at launch
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  // no pinch zoom: the reader has its own text-size controls, and accidental
  // zoom is far more common than intentional on a home-screen app
  maximumScale: 1,
  userScalable: false,
  // extend the page under the status bar so the strip above the header is
  // painted by the app's own background in every theme
  viewportFit: "cover",
  // Safari has always resized only the visual viewport when the keyboard
  // opens, and Chrome for Android has done the same since 108. Saying so
  // pins Firefox 132+ and anything later to that one model, so
  // lib/viewport.tsx has a single behaviour to measure instead of two.
  interactiveWidget: "resizes-visual",
};

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const app = (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              // storage access itself can throw where it is blocked by
              // policy, so the read sits inside its own try and the theme
              // falls back to the default rather than taking the page down
              'var t;try{t=localStorage.getItem("communion.theme")}catch(e){t=null}try{if(t!=="dark"&&t!=="light")t="grey";if(t!=="dark")document.documentElement.dataset.theme=t;var m=document.querySelector(\'meta[name="theme-color"]\');if(m)m.setAttribute("content",t==="light"?"#ede1c8":t==="grey"?"#000000":"#0b0d1a")}catch(e){}',
          }}
        />
        <LanguageProvider>
          <ReadingProvider>
            <ViewportInsets />
            <div className="bg-scene" aria-hidden />
            <PullToRefresh />
            <Nav />
            {/* Around the page, not the document: a broken screen must not
                take the nav bar with it, or there is no way off it. */}
            <main className="page">
              <PageBoundary>{children}</PageBoundary>
            </main>
            <ActingAs />
            <Welcome />
            <PushPrompt />
            <OfflineReady />
          </ReadingProvider>
        </LanguageProvider>
      </body>
    </html>
  );

  return clerkEnabled ? <ClerkProvider>{app}</ClerkProvider> : app;
}
