import { Lightbulb, Maximize, Smile, Sun } from "lucide-react"

export function FaceUploadGuidelines() {
    return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Tips for the Best AI Recognition Accuracy
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex bg-white p-3 rounded-lg border border-slate-100 shadow-sm gap-3 items-start">
                    <Sun className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-slate-700">Good Lighting</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">Ensure your face is evenly lit. Avoid harsh shadows or strong backlighting from windows.</p>
                    </div>
                </div>

                <div className="flex bg-white p-3 rounded-lg border border-slate-100 shadow-sm gap-3 items-start">
                    <Maximize className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-slate-700">Fill the Frame</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">Keep your phone at eye level. Your face should take up most of the photo without being cut off.</p>
                    </div>
                </div>

                <div className="flex bg-white p-3 rounded-lg border border-slate-100 shadow-sm gap-3 items-start">
                    <Smile className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-semibold text-slate-700">Clear Visibility</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">Look directly into the camera lens. Keep a neutral expression and remove dark glasses or hats.</p>
                    </div>
                </div>

                <div className="flex bg-white p-3 rounded-lg border border-slate-100 shadow-sm gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-500 shrink-0 flex items-center justify-center font-bold text-[10px] mt-0.5">✕</div>
                    <div>
                        <p className="text-xs font-semibold text-slate-700">What to Avoid</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">Blurry photos, extreme angles (looking up/down), or group photos with other people visible.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
