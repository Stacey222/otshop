import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description: "Authorized automation control plane foundation",
  title: "OTShop Control Plane",
};

interface RootLayoutProperties {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProperties) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
