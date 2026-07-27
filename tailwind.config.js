import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  // The app uses `animate-in fade-in / zoom-in-95 / slide-in-from-*` in ~37 places, but
  // the plugin that defines those utilities was never registered — so every one of them
  // was a dead class and none of those entry animations ever ran. Registering it also
  // gives us a CSS-driven way to animate modals, which (unlike AnimatePresence) cannot
  // leave an overlay stuck on screen when a frame loop stalls.
  plugins: [animate],
};
