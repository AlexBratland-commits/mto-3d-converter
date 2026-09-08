import { normalizeComponentName, getVector } from "./geometryEngine";
import { canonicalSizeKey } from "./parseUtils";

// [FASE 1-FIKS] P1: MTO-admin-rader (fasteners, isolasjonsstrips) modelleres bevisst
// ikke i 3D (se buildExpectedCountsChecklist) og skal derfor ikke telle i komponent-nevneren.
// "INSULATING STRIP" normaliseres IKKE til 'Fastener' av normalizeComponentName, så den
// må også fanges opp på rå streng.
function isMtoAdminItem(item) {
  const raw = String(item.component || "").toUpperCase();
  return normalizeComponentName(item.component) === "Fastener" || raw.includes("INSULAT");
}

// [FASE 1-FIKS] scoreExtraction er måleinstrumentet, ikke geometrien.
// Alle fire scorer kan returnere null når det ikke finnes noe verifiserbart grunnlag
// (f.eks. ingen MTO-lengder, ingen komponenter) — null betyr «kan ikke verifiseres»,
// og skal IKKE tolkes som 0 % eller 100 %.
export function scoreExtraction(components, lomItems, continuityIssues, topologyWarnings = []) {
  const isPipe = (c) => normalizeComponentName(c.component) === "Pipe";

  // 1) Komponenter mot MTO [FASE 1-FIKS] P1: ekskluder admin-rader fra lom-siden,
  // og fjern den kunstige `|| 1`-fallbacken på nevneren (expTot === 0 → ikke verifiserbart).
  // [FASE 2a-FIKS] B1: canonicalSizeKey i stedet for rå størrelsesstreng, slik at
  // MTO "WELDLET DN250" og AI "DN250XDN80" matcher som samme fysiske del.
  const lom = {}, got = {};
  const adminExcluded = lomItems.filter(isMtoAdminItem).length;
  lomItems.filter((i) => !isMtoAdminItem(i)).forEach((i) => {
    const k = `${normalizeComponentName(i.component)}_${canonicalSizeKey(i.size_dn_nps || i.size)}`;
    lom[k] = (lom[k] || 0) + (Number(i.quantity) || 1);
  });
  components.forEach((c) => {
    const k = `${normalizeComponentName(c.component)}_${canonicalSizeKey(c.size_dn_nps)}`;
    got[k] = (got[k] || 0) + 1;
  });

  const expTot = Object.values(lom).reduce((a, b) => a + b, 0);
  const matched = Object.keys(lom).reduce((a, k) => a + Math.min(lom[k], got[k] || 0), 0);
  const componentScore = expTot === 0 ? null : Math.round((matched / expTot) * 100);

  // 2) Lengder mot MTO-pipe [FASE 1-FIKS] P2: MTO-lengder er TOTALER per rad, ikke
  // enkeltsegmenter — sammenlign derfor summert mm per størrelse, ikke multiset-matching.
  // Valgt formel: vektet sum-avvik per størrelse (alternativ hadde vært binær
  // within-tolerance per størrelse; vektet sum-avvik gir en jevnere, mindre hakkete score).
  // [FASE 2a-FIKS] B1: canonicalSizeKey også her, slik at lengdesummer per størrelse
  // ikke splittes opp av multi-size-formatforskjeller mellom MTO og AI.
  const lomLenSum = {}, gotLenSum = {};
  lomItems.forEach((i) => {
    if (normalizeComponentName(i.component) !== "Pipe") return;
    const len = Number(i.length_mm);
    if (!(len > 0)) return;
    const k = canonicalSizeKey(i.size_dn_nps || i.size);
    lomLenSum[k] = (lomLenSum[k] || 0) + len;
  });
  components.forEach((c) => {
    // VIKTIG: sanitizeRouteGeometry setter length_mm = ASME-tabellverdi på ikke-pipe-
    // komponenter (ventil, flange …) — uten pipe-filteret forurenses summen.
    if (normalizeComponentName(c.component) !== "Pipe") return;
    const len = Number(c.length_mm);
    if (!(len > 0)) return;
    const k = canonicalSizeKey(c.size_dn_nps);
    gotLenSum[k] = (gotLenSum[k] || 0) + len;
  });

  const lomSizes = Object.keys(lomLenSum);
  let lengthScore = null;
  const lengthDetails = { bySize: [] };
  if (lomSizes.length > 0) {
    let okMm = 0, totMm = 0;
    lomSizes.forEach((k) => {
      const exp = lomLenSum[k];
      const foundMm = gotLenSum[k] || 0;
      totMm += exp;
      okMm += exp * Math.max(0, 1 - Math.abs(foundMm - exp) / exp);
      lengthDetails.bySize.push({ size: k, expectedMm: exp, foundMm });
    });
    lengthScore = totMm > 0 ? Math.round((okMm / totMm) * 100) : null;
  }

  // 3) Topologi [FASE 1-FIKS] P3: tell både continuityIssues (gap-brudd) OG
  // topologyWarnings (flere rørløp, uplasserte komponenter) — i graph-modus kan
  // continuityIssues alene aldri bli > 0, så uten dette er scoren matematisk alltid 100.
  let topologyScore = null;
  if (components.length > 0) {
    const links = Math.max(components.length - 1, 1);
    const issues = continuityIssues.length + topologyWarnings.length;
    topologyScore = Math.round((1 - Math.min(1, issues / links)) * 100);
  }

  // 4) Retnings-konsistens [FASE 1-FIKS] P4:
  // (a) rør uten lengde (_missingLength) hoppes over FØR dirN++, slik at de ikke
  //     forurenser nevneren med et tall som aldri kan gi poeng.
  // (b) ingen substring-matching på retningsstrenger ("E-to-N" matchet før både E og N) —
  //     bruk getVector() til å hente en faktisk retningsvektor, og sammenlign dominant
  //     akse (størst |x|/|y|/|z|) på BÅDE plassert segment og AI-vektor.
  let dirOk = 0, dirN = 0;
  components.forEach((c) => {
    if (!isPipe(c) || !c.direction) return;
    if (c._missingLength) return;
    dirN++;

    const dx = c.end_x - c.start_x;
    const dy = c.end_y - c.start_y;
    const dz = c.end_z - c.start_z;
    const placedDom = [Math.abs(dx), Math.abs(dy), Math.abs(dz)].indexOf(
      Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
    );

    const aiVec = getVector(c.direction);
    if (!aiVec) return; // uleselig retning: telles i nevner, gir ikke poeng

    const aiDom = [Math.abs(aiVec[0]), Math.abs(aiVec[1]), Math.abs(aiVec[2])].indexOf(
      Math.max(Math.abs(aiVec[0]), Math.abs(aiVec[1]), Math.abs(aiVec[2]))
    );

    if (placedDom === aiDom) dirOk++;
  });
  const directionScore = dirN ? Math.round((dirOk / dirN) * 100) : null;

  return {
    componentScore,
    lengthScore,
    topologyScore,
    directionScore,
    componentDetails: { expected: expTot, matched, adminExcluded },
    lengthDetails,
    verifiable: {
      components: expTot > 0,
      lengths: lomSizes.length > 0,
      directions: dirN > 0,
    },
  };
}
