import { useState, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { GlobalWorkerOptions } from "pdfjs-dist/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

function applyMatrix(x, y, m) {
  return [
    x * m[0] + y * m[2] + m[4],
    x * m[1] + y * m[3] + m[5]
  ];
}

function findNearestText(x, y, textItems, maxDistance = 50) {
  let nearest = null;
  let nearestDist = Infinity;
  textItems.forEach(item => {
    const dx = item.x - x;
    const dy = item.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist && dist < maxDistance) {
      nearestDist = dist;
      nearest = item;
    }
  });
  return nearest;
}

function classifyComponent(text) {
  const t = (text || "").toUpperCase();
  if (t.includes("ELBOW") || t.includes("BEND")) return "Bend";
  if (t.includes("FLANGE")) return "Flange";
  if (t.includes("VALVE") || t.includes("GATE") || t.includes("BALL") || t.includes("CHECK")) return "Valve";
  if (t.includes("REDUCER") || t.includes("SWAGE")) return "Reducer";
  if (t.includes("TEE")) return "Tee";
  if (t.includes("PIPE")) return "Pipe";
  if (t.includes("WELDLET") || t.includes("OLET")) return "Weldlet";
  if (t.includes("GASKET") || t.includes("STUD") || t.includes("BOLT") || t.includes("NUT")) return "Fastener";
  return "Pipe";
}

function extractDN(text) {
  const match = (text || "").match(/DN\s*(\d+)/i);
  if (match) return `DN${match[1]}`;
  const nbMatch = (text || "").match(/\b(\d{2,4})\s*(MM|"|IN|INS)?\b/i);
  if (nbMatch) return `DN${nbMatch[1]}`;
  return "";
}

function extractLength(text) {
  const match = (text || "").match(/\b(\d{2,5})\s*(MM)?\b/);
  return match ? parseInt(match[1]) : 0;
}

export default function PDFParser({ onComponentsReady }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef();

  const parsePDF = async (file) => {
    if (!file) return;
    setLoading(true);
    setProgress("Leser PDF...");

    try {
      const data = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data }).promise;
      
      let allTextItems = [];
      let allLines = [];
      let allCurves = [];
      let allRects = [];
      let mtoSection = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        setProgress(`Analyserer side ${pageNum} av ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNum);

        // 1. Hent tekst
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map((item) => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height
        }));
        allTextItems = allTextItems.concat(textItems);

        // 2. Hent ALL geometri – utvidet med rektangler, kurver, og q/Q-blokker
        const opList = await page.getOperatorList();
        let currentPath = null;
        let cm = [1, 0, 0, 1, 0, 0];
        let currentColor = null;
        let savedStates = [];

        for (let i = 0; i < opList.fnArray.length; i++) {
          const op = opList.fnArray[i];
          const args = opList.argsArray[i] || [];

          switch (op) {
            case pdfjsLib.OPS.save:
              savedStates.push({ cm: [...cm], color: currentColor ? [...currentColor] : null });
              break;

            case pdfjsLib.OPS.restore:
              if (savedStates.length > 0) {
                const saved = savedStates.pop();
                cm = saved.cm;
                currentColor = saved.color;
              }
              break;

            case pdfjsLib.OPS.setStrokeRGBColor:
              currentColor = args;
              break;

            case pdfjsLib.OPS.cm:
              cm = args;
              break;

            case pdfjsLib.OPS.moveTo:
              currentPath = [applyMatrix(args[0], args[1], cm)];
              break;

            case pdfjsLib.OPS.lineTo:
              if (currentPath) {
                currentPath.push(applyMatrix(args[0], args[1], cm));
              }
              break;

            case pdfjsLib.OPS.curveTo:
              if (currentPath && currentPath.length >= 1) {
                const start = currentPath[currentPath.length - 1];
                allCurves.push({
                  start: start,
                  cp1: applyMatrix(args[0], args[1], cm),
                  cp2: applyMatrix(args[2], args[3], cm),
                  end: applyMatrix(args[4], args[5], cm),
                  color: currentColor
                });
              }
              break;

            case pdfjsLib.OPS.rectangle:
              // Rektangel: x, y, w, h
              const rectStart = applyMatrix(args[0], args[1], cm);
              const rectEnd = applyMatrix(args[0] + args[2], args[1] + args[3], cm);
              allRects.push({
                x: rectStart[0],
                y: rectStart[1],
                w: args[2],
                h: args[3],
                color: currentColor
              });
              break;

            case pdfjsLib.OPS.closePath:
            case pdfjsLib.OPS.stroke:
              if (currentPath && currentPath.length > 1) {
                allLines.push({
                  points: currentPath,
                  color: currentColor
                });
              }
              currentPath = null;
              break;

            case pdfjsLib.OPS.fill:
              // fill kan også indikere symboler
              currentPath = null;
              break;
          }
        }
      }

      setProgress("Kobler tekst til geometri...");

      // 3. Identifiser MTO-seksjonen
      const fabMatIndex = allTextItems.findIndex(item => 
        item.text.toUpperCase().includes("FABRICATION MATERIALS")
      );
      
      if (fabMatIndex >= 0) {
        const headerY = allTextItems[fabMatIndex].y;
        const nextSection = allTextItems.findIndex((item, idx) => 
          idx > fabMatIndex && 
          (item.text.toUpperCase().includes("ERECTION MATERIALS") ||
           item.text.toUpperCase().includes("INSTRUMENTS"))
        );
        const endIndex = nextSection >= 0 ? nextSection : allTextItems.length;
        mtoSection = allTextItems.slice(fabMatIndex, endIndex);
      }

      // 4. Generer MTO-komponenter
      const components = [];
      
      // Først: MTO-tabell
      if (mtoSection.length > 0) {
        let currentComponent = null;
        mtoSection.forEach(item => {
          const text = item.text.trim();
          if (!text) return;
          const componentType = classifyComponent(text);
          if (componentType !== "Pipe" || text.length > 20) {
            if (currentComponent) components.push(currentComponent);
            currentComponent = {
              component: text.length > 50 ? text.substring(0, 50) : text,
              size_dn_nps: extractDN(text),
              quantity: 1,
              item_no: String(components.length + 1),
              start_x: 0, start_y: 0, start_z: 0,
              end_x: 0, end_y: 0, end_z: 0,
              insulation_thickness_mm: 0,
              schedule: text.includes("40S") ? "40" : "40",
              confidence: 0.95,
              source: "mto_table"
            };
          } else {
            if (currentComponent && !currentComponent.size_dn_nps) {
              currentComponent.size_dn_nps = extractDN(text);
            }
          }
        });
        if (currentComponent) components.push(currentComponent);
      }

      // 5. Geometri → komponenter
      if (components.length === 0 || allLines.length > 0 || allCurves.length > 0) {
        let x = 0, y = 0, z = 0;
        
        // Linjer = rør
        allLines.forEach((line) => {
          if (line.points.length >= 2) {
            const start = line.points[0];
            const end = line.points[line.points.length - 1];
            const dx = end[0] - start[0];
            const dy = end[1] - start[1];
            const length = Math.sqrt(dx * dx + dy * dy);
            
            if (length < 5) return; // ignorer veldig korte linjer
            
            const nearestText = findNearestText(start[0], start[1], allTextItems);
            const sizeDN = nearestText ? extractDN(nearestText.text) : "";
            
            let direction = "E";
            if (Math.abs(dx) > Math.abs(dy)) {
              direction = dx > 0 ? "E" : "W";
            } else {
              direction = dy > 0 ? "N" : "S";
            }
            
            components.push({
              component: "Pipe",
              item_no: String(components.length + 1),
              size_dn_nps: sizeDN || "DN100",
              direction: direction,
              length_mm: Math.round(length),
              start_x: start[0], start_y: start[1], start_z: 0,
              end_x: end[0], end_y: end[1], end_z: 0,
              insulation_thickness_mm: 0,
              schedule: "40",
              confidence: 0.7,
              source: "geometry"
            });
          }
        });

        // Kurver = bend
        allCurves.forEach((curve) => {
          const start = curve.start;
          const end = curve.end;
          const midX = (start[0] + end[0]) / 2;
          const midY = (start[1] + end[1]) / 2;
          const nearestText = findNearestText(midX, midY, allTextItems);
          const sizeDN = nearestText ? extractDN(nearestText.text) : "";
          
          const fromDir = "E";
          const toDir = "N";
          
          components.push({
            component: "Bend 90-LR",
            item_no: String(components.length + 1),
            size_dn_nps: sizeDN || "DN100",
            direction: `${fromDir}-to-${toDir}`,
            start_x: start[0], start_y: start[1], start_z: 0,
            end_x: end[0], end_y: end[1], end_z: 0,
            insulation_thickness_mm: 0,
            schedule: "40",
            confidence: 0.65,
            source: "geometry_curve"
          });
        });
      }

      setProgress(`Fullført! Fant ${components.length} komponenter.`);
      
      const filtered = components.filter(c => 
        c.component !== "Fastener" && 
        (c.length_mm === undefined || c.length_mm > 1)
      );

      const final = filtered.map((c, i) => ({
        ...c,
        item_no: String(i + 1)
      }));

      setPreview({
        totalComponents: final.length,
        textItems: allTextItems.length,
        lines: allLines.length,
        curves: allCurves.length,
        rects: allRects.length,
        mtoFound: mtoSection.length > 0
      });

      if (final.length > 0) {
        onComponentsReady(final);
      } else {
        alert("Fant ingen komponenter i PDF-en. Prøv en annen fil eller bruk AI-fanen for skannede PDF-er.\n\nTips: Sjekk at PDF-en er en vektor-native ISO-tegning (tekst kan markeres når du åpner den i Adobe Reader).");
      }

    } catch (err) {
      console.error("PDF-parsing feilet:", err);
      alert("Kunne ikke parse PDF-en: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="upload-zone" style={{ borderColor: "#14b8a6" }}>
        <p style={{ fontSize: "1.2rem", fontWeight: 700 }}>📄 Slipp vektor-PDF her</p>
        <p style={{ color: "#6b7280", marginTop: "0.4rem" }}>
          Kun for digitale/vektor-PDF-er (tekst kan markeres). For skannede PDF-er, bruk AI-fanen.
        </p>
        <input
          type="file"
          accept=".pdf"
          ref={fileInputRef}
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) parsePDF(file);
          }}
          style={{ display: "none" }}
        />
        <button
          className="btn btn-teal"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          {loading ? "⏳ Parser PDF..." : "📤 Last opp PDF og parse"}
        </button>
      </div>

      {progress && (
        <div className="message info" style={{ marginTop: "1rem" }}>
          {progress}
        </div>
      )}

      {preview && (
        <div style={{ marginTop: "1rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>
          <strong>PDF-analyse fullført:</strong><br />
          📝 {preview.textItems} tekstblokker funnet<br />
          📏 {preview.lines} linjer (rør) funnet<br />
          🌀 {preview.curves} kurver (bend) funnet<br />
          📦 {preview.rects} rektangler funnet<br />
          📊 MTO-tabell: {preview.mtoFound ? "Funnet ✓" : "Ikke funnet"}
        </div>
      )}

      <p style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "0.8rem" }}>
        💡 Denne komponenten bruker pdf.js til å lese vektor-native PDF-er direkte – ingen AI, 100 % deterministisk.
        For skannede eller håndskrevne PDF-er, bruk AI-fanen.
      </p>
    </div>
  );
}