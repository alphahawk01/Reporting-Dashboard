import { API_URL } from "./config";

export type OperationsRow = {
  analystName: string;
  computerName: string;
  workLocation: string;
  league: string;
  currentGame: string;
  videoStatus: string;
  isOnline: boolean;
};

export async function getOperations(
  location: "Home" | "Office"
): Promise<OperationsRow[]> {

  const url =
    `${API_URL}/api/operations?location=${location}`;

  console.log("Fetching:", url);

  const response = await fetch(url, {
    cache: "no-store",
    mode: "cors",
  });

  console.log("Status:", response.status);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}