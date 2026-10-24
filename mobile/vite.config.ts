import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, ".");
  const env = loadEnv(mode, envDir, "");

  return {
    envDir: path.resolve(__dirname, ".."),
    plugins: [react()],
    resolve: {
      alias: {
        "@/components/TestTimer": path.resolve(__dirname, "src/overrides/TestTimer.tsx"),
        "@/integrations/supabase/client": path.resolve(__dirname, "src/overrides/supabaseClient.ts"),
        "@/lib/pdfGenerator": path.resolve(__dirname, "src/overrides/pdfGenerator.ts"),
        "@": path.resolve(__dirname, "../src"),
      },
      dedupe: ["react", "react-dom", "@supabase/supabase-js", "@tanstack/react-query", "react-router-dom"],
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      fs: {
        allow: [path.resolve(__dirname, "..")],
      },
    },
    define: {
      __APP_ENV__: JSON.stringify(env),
    },
    build: {
      target: "chrome90",
      cssCodeSplit: true,
      sourcemap: false,
      minify: "esbuild",
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("react-dom") || id.includes("react-router-dom") || id.includes("/react/")) {
                return "vendor-react";
              }
              if (id.includes("@supabase")) {
                return "vendor-supabase";
              }
              if (id.includes("lucide-react")) {
                return "vendor-icons";
              }
              if (id.includes("recharts")) {
                return "vendor-charts";
              }
              if (id.includes("jspdf") || id.includes("html2canvas")) {
                return "vendor-pdf";
              }
            }
          },
        },
      },
    },
  };
});
