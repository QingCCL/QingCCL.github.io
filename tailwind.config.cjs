/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme")
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,mjs}"],
  darkMode: "class", // allows toggling dark mode manually
  theme: {
    extend: {
      fontSize:{
        'base': ['1.0625rem', { // 1rem 通常等于 16px
          lineHeight: '1.75',
        }],
      },
      fontFamily: {
        sans: [ "sans-serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
}
