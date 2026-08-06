export interface AnalystRatings {
  speed: number;
  efficiency: number;
  workRate: number;
  experience: number;
  consistency: number;
  versatility: number;
  knowledge: number;
  overall: number;
}

export interface TeamMetric {
  count: number;
  league: string;
}
export interface AnalystMetrics {
  key: string;
  name: string;
  team: "AUS" | "PHL";

  totalHours: number;
  totalCost: number;
  totalGames: number;

  avgHoursPerWeek: number;
  avgGamesPerWeek: number;

  avgHoursPerGame: number;
  avgCostPerGame: number;
  costPerHour: number;

  areas: Record<string, number>;
  competitions: Record<string, number>;
  teams: Record<string, TeamMetric>;

  ratings: AnalystRatings;

  grade: string;

  rank: number;
  percentile: number;
  totalAnalysts: number;

strengths: string[];
weaknesses: string[];

availabilityDays: string[];
}