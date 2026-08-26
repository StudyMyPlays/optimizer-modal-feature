import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The only images here are the four platform marks in /public/platforms,
    // already sized to 16px in the mode picker. Optimizing them costs a
    // round trip through the image pipeline for no bytes saved, and it is
    // what lets an SVG (gemini-color.svg) go through `next/image` untouched.
    unoptimized: true,
  },
};

export default nextConfig;
