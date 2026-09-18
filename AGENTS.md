# MTO-3D-Converter – Prosjektregler

## Arkitekturprinsipp (IKKE forhandlingsbart)
AI observerer → deterministisk kode beregner → usikkerhet FLAGGES
(NEEDS_REVIEW/UNKNOWN). Aldri gjett dimensjoner, komponenter, festepunkter.
Ingen fallback-verdier (50/100/300/1000) – null + flag er korrekt.

## Intern datakontrakt
- length_mm i den normaliserte modellen = ALLTID TOTAL lengde for raden.
- Normalisering (per-stykk → total) skjer ved INGEST (Excel-import) eller
  menneskeretting – aldri i scoring.
- length_ambiguous=true = aldri konverter.
- _lengthSource dokumenterer proveniens: 'AI_vision' | 'MTO' |
  'ASME_estimate' | 'pcf' | 'marker' | 'bend_zero_length'.

## Konvensjoner
- Bend/elbow = skjæringspunktkonvensjon: 0 mm aksial forbruk.
- W.O.L./WOL/Weld-O-Let = Weldlet (aldri Reducer).
- canonicalSizeKey for alle størrelsesnøkler (multi-size → primær-DN).
- Markørtyper (Support, Instrument, DeckPenetration): length_mm = null.

## Arbeidsflyt for kodeendringer
1. Skriftlig spesifikasjon med PASS-kriterier FØR implementering
2. Implementer KUN spesifikasjonen – ingen «forbedringer» utenfor
3. Hard constraints-liste (frosne filer) respekteres alltid
4. Empirisk test i nettleseren mot forhåndssatte forventede tall
5. Opus-review ved GEOMETRI-endringer (buildRouteFromGraph,
   placere-funksjoner)
6. [FASE X-FIKS]-tag på hver endret blokk, norske kommentarer

## Frosne filer (ikke rør uten eksplisitt spesifikasjon)
Viewer3D.jsx, PipeComponent.jsx, stepExport.js, PCFEksport.jsx,
ResultsPanel.jsx

## Kjente begrensninger (dokumentert, ikke bugs)
- Bends renderes som punktmarkører (fase 3: torus fra hjørnetangenter)
- STEP-eksport: bends = 1 mm-stubber (fase 3: ekte buer)
- AI-visjonsvarians: 63–95 % komponenter på samme tegning (2.5 Flash)
- Håndskrevne MTO-er: AI-lesing = utkast, mennesket er kalibrator

## Benchmark (frossen)
Iso 6: 2.5 Flash 63–95 %, 3.8 Flash 58 % reproduserbart,
topo/retning 100 %.
