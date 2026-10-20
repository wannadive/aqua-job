import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.appName,
    short_name: BRAND.appName,
    description: BRAND.tagline,
    start_url: "/",
    display: "standalone",
    theme_color: "#0E2235",
    background_color: "#F4F8FB",
    lang: "ko",
    // 물결 표시. PNG는 public/icon.svg에서 scripts/gen-icons.mjs로 만든다.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
