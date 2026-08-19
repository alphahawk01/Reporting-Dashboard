interface Props {
    total: number;
    assigned: number;
}

export default function SummaryCards({
    total,
    assigned,
}: Props) {
    return (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">

            <div className="
                rounded-xl
                bg-white
                p-5
                shadow
            ">
                <div className="
                    text-sm
                    font-medium
                    text-gray-500
                ">
                    Total Analysts
                </div>

                <div className="
                    mt-1
                    text-3xl
                    font-bold
                    text-gray-900
                ">
                    {total}
                </div>
            </div>


            <div className="
                rounded-xl
                bg-white
                p-5
                shadow
            ">
                <div className="
                    text-sm
                    font-medium
                    text-gray-500
                ">
                    Assigned
                </div>

                <div className="
                    mt-1
                    text-3xl
                    font-bold
                    text-gray-900
                ">
                    {assigned}
                </div>
            </div>

        </div>
    );
}