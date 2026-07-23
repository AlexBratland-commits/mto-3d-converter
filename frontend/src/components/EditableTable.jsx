import { useState, useEffect } from "react";

// Hjelpefunksjon for å finne retning på ny rad
const DIRECTION_VECTORS = {
  "N": [0, 1, 0], "NE": [0.707, 0.707, 0], "E": [1, 0, 0], "SE": [0.707, -0.707, 0],
  "S": [0, -1, 0], "SW": [-0.707, -0.707, 0], "W": [-1, 0, 0], "NW": [-0.707, 0.707, 0],
  "UP": [0, 0, 1], "DOWN": [0, 0, -1]
};

export default function EditableTable({ data, onDataChange }) {
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState([]);

  // Synkroniser editedData hvis data endres eksternt (f.eks. via Auto-Fix)
  useEffect(() => {
    if (editMode && data && data.length > editedData.length) {
      const newItems = data.slice(editedData.length);
      setEditedData([...editedData, ...newItems]);
    }
  }, [data, editMode, editedData.length]);

  // Start redigering – kopier dataene
  const startEditing = () => {
    setEditedData(JSON.parse(JSON.stringify(data)));
    setEditMode(true);
  };

  // Lagre endringer og send tilbake
  const saveChanges = () => {
    onDataChange(editedData);
    setEditMode(false);
  };

  // Avbryt redigering
  const cancelEditing = () => {
    setEditMode(false);
    setEditedData([]);
  };

  // Oppdater en celle
  const updateCell = (rowIndex, field, value) => {
    const updated = [...editedData];
    updated[rowIndex] = { ...updated[rowIndex], [field]: value };
    setEditedData(updated);
  };

  // Slett en rad
  const deleteRow = (rowIndex) => {
    const updated = editedData.filter((_, i) => i !== rowIndex);
    setEditedData(updated);
  };

  // Legg til en ny komponentrad med arvede/relative koordinater
  const addComponentRow = () => {
    const baseData = editMode ? editedData : (data || []);
    const lastItem = baseData.length > 0 ? baseData[baseData.length - 1] : {
      end_x: 0, end_y: 0, end_z: 0, size_dn_nps: "DN80", schedule: "40", direction: "N"
    };

    const nextItemNo = baseData.length > 0 ? Math.max(...baseData.map((item) => Number(item.item_no) || 0)) + 1 : 1;
    
    // Arv start-koordinater fra forrige komponents slutt-koordinater
    const startX = lastItem.end_x ?? 0;
    const startY = lastItem.end_y ?? 0;
    const startZ = lastItem.end_z ?? 0;

    // Beregn slutt-koordinater basert på retning
    const dir = lastItem.direction || "N";
    const vec = DIRECTION_VECTORS[dir] || [0, 1, 0];
    const length = 50; // Standardlengde for manuelt lagt til rad
    const endX = startX + vec[0] * length;
    const endY = startY + vec[1] * length;
    const endZ = startZ + vec[2] * length;

    const newRow = {
      item_no: nextItemNo,
      component: "Pipe",
      size_dn_nps: lastItem.size_dn_nps || "DN80",
      direction: dir,
      start_x: startX,
      start_y: startY,
      start_z: startZ,
      end_x: endX,
      end_y: endY,
      end_z: endZ,
      insulation_thickness_mm: 0,
      schedule: lastItem.schedule || "40"
    };

    if (editMode) {
      setEditedData([...editedData, newRow]);
    } else {
      setEditedData([...(JSON.parse(JSON.stringify(data || []))), newRow]);
      setEditMode(true);
    }
  };

  const currentData = editMode ? editedData : data;

  if (!data || data.length === 0) {
    return <p className="text-gray-400 mt-8 text-center">Ingen komponenter å vise.</p>;
  }

  return (
    <div className="mt-8 overflow-x-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">📊 MTO Komponenter ({currentData.length})</h2>
        <div className="flex gap-2">
          <button onClick={addComponentRow} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors">➕ Legg til</button>
          {editMode ? (
            <>
              <button onClick={saveChanges} className="bg-emerald-600 text-white px-3 py-1 rounded text-sm hover:bg-emerald-700 transition-colors">💾 Lagre</button>
              <button onClick={cancelEditing} className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 transition-colors">❌ Avbryt</button>
            </>
          ) : (
            <button onClick={startEditing} className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 transition-colors">✏️ Rediger</button>
          )}
        </div>
      </div>

      <table className="w-full text-sm text-left text-gray-300">
        <thead className="text-xs uppercase bg-gray-800 text-gray-400">
          <tr>
            <th className="px-3 py-3">Item</th>
            <th className="px-3 py-3">Component</th>
            <th className="px-3 py-3">Size</th>
            <th className="px-3 py-3">Start X</th>
            <th className="px-3 py-3">Start Y</th>
            <th className="px-3 py-3">Start Z</th>
            <th className="px-3 py-3">End X</th>
            <th className="px-3 py-3">End Y</th>
            <th className="px-3 py-3">End Z</th>
            <th className="px-3 py-3">Insul.</th>
            <th className="px-3 py-3">Schedule</th>
            {editMode && <th className="px-3 py-3 text-center">Slett</th>}
          </tr>
        </thead>
        <tbody>
          {currentData.map((comp, i) => (
            <tr key={comp.id || i} className={`bg-gray-900 border-b border-gray-700 hover:bg-gray-800 ${comp._autoFixed ? 'border-l-4 border-l-emerald-500' : ''}`}>
              <td className="px-3 py-2">{comp.item_no}</td>
              {editMode ? (
                <>
                  <td className="px-3 py-2"><input value={comp.component || ''} onChange={e => updateCell(i, 'component', e.target.value)} className="bg-gray-700 text-white px-2 py-1 rounded w-24" /></td>
                  <td className="px-3 py-2"><input value={comp.size_dn_nps || ''} onChange={e => updateCell(i, 'size_dn_nps', e.target.value)} className="bg-gray-700 text-white px-2 py-1 rounded w-20" /></td>
                  <td className="px-3 py-2"><input type="number" value={comp.start_x ?? 0} onChange={e => updateCell(i, 'start_x', parseFloat(e.target.value) || 0)} className="bg-gray-700 text-white px-2 py-1 rounded w-20" /></td>
                  <td className="px-3 py-2"><input type="number" value={comp.start_y ?? 0} onChange={e => updateCell(i, 'start_y', parseFloat(e.target.value) || 0)} className="bg-gray-700 text-white px-2 py-1 rounded w-20" /></td>
                  <td className="px-3 py-2"><input type="number" value={comp.start_z ?? 0} onChange={e => updateCell(i, 'start_z', parseFloat(e.target.value) || 0)} className="bg-gray-700 text-white px-2 py-1 rounded w-20" /></td>
                  <td className="px-3 py-2"><input type="number" value={comp.end_x ?? 0} onChange={e => updateCell(i, 'end_x', parseFloat(e.target.value) || 0)} className="bg-gray-700 text-white px-2 py-1 rounded w-20" /></td>
                  <td className="px-3 py-2"><input type="number" value={comp.end_y ?? 0} onChange={e => updateCell(i, 'end_y', parseFloat(e.target.value) || 0)} className="bg-gray-700 text-white px-2 py-1 rounded w-20" /></td>
                  <td className="px-3 py-2"><input type="number" value={comp.end_z ?? 0} onChange={e => updateCell(i, 'end_z', parseFloat(e.target.value) || 0)} className="bg-gray-700 text-white px-2 py-1 rounded w-20" /></td>
                  <td className="px-3 py-2"><input type="number" value={comp.insulation_thickness_mm ?? 0} onChange={e => updateCell(i, 'insulation_thickness_mm', parseFloat(e.target.value) || 0)} className="bg-gray-700 text-white px-2 py-1 rounded w-16" /></td>
                  <td className="px-3 py-2"><input value={comp.schedule || '40'} onChange={e => updateCell(i, 'schedule', e.target.value)} className="bg-gray-700 text-white px-2 py-1 rounded w-16" /></td>
                  <td className="px-3 py-2 text-center">
                    <button 
                      type="button"
                      onClick={() => deleteRow(i)} 
                      className="text-red-400 hover:text-red-200 bg-gray-800 hover:bg-red-900 px-2 py-1 rounded text-xs transition-colors"
                      title="Slett rad"
                    >
                      🗑️
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2 font-medium text-white">
                    <div className="flex items-center gap-2">
                      {comp.component}
                      {comp._autoFixed && <span className="text-xs bg-emerald-900 text-emerald-300 px-1.5 py-0.5 rounded">Auto</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">{comp.size_dn_nps}</td>
                  <td className="px-3 py-2 text-xs">{comp.start_x?.toFixed(1)}</td>
                  <td className="px-3 py-2 text-xs">{comp.start_y?.toFixed(1)}</td>
                  <td className="px-3 py-2 text-xs">{comp.start_z?.toFixed(1)}</td>
                  <td className="px-3 py-2 text-xs">{comp.end_x?.toFixed(1)}</td>
                  <td className="px-3 py-2 text-xs">{comp.end_y?.toFixed(1)}</td>
                  <td className="px-3 py-2 text-xs">{comp.end_z?.toFixed(1)}</td>
                  <td className="px-3 py-2">{comp.insulation_thickness_mm > 0 ? comp.insulation_thickness_mm + 'mm' : '-'}</td>
                  <td className="px-3 py-2">{comp.schedule || '40'}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}