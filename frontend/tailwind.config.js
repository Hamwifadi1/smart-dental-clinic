/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        clinic: {
          blue: "#0f4c81",
          light: "#e8f6ff",
          gold: "#d9a441",
        },
      },
    },
  },
  plugins: [],
};
