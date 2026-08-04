interface Props {

    label: string;

    value: number;

}

export default function Metric({
    label,
    value
}: Props) {

    return (

        <div className="rounded-lg bg-slate-800 p-3">

            <div className="text-xs text-slate-400">

                {label}

            </div>

            <div className="text-xl font-semibold text-white">

                {value.toFixed(1)}

            </div>

        </div>

    );

}