import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { LanguageProvider } from "@/lib/i18n";
import { ReadingProvider } from "@/lib/reading";
import Nav from "@/components/Nav";
import PullToRefresh from "@/components/PullToRefresh";
import PushPrompt from "@/components/PushPrompt";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://communion-mu.vercel.app"),
  title: "Communion — Read the Word. Gather in His name.",
  description:
    "A Bible app with a social heart: Scripture in multiple translations and languages, and Fellowships — small groups that worship together. Matthew 18:20.",
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
              'try{var t=localStorage.getItem("communion.theme");if(t!=="dark"&&t!=="light")t="grey";if(t!=="dark")document.documentElement.dataset.theme=t;var m=document.querySelector(\'meta[name="theme-color"]\');if(m)m.setAttribute("content",t==="light"?"#ede1c8":t==="grey"?"#000000":"#0b0d1a")}catch(e){}',
          }}
        />
        <LanguageProvider>
          <ReadingProvider>
            <div className="bg-scene" aria-hidden />
            <PullToRefresh />
            <Nav />
            <main className="page">{children}</main>
            <PushPrompt />
          </ReadingProvider>
        </LanguageProvider>
      </body>
    </html>
  );

  return clerkEnabled ? <ClerkProvider>{app}</ClerkProvider> : app;
}
