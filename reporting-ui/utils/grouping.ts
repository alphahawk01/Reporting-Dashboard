import { format, parseISO, startOfWeek } from "date-fns";

export function getWeekKey(dateStr: string) {
  const date = parseISO(dateStr);
  const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  return format(weekStart, "yyyy-'W'II");
}