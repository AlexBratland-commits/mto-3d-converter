export default function DiscrepancyReport({ discrepancies = [], onAutoFix }) {
  if (!discrepancies || discrepancies.length === 0) {
    return (
      <div className="bg-gray-900 border border-emerald-700 p-4 rounded-lg mt-6">
        <h3 className="text-emerald-400 font-semibold flex items-center gap-2">
          ✅ Ingen avvik! Alt stemmer overens med MTO.
        </h3>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-amber-600 p-4 rounded-lg mt-6 text-gray-300">
      <h3 className="text-lg font-semibold text-amber-400 mb-3 flex items-center gap-2">
        ⚠️ Avviksrapport & Mangler
      </h3>
      <ul className="space-y-3">
        {discrepancies.map((item, index) => (
          <li key={index} className="flex justify-between items-center bg-gray-800 p-3 rounded border border-gray-700">
            <div>
              <span className="font-medium text-white">{item.description}</span>
              <p className="text-xs text-gray-400 mt-0.5">
                MTO krever: {item.required} | Funnet på tegning: {item.found}
              </p>
            </div>
            {/* Hurtigknapp for å fikse avviket automatisk */}
            <button
              onClick={() => onAutoFix(item)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1 font-medium"
            >
              ➕ Legg til automatisk
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}