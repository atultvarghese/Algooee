export const themes = {
  dark: {
    bg: "#060e17",
    card: "#07101a",
    card2: "#0a1520",
    input: "#060e17",
    border: "#1a2a3a",
    text: "#cde",
    text2: "#8899aa",
    text3: "#667788",
    success: "#00e5a0",
    glassBg: "#0a1520",
    glassBorder: "#1a2a3a",
    glassShadow: "none"
  },

  light: {
    bg: "#f5f7fb",
    card: "#ffffff",
    card2: "#ffffff",
    input: "#ffffff",
    border: "#dbe3ee",
    text: "#111827",
    text2: "#6b7280",
    text3: "#94a3b8",
    success: "#10b981",
    glassBg: "rgba(255,255,255,0.65)",
    glassBorder: "rgba(255,255,255,0.45)",
    glassShadow: "0 8px 32px rgba(31,38,135,0.12)"
  }
};

export function applyTheme(themeMode) {
  const currentTheme = themes[themeMode] || themes.dark;
  Object.keys(currentTheme).forEach((key) => {
    document.documentElement.style.setProperty(`--theme-${key}`, currentTheme[key]);
  });
}