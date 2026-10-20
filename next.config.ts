import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Route navigations run inside React's <ViewTransition> integration, so the
  // browser View Transitions API animates page changes (see
  // components/motion/PageTransition.tsx and the ::view-transition rules in
  // app/globals.css). Browsers without the API just swap pages instantly.
  experimental: {
    viewTransition: true,
  },

  // Allow phones/tablets on the LAN to reach the dev server's internal
  // endpoints (RSC/HMR) so the page hydrates and touch works over the IP.
  allowedDevOrigins: ["192.168.86.*", "192.168.2.*"],

  // The legal pages moved to shorter slugs; keep the old URLs alive (indexed
  // links, and the privacy/terms URLs configured in the Google OAuth consent
  // screen) with permanent redirects.
  async redirects() {
    return [
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
      { source: "/terms-of-service", destination: "/terms", permanent: true },
    ];
  },
};

export default nextConfig;
