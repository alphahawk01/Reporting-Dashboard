"use client";

import {
    useEffect,
    useState,
} from "react";
import Link from "next/link";

import {
    getComputers,
    deleteComputer,
    type Computer,
} from "@/lib/api/computers";

import {
    getAnalysts,
    updateHomeComputer,
    updateOfficeComputer,
    type Analyst,
} from "@/lib/api/analysts";

import { useCallback, useMemo } from "react";
import { getHubConnection } from "@/lib/signalr";
import { HubConnectionState } from "@microsoft/signalr";

import AllocateAnalystModal from "./AllocateAnalystModal";
import ReassignComputerModal from "../analyst-management/ReassignComputerModal";

type AllocationFilter = "All" | "Allocated" | "Unallocated";

export default function ComputersPage() {

    const [computers, setComputers] =
        useState<Computer[]>([]);

    const [analysts, setAnalysts] =
        useState<Analyst[]>([]);

    const [allocateTarget, setAllocateTarget] =
        useState<Computer | null>(null);

    const [saving, setSaving] =
        useState(false);

    const [reassign, setReassign] =
        useState<{
            open: boolean;
            analystId: number;
            computerId: number;
            location: "Home" | "Office";
            currentAnalyst: string;
            newAnalyst: string;
            computerName: string;
        } | null>(null);

    const [search, setSearch] =
        useState("");

    const [allocationFilter, setAllocationFilter] =
        useState<AllocationFilter>("All");

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

            const [data, analystData] =
                await Promise.all([
                    getComputers(),
                    getAnalysts(),
                ]);

            setComputers(
                Array.isArray(data)
                    ? data
                    : []
            );

            setAnalysts(
                Array.isArray(analystData)
                    ? [...analystData].sort(
                        (a, b) =>
                            a.name.localeCompare(b.name)
                    )
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


    /*
     * Resolve which analyst holds this computer and in which slot.
     * Matching on computer id rather than name, since names are not unique.
     */
    function findAllocation(
        computer: Computer
    ): {
        analyst: Analyst;
        location: "Home" | "Office";
    } | null {

        for (const analyst of analysts) {

            if (analyst.homeComputer?.id === computer.id) {
                return { analyst, location: "Home" };
            }

            if (analyst.officeComputer?.id === computer.id) {
                return { analyst, location: "Office" };
            }

        }

        return null;

    }


    /*
     * ALLOCATE — assigns the analyst's Home or Office slot to this computer.
     * The API rejects with requiresConfirmation when the computer already
     * belongs to someone else; we then retry with force via the modal.
     */
    async function allocateAnalyst(
        analystId: number,
        location: "Home" | "Office"
    ) {

        if (!allocateTarget) return;

        const computerId = allocateTarget.id;

        setSaving(true);

        try {

            if (location === "Home") {
                await updateHomeComputer(analystId, computerId);
            }
            else {
                await updateOfficeComputer(analystId, computerId);
            }

            setAllocateTarget(null);

            await load();

        }
        catch (error: any) {

            if (error?.requiresConfirmation === true) {

                setReassign({
                    open: true,
                    analystId,
                    computerId,
                    location,
                    currentAnalyst: error.currentAnalyst ?? "",
                    newAnalyst: error.newAnalyst ?? "",
                    computerName:
                        error.computerName ??
                        allocateTarget.computerName,
                });

                return;

            }

            console.error("Failed allocating analyst:", error);

            alert(
                error?.message ||
                "Failed allocating analyst to this computer"
            );

        }
        finally {

            setSaving(false);

        }

    }


    async function confirmReassign() {

        if (!reassign) return;

        setSaving(true);

        try {

            if (reassign.location === "Home") {
                await updateHomeComputer(
                    reassign.analystId,
                    reassign.computerId,
                    true
                );
            }
            else {
                await updateOfficeComputer(
                    reassign.analystId,
                    reassign.computerId,
                    true
                );
            }

            setReassign(null);
            setAllocateTarget(null);

            await load();

        }
        catch (error: any) {

            console.error("Failed reassigning computer:", error);

            alert(
                error?.message ||
                "Failed reassigning computer"
            );

        }
        finally {

            setSaving(false);

        }

    }


    async function unallocate(
        computer: Computer
    ) {

        const current = findAllocation(computer);

        if (!current) {

            alert(
                "Could not determine which analyst holds this computer."
            );

            return;

        }

        if (
            !confirm(
                `Remove ${computer.computerName} as ${current.analyst.name}'s ` +
                `${current.location.toLowerCase()} computer?`
            )
        ) {
            return;
        }

        try {

            if (current.location === "Home") {
                await updateHomeComputer(current.analyst.id, null);
            }
            else {
                await updateOfficeComputer(current.analyst.id, null);
            }

            await load();

        }
        catch (error: any) {

            console.error("Failed unallocating computer:", error);

            alert(
                error?.message ||
                "Failed unallocating computer"
            );

        }

    }


    /*
     * A computer counts as allocated when it has an analyst attached.
     */
    function isAllocated(
        computer: Computer
    ) {
        return !!computer.analystName?.trim();
    }


    const totals = useMemo(() => {

        const allocated =
            computers.filter(isAllocated).length;

        return {
            registered: computers.length,
            allocated,
            unallocated: computers.length - allocated,
        };

    }, [computers]);


    /*
     * SEARCH + ALLOCATION FILTER
     */
    const visibleComputers = useMemo(() => {

        const term =
            search.trim().toLowerCase();

        return computers.filter(computer => {

            const matchesSearch =
                !term ||
                computer.computerName
                    ?.toLowerCase()
                    .includes(term) ||
                computer.analystName
                    ?.toLowerCase()
                    .includes(term) ||
                computer.workLocation
                    ?.toLowerCase()
                    .includes(term);

            if (!matchesSearch) return false;

            if (allocationFilter === "Allocated") {
                return isAllocated(computer);
            }

            if (allocationFilter === "Unallocated") {
                return !isAllocated(computer);
            }

            return true;

        });

    }, [computers, search, allocationFilter]);


    const sortedComputers =
        [...visibleComputers].sort(
            (a, b) => {

                let valueA:
                    string | number;

                let valueB:
                    string | number;


                switch (
                sortField
                ) {

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


            {/* TOTALS SUMMARY */}

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">

                <SummaryCard
                    title="Registered"
                    value={totals.registered}
                    active={allocationFilter === "All"}
                    accent="text-slate-900"
                    onClick={() =>
                        setAllocationFilter("All")
                    }
                />

                <SummaryCard
                    title="Allocated"
                    value={totals.allocated}
                    active={allocationFilter === "Allocated"}
                    accent="text-green-600"
                    onClick={() =>
                        setAllocationFilter(
                            allocationFilter === "Allocated"
                                ? "All"
                                : "Allocated"
                        )
                    }
                />

                <SummaryCard
                    title="Unallocated"
                    value={totals.unallocated}
                    active={allocationFilter === "Unallocated"}
                    accent="text-amber-600"
                    onClick={() =>
                        setAllocationFilter(
                            allocationFilter === "Unallocated"
                                ? "All"
                                : "Unallocated"
                        )
                    }
                />

            </div>


            {/* SEARCH */}

            <div className="
                mb-6
                rounded-xl
                border
                border-slate-200
                bg-white
                p-4
                shadow-sm
            ">

                <div className="flex flex-wrap items-center gap-3">

                    <input
                        value={search}
                        onChange={e =>
                            setSearch(
                                e.target.value
                            )
                        }
                        placeholder="Search by computer, analyst or location..."
                        className="
                            w-96
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

                    {(search || allocationFilter !== "All") && (

                        <button
                            onClick={() => {
                                setSearch("");
                                setAllocationFilter("All");
                            }}
                            className="
                                rounded-lg
                                border
                                border-slate-300
                                px-3
                                py-2
                                text-sm
                                font-medium
                                text-slate-600
                                transition
                                hover:bg-slate-100
                            "
                        >
                            Clear filters
                        </button>

                    )}

                    <div className="ml-auto text-sm text-slate-500">
                        Showing{" "}
                        <span className="font-semibold text-slate-700">
                            {sortedComputers.length}
                        </span>
                        {" of "}
                        {totals.registered}
                        {allocationFilter !== "All" && (
                            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                {allocationFilter}
                            </span>
                        )}
                    </div>

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

                                        <div className="flex flex-wrap items-center gap-2">

                                            <button
                                                onClick={() =>
                                                    setAllocateTarget(computer)
                                                }
                                                className="
                                                    rounded-lg
                                                    bg-sky-600
                                                    px-3
                                                    py-1.5
                                                    text-sm
                                                    font-semibold
                                                    text-white
                                                    transition
                                                    hover:bg-sky-700
                                                "
                                            >
                                                {isAllocated(computer)
                                                    ? "Reallocate"
                                                    : "Allocate"}
                                            </button>

                                            {isAllocated(computer) && (

                                                <button
                                                    onClick={() =>
                                                        unallocate(computer)
                                                    }
                                                    className="
                                                        rounded-lg
                                                        border
                                                        border-slate-300
                                                        px-3
                                                        py-1.5
                                                        text-sm
                                                        font-semibold
                                                        text-slate-700
                                                        transition
                                                        hover:bg-slate-100
                                                    "
                                                >
                                                    Unallocate
                                                </button>

                                            )}

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

                                        </div>

                                    </td>

                                </tr>

                            )
                        )}

                        {sortedComputers.length === 0 && (

                            <tr>
                                <td
                                    colSpan={7}
                                    className="p-10 text-center text-sm text-slate-500"
                                >
                                    No computers match your search or filter.
                                </td>
                            </tr>

                        )}

                    </tbody>

                </table>

            </div>


            <AllocateAnalystModal
                computer={allocateTarget}
                analysts={analysts}
                saving={saving}
                onCancel={() => setAllocateTarget(null)}
                onConfirm={allocateAnalyst}
            />


            <ReassignComputerModal
                open={reassign?.open ?? false}
                computerName={reassign?.computerName ?? ""}
                currentAnalyst={reassign?.currentAnalyst ?? ""}
                newAnalyst={reassign?.newAnalyst ?? ""}
                onCancel={() => setReassign(null)}
                onConfirm={confirmReassign}
            />

        </div>

    );

}


function SummaryCard({
    title,
    value,
    accent,
    active,
    onClick,
}: {
    title: string;
    value: number;
    accent: string;
    active: boolean;
    onClick: () => void;
}) {

    return (

        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`
                rounded-xl
                border
                bg-white
                p-5
                text-left
                shadow-sm
                transition
                hover:border-sky-400
                hover:shadow
                ${active
                    ? "border-sky-500 ring-2 ring-sky-100"
                    : "border-slate-200"
                }
            `}
        >

            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {title}
            </div>

            <div className={`mt-1 text-3xl font-bold ${accent}`}>
                {value}
            </div>

        </button>

    );

}
