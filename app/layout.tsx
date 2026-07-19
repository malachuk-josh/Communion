import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { LanguageProvider } from "@/lib/i18n";
import { ReadingProvider } from "@/lib/reading";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Communion — Read the Word. Gather in His name.",
  description:
    "A Bible app with a social heart: Scripture in multiple translations and languages, and Churches — small groups that worship together. Matthew 18:20.",
};

export const viewport: Viewport = {
  themeColor: "#0b0d1a",
  width: "device-width",
  initialScale: 1,
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
              'try{if(localStorage.getItem("communion.theme")!=="dark")document.documentElement.dataset.theme="light"}catch(e){document.documentElement.dataset.theme="light"}',
          }}
        />
        <LanguageProvider>
          <ReadingProvider>
            <div className="bg-scene" aria-hidden />
            <Nav />
            <main className="page">{children}</main>
          </ReadingProvider>
        </LanguageProvider>
      </body>
    </html>
  );

  return clerkEnabled ? <ClerkProvider>{app}</ClerkProvider> : app;
}
