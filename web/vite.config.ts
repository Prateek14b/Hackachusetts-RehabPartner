import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ../shared holds JSON shared with the API (MediaPipe landmark names, exercise library)
  server: { fs: { allow: ['..'] } },
})
