export const ratingColor = (rating?: string) => {
  switch (rating) {
    case "Elite":
      return "#3b82f6";
    case "Above Average":
      return "#22c55e";
    case "Average":
      return "#f59e0b";
    case "Below Average":
      return "#ef4444";
    default:
      return "rgba(255,255,255,0.2)";
  }
};