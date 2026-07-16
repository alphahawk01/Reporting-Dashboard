import { overallGrades } from "./ratingBands";

type RatingsInput = {
  speed: number;
  efficiency: number;
  experience: number;
  workRate: number;
  consistency: number;
  versatility: number;
  knowledge: number;
};

export function buildOverall(
  ratings: RatingsInput,
  team: "AUS" | "PHL"
) {
  let overall = 0;

  if (team === "AUS") {
    overall = Math.round(
      ratings.speed * 0.25 +
      ratings.efficiency * 0.25 +
      ratings.experience * 0.15 +
      ratings.workRate * 0.05 +
      ratings.consistency * 0.20 +
      ratings.versatility * 0.05 +
      ratings.knowledge * 0.05
    );
  } else {
    overall = Math.round(
      ratings.experience * 0.40 +
      ratings.consistency * 0.35 +
      ratings.versatility * 0.10 +
      ratings.knowledge * 0.15
    );
  }

  const grade =
    overallGrades.find((g) => overall >= g.min)?.label ??
    "Learning";

  return {
    overall,
    grade,
  };
}