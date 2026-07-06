import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary brand — Emerald green
        brand: {
  50:  '#e4fff5',
  100: '#b9f8dd',
  200: '#7be9bc',
  300: '#36d69b',
  400: '#12bd83',
  500: '#079b6b',  // primary
  600: '#047a55',
  700: '#035f44',
  800: '#024836',
  900: '#013326',
  950: '#001f18',
},
        // Navy — deep slate (used by landing components)
        navy: {
          50: '#f7faf9', 100: '#edf5f1', 200: '#d6e5df', 300: '#b6cbc4',
          400: '#8ba49c', 500: '#617c74', 600: '#455e57', 700: '#2b403a',
          800: '#132820', 900: '#071612', 950: '#020706',
        },
        // Ink — alias for navy (used by topology preview)
        ink: {
          50: '#f7faf9', 100: '#edf5f1', 200: '#d6e5df', 300: '#b6cbc4',
          400: '#8ba49c', 500: '#617c74', 600: '#455e57', 700: '#2b403a',
          800: '#132820', 900: '#071612', 950: '#020706',
        },
        // Accent — emerald alias (used by topology preview)
        accent: {
  50:  '#e4fff5',
  100: '#b9f8dd',
  200: '#7be9bc',
  300: '#36d69b',
  400: '#12bd83',
  500: '#079b6b',
  600: '#047a55',
  700: '#035f44',
  800: '#024836',
  900: '#013326',
  950: '#001f18',
},
        // Cream — warm off-white (used by LandingPage root)
        cream: {
          50: '#020706',  // mapped to dark product shell
          100: '#071612',
        },
        // Semantic colors (used by some components)
        danger: {
          50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
          400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
          800: '#991b1b', 900: '#7f1d1d',
        },
        warning: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
          400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309',
          800: '#92400e', 900: '#78350f',
        },
        success: {
  50:  '#e4fff5',
  100: '#b9f8dd',
  200: '#7be9bc',
  300: '#36d69b',
  400: '#12bd83',
  500: '#079b6b',
  600: '#047a55',
  700: '#035f44',
  800: '#024836',
  900: '#013326',
},
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0,0,0,0.12)',
        'soft-lg': '0 8px 24px rgba(0,0,0,0.18)',
        'glow-brand': '0 0 24px rgba(7,155,107,0.32)',
      },
      backgroundImage: {
        'grid-dark': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none' stroke='%2312bd83' stroke-opacity='0.045' stroke-width='1'/%3E%3C/svg%3E\")",
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'fade-in-down': 'fadeInDown 0.6s ease-out',
        'pulse-emerald': 'pulseEmerald 1.2s ease-in-out infinite',
        'blink': 'blink 1s steps(2, start) infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        fadeInUp: { '0%': { opacity: 0, transform: 'translateY(16px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        fadeInDown: { '0%': { opacity: 0, transform: 'translateY(-16px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        pulseEmerald: {
          '0%, 100%': { opacity: 1, transform: 'scaleY(1)' },
          '50%': { opacity: 0.4, transform: 'scaleY(0.85)' },
        },
        blink: { to: { visibility: 'hidden' } },
      },
    },
  },
  plugins: [typography],
};
