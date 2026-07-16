import { AnalystMetrics } from "../buildAnalystMetrics";
import { ratingBands } from "./ratingBands";

function getLowerScore(
  value: number,
  bands: { max?: number; rating: number }[]
): number {
  for (const band of bands) {
    if (value <= (band.max ?? Infinity)) {
      return band.rating;
    }
  }

  return 0;
}

function getHigherScore(
  value: number,
  bands: { min?: number; rating: number }[]
): number {
  for (const band of bands) {
    if (value >= (band.min ?? 0)) {
      return band.rating;
    }
  }

  return 0;
}

export function buildRatings(
  analyst: AnalystMetrics
) {
  const consistencyValue = analyst.avgGamesPerWeek;

  const consistency = getHigherScore(
    consistencyValue,
    ratingBands.consistency
  );

  const ratings = {
    speed: getLowerScore(
      analyst.avgHoursPerGame,
      ratingBands.speed
    ),

    efficiency: getLowerScore(
      analyst.avgCostPerGame,
      ratingBands.efficiency
    ),

    experience: getHigherScore(
      analyst.totalGames,
      ratingBands.experience
    ),

    workRate: getHigherScore(
      analyst.avgHoursPerWeek,
      ratingBands.workRate
    ),

    consistency,

    versatility: getHigherScore(
      Object.keys(analyst.competitions).length,
      ratingBands.versatility
    ),

    knowledge: getHigherScore(
      Object.keys(analyst.teams).length,
      ratingBands.knowledge
    ),
  };

  console.log("========== BUILD RATINGS ==========");
  console.log("Analyst:", analyst.name);

  console.log({
    avgHoursPerGame: analyst.avgHoursPerGame,
    avgCostPerGame: analyst.avgCostPerGame,
    avgHoursPerWeek: analyst.avgHoursPerWeek,
    avgGamesPerWeek: analyst.avgGamesPerWeek,

    speedRating: ratings.speed,
    efficiencyRating: ratings.efficiency,
    experienceRating: ratings.experience,
    workRateRating: ratings.workRate,
    consistencyRating: ratings.consistency,
    versatilityRating: ratings.versatility,
    knowledgeRating: ratings.knowledge,
  });

  console.log("Consistency Value:", consistencyValue);
  console.log("Consistency Bands:", ratingBands.consistency);

  console.log(
    "Is NaN?",
    Number.isNaN(consistencyValue)
  );

  console.log(
    "Is Finite?",
    Number.isFinite(consistencyValue)
  );

  console.log("==============================");

  return ratings;
}