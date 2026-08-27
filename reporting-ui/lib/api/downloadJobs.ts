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

/**
 * Requeues download jobs that previously failed so the desktop agent
 * retries them. The agent only ever polls for jobs whose status is
 * "Queued", so a failed job stays stuck until it's reset — this flips
 * it back to Queued and clears the old error/progress on the server.
 *
 * Pass a jobId to retry just one failed job, or omit it to retry every
 * failed job. Returns how many jobs were requeued and their ids.
 */
export async function retryFailedDownloadJobs(
    fixtureId?: number
): Promise<{
    requeued: number;
    fixturesReset: number;
    jobsRequeued: number;
    fixtureIds: number[];
    jobIds: number[];
}> {

    const url =
        fixtureId != null
            ? `${API_URL}/api/downloadjobs/retry-failed?id=${fixtureId}`
            : `${API_URL}/api/downloadjobs/retry-failed`;

    const res = await fetch(url, { method: "POST" });

    if (!res.ok) {
        const errorText = await res.text();

        console.error(
            "Retry failed download jobs failed:",
            res.status,
            errorText
        );

        throw new Error(
            `Failed retrying download jobs (${res.status}): ${errorText}`
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