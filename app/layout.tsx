import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND.appName,
  description: BRAND.tagline,
  applicationName: BRAND.appName,
  appleWebApp: { capable: true, title: BRAND.appName, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0E2235",
  width: "device-width",
  initialScale: 1,
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
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
