import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayCycle",
  description: "Track your monthly commitments with confidence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#f5f7fb] text-[#0f172a] antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
