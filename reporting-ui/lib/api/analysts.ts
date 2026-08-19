const API_URL =
    process.env.NODE_ENV === "development"
        ? "http://localhost:5165"
        : "https://downloads.premierdata-technology.com";


export interface AutoDownloadAnalyst {
    id: number;
    name: string;

    homeComputer: {
        id: number;
        computerName: string;
    } | null;

    officeComputer: {
        id: number;
        computerName: string;
    } | null;
}


export interface Analyst {
    id: number;
    name: string;
    email?: string | null;

    homeComputer: {
        id: number;
        computerName: string;
    } | null;

    officeComputer: {
        id: number;
        computerName: string;
    } | null;
}


export async function getAutoDownloadAnalysts(): Promise<
    AutoDownloadAnalyst[]
> {

    const res = await fetch(
        `${API_URL}/api/analysts`,
        {
            cache: "no-store",
        }
    );

    if (!res.ok) {
        throw new Error(
            "Failed loading AutoDownload analysts"
        );
    }

    return res.json();
}


export async function getAnalysts(): Promise<
    Analyst[]
> {

    const res = await fetch(
        `${API_URL}/api/analysts`,
        {
            cache: "no-store",
        }
    );

    if (!res.ok) {
        throw new Error(
            "Failed loading analysts"
        );
    }

    return res.json();
}


export async function deleteAnalyst(
    id: number
) {

    const res = await fetch(
        `${API_URL}/api/analysts/${id}`,
        {
            method: "DELETE",
        }
    );

    if (!res.ok) {

        const errorText =
            await res.text();

        throw new Error(
            `Failed deleting analyst (${res.status}): ${errorText}`
        );

    }

    return true;
}
export async function updateHomeComputer(
    analystId: number,
    computerId: number | null,
    force = false
) {

    const id = computerId ?? 0;

    const res = await fetch(
        `${API_URL}/api/analysts/${analystId}/home-computer/${id}?force=${force}`,
        {
            method: "PUT",
        }
    );

    if (!res.ok) {

        const errorText =
            await res.text();

        let errorData: any;

        try {
            errorData =
                JSON.parse(errorText);
        }
        catch {
            errorData = {
                message:
                    "Failed to update Home Computer",
            };
        }

        const error =
            new Error(
                errorData.message ||
                "Failed to update Home Computer"
            );

        Object.assign(
            error,
            errorData
        );

        throw error;
    }

    return res.json().catch(() => null);
}


export async function updateOfficeComputer(
    analystId: number,
    computerId: number | null,
    force = false
) {

    const id = computerId ?? 0;

    const res = await fetch(
        `${API_URL}/api/analysts/${analystId}/office-computer/${id}?force=${force}`,
        {
            method: "PUT",
        }
    );

    if (!res.ok) {

        const errorText =
            await res.text();

        let errorData: any;

        try {
            errorData =
                JSON.parse(errorText);
        }
        catch {
            errorData = {
                message:
                    "Failed to update Office Computer",
            };
        }

        const error =
            new Error(
                errorData.message ||
                "Failed to update Office Computer"
            );

        Object.assign(
            error,
            errorData
        );

        throw error;
    }

    return res.json().catch(() => null);
}