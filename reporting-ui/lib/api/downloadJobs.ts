const API_URL =
    process.env.NODE_ENV === "development"
        ? "http://localhost:5165"
        : "https://downloads.premierdata-technology.com";

export async function createDownloadJob(job: {
    gameKey: string;
    videoUrl: string;
    year: string;
    leagueName: string;
    analystId: number;
    computerId: number;
    assignmentLocation: "Home" | "Office";
    fileSizeBytes: number | null;
}) {

    const res = await fetch(
        `${API_URL}/api/downloadjobs`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(job),
        }
    );

    if (!res.ok) {
        const errorText = await res.text();

        console.error(
            "Create download job failed:",
            res.status,
            errorText
        );

        throw new Error(
            `Failed creating download job (${res.status}): ${errorText}`
        );
    }

    return res.json();
}

export type DownloadJob = {
    id: number;
    gameKey: string;
    videoUrl: string;
    year: string;
    leagueName: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    computerId: number;
    analystId: number;
    assignmentLocation: "Home" | "Office";
    fileSizeBytes: number | null;
    downloadedBytes: number;
    downloadPercent: number;
    downloadSpeedMbps: number;
    downloadedFilePath: string | null;
    downloadError: string | null;
};

export async function getDownloadJobs(): Promise<DownloadJob[]> {
    const res = await fetch(
        `${API_URL}/api/downloadjobs`,
        {
            cache: "no-store",
        }
    );

    if (!res.ok) {
        const errorText = await res.text();

        console.error(
            "Create download job failed:",
            res.status,
            errorText
        );

        throw new Error(
            `Failed creating download job (${res.status}): ${errorText}`
        );
    }

    return res.json();
}