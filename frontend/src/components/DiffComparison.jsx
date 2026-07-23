import { useState } from "react";
import * as XLSX from "xlsx";

function compareDatasets(a, b) {
  const report = { matches: 0, minor: 0, critical: 0, rows: [] };
  const maxLen = Math.max(a.length, b.length);
  const keys = [
    'component', 'size_dn_nps', 'spec_material', 'pipe_class',
    'direction', 'pressure_bar', 'temperature_c', 'insulation_thickness_mm',
    'schedule', 'bend_type', 'insulation_class', 'paint_system', 'material_grade'
  ];

  for (let i = 0; i < maxLen; i++) {
    const ra = a[i] || {}, rb = b[i] || {};
    const diffs = [];

    keys.forEach(k => {
      const va = ra[k] ?? '', vb = rb[k] ?? '';
      if (String(va) !== String(vb)) {
        const severity = (k === 'component' || k === 'size_dn_nps') ? 'critical' : 'minor';
        diffs.push({ field: k, a: va, b: vb, severity });
      }
    });

    ['start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z'].forEach(k => {
      const va = parseFloat(ra[k]) || 0, vb = parseFloat(rb[k]) || 0;
      if (Math.abs(va - vb) > 10) {
        diffs.push({ field: k, a: va, b: vb, severity: 'minor' });
      }
    });

    if (diffs.length === 0) {
      report.matches++;
      report.rows.push({ index: i, component: ra.component || rb.component || '?', status: 'match', diffs: [] });
    } else {
      const hasCritical = diffs.some(d => d.severity === 'critical');
      if (hasCritical) report.critical++;
      else report.minor++;
      report.rows.push({
        index: i,
        component: ra.component || rb.component || '?',
        status: hasCritical ? 'critical' : 'minor',
        diffs
      });
    }
  }

  if (a.length !== b.length) {
    report.summary = [{ field: 'Antall komponenter', a: a.length, b: b.length, severity: 'minor' }];
  } else {
    report.summary = [];
  }

  return report;
}

export default function DiffComparison({ onDataA, onDataB }) {
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [dataA, setDataA] = useState(null);
  const [dataB, setDataB] = useState(null);
  const [report, setReport] = useState(null);
  const [message, setMessage] = useState("");

  const readFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'json') {
      const text = await file.text();
      return JSON.parse(text);
    }
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    if (!data.length) throw new Error('Tom fil');
    return data.map((r, i) => ({
      line_no: r['Line No'] || r['line_no'] || '',
      item_no: r['Item No'] || r['item_no'] || String(i + 1),
      component: r['Component'] || r['component'] || 'Ukjent',
      size_dn_nps: r['Size (DN/NPS)'] || r['size_dn_nps'] || '',
      spec_material: r['Spec/Material'] || r['spec_material'] || '',
      pipe_class: r['Pipe Class'] || r['pipe_class'] || '',
      start_x: parseFloat(r['Start X'] || r['start_x'] || 0),
      start_y: parseFloat(r['Start Y'] || r['start_y'] || 0),
      start_z: parseFloat(r['Start Z'] || r['start_z'] || 0),
      end_x: parseFloat(r['End X'] || r['end_x'] || 0),
      end_y: parseFloat(r['End Y'] || r['end_y'] || 0),
      end_z: parseFloat(r['End Z'] || r['end_z'] || 0),
      direction: r['Direction'] || r['direction'] || '',
      pressure_bar: parseFloat(r['Pressure (bar)'] || r['pressure_bar'] || 0),
      temperature_c: parseFloat(r['Temperature (°C)'] || r['temperature_c'] || 0),
      insulation_thickness_mm: parseFloat(r['Insulation Thickness (mm)'] || r['insulation_thickness_mm'] || 0),
      schedule: r['Schedule'] || r['schedule'] || '',
      bend_type: r['Bend Type'] || r['bend_type'] || '',
      bend_angle_deg: parseFloat(r['Bend Angle'] || r['bend_angle_deg'] || 0),
      insulation_class: r['Insulation Class'] || r['insulation_class'] || '',
      paint_system: r['Paint System'] || r['paint_system'] || '',
      material_grade: r['Material Grade'] || r['material_grade'] || '',
    }));
  };

  const handleFileA = async (e) => {
    const file = e.target.files[0];
    setFileA(file);
    try {
      const data = await readFile(file);
      setDataA(data);
      if (dataB) runComparison(data, dataB);
      else setMessage("✅ Datasett A lastet. Vent på B.");
      if (onDataA) onDataA(data);
    } catch (err) {
      setMessage(`❌ Feil med A: ${err.message}`);
    }
  };

  const handleFileB = async (e) => {
    const file = e.target.files[0];
    setFileB(file);
    try {
      const data = await readFile(file);
      setDataB(data);
      if (dataA) runComparison(dataA, data);
      else setMessage("✅ Datasett B lastet. Vent på A.");
      if (onDataB) onDataB(data);
    } catch (err) {
      setMessage(`❌ Feil med B: ${err.message}`);
    }
  };

  const runComparison = (a, b) => {
    const rep = compareDatasets(a, b);
    setReport(rep);
    setMessage(`✅ ${rep.matches} match, ${rep.minor} mindre avvik, ${rep.critical} kritiske avvik`);
  };

  const maxDiffs = report ? Math.max(1, ...report.rows.map(r => r.diffs.length)) : 1;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4">
        <div className="card bg-gray-800 p-6 rounded-xl">
          <h3 className="text-xl mb-4">📗 Datasett A</h3>
          <input type="file" accept=".xlsx,.xls,.csv,.json" onChange={handleFileA} className="text-gray-300" />
          {fileA && <p className="text-sm text-gray-400 mt-2">✅ {fileA.name}</p>}
        </div>
        <div className="card bg-gray-800 p-6 rounded-xl">
          <h3 className="text-xl mb-4">📙 Datasett B</h3>
          <input type="file" accept=".xlsx,.xls,.csv,.json" onChange={handleFileB} className="text-gray-300" />
          {fileB && <p className="text-sm text-gray-400 mt-2">✅ {fileB.name}</p>}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.startsWith('✅') ? 'bg-green-900/50 text-green-300' : message.startsWith('❌') ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'}`}>
          {message}
        </div>
      )}

      {report && (
        <div className="card bg-gray-800 rounded-xl p-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-700/50 border border-green-500/30 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-green-400">{report.matches}</div>
              <div className="text-sm text-gray-400 mt-1">✅ Match</div>
            </div>
            <div className="bg-gray-700/50 border border-yellow-500/30 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-yellow-400">{report.minor}</div>
              <div className="text-sm text-gray-400 mt-1">🟡 Mindre avvik</div>
            </div>
            <div className="bg-gray-700/50 border border-red-500/30 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-red-400">{report.critical}</div>
              <div className="text-sm text-gray-400 mt-1">🔴 Kritiske avvik</div>
            </div>
          </div>

          {report.summary && report.summary.length > 0 && (
            <div className="mb-4">
              <h4 className="text-lg font-semibold mb-2">📋 Oppsummering</h4>
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-700 text-gray-300">
                  <tr>
                    <th className="px-3 py-2">Felt</th>
                    <th className="px-3 py-2">Datasett A</th>
                    <th className="px-3 py-2">Datasett B</th>
                    <th className="px-3 py-2">Alvorlighet</th>
                  </tr>
                </thead>
                <tbody>
                  {report.summary.map((s, i) => (
                    <tr key={i} className="border-b border-gray-700">
                      <td className="px-3 py-2">{s.field}</td>
                      <td className="px-3 py-2">{s.a}</td>
                      <td className="px-3 py-2">{s.b}</td>
                      <td className="px-3 py-2">
                        <span className={`badge ${s.severity === 'critical' ? 'bg-red-700' : 'bg-yellow-700'} text-white px-2 py-1 rounded-full text-xs`}>
                          {s.severity === 'critical' ? '🔴 Kritisk' : '🟡 Mindre'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4 className="text-lg font-semibold mb-2">🔍 Detaljer ({report.rows.length} rader)</h4>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-700 text-gray-300 sticky top-0">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Komponent</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Avvik</th>
                  <th className="px-3 py-2">Omfang</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r, i) => {
                  const cls = r.status === 'match' ? 'bg-green-900/20' : r.status === 'critical' ? 'bg-red-900/20' : 'bg-yellow-900/20';
                  const badge = r.status === 'match'
                    ? <span className="bg-green-700 text-white px-2 py-1 rounded-full text-xs">✅ Match</span>
                    : r.status === 'critical'
                    ? <span className="bg-red-700 text-white px-2 py-1 rounded-full text-xs">🔴 Kritisk</span>
                    : <span className="bg-yellow-700 text-white px-2 py-1 rounded-full text-xs">🟡 Mindre</span>;
                  const barColor = r.status === 'match' ? '#10b981' : r.status === 'critical' ? '#ef4444' : '#f59e0b';
                  const barPct = Math.round((r.diffs.length / maxDiffs) * 100);
                  const diffText = r.diffs.map(d => `${d.field}: ${d.a} → ${d.b}`).join(' • ');
                  return (
                    <tr key={i} className={`border-b border-gray-700 ${cls}`}>
                      <td className="px-3 py-2">{r.index + 1}</td>
                      <td className="px-3 py-2 font-medium">{r.component}</td>
                      <td className="px-3 py-2">{badge}</td>
                      <td className="px-3 py-2 text-xs text-gray-300 max-w-xs whitespace-normal">{diffText || '-'}</td>
                      <td className="px-3 py-2">
                        <div className="w-24 h-2 bg-gray-600 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}