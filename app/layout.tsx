import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./sketch.css";
import { asset } from "@/lib/assets";
export const metadata: Metadata = {
  title: "LoveLoom — пространство для двоих",
  description: "Ваши разговоры, планы и маленькие истории. В одном месте.",
  icons: { icon: asset("/favicon.svg") },
  manifest: asset("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LoveLoom",
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fff8f5",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
