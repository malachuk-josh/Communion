/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Gatherings, the Table and the calendar were taken out of the app, and
  // their addresses live on in invitations, old notifications and bookmarks.
  // Each lands on the home screen rather than on a page that is not there.
  // Not permanent: a browser holds on to a permanent redirect for good, and
  // that is not a decision to make for an address that may be used again.
  async redirects() {
    return [
      "/churches/:path*",
      "/menu/messages/:path*",
      "/calendar",
      "/join/:path*",
    ].map((source) => ({ source, destination: "/discover", permanent: false }));
  },
};

export default nextConfig;
