export const API_BASE =
  window.location.hostname === "localhost" && window.location.port === "3000"
    ? "http://localhost:8000"
    : window.location.origin;