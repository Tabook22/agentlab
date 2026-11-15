import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,fileURLToPath(new URL('.',import.meta.url)),'AGENT_LAB_');
  return { plugins: [react(), tailwindcss()], server: { proxy: { '/api': env.AGENT_LAB_API_TARGET || 'http://127.0.0.1:8010' } }, build: { rollupOptions: { output: { manualChunks: { workflow: ['@xyflow/react'], charts: ['recharts'], motion: ['motion/react'] } } } } };
});
