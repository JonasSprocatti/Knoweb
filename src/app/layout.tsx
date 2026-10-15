import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", axes: ["opsz", "wdth"] });

export const metadata: Metadata = {
  title: { default: "Knoweb", template: "%s · Knoweb" },
  description: "Notas, gravações e transcrições conectadas numa teia de conhecimento.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Knoweb", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1233" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={bricolage.variable}>
      <body className="min-h-dvh font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
