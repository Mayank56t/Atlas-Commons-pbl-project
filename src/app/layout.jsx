import "./globals.css";

export const metadata = {
  title: "Atlas Commons — Research Collaboration Platform",
  description:
    "A research collaboration platform where professors publish announcements, students join projects, and teams track tasks together.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
