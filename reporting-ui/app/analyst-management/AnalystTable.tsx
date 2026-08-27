"use client";

import Link from "next/link";
import type { Computer } from "@/lib/api/computers";

interface AssignedComputer {
    id: number;
    computerName: string;
}

interface Analyst {
    id: number;
    name: string;
    email?: string | null;

    homeComputer: AssignedComputer | null;
    officeComputer: AssignedComputer | null;
}

type AnalystAffiliations = Record<
    string,
    string[]
>;

type Props = {
    analysts: Analyst[];

    computers: Computer[];

    affiliations: AnalystAffiliations;

    onHomeComputerChange: (
        analystId: number,
        computerId: string
    ) => void;

    onOfficeComputerChange: (
        analystId: number,
        computerId: string
    ) => void;

    onDelete: (
        analystId: number
    ) => void;

    onRename: (
        analystId: number,
        currentName: string
    ) => void;
};

export default function AnalystTable({
    analysts,
    computers,
    affiliations,
    onHomeComputerChange,
    onOfficeComputerChange,
    onDelete,
    onRename,
}: Props) {

    const assignedHomeComputerIds =
        new Set(
            analysts
                .filter(
                    analyst =>
                        analyst.homeComputer
                )
                .map(
                    analyst =>
                        analyst.homeComputer!.id
                )
        );


    return (

        <div className="
            overflow-hidden
            rounded-lg
            bg-white
            shadow
        ">

            <table className="
                min-w-full
                table-fixed
            ">

                <thead className="
                    bg-gray-800
                    text-white
                ">

                    <tr>

                        <th className="
                            w-[25%]
                            p-3
                            text-left
                        ">
                            Analyst
                        </th>


                        <th className="
                            w-[30%]
                            p-3
                            text-left
                        ">
                            Affiliated Teams
                        </th>


                        <th className="
                            w-56
                            p-3
                            text-left
                        ">
                            Home Computer
                        </th>


                        <th className="
                            w-56
                            p-3
                            text-left
                        ">
                            Office Computer
                        </th>


                        <th className="
                            w-20
                            p-3
                            text-center
                        ">
                            Actions
                        </th>

                    </tr>

                </thead>


                <tbody>

                    {analysts.map(
                        analyst => {

                            const initials =
                                analyst.name
                                    .split(" ")
                                    .map(
                                        part =>
                                            part[0]
                                    )
                                    .join("")
                                    .substring(0, 2)
                                    .toUpperCase();


                            const analystAffiliations =
                                affiliations[
                                    analyst.name
                                        .trim()
                                        .toLowerCase()
                                ] ?? [];


                            return (

                                <tr
                                    key={analyst.id}
                                    className="
                                        border-b
                                        odd:bg-white
                                        even:bg-gray-50
                                        hover:bg-blue-50
                                    "
                                >

                                    {/* ANALYST */}

                                    <td className="
                                        px-4
                                        py-2
                                    ">

                                        <div className="
                                            flex
                                            items-center
                                            gap-2
                                        ">

                                            <div className="
                                                flex
                                                h-8
                                                w-8
                                                shrink-0
                                                items-center
                                                justify-center
                                                rounded-full
                                                bg-blue-600
                                                text-xs
                                                font-bold
                                                text-white
                                            ">
                                                {initials}
                                            </div>


                                            <div className="
                                                min-w-0
                                                leading-tight
                                            ">

                                                <div className="
                                                    truncate
                                                    font-medium
                                                    text-blue-600
                                                    hover:text-blue-800
                                                    hover:underline
                                                ">
                                                    <Link href={`/analyst-profile?analyst=${encodeURIComponent(analyst.name)}`}>
                                                        {analyst.name}
                                                    </Link>
                                                </div>

                                                <div className="
                                                    truncate
                                                    text-xs
                                                    text-gray-500
                                                ">
                                                    {
                                                        analyst.email ??
                                                        ""
                                                    }
                                                </div>

                                            </div>

                                        </div>

                                    </td>


                                    {/* AFFILIATED TEAMS */}

                                    <td className="
                                        px-4
                                        py-2
                                    ">

                                        {analystAffiliations.length === 0 ? (

                                            <span className="
                                                text-sm
                                                text-gray-400
                                            ">
                                                None
                                            </span>

                                        ) : (

                                            <div className="
                                                flex
                                                flex-wrap
                                                gap-1.5
                                            ">

                                                {analystAffiliations.map(
                                                    team => (

                                                        <span
                                                            key={
                                                                team
                                                            }
                                                            className="
                                                                rounded-full
                                                                bg-blue-50
                                                                px-2.5
                                                                py-1
                                                                text-xs
                                                                font-medium
                                                                text-blue-700
                                                            "
                                                        >
                                                            {team}
                                                        </span>

                                                    )
                                                )}

                                            </div>

                                        )}

                                    </td>


                                    {/* HOME COMPUTER */}

                                    <td className="p-4">

                                        <select
                                            value={
                                                analyst
                                                    .homeComputer
                                                    ?.id ?? ""
                                            }
                                            onChange={event =>
                                                onHomeComputerChange(
                                                    analyst.id,
                                                    event.target.value
                                                )
                                            }
                                            className="
                                                w-52
                                                rounded-lg
                                                border
                                                border-gray-300
                                                px-3
                                                py-2
                                            "
                                        >

                                            <option value="">
                                                Unassigned
                                            </option>


                                            {computers
                                                .filter(
                                                    computer =>
                                                        !assignedHomeComputerIds.has(
                                                            computer.id
                                                        ) ||
                                                        computer.id ===
                                                            analyst
                                                                .homeComputer
                                                                ?.id
                                                )
                                                .map(
                                                    computer => (

                                                        <option
                                                            key={
                                                                computer.id
                                                            }
                                                            value={
                                                                computer.id
                                                            }
                                                        >
                                                            {
                                                                computer.computerName
                                                            }
                                                        </option>

                                                    )
                                                )}

                                        </select>

                                    </td>


                                    {/* OFFICE COMPUTER */}

                                    <td className="p-4">

                                        <select
                                            value={
                                                analyst
                                                    .officeComputer
                                                    ?.id ?? ""
                                            }
                                            onChange={event =>
                                                onOfficeComputerChange(
                                                    analyst.id,
                                                    event.target.value
                                                )
                                            }
                                            className="
                                                w-52
                                                rounded-lg
                                                border
                                                border-gray-300
                                                px-3
                                                py-2
                                            "
                                        >

                                            <option value="">
                                                Unassigned
                                            </option>


                                            {computers.map(
                                                computer => (

                                                    <option
                                                        key={
                                                            computer.id
                                                        }
                                                        value={
                                                            computer.id
                                                        }
                                                    >
                                                        {
                                                            computer.computerName
                                                        }
                                                    </option>

                                                )
                                            )}

                                        </select>

                                    </td>


                                    {/* ACTIONS */}

                                    <td className="
                                        text-center
                                    ">

                                        <button
                                            onClick={() =>
                                                onRename(
                                                    analyst.id,
                                                    analyst.name
                                                )
                                            }
                                            className="
                                                rounded-lg
                                                p-2
                                                text-blue-600
                                                hover:bg-blue-50
                                            "
                                            title="Rename Analyst"
                                        >
                                            ✏️
                                        </button>

                                        <button
                                            onClick={() =>
                                                onDelete(
                                                    analyst.id
                                                )
                                            }
                                            className="
                                                rounded-lg
                                                p-2
                                                text-red-600
                                                hover:bg-red-50
                                            "
                                            title="Delete Analyst"
                                        >
                                            🗑️
                                        </button>

                                    </td>

                                </tr>

                            );

                        }
                    )}

                </tbody>

            </table>

        </div>

    );
}