import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KI-Chat",
  description: "Ein sicherer, direkter KI-Chat mit serverseitiger OpenAI-Anbindung.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
