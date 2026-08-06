import type { DeputyRoster } from "@/types/deputyRoster";

const dayOrder = [
    "Saturday",
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
];

const normalise = (value: string) =>
    value
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

export function buildAnalystAvailability(
    roster: DeputyRoster[]
): Map<string, Map<number, string[]>> {

    const availability =
        new Map<string, Map<number, Set<string>>>();

    for (const shift of roster) {

        if (
            !shift.employee_name ||
            !shift.shift_date ||
            shift.week == null
        ) {
            continue;
        }

        const analyst =
            normalise(shift.employee_name);

        if (!availability.has(analyst)) {
            availability.set(
                analyst,
                new Map()
            );
        }

        const analystWeeks =
            availability.get(analyst)!;

        if (!analystWeeks.has(shift.week)) {
            analystWeeks.set(
                shift.week,
                new Set()
            );
        }

        const day = new Date(
            shift.shift_date
        ).toLocaleDateString(
            "en-AU",
            {
                weekday: "long",
            }
        );

        analystWeeks
            .get(shift.week)!
            .add(day);
    }

    const result =
        new Map<string, Map<number, string[]>>();

    availability.forEach(
        (weeks, analyst) => {

            const weekMap =
                new Map<number, string[]>();

            weeks.forEach(
                (days, week) => {

                    weekMap.set(
                        week,
                        [...days].sort(
                            (a, b) =>
                                dayOrder.indexOf(a) -
                                dayOrder.indexOf(b)
                        )
                    );

                }
            );

            result.set(
                analyst,
                weekMap
            );

        }
    );

    return result;
}