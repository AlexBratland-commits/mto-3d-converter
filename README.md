# MTO.flow – ISO-tegning → MTO + 3D

Konverterer rør-isometriske tegninger til strukturert MTO (materialliste)
og 3D-senterlinjemodell, med kvalitetsscore mot MTO-referansen.

## Hvordan det fungerer

1. **MTO-fanen:** last opp bilde av MTO-tabellen (AI leser) ELLER importer
   Excel/CSV. AI-lesingen er et UTKAST – mennesket retter og kalibrerer.
   Korrigert MTO = fast fasit for scoring.
2. **AI-fanen:** last opp ISO-tegningen (PDF/bilde) eller importer en
   PCF-fil. Appen bygger senterlinjegeometri (rør, bends, flenser,
   ventiler, weldlets, grener) og viser den i 3D.
3. **Avviksrapport:** viser automatisk hva som matcher MTO-en og hva som
   avviker – med flagg for usikkerhet i stedet for gjetninger.
4. **Eksport:** Excel/CSV/JSON (MTO), STEP (til Inventor), PCF.

## To inngangsveier

- **PCF-fil (ISOGEN):** 100 % deterministisk import, ingen AI-kall.
- **ISO-tegning (PDF/bilde):** AI-vision + OCR → geometri.

## Kvalitetsscore

Fire tall: Komponenter / Lengder / Topologi / Retninger – alle
rekonstruerbare mot MTO-referansen. N/A = kan ikke verifiseres
(aldri 0 % som feiltolkes).

## Teknisk

- React/Vite frontend, Vercel-deploy fra main
- AI: OpenRouter (Gemini 2.5 Flash anbefalt)
- Arkitekturprinsipp og prosjektregler: se CLAUDE.md
- Måleprovenyen: _lengthSource-feltet dokumenterer hvor hver lengde
  kommer fra

## Bruk

1. Sett OpenRouter API-nøkkel (nøkkel-ikonet)
2. Opprett prosjekt (ProjectManager)
3. MTO-fanen: les/importer → rett i tabellen → lagre
4. AI-fanen: last tegning/PCF → analyser → se 3D og score
5. Eksporter Excel + STEP
