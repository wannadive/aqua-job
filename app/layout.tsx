import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { NavigationInit } from "@/components/shared/navigation-init";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND.appName,
  description: BRAND.tagline,
  applicationName: BRAND.appName,
  appleWebApp: { capable: true, title: BRAND.appName, statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0E2235",
  width: "device-width",
  initialScale: 1,
  // 아이폰 노치·홈 바 영역까지 그려야 env(safe-area-inset-*)가 값을 가진다
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <NavigationInit />
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
