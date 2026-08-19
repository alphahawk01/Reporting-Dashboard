export interface TTGame {
    id: number;

    downloadPercent: number | null;

    fileSizeBytes: number | null;

    Week: string;
    Date: string;
    Competition: string;
    Round: string;
    home_team: string;
    away_team: string;
    home_allocated: string | null;
    away_allocated: string | null;
    expected_day: string | null;
    game_key: string;
    videoURL: string;

    assignments?: {
        id: number;
        analystId: number;
        name: string;
        location: string;
        computerName?: string | null;
    }[];
}