"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

import {
    getAnalysts,
    getPlatformAnalysts,
    updateHomeComputer,
    updateOfficeComputer,
    renameAnalyst,
    type Analyst,
    type PlatformAnalyst,
} from "@/lib/api/analysts";

import {
    getComputers,
    type Computer,
} from "@/lib/api/computers";

import { supabase } from "@/lib/supabase";

import AnalystTable from "./AnalystTable";
import SearchBar from "./SearchBar";
import SummaryCards from "./SummaryCards";
import ReassignComputerModal from "./ReassignComputerModal";
import AddAnalystModal from "./AddAnalystModal";

import { getHubConnection } from "@/lib/signalr";
import { HubConnectionState } from "@microsoft/signalr";
import { UserPlus } from "lucide-react";

type AnalystAffiliations = Record<
    string,
    string[]
>;

export default function AnalystsPage() {

    const [analysts, setAnalysts] =
        useState<Analyst[]>([]);

    // Analysts added via the shared Supabase `analysts` table (platform
    // source of truth). Merged into the displayed list below so newly-added
    // analysts are visible here even though the main list comes from the
    // .NET API.
    const [platformAnalysts, setPlatformAnalysts] =
        useState<PlatformAnalyst[]>([]);

    const [addOpen, setAddOpen] = useState(false);

    const [computers, setComputers] =
        useState<Computer[]>([]);

    const [affiliations, setAffiliations] =
        useState<AnalystAffiliations>({});

    const [search, setSearch] =
        useState("");

    const [loading, setLoading] =
        useState(true);

    const [reassign, setReassign] =
        useState<{
            open: boolean;
            analystId: number;
            computerId: number;
            assignmentType: "Home" | "Office";
            currentAnalyst: string;
            newAnalyst: string;
            computerName: string;
        }>({
            open: false,
            analystId: 0,
            computerId: 0,
            assignmentType: "Office",
            currentAnalyst: "",
            newAnalyst: "",
            computerName: "",
        });

    const [renameModal, setRenameModal] =
        useState<{
            open: boolean;
            analystId: number;
            firstName: string;
            lastName: string;
        }>({
            open: false,
            analystId: 0,
            firstName: "",
            lastName: "",
        });


    // ==================================================
    // LOAD DATA
    // ==================================================

    const load = useCallback(async () => {

        try {

            const [
                analystData,
                computerData,
                affiliationResult,
                platformData,
            ] = await Promise.all([

                getAnalysts(),

                getComputers(),

                supabase
                    .from("analyst_team_affiliations")
                    .select(`
                        analyst_name,
                        team_id,
                        teams (
                            team_name
                        )
                    `),

                getPlatformAnalysts().catch((err) => {
                    console.error(
                        "Failed loading platform analysts:",
                        err
                    );
                    return [] as PlatformAnalyst[];
                }),

            ]);


            // ------------------------------------------------
            // CHECK AFFILIATION QUERY
            // ------------------------------------------------

            if (
                affiliationResult.error
            ) {

                throw affiliationResult.error;

            }


            // ------------------------------------------------
            // SORT COMPUTERS
            // ------------------------------------------------

            computerData.sort(
                (a, b) =>
                    a.computerName.localeCompare(
                        b.computerName
                    )
            );


            // ------------------------------------------------
            // BUILD AFFILIATION MAP
            // ------------------------------------------------

            const affiliationMap:
                AnalystAffiliations = {};


            for (
                const row of
                affiliationResult.data ?? []
            ) {

                const analystName =
                    row.analyst_name
                        ?.trim()
                        .toLowerCase();


                const teamData =
                    Array.isArray(row.teams)
                        ? row.teams[0]
                        : row.teams;


                const teamName =
                    teamData?.team_name;


                if (
                    !analystName ||
                    !teamName
                ) {
                    continue;
                }


                if (
                    !affiliationMap[
                        analystName
                    ]
                ) {

                    affiliationMap[
                        analystName
                    ] = [];

                }


                if (
                    !affiliationMap[
                        analystName
                    ].includes(teamName)
                ) {

                    affiliationMap[
                        analystName
                    ].push(teamName);

                }

            }


            // ------------------------------------------------
            // SORT TEAM NAMES
            // ------------------------------------------------

            Object.keys(
                affiliationMap
            ).forEach(
                analystName => {

                    affiliationMap[
                        analystName
                    ].sort(
                        (a, b) =>
                            a.localeCompare(b)
                    );

                }
            );


            setAnalysts(
                analystData
            );

            setPlatformAnalysts(
                platformData
            );

            setComputers(
                computerData
            );

            setAffiliations(
                affiliationMap
            );

        }
        catch (error) {

            console.error(
                "Failed loading analysts:",
                error
            );

        }
        finally {

            setLoading(false);

        }

    }, []);


    // ==================================================
    // INITIAL LOAD + SIGNALR
    // ==================================================

    useEffect(() => {

        load();

        const hubConnection =
            getHubConnection();


        const handleRefresh =
            async () => {

                console.log(
                    "Refreshing analysts after computer assignment"
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
                            "Analysts SignalR connected"
                        );

                    }

                }
                catch (error) {

                    console.error(
                        "Analysts SignalR connection failed:",
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


    // ==================================================
    // FILTER ANALYSTS
    // ==================================================

    // Merge the .NET analyst list with any Supabase-added platform analysts
    // that aren't already present (matched by name, case-insensitively).
    // Platform-only analysts have no computer records yet, so they show with
    // a negative id and empty computer assignments.
    const mergedAnalysts: Analyst[] = (() => {
        const seen = new Set(
            analysts.map((a) => a.name.trim().toLowerCase())
        );
        const extras: Analyst[] = platformAnalysts
            .filter((p) => !seen.has(p.name.trim().toLowerCase()))
            .map((p) => ({
                id: -p.id,
                name: p.name,
                email: p.email,
                homeComputer: null,
                officeComputer: null,
            }));
        return [...analysts, ...extras].sort((a, b) =>
            a.name.localeCompare(b.name)
        );
    })();

    const filteredAnalysts =
        mergedAnalysts.filter(
            analyst => {

                const analystTeams =
                    affiliations[
                        analyst.name
                            .trim()
                            .toLowerCase()
                    ] ?? [];


                const searchText = `
                    ${analyst.name}
                    ${analyst.email ?? ""}
                    ${analyst.homeComputer?.computerName ?? ""}
                    ${analyst.officeComputer?.computerName ?? ""}
                    ${analystTeams.join(" ")}
                `.toLowerCase();


                return searchText.includes(
                    search.toLowerCase()
                );

            }
        );


    // ==================================================
    // ASSIGNED COMPUTER COUNT
    // ==================================================

    const assignedCount =
        mergedAnalysts.filter(
            analyst =>
                analyst.homeComputer ||
                analyst.officeComputer
        ).length;


    // ==================================================
    // OPEN REASSIGN MODAL
    // ==================================================

    function openReassignModal(
        error: any,
        analystId: number,
        computerId: number
    ) {

        setReassign({

            open: true,

            analystId,

            computerId,

            assignmentType:
                error.assignmentType === "Home"
                    ? "Home"
                    : "Office",

            currentAnalyst:
                error.currentAnalyst ?? "",

            newAnalyst:
                error.newAnalyst ?? "",

            computerName:
                error.computerName ?? "",

        });

    }


    // ==================================================
    // HOME COMPUTER
    // ==================================================

    async function changeHomeComputer(
        analystId: number,
        value: string
    ) {

        const computerId =
            value === ""
                ? null
                : Number(value);


        try {

            await updateHomeComputer(
                analystId,
                computerId
            );

            await load();

        }
        catch (error: any) {

            if (
                computerId === null
            ) {

                console.error(
                    "Failed clearing home computer:",
                    error
                );

                alert(
                    error?.message ||
                    "Failed clearing home computer"
                );

                return;

            }


            if (
                error?.requiresConfirmation === true
            ) {

                openReassignModal(
                    error,
                    analystId,
                    computerId
                );

                return;

            }


            console.error(
                "Failed updating home computer:",
                error
            );

            alert(
                error?.message ||
                "Failed updating home computer"
            );

        }

    }


    // ==================================================
    // OFFICE COMPUTER
    // ==================================================

    async function changeOfficeComputer(
        analystId: number,
        value: string
    ) {

        const computerId =
            value === ""
                ? null
                : Number(value);


        try {

            await updateOfficeComputer(
                analystId,
                computerId
            );

            await load();

        }
        catch (error: any) {

            if (
                computerId === null
            ) {

                console.error(
                    "Failed clearing office computer:",
                    error
                );

                alert(
                    error?.message ||
                    "Failed clearing office computer"
                );

                return;

            }


            if (
                error?.requiresConfirmation === true
            ) {

                openReassignModal(
                    error,
                    analystId,
                    computerId
                );

                return;

            }


            console.error(
                "Failed updating office computer:",
                error
            );

            alert(
                error?.message ||
                "Failed updating office computer"
            );

        }

    }


    // ==================================================
    // CONFIRM REASSIGN
    // ==================================================

    async function confirmReassign() {

        if (
            reassign.assignmentType ===
            "Home"
        ) {

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


        setReassign(
            current => ({
                ...current,
                open: false,
            })
        );


        await load();

    }


    // ==================================================
    // RENAME ANALYST
    // ==================================================

    function openRenameModal(
        analystId: number,
        currentName: string
    ) {
        const parts = currentName.trim().split(/\s+/);
        const firstName = parts[0] ?? "";
        const lastName = parts.slice(1).join(" ") ?? "";

        setRenameModal({
            open: true,
            analystId,
            firstName,
            lastName,
        });
    }

    async function confirmRename() {
        try {
            await renameAnalyst(
                renameModal.analystId,
                renameModal.firstName.trim() || undefined,
                renameModal.lastName.trim() || undefined
            );

            setRenameModal(curr => ({ ...curr, open: false }));
            await load();
        } catch (err: any) {
            alert(err?.message || "Failed renaming analyst");
        }
    }


    // ==================================================
    // LOADING
    // ==================================================

    if (loading) {

        return (
            <div className="
                min-h-screen
                bg-gray-100
                p-8
            ">
                Loading analysts...
            </div>
        );

    }


    // ==================================================
    // PAGE
    // ==================================================

    return (

        <div className="
            min-h-screen
            bg-gray-100
            p-8
        ">

            <div className="
                mb-6
                flex
                items-center
                justify-between
            ">

                <div>

                    <h1 className="
                        text-3xl
                        font-bold
                        text-gray-900
                    ">
                        Analyst Management
                    </h1>

                    <p className="
                        mt-1
                        text-gray-500
                    ">
                        Manage analysts, affiliated
                        teams and download computers.
                    </p>

                </div>


                <div className="flex items-center gap-2">

                    <button
                        onClick={() => setAddOpen(true)}
                        className="
                            inline-flex
                            items-center
                            gap-1.5
                            rounded-lg
                            bg-blue-600
                            px-4
                            py-2
                            font-medium
                            text-white
                            hover:bg-blue-700
                        "
                    >
                        <UserPlus size={16} /> Add analyst
                    </button>

                    <Link
                        href="/fixtures"
                        className="
                            rounded-lg
                            border
                            border-slate-300
                            bg-white
                            px-4
                            py-2
                            font-medium
                            text-slate-700
                            hover:bg-slate-50
                        "
                    >
                        Back to Fixtures
                    </Link>

                </div>

            </div>


            <SummaryCards
                total={
                    mergedAnalysts.length
                }
                assigned={
                    assignedCount
                }
            />


            <SearchBar
                value={search}
                onChange={setSearch}
            />


            <AnalystTable
                analysts={
                    filteredAnalysts
                }
                computers={
                    computers
                }
                affiliations={
                    affiliations
                }
                onHomeComputerChange={
                    changeHomeComputer
                }
                onOfficeComputerChange={
                    changeOfficeComputer
                }
                onDelete={
                    async analystId => {

                        console.log(
                            "Delete analyst requested:",
                            analystId
                        );

                    }
                }
                onRename={openRenameModal}
            />


            <ReassignComputerModal
                open={
                    reassign.open
                }
                computerName={
                    reassign.computerName
                }
                currentAnalyst={
                    reassign.currentAnalyst
                }
                newAnalyst={
                    reassign.newAnalyst
                }
                onCancel={() =>
                    setReassign(
                        current => ({
                            ...current,
                            open: false,
                        })
                    )
                }
                onConfirm={
                    confirmReassign
                }
            />


            <AddAnalystModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onSaved={load}
            />

            {/* RENAME MODAL */}
            {renameModal.open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={() => setRenameModal(c => ({ ...c, open: false }))}
                >
                    <div
                        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="mb-4 text-lg font-bold text-gray-900">
                            Rename Analyst
                        </h3>

                        <div className="mb-3">
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                                First Name
                            </label>
                            <input
                                type="text"
                                value={renameModal.firstName}
                                onChange={e =>
                                    setRenameModal(c => ({
                                        ...c,
                                        firstName: e.target.value,
                                    }))
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                                autoFocus
                            />
                        </div>

                        <div className="mb-5">
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                                Last Name
                            </label>
                            <input
                                type="text"
                                value={renameModal.lastName}
                                onChange={e =>
                                    setRenameModal(c => ({
                                        ...c,
                                        lastName: e.target.value,
                                    }))
                                }
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setRenameModal(c => ({ ...c, open: false }))}
                                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRename}
                                disabled={
                                    !renameModal.firstName.trim() &&
                                    !renameModal.lastName.trim()
                                }
                                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:bg-gray-300"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>

    );

}