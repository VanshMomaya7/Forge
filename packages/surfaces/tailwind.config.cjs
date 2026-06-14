/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  safelist: [
    "grid",
    "flex",
    "hidden",
    "min-h-screen",
    "max-w-7xl",
    "text-5xl",
    "text-6xl",
    "text-7xl",
    "py-16",
    "py-20",
    "px-4",
    "sm:px-6",
    "lg:px-8",
    "rounded-xl",
    "rounded-lg",
    "border",
    "border-zinc-200",
    "bg-white",
    "bg-zinc-50",
    "text-zinc-950",
    "text-zinc-600",
    "shadow-sm",
  ],
  theme: {
    extend: {
      colors: {
        forge: {
          ink: "#111a2d",
          text: "#1d2433",
          muted: "#707b8f",
          blue: "#2f67f5",
          line: "#6791ff",
          panel: "#f8fbff",
          green: "#2f9148",
        },
      },
      boxShadow: {
        panel: "0 14px 42px rgba(30, 59, 138, 0.08)",
        builder: "0 28px 80px rgba(48, 92, 201, 0.17)",
        config: "12px 16px 28px rgba(29, 48, 93, 0.16)",
      },
    },
  },
  plugins: [],
};
