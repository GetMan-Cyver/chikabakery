module.exports = {
  content: ["./index.html", "./script.js"],
  theme: {
    extend: {
      colors: {
        bakery: {
          50: "#FDFBF7",
          100: "#F7F2EA",
          200: "#EBDDC9",
          300: "#DCBF98",
          400: "#CDA268",
          500: "#B8823B",
          600: "#9B6425",
          700: "#7A4B1A",
          800: "#543110",
          900: "#341D09",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        serif: ["Playfair Display", "serif"],
      },
    },
  },
  plugins: [],
};
