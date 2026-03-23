// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
var __electron_vite_injected_import_meta_url = "file:///C:/Users/rylan/Projects/null-platform/packages/desktop/electron.vite.config.ts";
var __dirname = dirname(fileURLToPath(__electron_vite_injected_import_meta_url));
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "electron/main.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "electron/preload.ts")
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: resolve(__dirname, "src"),
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/index.html")
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
