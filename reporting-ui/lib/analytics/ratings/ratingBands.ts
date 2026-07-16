export type RatingBand = {
  rating: number;
  min?: number;
  max?: number;
};

export const ratingWeights = {
  speed: 0.20,
  efficiency: 0.25,
  experience: 0.20,
  workRate: 0.025,
  versatility: 0.025,
  knowledge: 0.025,
  consistency: 0.225
};

export const ratingBands = {
  // Ave. Hours/Game - LOWER IS BETTER
  speed: [
    { max: 5.75, rating: 99 },
    { max: 6.00, rating: 95 },
    { max: 6.25, rating: 92 },
    { max: 6.50, rating: 89 },
    { max: 6.75, rating: 86 },
    { max: 7.00, rating: 83 },
    { max: 7.25, rating: 73 },
    { max: 7.50, rating: 70 },
    { max: 8.00, rating: 65 },
    { max: 8.50, rating: 60 },
    { max: 9.00, rating: 50 },
    { max: Infinity, rating: 40 },
  ] as RatingBand[],

  // AVE. Cost/Game - LOWER IS BETTER ($ / GAME)
  efficiency: [
    { max: 180, rating: 99 },
    { max: 190, rating: 95 },
    { max: 200, rating: 90 },
    { max: 210, rating: 80 },
    { max: 220, rating: 70 },
    { max: 240, rating: 60 },
    { max: 260, rating: 50 },
    { max: 280, rating: 40 },
    { max: Infinity, rating: 30 },
  ] as RatingBand[],

  // Total Games - HIGHER IS BETTER
  experience: [
    { min: 80, rating: 99 },
    { min: 75, rating: 97 },
    { min: 70, rating: 94 },
    { min: 65, rating: 91 },
    { min: 60, rating: 87 },
    { min: 55, rating: 83 },
    { min: 50, rating: 80 },
    { min: 40, rating: 76 },
    { min: 35, rating: 72 },
    { min: 30, rating: 68 },
    { min: 25, rating: 64 },
    { min: 20, rating: 60 },
    { min: 15, rating: 55 },
    { min: 10, rating: 50 },  
    { min: 5,  rating: 45 },      
    { min: 0,  rating: 40 },

  ] as RatingBand[],

  // Ave. HOURS/Week - HIGHER IS BETTER
  workRate: [
    { min: 35, rating: 99 },
    { min: 30, rating: 90 },
    { min: 25, rating: 80 },
    { min: 20, rating: 70 },
    { min: 15, rating: 60 },
    { min: 10, rating: 50 },
    { min: 0, rating: 40 },
  ] as RatingBand[],

  // Unique Competitions - HIGHER IS BETTER
  versatility: [
    { min: 50, rating: 99 },
    { min: 40, rating: 90 },
    { min: 35, rating: 85 },
    { min: 30, rating: 80 },
    { min: 25, rating: 75 },
    { min: 20, rating: 65 },
    { min: 15, rating: 55 },
    { min: 10, rating: 45 },
    { min: 5,  rating: 30 },
    { min: 0,  rating: 20 },
  ] as RatingBand[],

  // Unique Teams - HIGHER IS BETTER
  knowledge: [
    { min: 100, rating: 99 },
    { min: 90, rating: 90 },
    { min: 80, rating: 80 },
    { min: 70, rating: 70 },
    { min: 60, rating: 60 },
    { min: 50, rating: 50 },
    { min: 40, rating: 40 },
    { min: 10, rating: 30 },
    { min: 0, rating: 20 },
  ] as RatingBand[],

  // Ave. Games/ week - HIGHER IS BETTER
  consistency: [
  { min: 4.0, rating: 99 },
  { min: 3.5, rating: 90 },
  { min: 3.0, rating: 80 },
  { min: 2.5, rating: 70 },
  { min: 2.0, rating: 60 },
  { min: 1.5, rating: 45 },
  { min: 1.0, rating: 30 },
] as RatingBand[],
};

export const overallGrades = [
  { min: 95, label: "G.O.A.T" },
  { min: 90, label: "Champion" },
  { min: 85, label: "Elite" },
  { min: 80, label: "Strong" },
  { min: 75, label: "Reliable" },
  { min: 60, label: "Developing" },
  { min: 0, label: "Rookie" },
];