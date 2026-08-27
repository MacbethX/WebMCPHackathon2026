import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Toolsmith",
  description: "Make a website agent-ready, together.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
