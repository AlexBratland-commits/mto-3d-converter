/* ================================================================
   stepExport.js — STEP (ISO 10303-21) exporter
   ================================================================
   
   Straight pipes → MANIFOLD_SOLID_BREP (CYLINDRICAL_SURFACE)
   Bend elbows   → Segmented arc of short cylinders (smooth curve)
   Valves/flanges → Solid cylinder with component-specific radius
   
   Default mode: 'solid'
   ================================================================ */

function toNumber(value) {
  if (value === undefined || value === null) return 0;
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

/* ── Pipe size → outer radius (mm) ─────────────────────────────── */

const NPS_OD_MM = {
  0.125:10.3, 0.25:13.7, 0.5:21.3, 0.75:26.7,
  1:33.4, 1.25:42.2, 1.5:48.3, 2:60.3, 2.5:73, 3:88.9,
  4:114.3, 5:141.3, 6:168.3, 8:219.1, 10:273.1, 12:323.9,
  14:355.6, 16:406.4, 18:457, 20:508, 22:559, 24:610
};
const DN_OD_MM = {
  15:21.3, 20:26.7, 25:33.4, 32:42.2, 40:48.3, 50:60.3,
  65:73, 80:88.9, 100:114.3, 125:141.3, 150:168.3, 200:219.1,
  250:273.1, 300:323.9, 350:355.6, 400:406.4, 450:457, 500:508, 600:610
};

function parsePipeRadius(sizeStr) {
  if (!sizeStr) return null;
  const s = String(sizeStr).trim();
  const dn = s.match(/^(?:DN\s*)?(\d+)$/i);
  if (dn) { const od = DN_OD_MM[parseInt(dn[1])] || parseInt(dn[1]); return od / 2; }
  const nps = s.match(/^(?:NPS\s*)?(\d+(?:\/\d+)?)\s*(?:[""]|in|inch)?$/i);
  if (nps) {
    const raw = nps[1];
    const v = raw.includes('/') ? parseFloat(raw.split('/')[0]) / parseFloat(raw.split('/')[1]) : parseFloat(raw);
    return (NPS_OD_MM[v] || v * 25.4) / 2;
  }
  const num = parseFloat(s);
  if (Number.isFinite(num) && num > 0) return num / 2;
  return null;
}

function fmt(v) {
  const r = Math.round(v * 1e6) / 1e6;
  if (Math.abs(r) < 1e-10) return '0.';
  const s = r.toString();
  if (s.includes('.') || s.includes('e') || s.includes('E')) return s;
  return s + '.';
}

/* ── Vector math ────────────────────────────────────────────────── */

const V = {
  add:  (a,b) => ({x:a.x+b.x, y:a.y+b.y, z:a.z+b.z}),
  sub:  (a,b) => ({x:a.x-b.x, y:a.y-b.y, z:a.z-b.z}),
  scale:(a,s) => ({x:a.x*s, y:a.y*s, z:a.z*s}),
  dot:  (a,b) => a.x*b.x + a.y*b.y + a.z*b.z,
  cross:(a,b) => ({x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x}),
  len:  (a)   => Math.sqrt(a.x*a.x + a.y*a.y + a.z*a.z),
  norm: (a)   => { const l=V.len(a); return l<1e-10?{x:0,y:0,z:0}:{x:a.x/l,y:a.y/l,z:a.z/l}; },
  rot:  (v,k,θ) => {                         // Rodrigues rotation of v around unit-axis k by θ rad
    const c=Math.cos(θ), s=Math.sin(θ), d=V.dot(v,k),
          cr=V.cross(k,v);
    return {x:v.x*c+cr.x*s+k.x*d*(1-c), y:v.y*c+cr.y*s+k.y*d*(1-c), z:v.z*c+cr.z*s+k.z*d*(1-c)};
  },
  fromXYZ:(x,y,z) => ({x,y,z}),
  eq:(a,b,tol=5) => Math.abs(a.x-b.x)<tol && Math.abs(a.y-b.y)<tol && Math.abs(a.z-b.z)<tol
};

/* ── Component type detection ───────────────────────────────────── */

function getComponentType(c) {
  const name = (c.component || '').toUpperCase().trim();
  const angle = toNumber(c.bend_angle_deg);
  if (angle > 0 || name.includes('BEND') || name.includes('ELBOW')) return 'BEND';
  if (name.includes('REDUCER') || name.includes('RED')) return 'REDUCER';
  if (name.includes('FLANGE')) return 'FLANGE';
  if (name.includes('VALVE') || name.includes('GATE') || name.includes('BALL') || name.includes('CHECK')) return 'VALVE';
  return 'STRAIGHT';
}

/* ── Find tangent directions from adjacent segments ─────────────── */

function findTangent(components, point, sense, tolerance) {
  // sense='in': find segment ending near point → tangent pointing INTO point
  // sense='out': find segment starting near point → tangent pointing AWAY from point
  for (const c of components) {
    const s = V.fromXYZ(toNumber(c.start_x), toNumber(c.start_y), toNumber(c.start_z));
    const e = V.fromXYZ(toNumber(c.end_x),   toNumber(c.end_y),   toNumber(c.end_z));
    if (sense === 'in'  && V.eq(e, point, tolerance)) return V.norm(V.sub(point, s));
    if (sense === 'out' && V.eq(s, point, tolerance)) return V.norm(V.sub(e, point));
  }
  return null;
}

/* ── Compute arc centerline points for a bend ───────────────────── */

function computeArcPoints(S, E, thetaRad, planeNormal, numSegs) {
  const chord    = V.sub(E, S);
  const L        = V.len(chord);
  const chordDir = V.norm(chord);

  if (L < 1e-6 || Math.abs(thetaRad) < 1e-6) return [S, E];

  const sinHalf = Math.sin(thetaRad / 2);
  if (Math.abs(sinHalf) < 1e-10) return [S, E];

  const Rb = L / (2 * sinHalf);                           // bend radius
  const M  = V.scale(V.add(S, E), 0.5);                   // chord midpoint
  const h  = Math.sqrt(Math.max(0, Rb * Rb - L * L / 4));// dist M→C

  // Perpendicular in bend plane
  const perp = V.norm(V.cross(chordDir, planeNormal));

  // Two possible centers — pick the one where tangent at S aligns with incoming direction
  const C1 = V.add(M, V.scale(perp, h));
  const C2 = V.add(M, V.scale(perp, -h));

  // Tangent at S for each center: cross(planeNormal, norm(S-C))
  const r1 = V.norm(V.sub(S, C1));
  const r2 = V.norm(V.sub(S, C2));
  const t1 = V.norm(V.cross(planeNormal, r1));
  const t2 = V.norm(V.cross(planeNormal, r2));

  // Check alignment with chord direction (arc should go from S toward E)
  const C = V.dot(t1, chordDir) > V.dot(t2, chordDir) ? C1 : C2;

  // Compute points along arc
  const startRadial = V.norm(V.sub(S, C));
  const points = [];
  for (let i = 0; i <= numSegs; i++) {
    const angle = thetaRad * i / numSegs;
    const rotated = V.rot(startRadial, planeNormal, angle);
    points.push(V.add(C, V.scale(rotated, Rb)));
  }
  return points;
}

/* ── Compute bend plane normal ──────────────────────────────────── */

function computeBendPlaneNormal(components, sx, sy, sz, ex, ey, ez, tolerance) {
  const S = V.fromXYZ(sx, sy, sz);
  const E = V.fromXYZ(ex, ey, ez);

  const tIn  = findTangent(components, S, 'in',  tolerance);
  const tOut = findTangent(components, E, 'out', tolerance);

  if (tIn && tOut) {
    const n = V.cross(tIn, tOut);
    if (V.len(n) > 0.001) return V.norm(n);
  }

  // Fallback: plane containing chord and the "most vertical" direction
  const chord = V.norm(V.sub(E, S));
  const up    = {x:0, y:0, z:1};
  const n1    = V.cross(chord, up);
  if (V.len(n1) > 0.001) return V.norm(n1);
  return V.norm(V.cross(chord, {x:0, y:1, z:0}));
}

/* ── Write one cylinder MANIFOLD_SOLID_BREP ─────────────────────── */

function writeCylinderBrep(r, E, startPt, endPt, R) {
  let sx=startPt.x, sy=startPt.y, sz=startPt.z;
  let ex=endPt.x,   ey=endPt.y,   ez=endPt.z;

  if (sx===ex && sy===ey && sz===ez) ex = sx + 1;

  const ax=ex-sx, ay=ey-sy, az=ez-sz;
  const len=Math.sqrt(ax*ax+ay*ay+az*az);
  if (len<1e-6) return null;
  const dx=ax/len, dy=ay/len, dz=az/len;

  let rx,ry,rz;
  const cz_x=dy, cz_y=-dx, cz_z=0;
  const czL=Math.sqrt(cz_x*cz_x+cz_y*cz_y);
  if (czL>0.001) { rx=cz_x/czL; ry=cz_y/czL; rz=0; }
  else {
    const aL=Math.sqrt(dz*dz+dx*dx);
    if (aL>0.001) { rx=-dz/aL; ry=0; rz=dx/aL; }
    else { rx=1; ry=0; rz=0; }
  }

  const s1x=sx+R*rx, s1y=sy+R*ry, s1z=sz+R*rz;
  const s2x=ex+R*rx, s2y=ey+R*ry, s2z=ez+R*rz;

  /* Geometry */
  const axisDir=r(); E(`${axisDir}=DIRECTION('',(${fmt(dx)},${fmt(dy)},${fmt(dz)}));`);
  const refDir =r(); E(`${refDir}=DIRECTION('',(${fmt(rx)},${fmt(ry)},${fmt(rz)}));`);
  const axisVec=r(); E(`${axisVec}=VECTOR('',${axisDir},1.);`);

  const cPtS  =r(); E(`${cPtS}=CARTESIAN_POINT('',(${fmt(sx)},${fmt(sy)},${fmt(sz)}));`);
  const cPtE  =r(); E(`${cPtE}=CARTESIAN_POINT('',(${fmt(ex)},${fmt(ey)},${fmt(ez)}));`);
  const cPtS1 =r(); E(`${cPtS1}=CARTESIAN_POINT('',(${fmt(s1x)},${fmt(s1y)},${fmt(s1z)}));`);
  const cPtS2 =r(); E(`${cPtS2}=CARTESIAN_POINT('',(${fmt(s2x)},${fmt(s2y)},${fmt(s2z)}));`);

  const v1=r(); E(`${v1}=VERTEX_POINT('',${cPtS1});`);
  const v2=r(); E(`${v2}=VERTEX_POINT('',${cPtS2});`);

  const plS=r(); E(`${plS}=AXIS2_PLACEMENT_3D('',${cPtS},${axisDir},${refDir});`);
  const plE=r(); E(`${plE}=AXIS2_PLACEMENT_3D('',${cPtE},${axisDir},${refDir});`);

  const cylS=r(); E(`${cylS}=CYLINDRICAL_SURFACE('',${plS},${fmt(R)});`);
  const plnS=r(); E(`${plnS}=PLANE('',${plS});`);
  const plnE=r(); E(`${plnE}=PLANE('',${plE});`);
  const cirS=r(); E(`${cirS}=CIRCLE('',${plS},${fmt(R)});`);
  const cirE=r(); E(`${cirE}=CIRCLE('',${plE},${fmt(R)});`);
  const seam=r(); E(`${seam}=LINE('',${cPtS1},${axisVec});`);

  /* Topology */
  const ecCS=r(); E(`${ecCS}=EDGE_CURVE('',${v1},${v1},${cirS},.T.);`);
  const ecCE=r(); E(`${ecCE}=EDGE_CURVE('',${v2},${v2},${cirE},.T.);`);
  const ecSm=r(); E(`${ecSm}=EDGE_CURVE('',${v1},${v2},${seam},.T.);`);

  const oSF=r();  E(`${oSF}=ORIENTED_EDGE('',*,*,${ecCS},.T.);`);
  const oSmF=r(); E(`${oSmF}=ORIENTED_EDGE('',*,*,${ecSm},.T.);`);
  const oER=r();  E(`${oER}=ORIENTED_EDGE('',*,*,${ecCE},.F.);`);
  const oSmR=r(); E(`${oSmR}=ORIENTED_EDGE('',*,*,${ecSm},.F.);`);
  const oSR=r();  E(`${oSR}=ORIENTED_EDGE('',*,*,${ecCS},.F.);`);
  const oEF=r();  E(`${oEF}=ORIENTED_EDGE('',*,*,${ecCE},.T.);`);

  const lC=r(); E(`${lC}=EDGE_LOOP('',(${oSF},${oSmF},${oER},${oSmR}));`);
  const lS=r(); E(`${lS}=EDGE_LOOP('',(${oSR}));`);
  const lE=r(); E(`${lE}=EDGE_LOOP('',(${oEF}));`);

  const fC=r(); E(`${fC}=FACE_OUTER_BOUND('',${lC},.T.);`);
  const fS=r(); E(`${fS}=FACE_OUTER_BOUND('',${lS},.T.);`);
  const fE=r(); E(`${fE}=FACE_OUTER_BOUND('',${lE},.T.);`);

  const aC=r(); E(`${aC}=ADVANCED_FACE('',(${fC}),${cylS},.T.);`);
  const aS=r(); E(`${aS}=ADVANCED_FACE('',(${fS}),${plnS},.F.);`);
  const aE=r(); E(`${aE}=ADVANCED_FACE('',(${fE}),${plnE},.T.);`);

  const sh=r(); E(`${sh}=CLOSED_SHELL('',(${aC},${aS},${aE}));`);
  const br=r(); E(`${br}=MANIFOLD_SOLID_BREP('',${sh});`);

  return br;
}

/* ================================================================
   SOLID EXPORT
   ================================================================ */

export function buildStepFileSolid(
  components,
  { fileName = 'MTO_Export.stp', productName = 'MTO 3D Export' } = {}
) {
  if (!components?.length) return null;

  let id = 0;
  const r  = () => '#' + (++id);
  const E  = (line) => { out += line + '\n'; };
  let out  = '';

  const DEGEN_STUB     = 1.0;
  const DEFAULT_RADIUS = 25.0;
  const TOLERANCE      = 5;   // mm for endpoint matching
  const FLANGE_SCALE   = 1.5; // flange OD ≈ pipe OD × 1.5

  /* ── Structural chain (#1–#13) ── */

  const appContext      = r();
  const prodContext     = r();
  const apDef           = r();
  const prodDefCtx      = r();
  const product         = r();
  const prodDefForm     = r();
  const prodDef         = r();
  const prodDefShape    = r();
  const lengthUnit      = r();
  const planeAngleUnit  = r();
  const solidAngleUnit  = r();
  const uncertainty     = r();
  const geomContext     = r();

  const safeName = productName.replace(/'/g, '');

  E(`${appContext}=APPLICATION_CONTEXT('configuration controlled 3D design of mechanical parts and assemblies');`);
  E(`${prodContext}=PRODUCT_CONTEXT('',${appContext},'mechanical');`);
  E(`${apDef}=APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,${appContext});`);
  E(`${prodDefCtx}=PRODUCT_DEFINITION_CONTEXT('',${appContext},'design');`);
  E(`${product}=PRODUCT('${safeName}','${safeName}','',(${prodContext}));`);
  E(`${prodDefForm}=PRODUCT_DEFINITION_FORMATION('','',${product});`);
  E(`${prodDef}=PRODUCT_DEFINITION('design','',${prodDefForm},${prodDefCtx});`);
  E(`${prodDefShape}=PRODUCT_DEFINITION_SHAPE('','',${prodDef});`);
  E(`${lengthUnit}=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));`);
  E(`${planeAngleUnit}=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));`);
  E(`${solidAngleUnit}=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());`);
  E(`${uncertainty}=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-3),${lengthUnit},'distance_accuracy_value','confusion accuracy');`);
  E(`${geomContext}=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${lengthUnit},${planeAngleUnit},${solidAngleUnit}))REPRESENTATION_CONTEXT('','3D'));`);

  /* ── Geometry per component ── */

  const brepRefs = [];

  for (const c of components) {
    const sx = toNumber(c.start_x), sy = toNumber(c.start_y), sz = toNumber(c.start_z);
    const ex = toNumber(c.end_x),   ey = toNumber(c.end_y),   ez = toNumber(c.end_z);
    const type = getComponentType(c);

    let baseR = parsePipeRadius(c.size_dn_nps || '') || DEFAULT_RADIUS;
    if (type === 'FLANGE') baseR *= FLANGE_SCALE;
    if (type === 'REDUCER') baseR *= 1.2; // simplified: average diameter

    const S = V.fromXYZ(sx, sy, sz);
    const E_pt = V.fromXYZ(ex, ey, ez);

    if (type === 'BEND') {
      const angleDeg = toNumber(c.bend_angle_deg) || 90;
      const thetaRad = angleDeg * Math.PI / 180;
      const numSegs  = Math.max(6, Math.ceil(angleDeg / 7.5));

      const planeN = computeBendPlaneNormal(components, sx, sy, sz, ex, ey, ez, TOLERANCE);
      const arcPts = computeArcPoints(S, E_pt, thetaRad, planeN, numSegs);

      for (let i = 0; i < arcPts.length - 1; i++) {
        const br = writeCylinderBrep(r, E, arcPts[i], arcPts[i + 1], baseR);
        if (br) brepRefs.push(br);
      }
    } else {
      /* STRAIGHT / VALVE / FLANGE / REDUCER → single cylinder */
      const br = writeCylinderBrep(r, E, S, E_pt, baseR);
      if (br) brepRefs.push(br);
    }
  }

  if (!brepRefs.length) return null;

  /* ── Top-level representation ── */

  const shapeRep    = r();
  const shapeDefRep = r();
  E(`${shapeRep}=ADVANCED_BREP_SHAPE_REPRESENTATION('',(${brepRefs.join(',')}),${geomContext});`);
  E(`${shapeDefRep}=SHAPE_DEFINITION_REPRESENTATION(${prodDefShape},${shapeRep});`);

  /* ── HEADER ── */

  const now = new Date().toISOString();
  const header =
    `ISO-10303-21;\nHEADER;\n` +
    `FILE_DESCRIPTION(('STEP solid pipe export from MTO Converter'),'2;1');\n` +
    `FILE_NAME('${fileName}','${now}',('Author'),(''),'MTO Converter','','');\n` +
    `FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\n` +
    `ENDSEC;\nDATA;\n`;

  return header + out + 'ENDSEC;\nEND-ISO-10303-21;\n';
}

/* ================================================================
   WIREFRAME EXPORT
   ================================================================ */

export function buildStepFileWireframe(
  components,
  { fileName = 'MTO_Export.stp', productName = 'MTO 3D Export' } = {}
) {
  if (!components?.length) return null;

  let id = 0;
  const r  = () => '#' + (++id);
  const E  = (line) => { out += line + '\n'; };
  let out  = '';

  const DEGEN_STUB = 1.0;
  const TOLERANCE  = 5;

  const appContext      = r();
  const prodContext     = r();
  const apDef           = r();
  const prodDefCtx      = r();
  const product         = r();
  const prodDefForm     = r();
  const prodDef         = r();
  const prodDefShape    = r();
  const lengthUnit      = r();
  const planeAngleUnit  = r();
  const solidAngleUnit  = r();
  const uncertainty     = r();
  const geomContext     = r();

  const safeName = productName.replace(/'/g, '');

  E(`${appContext}=APPLICATION_CONTEXT('configuration controlled 3D design of mechanical parts and assemblies');`);
  E(`${prodContext}=PRODUCT_CONTEXT('',${appContext},'mechanical');`);
  E(`${apDef}=APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,${appContext});`);
  E(`${prodDefCtx}=PRODUCT_DEFINITION_CONTEXT('',${appContext},'design');`);
  E(`${product}=PRODUCT('${safeName}','${safeName}','',(${prodContext}));`);
  E(`${prodDefForm}=PRODUCT_DEFINITION_FORMATION('','',${product});`);
  E(`${prodDef}=PRODUCT_DEFINITION('design','',${prodDefForm},${prodDefCtx});`);
  E(`${prodDefShape}=PRODUCT_DEFINITION_SHAPE('','',${prodDef});`);
  E(`${lengthUnit}=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));`);
  E(`${planeAngleUnit}=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));`);
  E(`${solidAngleUnit}=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());`);
  E(`${uncertainty}=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-3),${lengthUnit},'distance_accuracy_value','confusion accuracy');`);
  E(`${geomContext}=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${lengthUnit},${planeAngleUnit},${solidAngleUnit}))REPRESENTATION_CONTEXT('','3D'));`);

  const pointCache = new Map();
  function pointRef(x, y, z) {
    const key = `${x}|${y}|${z}`;
    if (pointCache.has(key)) return pointCache.get(key);
    const p = r();
    E(`${p}=CARTESIAN_POINT('',(${fmt(x)},${fmt(y)},${fmt(z)}));`);
    pointCache.set(key, p);
    return p;
  }

  const curveRefs = [];

  for (const c of components) {
    const sx = toNumber(c.start_x), sy = toNumber(c.start_y), sz = toNumber(c.start_z);
    const ex = toNumber(c.end_x),   ey = toNumber(c.end_y),   ez = toNumber(c.end_z);
    const type = getComponentType(c);

    if (type === 'BEND') {
      const angleDeg = toNumber(c.bend_angle_deg) || 90;
      const thetaRad = angleDeg * Math.PI / 180;
      const numSegs  = Math.max(4, Math.ceil(angleDeg / 15));

      const S = V.fromXYZ(sx, sy, sz);
      const Ep = V.fromXYZ(ex, ey, ez);
      const planeN = computeBendPlaneNormal(components, sx, sy, sz, ex, ey, ez, TOLERANCE);
      const arcPts = computeArcPoints(S, Ep, thetaRad, planeN, numSegs);

      for (let i = 0; i < arcPts.length - 1; i++) {
        const p1 = pointRef(arcPts[i].x, arcPts[i].y, arcPts[i].z);
        const p2 = pointRef(arcPts[i+1].x, arcPts[i+1].y, arcPts[i+1].z);
        const poly = r();
        E(`${poly}=POLYLINE('',(${p1},${p2}));`);
        curveRefs.push(poly);
      }
    } else {
      let sx2=sx, sy2=sy, sz2=sz, ex2=ex, ey2=ey, ez2=ez;
      if (sx2===ex2 && sy2===ey2 && sz2===ez2) { ex2 = sx2 + DEGEN_STUB; }

      const p1 = pointRef(sx2, sy2, sz2);
      const p2 = pointRef(ex2, ey2, ez2);
      const poly = r();
      E(`${poly}=POLYLINE('',(${p1},${p2}));`);
      curveRefs.push(poly);
    }
  }

  if (!curveRefs.length) return null;

  const curveSet    = r();
  const shapeRep    = r();
  const shapeDefRep = r();

  E(`${curveSet}=GEOMETRIC_CURVE_SET('',(${curveRefs.join(',')}));`);
  E(`${shapeRep}=GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION('',(${curveSet}),${geomContext});`);
  E(`${shapeDefRep}=SHAPE_DEFINITION_REPRESENTATION(${prodDefShape},${shapeRep});`);

  const now = new Date().toISOString();
  const header =
    `ISO-10303-21;\nHEADER;\n` +
    `FILE_DESCRIPTION(('STEP wireframe export from MTO Converter'),'2;1');\n` +
    `FILE_NAME('${fileName}','${now}',('Author'),(''),'MTO Converter','','');\n` +
    `FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\n` +
    `ENDSEC;\nDATA;\n`;

  return header + out + 'ENDSEC;\nEND-ISO-10303-21;\n';
}

/* ================================================================
   UNIFIED API
   ================================================================ */

export function buildStepFile(
  components,
  { fileName = 'MTO_Export.stp', productName = 'MTO 3D Export', mode = 'solid' } = {}
) {
  return mode === 'wireframe'
    ? buildStepFileWireframe(components, { fileName, productName })
    : buildStepFileSolid(components, { fileName, productName });
}

export function downloadStepFile(components, fileName = 'MTO_Export.stp', mode = 'solid') {
  const step = buildStepFile(components, { fileName, mode });
  if (!step) return false;
  const blob = new Blob([step], { type: 'application/octet-stream' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}