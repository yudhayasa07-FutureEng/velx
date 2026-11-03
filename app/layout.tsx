import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VELX — Think. Build. Execute.",
  description: "The AI-powered workspace that turns ideas into completed projects.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
