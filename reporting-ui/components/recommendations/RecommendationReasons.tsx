interface Props {
    reasons: string[];
}

export default function RecommendationReasons({
    reasons,
}: Props) {

    return (

        <ul className="mt-3 space-y-1">

            {reasons.map((reason, index) => (

                <li
                    key={index}
                    className="text-sm text-slate-300"
                >
                    ✓ {reason}
                </li>

            ))}

        </ul>

    );

}