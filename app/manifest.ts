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
    // 임시 아이콘(물결 SVG) — 이후 PNG로 교체
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
