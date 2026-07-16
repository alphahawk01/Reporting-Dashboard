export function getAnalystImage(name: string): string {
  return `/analysts/${name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")}.jpg`;
}

export function getAnalystInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}