import tailwindcss from "@tailwindcss/vite";
import robotsTxt from "astro-robots-txt";
import { defineConfig } from "astro/config";
import { SITE_URL } from "./src/data/config";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { unified } from "@astrojs/markdown-remark";

export default defineConfig({
  integrations: [
    robotsTxt({
      sitemap: `${SITE_URL.replace(/\/$/, "")}/sitemap.xml`,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  site: SITE_URL,
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
    syntaxHighlight: "shiki",
    shikiConfig: {
      theme: "nord",
      wrap: false,
    },
  },
});