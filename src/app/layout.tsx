import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "School Council Voting System",
  description:
    "A secure, official platform for student council elections. Vote for your student leaders.",
  keywords: ["school election", "student council", "voting", "poll"],
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
