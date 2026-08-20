import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones/tablets on the LAN to reach the dev server's internal
  // endpoints (RSC/HMR) so the page hydrates and touch works over the IP.
  allowedDevOrigins: ["192.168.86.79", "192.168.86.*"],
};

export default nextConfig;
