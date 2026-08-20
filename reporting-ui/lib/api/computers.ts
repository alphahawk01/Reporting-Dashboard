import { API_URL } from "./config";

export type Computer = {
    id: number;
    computerName: string;

    // Raw column on the Computer record. Only ever set via the unused
    // PUT /api/computers/{id}/location endpoint, so it is almost always
    // stale ("Unassigned"). Prefer assignmentLocation below.
    workLocation: string;

    // Computed by the API from the actual analyst <-> computer
    // relationship (Office if there is an active AnalystComputerAssignment,
    // Home if some analyst's HomeComputerId points at this machine).
    // This is the value Analyst Management effectively shows, and the
    // one that reflects reality.
    assignmentLocation: string | null;

    apiKey?: string;
    lastSeen: string;
    enabled: boolean;
    currentJobId: number | null;
    currentJobStarted: string | null;
    assignedFixtures: number;
    analystName: string | null;
    status: string;
};

export async function getComputers(): Promise<Computer[]> {

    const response = await fetch(
        `${API_URL}/api/computers`,
        {
            cache: "no-store",
        }
    );

    if (!response.ok) {
        throw new Error(
            `Failed loading computers (${response.status})`
        );
    }

    return response.json();
}

export async function registerComputer(
    computerName: string
) {

    const response = await fetch(
        `${API_URL}/api/computers/register`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                computerName,
            }),
        }
    );

    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `Failed registering computer (${response.status}): ${errorText}`
        );
    }

    return response.json();
}

export async function deleteComputer(
    id: number
) {

    const response = await fetch(
        `${API_URL}/api/computers/${id}`,
        {
            method: "DELETE",
        }
    );

    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `Failed deleting computer (${response.status}): ${errorText}`
        );
    }

    return true;
}