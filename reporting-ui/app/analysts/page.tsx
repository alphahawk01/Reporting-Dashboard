"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

import {
    getAnalysts,
    updateHomeComputer,
    updateOfficeComputer,
    type Analyst,
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

import { getHubConnection } from "@/lib/signalr";
import { HubConnectionState } from "@microsoft/signalr";

type AnalystAffiliations = Record<
    string,
    string[]
>;

export default function AnalystsPage() {

    const [analysts, setAnalysts] =
        useState<Analyst[]>([]);

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


    // ==================================================
    // LOAD DATA
    // ==================================================

    const load = useCallback(async () => {

        try {

            const [
                analystData,
                computerData,
                affiliationResult,
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

    const filteredAnalysts =
        analysts.filter(
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
        analysts.filter(
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


                <Link
                    href="/fixtures"
                    className="
                        rounded-lg
                        bg-blue-600
                        px-4
                        py-2
                        font-medium
                        text-white
                        hover:bg-blue-700
                    "
                >
                    Back to Fixtures
                </Link>

            </div>


            <SummaryCards
                total={
                    analysts.length
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

        </div>

    );

}