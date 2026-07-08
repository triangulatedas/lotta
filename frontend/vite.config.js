import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Listen on all interfaces so the app is reachable from other LAN devices
  // (e.g. a phone using the camera / image-upload feature), not just
  // localhost. Vite prints the reachable Network: URL on start.
  server: { host: true },
})
