type Allocation = {
  analyst: string;
  weight: number;
  location: "AUS" | "PHL" | "MIXED";
};

// simple rule (replace later if you have a mapping table)
function inferLocation(analyst: string): Allocation["location"] {
  const n = (analyst || "").toLowerCase();

  if (n.includes("aus")) return "AUS";
  if (n.includes("phl") || n.includes("phil")) return "PHL";

  return "MIXED";
}

export function getTTAllocations({
  home_allocated,
  away_allocated,
}: {
  home_allocated: string;
  away_allocated: string;
}): Allocation[] {
  const result: Allocation[] = [];

  if (home_allocated) {
    result.push({
      analyst: home_allocated,
      weight: 0.5,
      location: inferLocation(home_allocated),
    });
  }

  if (away_allocated) {
    result.push({
      analyst: away_allocated,
      weight: 0.5,
      location: inferLocation(away_allocated),
    });
  }

  return result;
}