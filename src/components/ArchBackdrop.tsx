import { memo } from 'react'

/*
  Login backdrop: a construction drawing of a two-centred pointed arch (قوس جناغیِ دومرکزی) inside an iwan frame,
  laid out the traditional way with a compass — then seen through a glass curtain wall (frosted fins).
  Pure SVG lines (a few KB, static, memoised) + at most six backdrop-filter fins on wide screens.
  Units: 100 = 1 m. Springing level +1.40, base ±0.00.
*/
const CX = 1000, SPRING = 560, BASE = 700
const HALF = 200, OFF = 70, R = HALF + OFF, T = 28
const apex = (r: number) => SPRING - Math.sqrt(r * r - OFF * OFF)
const A1 = apex(R), A2 = apex(R + T)
const arch = (r: number) =>
  `M${CX - (r - OFF)},${SPRING} A${r},${r} 0 0 1 ${CX},${apex(r).toFixed(1)} A${r},${r} 0 0 1 ${CX + (r - OFF)},${SPRING}`

function muqarnas() {
  const rows: string[] = []
  for (let k = 0; k < 4; k++) {
    const n = 2 * k + 1, w = 44, y = 334 + k * 34, x0 = CX - (n * w) / 2
    let d = `M${x0},${y}`
    for (let i = 0; i < n; i++) d += ` q${w / 2},${-26} ${w},0`
    rows.push(d)
  }
  return rows
}

function Level({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g className="g">
      <path d={`M${x - 9},${y - 15} h18 l-9,15 z`} fill="none" stroke="currentColor" strokeWidth="1.4" />
      <line x1={x - 22} y1={y} x2={x + 70} y2={y} stroke="currentColor" strokeWidth="1.2" />
      <text x={x + 14} y={y - 6} fontSize="14" fill="currentColor" direction="ltr">{label}</text>
    </g>
  )
}

export const ArchBackdrop = memo(function ArchBackdrop() {
  const hatch = Array.from({ length: 36 }, (_, i) => 640 + i * 20)
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="drawing absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMaxYMid slice" fill="none">
        {/* axes with bubbles */}
        {[[CX - HALF - T, 'A'], [CX, 'B'], [CX + HALF + T, 'C']].map(([x, l]) => (
          <g key={l as string}>
            <line x1={x as number} y1={150} x2={x as number} y2={790} stroke="currentColor" strokeWidth="0.9" strokeDasharray="14 5 3 5" />
            <circle cx={x as number} cy={132} r={15} stroke="currentColor" strokeWidth="1.2" />
            <text x={x as number} y={137} fontSize="14" textAnchor="middle" fill="currentColor" fontFamily="JetBrains Mono, monospace">{l}</text>
          </g>
        ))}
        {/* iwan frame (pishtaq) */}
        <rect x={700} y={200} width={600} height={BASE - 200} stroke="currentColor" strokeWidth="1.6" />
        <rect x={714} y={214} width={572} height={BASE - 214} stroke="currentColor" strokeWidth="0.8" />
        {/* arch: intrados, extrados, piers */}
        <path d={arch(R)} stroke="currentColor" strokeWidth="2" />
        <path d={arch(R + T)} stroke="currentColor" strokeWidth="1.2" />
        <path d={`M${CX - HALF - T},${SPRING} V${BASE} M${CX - HALF},${SPRING} V${BASE} M${CX + HALF},${SPRING} V${BASE} M${CX + HALF + T},${SPRING} V${BASE}`} stroke="currentColor" strokeWidth="1.4" />
        {muqarnas().map((d, i) => <path key={i} d={d} stroke="currentColor" strokeWidth="0.9" />)}
        {/* spandrel rosettes */}
        {[CX - 205, CX + 205].map((x) => (
          <g key={x}><circle cx={x} cy={262} r={26} stroke="currentColor" strokeWidth="0.9" /><circle cx={x} cy={262} r={14} stroke="currentColor" strokeWidth="0.7" /></g>
        ))}
        {/* ground */}
        <line x1={620} y1={BASE} x2={1380} y2={BASE} stroke="currentColor" strokeWidth="2" />
        {hatch.map((x) => <line key={x} x1={x} y1={BASE + 2} x2={x - 12} y2={BASE + 14} stroke="currentColor" strokeWidth="0.8" />)}
        {/* compass construction: the two centres, their circles and radii */}
        <g className="c">
          {[CX + OFF, CX - OFF].map((x) => (
            <g key={x}>
              <circle cx={x} cy={SPRING} r={R} stroke="currentColor" strokeWidth="0.9" strokeDasharray="4 7" />
              <path d={`M${x - 8},${SPRING} h16 M${x},${SPRING - 8} v16`} stroke="currentColor" strokeWidth="1.4" />
              <circle cx={x} cy={SPRING} r={3.5} fill="currentColor" />
              <line x1={x} y1={SPRING} x2={CX} y2={A1} stroke="currentColor" strokeWidth="1" />
            </g>
          ))}
          <path d={`M${CX + OFF - 150},${SPRING - 222} A270,270 0 0 1 ${CX + OFF - 60},${SPRING - 263}`} stroke="currentColor" strokeWidth="1.4" />
          <path d={`M${CX + OFF - 70},${SPRING - 270} l12,4 l-11,6`} stroke="currentColor" strokeWidth="1.4" />
          <text x={CX + OFF + 14} y={SPRING - 14} fontSize="14" fill="currentColor" direction="ltr">R = 2.70</text>
          <text x={CX - OFF - 8} y={SPRING + 26} fontSize="13" fill="currentColor" textAnchor="middle">مرکز ۱</text>
          <text x={CX + OFF + 8} y={SPRING + 26} fontSize="13" fill="currentColor" textAnchor="middle">مرکز ۲</text>
        </g>
        {/* springing line and levels */}
        <line x1={660} y1={SPRING} x2={1340} y2={SPRING} stroke="currentColor" strokeWidth="0.9" strokeDasharray="10 6" />
        <Level x={1316} y={BASE} label="±0.00" />
        <Level x={1316} y={SPRING} label="+1.40" />
        <Level x={1316} y={Math.round(A1)} label="+4.01" />
        <Level x={1316} y={200} label="+5.00" />
        {/* dimensions */}
        <g>
          <line x1={CX - HALF} y1={765} x2={CX + HALF} y2={765} stroke="currentColor" strokeWidth="1" />
          <path d={`M${CX - HALF - 6},${771} l12,-12 M${CX + HALF - 6},${771} l12,-12`} stroke="currentColor" strokeWidth="1.6" />
          <path d={`M${CX - HALF},${BASE + 20} V${775} M${CX + HALF},${BASE + 20} V${775}`} stroke="currentColor" strokeWidth="0.8" />
          <text x={CX} y={757} fontSize="15" textAnchor="middle" fill="currentColor" direction="ltr">4.00</text>
          <line x1={1260} y1={SPRING} x2={1260} y2={A1} stroke="currentColor" strokeWidth="1" />
          <path d={`M${1254},${SPRING + 6} l12,-12 M${1254},${A1 + 6} l12,-12`} stroke="currentColor" strokeWidth="1.6" />
          <text x={1250} y={(SPRING + A1) / 2} fontSize="15" textAnchor="middle" fill="currentColor" direction="ltr" transform={`rotate(-90 1250 ${(SPRING + A1) / 2})`}>2.61</text>
        </g>
        <path d={arch(R + T + 46)} stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 6" opacity="0.7" />
        <text x={CX} y={A2 - 12} fontSize="12" textAnchor="middle" fill="currentColor">کلید قوس</text>
      </svg>
      {/* glass curtain wall in front of the drawing (wide screens only) */}
      <div className="absolute inset-y-0 start-0 hidden w-[52%] gap-[10px] lg:flex">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="fin" />)}
      </div>
    </div>
  )
})
