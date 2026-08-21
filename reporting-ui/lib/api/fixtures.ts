const API_URL =
    process.env.NODE_ENV === "development"
        ? "http://localhost:5165"
        : "https://downloads.premierdata-technology.com";


export async function getFixtures() {

    const response =
        await fetch(
            `${API_URL}/api/fixtures`,
            {
                cache: "no-store",
            }
        );


    if (!response.ok) {

        throw new Error(
            "Failed loading fixtures"
        );

    }


    const data =
        await response.json();


    if (!Array.isArray(data)) {

        return [];

    }


    return data.map(
        (fixture: any) => ({

            id:
                Number(
                    fixture.id
                ),

            Week:
                fixture.week ??
                "",

            Date:
                fixture.date ??
                "",

            Competition:
                fixture.leagueName ??
                "",

            Round:
                fixture.round ??
                "",

            home_team:
                fixture.homeTeam ??
                "",

            away_team:
                fixture.awayTeam ??
                "",

            home_allocated:
                fixture.homeAllocated ??
                null,

            away_allocated:
                fixture.awayAllocated ??
                null,

            expected_day:
                fixture.expectedDay ??
                null,

            game_key:
                fixture.gameKey ??
                fixture.fixtureId ??
                "",

            videoURL:
                fixture.videoUrl ??
                fixture.videoURL ??
                "",

            status:
                fixture.status ??
                "Pending",

            downloadPercent:
                fixture.downloadPercent ??
                null,

            downloadSpeedMbps:
                fixture.downloadSpeedMbps ??
                null,

            fileSizeBytes:
                fixture.fileSizeBytes ??
                null,

            downloadCompletedAt:
                fixture.downloadCompletedAt ??
                null,

            assignments:
                Array.isArray(
                    fixture.assignments
                )
                    ? fixture.assignments
                    : [],

        })
    );

}


export async function checkFileSize(videoUrl: string): Promise<number | null> {

    try {
        const response = await fetch(
            `${API_URL}/api/fixtures/check-size?url=${encodeURIComponent(videoUrl)}`,
            { cache: "no-store" }
        );

        if (!response.ok) return null;

        const data = await response.json();

        return data.fileSizeBytes ?? null;
    } catch {
        return null;
    }
}


export async function syncGamesToApi(games: {
    gameKey?: string;
    date?: string;
    year?: string;
    leagueName?: string;
    round?: string;
    homeTeam?: string;
    awayTeam?: string;
    videoUrl?: string;
}[]): Promise<number> {

    try {
        const response = await fetch(
            `${API_URL}/api/fixtures/sync-games`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ games }),
                cache: "no-store",
            }
        );

        if (!response.ok) return 0;

        const data = await response.json();
        return data.synced ?? 0;
    } catch {
        return 0;
    }
}
