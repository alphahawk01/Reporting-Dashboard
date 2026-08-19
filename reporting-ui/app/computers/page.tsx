"use client";

import {
    useEffect,
    useState,
} from "react";
import Link from "next/link";

import {
    getComputers,
    registerComputer,
    deleteComputer,
    type Computer,
} from "@/lib/api/computers";
import { useCallback } from "react";
import { getHubConnection } from "@/lib/signalr";
import { HubConnectionState } from "@microsoft/signalr";

export default function ComputersPage() {

    const [computers, setComputers] =
        useState<Computer[]>([]);

    const [name, setName] =
        useState("");

    const [loading, setLoading] =
        useState(true);

    const [lastRefresh, setLastRefresh] =
        useState<Date | null>(null);

    const [sortField, setSortField] =
        useState("name");

    const [sortDirection, setSortDirection] =
        useState<"asc" | "desc">("asc");


    const load = useCallback(async () => {

        try {

            const data =
                await getComputers();

            setComputers(
                Array.isArray(data)
                    ? data
                    : []
            );

            setLastRefresh(
                new Date()
            );

        }
        catch (err) {

            console.error(
                "Failed loading computers:",
                err
            );

        }
        finally {

            setLoading(false);

        }

    }, []);


    useEffect(() => {

        load();

        const hubConnection =
            getHubConnection();

        const handleRefresh =
            async () => {

                console.log(
                    "Refreshing computers after assignment change"
                );

                await load();

            };


        hubConnection.off(
            "RefreshOperations",
            handleRefresh
        );

        hubConnection.on(
            "RefreshOperations",
            handleRefresh
        );


        const startSignalR =
            async () => {

                try {

                    if (
                        hubConnection.state ===
                        HubConnectionState.Disconnected
                    ) {

                        await hubConnection.start();

                        console.log(
                            "Computers SignalR connected"
                        );

                    }

                }
                catch (error) {

                    console.error(
                        "Computers SignalR connection failed:",
                        error
                    );

                }

            };


        startSignalR();


        return () => {

            hubConnection.off(
                "RefreshOperations",
                handleRefresh
            );

        };

    }, [load]);


    function getLastSeenText(
        date: string
    ) {

        if (!date)
            return "Never";


        const seconds =
            Math.floor(
                (
                    Date.now() -
                    new Date(date).getTime()
                ) / 1000
            );


        if (seconds < 60)
            return `${seconds} seconds ago`;


        const minutes =
            Math.floor(
                seconds / 60
            );


        if (minutes < 60)
            return `${minutes} minutes ago`;


        const hours =
            Math.floor(
                minutes / 60
            );


        return `${hours} hours ago`;

    }


    function sortBy(
        field: string
    ) {

        if (
            sortField === field
        ) {

            setSortDirection(
                current =>
                    current === "asc"
                        ? "desc"
                        : "asc"
            );

        }
        else {

            setSortField(field);

            setSortDirection("asc");

        }

    }


    function SortArrow({
        field,
    }: {
        field: string;
    }) {

        if (
            sortField !== field
        ) {
            return null;
        }

        return (
            sortDirection === "asc"
                ? " ↑"
                : " ↓"
        );

    }


    async function addComputer() {

        if (!name.trim())
            return;


        try {

            await registerComputer(
                name.trim()
            );

            setName("");

            await load();

        }
        catch (err) {

            console.error(
                "Failed registering computer:",
                err
            );

            alert(
                "Failed registering computer"
            );

        }

    }


    async function removeComputer(
        id: number
    ) {

        if (
            !confirm(
                "Delete this computer?"
            )
        ) {
            return;
        }


        try {

            await deleteComputer(id);

            await load();

        }
        catch (err) {

            console.error(
                "Failed deleting computer:",
                err
            );

            alert(
                "Delete failed"
            );

        }

    }


    const sortedComputers =
        [...computers].sort(
            (a, b) => {

                let valueA:
                    string | number;

                let valueB:
                    string | number;


                switch (
                sortField
                ) {

                    case "id":

                        valueA = a.id;
                        valueB = b.id;

                        break;


                    case "name":

                        valueA =
                            a.computerName;

                        valueB =
                            b.computerName;

                        break;


                    case "status":

                        valueA =
                            a.status;

                        valueB =
                            b.status;

                        break;


                    case "lastSeen":

                        valueA =
                            a.lastSeen
                                ? new Date(
                                    a.lastSeen
                                ).getTime()
                                : 0;

                        valueB =
                            b.lastSeen
                                ? new Date(
                                    b.lastSeen
                                ).getTime()
                                : 0;

                        break;

                    case "analyst":
                        valueA = a.analystName ?? "";
                        valueB = b.analystName ?? "";
                        break;

                    case "location":
                        valueA = a.workLocation ?? "";
                        valueB = b.workLocation ?? "";
                        break;

                    case "fixtures":

                        valueA =
                            a.assignedFixtures ??
                            0;

                        valueB =
                            b.assignedFixtures ??
                            0;

                        break;


                    default:

                        return 0;

                }


                if (
                    valueA < valueB
                ) {

                    return sortDirection ===
                        "asc"
                        ? -1
                        : 1;

                }


                if (
                    valueA > valueB
                ) {

                    return sortDirection ===
                        "asc"
                        ? 1
                        : -1;

                }


                return 0;

            }
        );


    if (loading) {

        return (
            <div className="p-8">
                Loading computers...
            </div>
        );

    }


    return (

        <div className="min-h-screen bg-slate-50 p-8">

            <div className="mb-6 flex items-center justify-between">

                <div>

                    <h1 className="text-3xl font-bold text-slate-900">
                        Computers
                    </h1>

                    {lastRefresh && (

                        <div className="mt-1 text-sm text-slate-500">
                            Updated{" "}
                            {lastRefresh.toLocaleTimeString()}
                        </div>

                    )}

                </div>


                <Link
                    href="/operations"
                    className="
                        rounded-lg
                        bg-slate-900
                        px-4
                        py-2
                        text-sm
                        font-semibold
                        text-white
                        transition
                        hover:bg-slate-800
                    "
                >
                    Live Board →
                </Link>

            </div>


            <div className="
                mb-6
                rounded-xl
                border
                border-slate-200
                bg-white
                p-5
                shadow-sm
            ">

                <div className="flex gap-3">

                    <input
                        value={name}
                        onChange={e =>
                            setName(
                                e.target.value
                            )
                        }
                        onKeyDown={e => {

                            if (
                                e.key === "Enter"
                            ) {
                                addComputer();
                            }

                        }}
                        placeholder="Computer name"
                        className="
                            w-80
                            rounded-lg
                            border
                            border-slate-300
                            px-3
                            py-2
                            text-sm
                            outline-none
                            focus:border-sky-500
                            focus:ring-2
                            focus:ring-sky-100
                        "
                    />


                    <button
                        onClick={addComputer}
                        className="
                            rounded-lg
                            bg-sky-600
                            px-5
                            py-2
                            text-sm
                            font-semibold
                            text-white
                            transition
                            hover:bg-sky-700
                        "
                    >
                        Register Computer
                    </button>

                </div>

            </div>


            <div className="
                overflow-hidden
                rounded-xl
                border
                border-slate-200
                bg-white
                shadow-sm
            ">

                <table className="w-full text-left">

                    <thead className="
        bg-slate-900
        text-white
    ">

                        <tr>

                            {[
                                ["id", "ID"],
                                ["name", "Name"],
                                ["analyst", "Analyst"],
                                ["location", "Location"],
                                ["status", "Status"],
                                ["lastSeen", "Last Seen"],
                                ["fixtures", "Fixtures"],
                            ].map(
                                ([field, label]) => (

                                    <th
                                        key={field}
                                        onClick={() =>
                                            sortBy(field)
                                        }
                                        className="
                            cursor-pointer
                            p-4
                            text-sm
                            font-semibold
                            hover:bg-slate-800
                        "
                                    >
                                        {label}
                                        <SortArrow
                                            field={field}
                                        />
                                    </th>

                                )
                            )}

                            <th className="
                p-4
                text-sm
                font-semibold
            ">
                                Actions
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        {sortedComputers.map(
                            computer => (

                                <tr
                                    key={
                                        computer.id
                                    }
                                    className="
                        border-b
                        border-slate-100
                        last:border-0
                        hover:bg-slate-50
                    "
                                >

                                    <td className="
                        p-4
                        text-sm
                        text-slate-500
                    ">
                                        {computer.id}
                                    </td>


                                    <td className="
                        p-4
                        text-sm
                        font-semibold
                        text-slate-900
                    ">
                                        {computer.computerName}
                                    </td>


                                    <td className="
                        p-4
                        text-sm
                        font-medium
                        text-slate-700
                    ">
                                        {computer.analystName ?? "Unassigned"}
                                    </td>


                                    <td className="
                        p-4
                        text-sm
                        text-slate-600
                    ">
                                        {computer.workLocation || "Unassigned"}
                                    </td>


                                    <td className="p-4">

                                        {
                                            computer.status ===
                                                "Online"
                                                ? (

                                                    <div>

                                                        <div className="
                                            font-medium
                                            text-green-600
                                        ">
                                                            🟢 Online
                                                        </div>

                                                        <div className="
                                            text-xs
                                            text-slate-500
                                        ">
                                                            Last seen{" "}
                                                            {
                                                                getLastSeenText(
                                                                    computer.lastSeen
                                                                )
                                                            }
                                                        </div>

                                                    </div>

                                                )
                                                : (

                                                    <div>

                                                        <div className="
                                            font-medium
                                            text-red-600
                                        ">
                                                            🔴 Offline
                                                        </div>

                                                        <div className="
                                            text-xs
                                            text-slate-500
                                        ">
                                                            Last seen{" "}
                                                            {
                                                                getLastSeenText(
                                                                    computer.lastSeen
                                                                )
                                                            }
                                                        </div>

                                                    </div>

                                                )
                                        }

                                    </td>


                                    <td className="
                        p-4
                        text-sm
                        text-slate-600
                    ">

                                        {
                                            computer.lastSeen
                                                ? new Date(
                                                    computer.lastSeen
                                                ).toLocaleString()
                                                : "-"
                                        }

                                    </td>


                                    <td className="
                        p-4
                        text-sm
                        text-slate-600
                    ">

                                        {
                                            computer.assignedFixtures ??
                                            0
                                        }

                                    </td>


                                    <td className="p-4">

                                        <button
                                            onClick={() =>
                                                removeComputer(
                                                    computer.id
                                                )
                                            }
                                            className="
                                rounded-lg
                                bg-red-600
                                px-3
                                py-1.5
                                text-sm
                                font-semibold
                                text-white
                                transition
                                hover:bg-red-700
                            "
                                        >
                                            Delete
                                        </button>

                                    </td>

                                </tr>

                            )
                        )}

                    </tbody>

                </table>

            </div>

        </div>

    );

}