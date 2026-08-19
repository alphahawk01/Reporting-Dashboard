const API_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5165"
    : "https://downloads.premierdata-technology.com";

export async function assignFixture(
  fixtureId: number,
  analystId: number,
  location: "Home" | "Office",
  scheduledDate?: string
) {

  const response =
    await fetch(
      `${API_URL}/api/fixtures/${fixtureId}/assign`,
      {
        method: "PUT",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          analystId,
          location,
          ...(scheduledDate
            ? { scheduledDate }
            : {}),
        }),
      }
    );


  if (!response.ok) {

    const errorText =
      await response.text();

    console.error(
      "Assign fixture API error:",
      response.status,
      errorText
    );

    throw new Error(
      errorText ||
      "Failed assigning fixture"
    );

  }


  return response.json();

}