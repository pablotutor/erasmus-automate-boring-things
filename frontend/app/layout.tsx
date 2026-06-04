import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Erasmus — Meal Planner",
  description: "Weekly meal planner for Erasmus students",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
