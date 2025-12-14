// tailwind.config.js
export default {
  // 🔥 обов’язково: активує класовий режим теми, щоб працювало dark:
  darkMode: "class",

  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      colors: {
        // базові кольори, які зручно використовувати у варіантах тем
        bg: "var(--bg)",
        fg: "var(--fg)",
        primary: "var(--color-primary)",
        muted: "var(--muted)",
      },

      boxShadow: {
        glow: "0 0 20px rgba(255, 255, 255, 0.6)", // універсальне біле світіння
        "glow-blue": "0 0 20px rgba(0, 191, 255, 0.7)",
        "glow-green": "0 0 20px rgba(0, 255, 127, 0.7)",
        "glow-pink": "0 0 20px rgba(255, 105, 180, 0.7)",
        "glow-purple": "0 0 20px rgba(186, 85, 211, 0.7)",
      },

      transitionTimingFunction: {
        "in-expo": "cubic-bezier(0.95, 0.05, 0.795, 0.035)",
        "out-expo": "cubic-bezier(0.19, 1, 0.22, 1)",
      },
    },
  },

  plugins: [],
};
