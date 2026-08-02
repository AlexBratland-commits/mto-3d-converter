import { normalizeComponentName } from "./geometryEngine";

export function scoreExtraction(components, lomItems, continuityIssues) {
  const norm = (s) => String(s || "").toUpperCase().replace(/\s/g, "");
  const isPipe = (c) => normalizeComponentName(c.component) === "Pipe";

  // 1) Komponenter mot MTO
  const lom = {}, got = {};
  lomItems.forEach(i => { const k = `${normalizeComponentName(i.component)}_${norm(i.size_dn_nps||i.size)}`; lom[k] = (lom[k]||0)+(Number(i.quantity)||1); });
  components.forEach(c => { const k = `${normalizeComponentName(c.component)}_${norm(c.size_dn_nps)}`; got[k] = (got[k]||0)+1; });
  
  const expTot = Object.values(lom).reduce((a,b)=>a+b,0) || 1;
  const matched = Object.keys(lom).reduce((a,k)=>a+Math.min(lom[k], got[k]||0),0);
  const componentScore = Math.round((matched / expTot) * 100);

  // 2) Lengder mot MTO-pipe
  const lomLen = lomItems.filter(isPipe).map(i=>Number(i.length_mm)).filter(n=>n>0).sort((a,b)=>a-b);
  const gotLen = components.filter(isPipe).map(c=>Number(c.length_mm)).filter(n=>n>0).sort((a,b)=>a-b);
  const pool = [...lomLen]; 
  let lenHit = 0;
  gotLen.forEach(g => { const i = pool.findIndex(v=>Math.abs(v-g)<=2); if (i>=0){lenHit++; pool.splice(i,1);} });
  const lengthScore = lomLen.length ? Math.round((lenHit / lomLen.length) * 100) : (gotLen.length ? 0 : 100);

  // 3) Topologi: andel forbindelser uten gap
  const links = Math.max(components.length - 1, 1);
  const topologyScore = Math.round((1 - (continuityIssues.length / links)) * 100);

  // 4) Retnings-konsistens (Proxy)
  let dirOk = 0, dirN = 0;
  components.forEach(c => { 
    if (!isPipe(c) || !c.direction) return; 
    dirN++;
    if (c._missingLength) return; 
    
    const dx = c.end_x - c.start_x;
    const dy = c.end_y - c.start_y;
    const dz = c.end_z - c.start_z;
    
    const dom = [Math.abs(dx), Math.abs(dy), Math.abs(dz)].indexOf(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)));
    
    const aiDir = String(c.direction).toUpperCase();
    if ((dom === 0 && (aiDir.includes('E') || aiDir.includes('W'))) ||
        (dom === 1 && (aiDir.includes('N') || aiDir.includes('S'))) ||
        (dom === 2 && (aiDir.includes('UP') || aiDir.includes('DOWN')))) {
      dirOk++;
    }
  });
  const directionScore = dirN ? Math.round((dirOk / dirN) * 100) : 100;

  return { componentScore, lengthScore, topologyScore, directionScore };
}