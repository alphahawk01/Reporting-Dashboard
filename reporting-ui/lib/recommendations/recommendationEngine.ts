import type { AnalystMetrics } from "@/types/analyst";
import type { TTGame } from "@/types/ttgame";

import {
    scoreLeagueExperience,
    scoreTeamExperience
} from "./scoring";

export function recommendFixture(
    fixture: TTGame,
    analysts: AnalystMetrics[]
) {

    return analysts
        .map(a => ({

            analyst: a,

            leagueScore:
                scoreLeagueExperience(
                    a,
                    fixture
                ),

            teamScore:
                scoreTeamExperience(
                    a,
                    fixture
                )

        }))
        .sort((a, b) => {

            const scoreA =
                a.leagueScore +
                a.teamScore;

            const scoreB =
                b.leagueScore +
                b.teamScore;

            return scoreB - scoreA;

        });

}