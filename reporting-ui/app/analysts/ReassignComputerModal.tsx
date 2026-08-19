"use client";

interface Props {
    open: boolean;
    computerName: string;
    currentAnalyst: string;
    newAnalyst: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
}

export default function ReassignComputerModal({
    open,
    computerName,
    currentAnalyst,
    newAnalyst,
    onCancel,
    onConfirm,
}: Props) {

    if (!open) {
        return null;
    }

    return (
        <div className="
            fixed
            inset-0
            z-50
            flex
            items-center
            justify-center
            bg-black/50
            p-4
        ">

            <div className="
                w-full
                max-w-md
                rounded-xl
                bg-white
                p-6
                shadow-2xl
            ">

                <h2 className="
                    text-xl
                    font-bold
                    text-slate-900
                ">
                    Computer Already Assigned
                </h2>

                <p className="
                    mt-3
                    text-sm
                    text-slate-600
                ">
                    This computer is already assigned to
                    <strong className="mx-1 text-slate-900">
                        {currentAnalyst}
                    </strong>
                    and you are trying to assign it to
                    <strong className="mx-1 text-slate-900">
                        {newAnalyst}
                    </strong>.
                </p>

                <div className="
                    mt-4
                    rounded-lg
                    bg-slate-100
                    p-4
                ">

                    <div className="
                        text-xs
                        font-semibold
                        uppercase
                        tracking-wide
                        text-slate-500
                    ">
                        Computer
                    </div>

                    <div className="
                        mt-1
                        font-semibold
                        text-slate-900
                    ">
                        {computerName}
                    </div>

                </div>

                <p className="
                    mt-4
                    text-sm
                    text-slate-600
                ">
                    Reassigning it will remove the current
                    analyst's assignment.
                </p>

                <div className="
                    mt-6
                    flex
                    justify-end
                    gap-3
                ">

                    <button
                        type="button"
                        onClick={onCancel}
                        className="
                            rounded-lg
                            border
                            border-slate-300
                            px-4
                            py-2
                            text-sm
                            font-semibold
                            text-slate-700
                            hover:bg-slate-50
                        "
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        className="
                            rounded-lg
                            bg-red-600
                            px-4
                            py-2
                            text-sm
                            font-semibold
                            text-white
                            hover:bg-red-700
                        "
                    >
                        Reassign
                    </button>

                </div>

            </div>

        </div>
    );
}