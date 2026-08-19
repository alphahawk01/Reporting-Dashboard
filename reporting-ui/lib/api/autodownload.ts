const API_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5165"
    : "https://downloads.premierdata-technology.com";

export interface AutoDownloadFixture {
  id: number;
  fixtureId: string;
  gameKey: string;

  status: string;

  analyst: string | null;

  analystId: number | null;

  computer: string | null;

  assignmentLocation: string | null;

  downloadPercent: number | null;

  downloadSpeedMbps: number | null;

  fileSizeBytes: number | null;

  downloadCompletedAt: string | null;
}

export async function getAutoDownloadFixtures() {
  const res = await fetch(
    `${API_URL}/api/fixtures`,
    {
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error("Failed loading AutoDownload fixtures");
  }

  const data = await res.json();

  // API may return { value: [...], Count: N } or a direct array
  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.value)) {
    return data.value;
  }

  return [];
}