import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Revisit — evidence before conviction", description: "An evidence-backed second look at the companies you're tracking. A fictional investment research demo." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
