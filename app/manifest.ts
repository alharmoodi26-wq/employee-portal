import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Employee Work Management Portal",
    short_name: "EIHG Portal",
    description:
      "Emirates International Holdings Group — Employee Work Management Portal",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f1c35",
    theme_color: "#0f1c35",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/api/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
