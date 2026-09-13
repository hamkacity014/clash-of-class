import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clash of Class — Arena Pembelajaran Kompetitif Real-Time",
  description: "Platform kompetisi belajar real-time interaktif untuk siswa dan guru. Perebutkan soal, kunci dalam 60 detik, dan jadilah juara!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
