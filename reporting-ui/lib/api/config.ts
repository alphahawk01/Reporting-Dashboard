export const API_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5165"
    : "https://downloads.premierdata-technology.com";