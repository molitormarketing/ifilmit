import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-dm-serif" });

export const metadata = {
  title: "FilmIt — Content Creator Hub",
  description: "Pick an idea, film it, upload it.",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-in"
      afterSignInUrl="/"
      afterSignUpUrl="/"
    >
      <html lang="en">
        <body className={`${dmSans.variable} ${dmSerif.variable}`}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
