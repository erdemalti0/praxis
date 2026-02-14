/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#000000",
          secondary: "#0a0a0a",
          tertiary: "#141414",
          hover: "#1e1e1e",
        },
        border: {
          primary: "#1e1e1e",
          secondary: "#141414",
        },
        text: {
          primary: "#e0e0e0",
          secondary: "#787878",
          tertiary: "#525252",
        },
        accent: {
          green: "#4ade80",
          yellow: "#facc15",
          red: "#f87171",
          blue: "#a0a0a0",
          purple: "#a78bfa",
        },
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        md: "12px",
        lg: "16px",
        xl: "20px",
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "SF Mono",
          "Monaco",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
