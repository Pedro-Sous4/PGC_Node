/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      colors: {
        'dark-purple': '#0C1445',
        'medium-purple': '#471E54',
        'label-bg': '#08081B',
        'primary-blue': '#6366EE',
        'primary-blue-light': '#9192F3',
      },
      boxShadow: {
        blue: '0 0 4px 2px #6366EE',
      },
      animation: {
        'spin-fast': 'spin 0.6s linear infinite',
        'float': 'float 3s ease-in-out infinite',
        'float-slow': 'float 4.5s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%': { transform: 'translatey(0px)', },
          '50%': { transform: 'translatey(-30px)' },
          '100%': { transform: 'translatey(0px)' },
        },
      },
    },
  },
  plugins: [],
};
