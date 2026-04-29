import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI PR Reviewer",
  description: "Context-aware PR review for Azure DevOps",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
