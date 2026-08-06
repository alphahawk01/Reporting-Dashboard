export interface TTGame {
  Week: string;
  Date: string;
  Competition: string;
  Round: string;
  home_team: string;
  away_team: string;
  home_allocated: string | null;
  away_allocated: string | null;
  expected_day: string | null;
}