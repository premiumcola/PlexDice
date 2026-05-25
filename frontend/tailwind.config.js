/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // PlexDice orange. Overriding Tailwind's `amber` ramp lets the ported
        // Filmwürfel UI become orange-accented with zero class churn.
        amber: {
          100: '#fef0d7',
          200: '#fcdca3',
          300: '#f7c06a',
          400: '#f5a623',
          500: '#e08e15',
          600: '#c2760f',
          700: '#9c5e0c',
        },
        plex: '#f5a623',
      },
    },
  },
  plugins: [],
};
