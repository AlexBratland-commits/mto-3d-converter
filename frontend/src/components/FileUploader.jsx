import { downloadStepFile } from "../services/stepExport";
import { useState } from "react";
import * as XLSX from "xlsx";
import ComponentTable from "./ComponentTable";
import Viewer3D from "./Viewer3D";

export default function FileUploader() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState(null);
  const [asmeOn, setAsmeOn] = useState(true);

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setMessage("Laster opp og prosesserer...");
    setData(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!json.length) throw new Error("Tom fil");

      const components = json.map((r, i) => ({
        line_no: r["Line No"] || r["line_no"] || "",
        item_no: r["Item No"] || r["item_no"] || String(i + 1),
        component: r["Component"] || r["component"] || "Ukjent",
        size_dn_nps: r["Size (DN/NPS)"] || r["size_dn_nps"] || "",
        spec_material: r["Spec/Material"] || r["spec_material"] || "",
        start_x: parseFloat(r["Start X"] || r["start_x"] || 0),
        start_y: parseFloat(r["Start Y"] || r["start_y"] || 0),
        start_z: parseFloat(r["Start Z"] || r["start_z"] || 0),
        end_x: parseFloat(r["End X"] || r["end_x"] || 0),
        end_y: parseFloat(r["End Y"] || r["end_y"] || 0),
        end_z: parseFloat(r["End Z"] || r["end_z"] || 0),
        insulation_thickness_mm: parseFloat(r["Insulation Thickness (mm)"] || r["insulation_thickness_mm"] || 0),
        schedule: r["Schedule"] || r["schedule"] || "",
        bend_type: r["Bend Type"] || r["bend_type"] || "",
        bend_angle_deg: parseFloat(r["Bend Angle"] || r["bend_angle_deg"] || 0),
        material_grade: r["Material Grade"] || r["material_grade"] || "",
      }));

      setData(components);
      setStatus("success");
      setMessage(`✅ ${file.name} prosessert! ${components.length} komponenter funnet.`);
    } catch (err) {
      setStatus("error");
      setMessage(`❌ ${err.message}`);
    }
  };

  const exportJSON = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "MTO_Export.json";
    a.click();
  };

  const exportCSV = () => {
    if (!data?.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map(row => headers.map(h => row[h] ?? "").join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "MTO_Export.csv";
    a.click();
  };

  const exportSTEP = () => {
    const ok = downloadStepFile(data, "MTO_Export.stp");
    if (!ok) alert("Ingen brukbare koordinater funnet – ingenting å eksportere.");
  };

  return (
    <div className="max-w-6xl mx-auto mt-10">
      <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            setFile(e.target.files[0]);
            setStatus("");
            setMessage("");
            setData(null);
          }}
          className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700"
        />
        {file && (
          <p className="mt-3 text-gray-300 text-sm">
            Valgt: <span className="text-white">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || status === "uploading"}
        className="mt-4 w-full py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white"
      >
        {status === "uploading" ? "⏳ Prosesserer..." : "📤 Last opp og analyser"}
      </button>

      {message && (
        <div className={`mt-4 p-4 rounded-lg text-sm ${
          status === "success" ? "bg-green-900/50 text-green-300" :
          status === "error" ? "bg-red-900/50 text-red-300" : "bg-gray-800 text-gray-300"
        }`}>
          {message}
        </div>
      )}

      {data && (
        <>
          <ComponentTable data={data} />
          <Viewer3D components={data} asmeOn={asmeOn} onToggleAsme={() => setAsmeOn(prev => !prev)} />
          <div className="flex gap-4 mt-6">
            <button onClick={exportJSON} className="px-6 py-3 bg-green-700 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors">📥 JSON</button>
            <button onClick={exportCSV} className="px-6 py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors">📊 CSV</button>
            <button onClick={exportSTEP} className="px-6 py-3 bg-teal-700 hover:bg-teal-600 text-white rounded-lg font-semibold transition-colors">🔧 STEP</button>
          </div>
        </>
      )}
    </div>
  );
}