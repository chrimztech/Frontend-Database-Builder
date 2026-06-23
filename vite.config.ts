// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, "/");

            if (normalizedId.endsWith("/src/integrations/supabase/client.ts")) {
              return "supabase-client";
            }

            if (!normalizedId.includes("/node_modules/")) {
              return undefined;
            }

            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/scheduler/")
            ) {
              return "react-core";
            }

            if (normalizedId.includes("/node_modules/@tanstack/")) {
              return "tanstack-core";
            }

            if (normalizedId.includes("/node_modules/@supabase/")) {
              return "supabase-core";
            }

            if (normalizedId.includes("/node_modules/@radix-ui/")) {
              return "radix-ui";
            }

            if (normalizedId.includes("/node_modules/lucide-react/")) {
              return "icons";
            }

            if (normalizedId.includes("/node_modules/recharts/")) {
              return "charts-vendor";
            }

            if (
              normalizedId.includes("/node_modules/jspdf/") ||
              normalizedId.includes("/node_modules/qrcode/") ||
              normalizedId.includes("/node_modules/pdfjs-dist/") ||
              normalizedId.includes("/node_modules/html2canvas/")
            ) {
              return "pdf-vendor";
            }

            return "vendor";
          },
        },
      },
    },
  },
});
