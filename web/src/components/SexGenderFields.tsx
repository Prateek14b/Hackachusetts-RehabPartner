import { useState } from 'react'

export type Sex = 'female' | 'male' | 'intersex' | 'prefer_not_to_say'

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'intersex', label: 'Intersex' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const GENDER_OPTIONS = [
  'Woman',
  'Man',
  'Non-binary',
  'Transgender woman',
  'Transgender man',
  'Genderqueer / gender-fluid',
  'Two-Spirit',
  'Prefer not to say',
]
const SELF_DESCRIBE = '__self_describe__'

const inputClass =
  'mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-lg focus:border-blue-600 focus:outline-none'

interface Props {
  sex: Sex | null
  onSexChange: (sex: Sex | null) => void
  gender: string
  onGenderChange: (gender: string) => void
}

// Sex assigned at birth (used for range-of-motion norms) and gender identity are asked separately
export default function SexGenderFields({ sex, onSexChange, gender, onGenderChange }: Props) {
  const [selfDescribe, setSelfDescribe] = useState(gender !== '' && !GENDER_OPTIONS.includes(gender))

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="font-medium">
          Sex assigned at birth <span className="font-normal text-slate-500">(optional)</span>
        </legend>
        <p className="text-sm text-slate-500">Used to set healthy range-of-motion targets.</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup">
          {SEX_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={sex === o.value}
              onClick={() => onSexChange(sex === o.value ? null : o.value)}
              className={`rounded-xl border-2 px-3 py-3 font-semibold transition ${
                sex === o.value
                  ? 'border-blue-700 bg-blue-50 text-blue-800'
                  : 'border-slate-300 bg-white hover:border-slate-500'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block font-medium">
        Gender identity <span className="font-normal text-slate-500">(optional)</span>
        <select
          className={inputClass}
          value={selfDescribe ? SELF_DESCRIBE : gender}
          onChange={(e) => {
            const v = e.target.value
            setSelfDescribe(v === SELF_DESCRIBE)
            onGenderChange(v === SELF_DESCRIBE ? '' : v)
          }}
        >
          <option value="">Select…</option>
          {GENDER_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value={SELF_DESCRIBE}>Prefer to self-describe</option>
        </select>
      </label>

      {selfDescribe && (
        <label className="block font-medium">
          Describe your gender
          <input
            className={inputClass}
            value={gender}
            maxLength={50}
            onChange={(e) => onGenderChange(e.target.value)}
            autoFocus
          />
        </label>
      )}
    </div>
  )
}
