import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Communion",
    short_name: "Communion",
    description:
      "Read the Word. Gather in His name. A Bible app with Churches — small groups that worship together.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7efdd",
    theme_color: "#f7efdd",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
