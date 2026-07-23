export default function ComponentTable({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-gray-400 mt-8 text-center">Ingen komponenter å vise.</p>;
  }

  return (
    <div className="mt-8 overflow-x-auto">
      <h2 className="text-xl font-semibold mb-4">📊 MTO Komponenter ({data.length})</h2>
      <table className="w-full text-sm text-left text-gray-300">
        <thead className="text-xs uppercase bg-gray-800 text-gray-400">
          <tr>
            <th className="px-3 py-3">Item</th>
            <th className="px-3 py-3">Component</th>
            <th className="px-3 py-3">Size</th>
            <th className="px-3 py-3">Start (X,Y,Z)</th>
            <th className="px-3 py-3">End (X,Y,Z)</th>
            <th className="px-3 py-3">Insul.</th>
            <th className="px-3 py-3">Dev. time</th>
          </tr>
        </thead>
        <tbody>
          {data.map((comp, i) => (
            <tr key={i} className="bg-gray-900 border-b border-gray-700 hover:bg-gray-800">
              <td className="px-3 py-2">{comp.item_no}</td>
              <td className="px-3 py-2 font-medium text-white">{comp.component}</td>
              <td className="px-3 py-2">{comp.size_dn_nps}</td>
              <td className="px-3 py-2 text-xs">{comp.start_x}, {comp.start_y}, {comp.start_z}</td>
              <td className="px-3 py-2 text-xs">{comp.end_x}, {comp.end_y}, {comp.end_z}</td>
              <td className="px-3 py-2">{comp.insulation_thickness_mm > 0 ? comp.insulation_thickness_mm + 'mm' : '-'}</td>
              <td className="px-3 py-2">{comp.utviklingstid ? comp.utviklingstid + ' min' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}