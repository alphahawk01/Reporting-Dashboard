import fs from "fs";
import path from "path";

export async function GET() {
  const filePath = path.join(
    process.cwd(),
    "reporting-sync",
    "data",
    "report.json"
  );

  const data = fs.readFileSync(filePath, "utf8");

  return Response.json(JSON.parse(data));
}