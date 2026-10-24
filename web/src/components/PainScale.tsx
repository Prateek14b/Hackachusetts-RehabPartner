// 0–10 pain rating with large buttons, asked after each exercise
const COLORS = [
  'bg-green-600',
  'bg-green-600',
  'bg-lime-600',
  'bg-lime-600',
  'bg-yellow-500',
  'bg-yellow-500',
  'bg-orange-500',
  'bg-orange-500',
  'bg-red-600',
  'bg-red-600',
  'bg-red-700',
]

export default function PainScale({ onSelect }: { onSelect: (pain: number | null) => void }) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
        {COLORS.map((color, n) => (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(n)}
            className={`${color} rounded-xl py-4 text-2xl font-bold text-white hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-white`}
            aria-label={`Pain ${n} out of 10`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-slate-300">
        <span>0 = no pain</span>
        <span>10 = worst pain</span>
      </div>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="mt-4 text-lg text-slate-300 underline underline-offset-4"
      >
        Skip this question
      </button>
    </div>
  )
}
