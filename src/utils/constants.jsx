export const API_BASE =
  window.location.port === "3000"
    ? `http://${window.location.hostname}:8000`
    : window.location.origin;