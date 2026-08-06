export interface DeputyRoster {
    roster_key: string;

    employee_name: string;
    email: string | null;

    location: string | null;
    area_name: string | null;

    shift_date: string;
    start_time: string | null;

    end_date: string | null;
    end_time: string | null;

    total_hours: number;

    status: string | null;
    note: string | null;

    cost: number | null;
    week: number | null;
}