import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Cooking Mode's own display serif — scoped there via the `.cook-serif`
// utility in globals.css, kept separate from Fraunces/.font-display used
// everywhere else in the app.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "The Larder",
  description: "Your recipes, meal plan, and shopping list.",
};

// Pinch-zoom and horizontal scroll are more accident than feature on a
// kitchen tablet/phone — a stray double-tap or edge-swipe shouldn't ever
// leave the layout scaled or shifted sideways.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-stone-100">{children}</body>
    </html>
  );
}
