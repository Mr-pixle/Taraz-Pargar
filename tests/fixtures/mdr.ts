// A synthetic MDR built on the office's fixed template (the same 36 headers, in the same order, as the MDR tab of the
// Babolsar / Darrous / Nourian sheets) with the patterns found in those sheets: numeric project code, the first child
// repeating its parent's Weight, a Document Number used twice, the same name on several numbers, "#N/A" / "#DIV/0!" cells,
// a summary row with an empty Parent 4, a Parent 1 that does not match the row's position, Jalali dates, SubTasks,
// and lookup tables below the data block.
export const HEADERS = ['Project ', 'Project Code', 'Document Number', 'phase', 'Stage', 'summary', 'Docs', 'Sheets Name', 'Parent 4', 'P4', 'Parent 3', 'P3', 'Parent 2', 'P2', 'Parent 1', 'SubTask (Render)', 'SubTask (Design)', 'Floor', 'Weight', 'Package', 'To Clickup', 'Transmital', 'Plan Issue Date', 'Designer/Producer', 'Department', 'Stage (Code)', 'Discipline', 'Document Type', 'Floor/Type', 'Serial Number', 'Loc', 'Sheet N', 'Last Status Date (internal)', 'Last Status (internal)', 'Progress (internal)', 'Name']

const idx = (L: string) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
/** a sheet row from {column letter: value}; trailing empty cells are dropped like the Sheets API does */
export function R(cells: Record<string, string> = {}): string[] {
  const a: string[] = Array(36).fill('')
  for (const [k, v] of Object.entries(cells)) a[idx(k)] = v
  while (a.length && a[a.length - 1] === '') a.pop()
  return a
}
const P = '900'
const DES = 'ترسیم پلان,اندازه گذاری,ارائه'
export const N = {
  index: `${P}-PRG-EN-GE-ALL-LST-GE00-0020101`, control: `${P}-PRG-EN-PD-ALL-RPT-GE00-0120101`, urban: `${P}-PRG-EN-PD-ARC-TCR-GE00-0140101`,
  ug01: `${P}-PRG-EN-CD-ARC-DWG-UG01-1100101`, gf00: `${P}-PRG-EN-CD-ARC-DWG-GF00-1100201`, ag01: `${P}-PRG-EN-CD-ARC-DWG-AG01-1100301`, ag02: `${P}-PRG-EN-CD-ARC-DWG-AG02-1100401`,
  render: `${P}-PRG-EN-CD-ARC-RND-GE00-8600101`,
  ws1: `${P}-PRG-EN-DD-ARC-DWG-GE00-3400101`, ws2: `${P}-PRG-EN-DD-ARC-DWG-GE00-3400201`, ws3: `${P}-PRG-EN-DD-ARC-DWG-GE00-3400301`,
  est1: `${P}-PRG-EN-DD-ARC-DWG-GE00-7200201`, est2: `${P}-PRG-EN-DD-ARC-DWG-GE00-7400301`,
}
const ph0 = { A: P, I: 'Phase 0' }, ph1 = { A: P, I: 'Phase I' }, ph2 = { A: P, I: 'Phase II' }

export function sampleMdr(): string[][] {
  return [
    R({ H: 'Sample Tower', T: 'Residential' }),
    HEADERS,
    R({ A: P, B: P, D: 'Phase 0', S: '0.25%', U: 'FALSE', V: 'FALSE' }),
    R({ ...ph0, E: 'Pre-Design', J: 'Phase 0', S: '0.25%' }),
    R({ ...ph0, F: 'General Informations', K: 'Pre-Design', L: 'Pre-Design', S: '0.00%', AD: '000' }),
    R({ ...ph0, G: 'Index', K: 'Pre-Design', M: 'General Informations', N: 'General Informations', R: 'General', S: '0.00%', AD: '002', AI: '0.00%', AJ: 'Index' }),
    R({ ...ph0, C: N.index, H: 'Index', K: 'Pre-Design', M: 'General Informations', O: 'Index', R: 'General', S: '0.00%', W: '1405-02-05', AD: '0020101', AG: '1405-02-10', AI: '0.00%', AJ: 'Index' }),
    R({ ...ph0, F: 'Study', K: 'Pre-Design', L: 'Pre-Design', S: '0.25%', AD: '010' }),
    R({ ...ph0, G: 'Control & Report Technical Documents', K: 'Pre-Design', M: 'Study', N: 'Study', R: 'General', S: '0.25%', AD: '012' }),
    R({ ...ph0, C: N.control, H: 'Control & Report Technical Documents', K: 'Pre-Design', M: 'Study', O: 'Control & Report Technical Documents', R: 'General', S: '0.25%', AI: '0.00%' }),
    R({ ...ph0, G: 'Urban Study', K: 'Pre-Design', M: 'Study', N: 'Study', R: 'General', S: '0.00%', AD: '014' }),
    R({ ...ph0, C: N.urban, H: 'Urban Study', K: 'Pre-Design', M: 'Study', O: 'Urban Study', R: 'General', AI: '0.00%' }),
    R({ A: P, D: 'Phase I', S: '39.00%' }),
    R({ ...ph1, E: 'Concept Design', J: 'Phase I', S: '8.25%' }),
    R({ ...ph1, F: 'CD Plans', K: 'Concept Design', L: 'Concept Design', S: '4.00%', AD: '100' }),
    R({ ...ph1, G: 'Architectural Plans CD', K: 'Concept Design', M: 'CD Plans', N: 'CD Plans', Q: DES, S: '4.00%', AC: '#N/A', AD: '110' }),
    R({ ...ph1, C: N.ug01, H: '1ST Basement Architectural Plans CD', K: 'Concept Design', M: 'CD Plans', O: 'Architectural Plans CD', Q: DES, R: '1ST Basement', S: '4.00%', V: 'TRUE', W: '1405-03-01', AI: '0.00%' }),
    R({ ...ph1, C: N.gf00, H: 'Ground Floor Architectural Plans CD', K: 'Concept Design', M: 'CD Plans', O: 'Architectural Plans CD', Q: DES, R: 'Ground Floor' }),
    R({ ...ph1, C: N.ag01, H: '1ST Floor Architectural Plans CD', K: 'Concept Design', M: 'CD Plans', O: 'Architectural Plans CD', Q: DES, R: '1ST Floor' }),
    R({ ...ph1, C: N.ag02, H: '2ND Floor Architectural Plans CD', K: 'Concept Design', M: 'CD Plans', O: 'Architectural Plans CD', Q: DES, R: '2ND Floor' }),
    R({ ...ph1, F: 'CD Renders', K: 'Concept Design', L: 'Concept Design', S: '4.25%', AD: '800' }),
    R({ ...ph1, G: '3D Renders CD', K: 'Concept Design', M: 'CD Renders', N: 'CD Renders', P: 'مدل سازی,رندر', S: '4.25%', AD: '860' }),
    R({ ...ph1, C: N.render, H: 'Balcony Render', K: 'Concept Design', M: 'CD Renders', O: '3D Renders CD', P: 'مدل سازی,رندر', R: 'General', S: '2.00%', T: 'Package 1' }),
    R({ ...ph1, C: N.render, H: 'Multipurpose Hall Render', K: 'Concept Design', M: 'CD Renders', O: '3D Renders CD', P: 'مدل سازی,رندر', R: 'General', S: '2.25%', T: 'Package 1' }),
    R({ A: P, D: 'Phase II', S: '60.75%' }),
    R({ ...ph2, E: 'Design Development', J: 'Phase II', S: '60.75%' }),
    R({ ...ph2, F: 'Sections', K: 'Design Development', L: 'Design Development', S: '3.00%', AD: '300' }),
    R({ ...ph2, G: 'DD Wall Sections', K: 'Design Development', M: 'Sections', N: 'Sections', S: '3.00%', AD: '340' }),
    R({ ...ph2, C: N.ws1, H: 'Wall Section A', K: 'Design Development', M: 'Sections', O: 'DD Wall Sections', R: 'General', S: '1.00%', T: 'Package 2', W: '1405-13-40' }),
    R({ ...ph2, C: N.ws2, H: 'Wall Section A', K: 'Design Development', M: 'Sections', O: 'DD Wall Sections', R: 'General', S: '1.00%', T: 'Package 2' }),
    R({ ...ph2, C: N.ws3, H: 'Wall Section A', K: 'Design Development', M: 'Sections', O: 'DD Wall Sections', R: 'General', S: '#DIV/0!', T: 'Package 2' }),
    // the real sheets have a summary row with an empty Parent 4 and no Weight
    R({ A: P, F: 'Estimation', K: 'Design Development', L: 'Design Development' }),
    R({ ...ph2, G: 'Architectural Estimation', K: 'Design Development', M: 'Estimation', N: 'Estimation', R: 'General', S: '0.00%', AD: '720' }),
    R({ ...ph2, C: N.est1, H: 'Architectural Estimation', K: 'Design Development', M: 'Estimation', O: 'Architectural Estimation', R: 'General', S: '0.00%' }),
    // Parent 1 says "Structural Estimation" but the row sits under "Architectural Estimation"
    R({ ...ph2, C: N.est2, H: 'Structural Estimation', K: 'Design Development', M: 'Estimation', O: 'Structural Estimation', R: 'General' }),
    [], [], [],
    R({ B: 'Name', C: 'Code', R: 'Code', S: 'Meaning', T: 'Typical Stage' }),
    R({ B: '5TH Basement', C: 'UG05', R: 'FI', S: 'First Issue', T: 'First formal release' }),
    R({ B: 'Ground Floor', C: 'GF00', R: 'IFC', S: 'Issued for Construction' }),
  ]
}
/** 1-based sheet row of a Document Number (first occurrence) */
export const rowOf = (values: string[][], docNumber: string) => values.findIndex((r) => r[2] === docNumber) + 1
