import React, { useState, useEffect, useMemo, useCallback, Fragment, Component } from "react";

// ── localStorage adapter — replaces Claude artifact window.storage ──────────
// Provides the same async get/set/delete/list API so the rest of the code
// works unchanged whether running inside Claude or as a real website.
if (!window.storage) {
  window.storage = {
    get: async (key) => {
      try {
        const value = localStorage.getItem(key);
        if (value === null) throw new Error("not found");
        return { key, value, shared: false };
      } catch (e) { throw e; }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, value);
        return { key, value, shared: false };
      } catch (e) { return null; }
    },
    delete: async (key) => {
      localStorage.removeItem(key);
      return { key, deleted: true, shared: false };
    },
    list: async (prefix = "") => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      return { keys, shared: false };
    },
  };
}

// ── FONT & GLOBAL STYLES ────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Josefin+Sans:wght@300;400;500;600;700&family=Bebas+Neue&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=JetBrains+Mono:wght@400;600&display=swap');

  /* ── ANDROID FONT & RENDERING FIXES ── */
  html {
    -webkit-text-size-adjust: 100% !important;
    -moz-text-size-adjust: 100% !important;
    -ms-text-size-adjust: 100% !important;
    text-size-adjust: 100% !important;
  }
  body {
    -webkit-text-size-adjust: 100% !important;
    -moz-text-size-adjust: 100% !important;
    text-size-adjust: 100% !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    overscroll-behavior: none;
    -webkit-overflow-scrolling: touch;
  }
  /* Force GPU acceleration on animated elements */
  [style*="animation"] {
    -webkit-transform: translateZ(0);
    transform: translateZ(0);
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
    -webkit-perspective: 1000;
    perspective: 1000;
  }

  /* Calligraphy UI polish */
  .callig-title {
    font-family: 'Cinzel', serif;
    font-weight: 600;
    letter-spacing: 0.12em;
  }
  .callig-body {
    font-family: 'Lora', serif;
    font-style: italic;
    line-height: 1.8;
  }
  .callig-label {
    font-family: 'Josefin Sans', sans-serif;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.25); border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(124,58,237,0.45); }
  button, input, select, textarea { font-family: inherit; }
  textarea { scrollbar-width: thin; }

  @keyframes fadeSlideUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideInRight { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }
  @keyframes slideInLeft  { from{opacity:0;transform:translateX(-40px)} to{opacity:1;transform:translateX(0)} }
  @keyframes popIn        { from{opacity:0;transform:scale(0.82)} to{opacity:1;transform:scale(1)} }
  @keyframes fadeIn       { from{opacity:0} to{opacity:1} }
  @keyframes pulse        { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
  @keyframes navPop       { from{transform:scale(0.85);opacity:0} to{transform:scale(1);opacity:1} }
  @keyframes shimmer {
    0%   { transform: translateX(-120%) skewX(-20deg); }
    100% { transform: translateX(220%) skewX(-20deg); }
  }
  @keyframes float {
    0%,100%{transform:translateY(0px) rotate(0deg)}
    33%{transform:translateY(-10px) rotate(2deg)}
    66%{transform:translateY(-5px) rotate(-1deg)}
  }
  @keyframes haloGlow {
    0%,100%{box-shadow:0 0 0 0 rgba(168,85,247,0)}
    50%{box-shadow:0 0 0 6px rgba(168,85,247,0.12)}
  }
  @keyframes goldPulse {
    0%,100%{box-shadow:0 0 0 0 rgba(212,175,55,0)}
    50%{box-shadow:0 0 12px 3px rgba(212,175,55,0.25)}
  }
  @keyframes sakuraDrift {
    0%   { transform: translateX(0) translateY(0) rotate(0deg); opacity:0.9; }
    50%  { transform: translateX(20px) translateY(30px) rotate(180deg); opacity:0.7; }
    100% { transform: translateX(-10px) translateY(60px) rotate(360deg); opacity:0; }
  }
  .subject-card-3d {
    transition: transform 0.35s cubic-bezier(.25,.46,.45,.94), box-shadow 0.35s ease;
    will-change: transform;
    -webkit-transform: translateZ(0);
    transform: translateZ(0);
    -webkit-backface-visibility: hidden;
    backface-visibility: hidden;
  }
  .subject-card-3d:active {
    transform: scale(0.97) translateZ(0) !important;
  }
`;

// ── BEAUTIFUL FORMULA RENDERER ──────────────────────────────────────────
// Converts plain-text formulas to gorgeous, human-readable JSX
// Handles: ^sup, _sub, auto-chemical subscripts, Greek letters, arrows, charges

// Known chemical element symbols for smart auto-subscript
const ELEMENTS = new Set([
  'H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S',
  'Cl','Ar','K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn',
  'Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr','Nb','Mo','Tc','Ru',
  'Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I','Xe','Cs','Ba','La','Ce',
  'Pr','Nd','Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu','Hf',
  'Ta','W','Re','Os','Ir','Pt','Au','Hg','Tl','Pb','Bi','Po','At','Rn',
  'Fr','Ra','Ac','Th','Pa','U','Np','Pu','Am','Cm'
]);

// State symbol styling: (aq), (s), (l), (g)
function styleStateSymbol(s, color, k) {
  const stateMap = {'aq':'aq','s':'s','l':'\u2113','g':'g','gas':'g','solid':'s','liq':'\u2113'};
  const inner = stateMap[s.toLowerCase()] || s;
  return (
    <span key={k} style={{
      fontSize:'0.65em', verticalAlign:'sub', color:`${color}99`,
      fontStyle:'italic', letterSpacing:0, marginLeft:1,
    }}>({inner})</span>
  );
}

// Parse and render a single formula/expression string into React nodes
function parseFormulaNodes(text, color, baseSize) {
  if (!text) return [];
  const nodes = [];
  let k = 0;
  let buf = '';
  const chars = [...text];
  let j = 0;

  const flushBuf = () => {
    if (buf) {
      nodes.push(<span key={k++} style={{color, fontFamily:"'Cormorant Garamond','Playfair Display','Palatino Linotype','Georgia',serif", fontSize: baseSize, lineHeight:1.9}}>{buf}</span>);
      buf = '';
    }
  };

  const pushSup = (content) => {
    flushBuf();
    const isCharge = /^[0-9]*[+\-]$/.test(content) || /^[+\-]$/.test(content);
    nodes.push(
      <sup key={k++} style={{
        fontSize:'0.62em', verticalAlign:'0.55em', lineHeight:0,
        fontWeight: isCharge ? 800 : 600,
        color: isCharge ? (content.includes('+') ? '#86efac' : '#fca5a5') : color,
        fontFamily:"'Cormorant Garamond','Playfair Display','Georgia',serif",
      }}>{content}</sup>
    );
  };

  const pushSub = (content) => {
    flushBuf();
    nodes.push(
      <sub key={k++} style={{
        fontSize:'0.60em', verticalAlign:'-0.3em', lineHeight:0,
        fontWeight:600, color:`${color}dd`,
        fontFamily:"'Cormorant Garamond','Playfair Display','Georgia',serif",
      }}>{content}</sub>
    );
  };

  while (j < chars.length) {
    const ch = chars[j];

    // Explicit superscript ^(...) or ^x
    if (ch === '^' && j + 1 < chars.length) {
      j++;
      let exp = '';
      if (chars[j] === '(') {
        j++;
        let depth = 1;
        while (j < chars.length && depth > 0) {
          if (chars[j] === '(') depth++;
          else if (chars[j] === ')') { depth--; if (depth === 0) { j++; break; } }
          if (depth > 0) exp += chars[j];
          j++;
        }
      } else {
        while (j < chars.length && /[0-9a-zA-Z+\-*\/\u00b1\u00b7n]/.test(chars[j])) {
          exp += chars[j]; j++;
        }
      }
      pushSup(exp);
      continue;
    }

    // Explicit subscript _(...) or _x
    if (ch === '_' && j + 1 < chars.length) {
      j++;
      let sub = '';
      if (chars[j] === '(') {
        j++;
        let depth = 1;
        while (j < chars.length && depth > 0) {
          if (chars[j] === '(') depth++;
          else if (chars[j] === ')') { depth--; if (depth === 0) { j++; break; } }
          if (depth > 0) sub += chars[j];
          j++;
        }
      } else {
        while (j < chars.length && /[0-9a-zA-Z+\-n]/.test(chars[j])) {
          sub += chars[j]; j++;
        }
      }
      pushSub(sub);
      continue;
    }

    // State symbols: (aq), (s), (g), (l)
    if (ch === '(' && j + 1 < chars.length) {
      let ahead = '';
      let ai = j + 1;
      while (ai < chars.length && chars[ai] !== ')' && ahead.length < 6) {
        ahead += chars[ai]; ai++;
      }
      if (chars[ai] === ')' && /^(aq|s|g|l|gas|solid|liq)$/i.test(ahead)) {
        flushBuf();
        nodes.push(styleStateSymbol(ahead, color, k++));
        j = ai + 1;
        continue;
      }
    }

    // Auto-subscript: known element symbol followed by digits e.g. H2, SO4
    if (/[A-Z]/.test(ch)) {
      let sym = ch;
      if (j + 1 < chars.length && /[a-z]/.test(chars[j+1])) sym = ch + chars[j+1];
      const isSym = ELEMENTS.has(sym) || ELEMENTS.has(ch);
      const symLen = ELEMENTS.has(sym) ? sym.length : 1;
      if (isSym && j + symLen < chars.length && /[0-9]/.test(chars[j + symLen])) {
        buf += chars.slice(j, j + symLen).join('');
        j += symLen;
        let digits = '';
        while (j < chars.length && /[0-9]/.test(chars[j])) { digits += chars[j]; j++; }
        pushSub(digits);
        continue;
      }
    }

    // Arrow styling
    if ('\u2192\u27f6\u27f9\u27fa\u2194\u21cc\u21d2'.includes(ch) || ch === '\u2192' || ch === '\u21cc') {
      flushBuf();
      nodes.push(<span key={k++} style={{fontSize: baseSize * 1.2, color, fontWeight:400, margin:'0 6px', display:'inline-block', verticalAlign:'middle'}}>{ch}</span>);
      j++;
      continue;
    }

    buf += ch;
    j++;
  }
  flushBuf();
  return nodes;
}

// Main FormulaText component — beautiful math/science rendering
function FormulaText({ text, style = {} }) {
  const color = style.color || '#e2e8f0';
  const fontSize = style.fontSize || 17;
  const nodes = parseFormulaNodes(text, color, fontSize);
  return (
    <span style={{
      fontFamily:"'Cormorant Garamond','Playfair Display','Palatino Linotype','Palatino','Book Antiqua','Georgia',serif",
      fontSize, lineHeight:2.1, letterSpacing:0.3, display:'inline',
      ...style,
    }}>{nodes}</span>
  );
}

// Chemical Reaction Renderer — beautiful, readable, structured
function ChemEquation({ text, color = '#34d399', bgColor = 'rgba(52,211,153,0.08)' }) {
  const arrowVariants = ['\u21cc','\u27f9','\u27fa','\u27f6','\u2192','\u2194','\u21d2'];
  let arrowIdx = -1;
  let arrowChar = '';
  for (const arr of arrowVariants) {
    const idx = text.indexOf(arr);
    if (idx !== -1) { arrowIdx = idx; arrowChar = arr; break; }
  }

  // Split compounds by '+' respecting brackets
  const splitCompounds = (str) => {
    const parts = []; let cur = ''; let depth = 0;
    for (const ch of str) {
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (ch === '+' && depth === 0) { if (cur.trim()) parts.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  };

  if (arrowIdx === -1) {
    return (
      <div style={{background:bgColor, borderRadius:14, padding:'14px 18px',
        border:`1.5px solid ${color}30`, width:'100%', boxSizing:'border-box'}}>
        <FormulaText text={text} style={{color, fontSize:17, fontWeight:600}}/>
      </div>
    );
  }

  const reactants = text.substring(0, arrowIdx).trim();
  const afterArrow = text.substring(arrowIdx + arrowChar.length).trim();
  const reactantParts = splitCompounds(reactants);
  const productParts = splitCompounds(afterArrow);

  const renderCompound = (compound, idx) => {
    // Detect stoichiometric coeff at start: "2H2O" or "3Fe"
    const coefMatch = compound.match(/^(\d+)([A-Z(].*)$/);
    let coef = null, formula = compound;
    if (coefMatch) { coef = coefMatch[1]; formula = coefMatch[2]; }
    return (
      <span key={idx} style={{display:'inline-flex', alignItems:'baseline', gap:1}}>
        {coef && <span style={{fontSize:13, fontWeight:700, color:`${color}88`, fontFamily:"'Cambria','Georgia',serif", marginRight:2}}>{coef}</span>}
        <FormulaText text={formula} style={{color, fontSize:17, fontWeight:700}}/>
      </span>
    );
  };

  return (
    <div style={{
      background: bgColor, borderRadius:14, padding:'14px 16px',
      border:`1.5px solid ${color}35`, width:'100%', boxSizing:'border-box',
      boxShadow:`inset 0 1px 0 ${color}18`,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
        {/* Reactants */}
        {reactantParts.map((r, i) => (
          <Fragment key={i}>
            {renderCompound(r, i)}
            {i < reactantParts.length - 1 && (
              <span style={{fontSize:15, color:`${color}88`, fontWeight:700, margin:'0 1px'}}>+</span>
            )}
          </Fragment>
        ))}

        {/* Arrow — large and beautiful */}
        <span style={{
          fontSize: 22, color, fontWeight:400, lineHeight:1,
          margin:'0 6px', flexShrink:0,
          filter:`drop-shadow(0 0 4px ${color}60)`,
        }}>{arrowChar}</span>

        {/* Products */}
        {productParts.map((p, i) => (
          <Fragment key={i}>
            {renderCompound(p, i)}
            {i < productParts.length - 1 && (
              <span style={{fontSize:15, color:`${color}88`, fontWeight:700, margin:'0 1px'}}>+</span>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

// Smart formula display: detects chem vs math and renders appropriately
// ── SMART FORMULA RENDERER — Human-readable, diagram-like ─────────────
// Splits semicolons into visual rows, detects LHS=RHS, shows each part clearly
function parseFormulaParts(text) {
  // Split on "; " but not inside parentheses
  const parts = [];
  let depth = 0, cur = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (depth === 0 && ch === ";" && text[i+1] === " ") {
      if (cur.trim()) parts.push(cur.trim());
      cur = "";
      i++; // skip the space
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.length > 0 ? parts : [text];
}

function classifyPart(part) {
  if (/[=≈≡∝]/.test(part)) return "equation";
  if (/[→⟹⟺⟶⇒]/.test(part)) return "reaction";
  if (/^(if|when|note|for|where|else|case|then|∴|∵)/i.test(part)) return "condition";
  if (/^[∴∵•]/.test(part)) return "note";
  return "expression";
}

function FormulaRow({ text, color, accent, index, total, subKey }) {
  const type = classifyPart(text);
  const isChem = subKey === "chem";

  // Find = or → split for LHS/RHS display
  let lhs = null, rhs = null, op = null;
  const eqMatch = text.match(/^(.+?)\s*(=|≈|≡)\s*(.+)$/);
  const arrMatch = text.match(/^(.+?)\s*(→|⟹|⟺|⟶)\s*(.+)$/);
  if (eqMatch && eqMatch[1].length < 60 && !isChem) {
    lhs = eqMatch[1]; op = eqMatch[2]; rhs = eqMatch[3];
  } else if (arrMatch && arrMatch[1].length < 40) {
    lhs = arrMatch[1]; op = arrMatch[2]; rhs = arrMatch[3];
  }

  const isNote = type === "condition" || type === "note";
  const isLast = index === total - 1;

  return (
    <div style={{
      position: "relative",
      paddingLeft: 14,
      paddingBottom: isLast ? 0 : 18,
    }}>
      {/* Vertical timeline line */}
      {!isLast && (
        <div style={{
          position:"absolute", left:5, top:24, bottom:0, width:1,
          background:`linear-gradient(180deg,${accent}60,${accent}10)`,
        }}/>
      )}
      {/* Circle dot */}
      <div style={{
        position:"absolute", left:0, top:8, width:10, height:10,
        borderRadius:"50%", background: isNote ? `${accent}30` : accent,
        border:`1.5px solid ${accent}`,
        boxShadow: isNote ? "none" : `0 0 8px ${accent}80`,
      }}/>

      {lhs && rhs ? (
        // Equation/reaction: show as LHS [op] RHS on two sub-rows
        <div style={{paddingLeft:14, display:"flex", flexDirection:"column", gap:6}}>
          <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
            <span style={{
              fontFamily:"'Cormorant Garamond',serif",
              fontSize:18, fontWeight:600, color,
              letterSpacing:0.5, lineHeight:1.5,
            }}>
              <FormulaText text={lhs} style={{color, fontSize:18}}/>
            </span>
            <span style={{
              fontFamily:"'Cormorant Garamond',serif",
              fontSize:22, color: accent, fontWeight:700,
              padding:"0 4px", lineHeight:1,
            }}>{op}</span>
            <span style={{
              fontFamily:"'Cormorant Garamond',serif",
              fontSize:18, fontWeight:600, color,
              letterSpacing:0.5, lineHeight:1.5,
              background:`${accent}12`, borderRadius:8,
              padding:"3px 10px", border:`1px solid ${accent}28`,
            }}>
              <FormulaText text={rhs} style={{color, fontSize:18}}/>
            </span>
          </div>
        </div>
      ) : (
        // Plain part
        <div style={{
          paddingLeft:14,
          fontFamily:"'Cormorant Garamond',serif",
          fontSize: isNote ? 15 : 17,
          color: isNote ? `${color}99` : color,
          lineHeight: 1.7,
          fontStyle: isNote ? "italic" : "normal",
          fontWeight: 500,
          letterSpacing: 0.3,
        }}>
          <FormulaText text={text} style={{color: isNote ? `${color}99` : color, fontSize: isNote ? 15 : 17}}/>
        </div>
      )}
    </div>
  );
}

function SmartFormula({ text, subKey, style = {} }) {
  const th = FORMULA_THEMES[subKey] || FORMULA_THEMES.math;
  const isChem = subKey === "chem";

  if (isChem) {
    return <ChemEquation text={text} color={th.formulaCol} bgColor={`${th.accent}10`}/>;
  }

  const parts = parseFormulaParts(text);
  const isSingle = parts.length === 1;

  return (
    <div style={{
      background:`${th.accent}08`,
      border:`1.5px solid ${th.accent}35`,
      borderRadius:18,
      padding: isSingle ? "20px 24px" : "22px 20px 22px 22px",
      userSelect:"text",
      boxShadow:`inset 0 1px 0 ${th.accent}15, 0 4px 20px rgba(0,0,0,0.2)`,
      width:"100%", boxSizing:"border-box",
      ...style,
    }}>
      {isSingle ? (
        // Single part: large, centred, no bullet
        <div style={{
          fontFamily:"'Cormorant Garamond',serif",
          fontSize: text.length > 80 ? 17 : text.length > 50 ? 19 : 21,
          fontWeight:600, color:th.formulaCol,
          lineHeight:1.9, textAlign:"center", letterSpacing:0.4,
        }}>
          <FormulaText text={text} style={{color:th.formulaCol, fontSize: text.length > 80 ? 17 : text.length > 50 ? 19 : 21}}/>
        </div>
      ) : (
        // Multi-part: vertical timeline layout
        <div style={{display:"flex", flexDirection:"column"}}>
          {parts.map((part, i) => (
            <FormulaRow
              key={i} text={part} index={i} total={parts.length}
              color={th.formulaCol} accent={th.accent} subKey={subKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── THEME ──────────────────────────────────────────────────────────────
const C = {
  bg:"#f4f2fb",
  surface:"#ffffff",
  card:"#ffffff",
  border:"rgba(109,40,217,0.09)",
  borderMed:"rgba(109,40,217,0.16)",
  hover:"#f5f0fe",
  text:"#0d0a2e",
  subtext:"#5f5b78",
  dim:"#9b98b0",
  accent:"#7c3aed",
  accentH:"#6d28d9",
  accentSoft:"#ede9fe",
  navy:"#0d0a2e",
  navyMid:"#1e1b4b",
  green:"#059669",  greenBg:"rgba(5,150,105,0.1)",
  gold:"#d97706",   goldBg:"rgba(217,119,6,0.1)",
  red:"#dc2626",    redBg:"rgba(220,38,38,0.09)",
  orange:"#ea580c", orangeBg:"rgba(234,88,12,0.09)",
};
const SUB={
  math:   {label:"Mathematics", short:"MATH", icon:"∑",  col:"#7c3aed", bg:"rgba(124,58,237,.1)",  light:"#ede9fe", grd:"linear-gradient(135deg,#7c3aed,#a855f7)"},
  physics:{label:"Physics",     short:"PHY",  icon:"⚡", col:"#ea580c", bg:"rgba(234,88,12,.1)",   light:"#fff7ed", grd:"linear-gradient(135deg,#ea580c,#fb923c)"},
  chem:   {label:"Chemistry",   short:"CHEM", icon:"⚗", col:"#059669", bg:"rgba(5,150,105,.1)",   light:"#ecfdf5", grd:"linear-gradient(135deg,#059669,#34d399)"},
};
const ST={
  untouched:{col:"#c4c0d8", label:"Not Started", icon:"○", xp:0},
  learning: {col:"#f59e0b", label:"Learning",    icon:"◑", xp:5},
  practiced:{col:"#7c3aed", label:"Practiced",   icon:"◕", xp:12},
  mastered: {col:"#059669", label:"Mastered",    icon:"●", xp:25},
};
const SCYCLE=["untouched","learning","practiced","mastered"];

// ── FORMULA CARD THEMES (Kanji-app colour palettes per subject) ─────────
const FORMULA_THEMES={
  math:{
    frontBg:"linear-gradient(155deg,#0e1637 0%,#141e4b 50%,#1a1060 100%)",
    backBg:"linear-gradient(155deg,#080e24 0%,#0f1840 50%,#120d48 100%)",
    border:"rgba(167,139,250,0.62)",backBorder:"rgba(139,92,246,0.68)",
    shadow:"0 24px 60px rgba(0,0,20,0.92),0 0 0 1px rgba(167,139,250,0.15)",
    headerBg:"rgba(124,58,237,0.18)",headerBorder:"rgba(124,58,237,0.28)",
    accent:"#a855f7",titleCol:"#c4b5fd",hintCol:"rgba(196,181,253,0.65)",
    formulaCol:"#e9d5ff",shimmer:"rgba(168,85,247,0.12)",
    iconGrad:"linear-gradient(135deg,#A78BFA,#7c3aed)",icon:"∑",label:"Mathematics",
  },
  physics:{
    frontBg:"linear-gradient(155deg,#1a0800 0%,#2d1000 50%,#3c1400 100%)",
    backBg:"linear-gradient(155deg,#100400 0%,#1f0800 50%,#280a00 100%)",
    border:"rgba(245,158,11,0.65)",backBorder:"rgba(249,115,22,0.62)",
    shadow:"0 24px 60px rgba(0,0,0,0.94),0 0 0 1px rgba(245,158,11,0.15)",
    headerBg:"rgba(245,158,11,0.15)",headerBorder:"rgba(245,158,11,0.26)",
    accent:"#f59e0b",titleCol:"#fcd34d",hintCol:"rgba(251,191,36,0.65)",
    formulaCol:"#fef3c7",shimmer:"rgba(245,158,11,0.12)",
    iconGrad:"linear-gradient(135deg,#F59E0B,#EA580C)",icon:"⚡",label:"Physics",
  },
  chem:{
    frontBg:"linear-gradient(155deg,#021a10 0%,#054030 50%,#076040 100%)",
    backBg:"linear-gradient(155deg,#011208 0%,#032a1e 50%,#044030 100%)",
    border:"rgba(52,211,153,0.55)",backBorder:"rgba(16,185,129,0.62)",
    shadow:"0 24px 60px rgba(0,0,0,0.92),0 0 0 1px rgba(52,211,153,0.12)",
    headerBg:"rgba(5,150,105,0.18)",headerBorder:"rgba(5,150,105,0.28)",
    accent:"#34d399",titleCol:"#6ee7b7",hintCol:"rgba(110,231,183,0.65)",
    formulaCol:"#d1fae5",shimmer:"rgba(52,211,153,0.10)",
    iconGrad:"linear-gradient(135deg,#34d399,#059669)",icon:"⚗",label:"Chemistry",
  },
};

// ── CHEMISTRY EXAMPLES LOOKUP ─────────────────────────────────────────
const CHEM_EXAMPLES = {
  "Mole Relations": {r:"180 g glucose ÷ 180 g/mol = 1 mol = 6.022×10²³ molecules",n:"Always: n = m/M first, then multiply by Nₐ"},
  "Molarity": {r:"4 g NaOH (MW=40) in 500 mL → M = (4/40)/0.5 = 0.2 M",n:"Dilution: 0.2 M × 500 mL = M₂ × 1000 mL → M₂ = 0.1 M"},
  "Molality": {r:"4 g NaOH in 200 g water → m = (4/40)/0.2 kg = 0.5 mol/kg",n:"Unlike molarity, molality does NOT change with temperature"},
  "Mole Fraction": {r:"1 mol ethanol + 9 mol water → χ_ethanol = 1/10 = 0.1",n:"Σ all mole fractions = 1 always"},
  "Normality": {r:"H₂SO₄ (n-factor=2): 1 M H₂SO₄ = 2 N; Na₂CO₃ (n-factor=2): 1 M = 2 N",n:"Acid-base: N₁V₁ = N₂V₂ at equivalence point"},
  "n-factor": {r:"HCl: n=1 (1 H⁺); H₂SO₄: n=2; Al(OH)₃: n=3; KMnO₄ (acidic): n=5",n:"For redox: n = total e⁻ transferred per formula unit"},
  "Equivalent Weight": {r:"H₂SO₄: Eq.wt = 98/2 = 49 g/eq; Ca(OH)₂: Eq.wt = 74/2 = 37 g/eq",n:"Normality = Molarity × n-factor = grams / (Eq.wt × Volume_L)"},
  "Limiting Reagent": {r:"N₂ + 3H₂ → 2NH₃: if 1 mol N₂ and 2 mol H₂ → compare 1/1=1 vs 2/3=0.67 → H₂ limiting",n:"Always divide moles by stoichiometric coefficient to identify limiting reagent"},
  "% Yield": {r:"Theoretical: 10 g product. Actual: 8 g. % yield = (8/10)×100 = 80%",n:"% yield < 100% due to side reactions, incomplete conversion"},
  "% Composition": {r:"H₂O: %H = (2×1/18)×100 = 11.1%; %O = (16/18)×100 = 88.9%",n:"All percentages in a compound must add to 100%"},
  "Empirical & Molecular": {r:"CH₂O is empirical; glucose C₆H₁₂O₆: n = 180/30 = 6 → Molecular formula = (CH₂O)₆",n:"Empirical formula = simplest whole number ratio of atoms"},
  "Titration": {r:"25 mL of 0.1 N HCl titrated by 0.2 N NaOH: V₂ = (25×0.1)/0.2 = 12.5 mL",n:"Back titration: sample + excess reagent, then titrate the excess"},
  "Oxidation State Rules": {r:"KMnO₄: K=+1, O=−2×4=−8, so Mn=+7. In SO₄²⁻: O=−2×4=−8, charge=−2, so S=+6",n:"H=+1 with nonmetals, −1 with metals (NaH). F always −1. O usually −2, except peroxides (−1)"},
  "Balancing Redox": {r:"MnO₄⁻→Mn²⁺ (gain 5e⁻); Fe²⁺→Fe³⁺ (lose 1e⁻) → ratio 1:5 → MnO₄⁻ + 5Fe²⁺ + 8H⁺→Mn²⁺+5Fe³⁺+4H₂O",n:"Step: balance atoms → add H₂O for O → add H⁺ for H → add e⁻ to balance charge"},
  "Bohr Energy": {r:"H (Z=1, n=1): E = −13.6 eV. He⁺ (Z=2, n=1): E = −13.6×4 = −54.4 eV",n:"Energy is negative (bound state). IE = +13.6Z²/n² eV (energy to remove electron)"},
  "Orbital Radius": {r:"H n=1: r₁ = 0.529 Å. H n=2: r₂ = 0.529×4 = 2.116 Å. He⁺ n=1: r = 0.529/2 = 0.265 Å",n:"r ∝ n²/Z. Larger n = bigger orbit. Higher Z = smaller orbit (more attraction)"},
  "Spectral Formula": {r:"H Balmer series n₂=3→n₁=2: 1/λ = 1.097×10⁷(1/4−1/9) = 1.524×10⁶ m⁻¹ → λ = 656 nm (red)",n:"Lyman: UV (n₁=1). Balmer: visible (n₁=2). Paschen: IR (n₁=3)"},
  "de Broglie": {r:"e⁻ (9.1×10⁻³¹ kg) at v=10⁶ m/s: λ=6.626×10⁻³⁴/(9.1×10⁻³¹×10⁶) = 0.73 nm (X-ray scale!)",n:"For macroscopic objects (cricket ball), λ is negligibly small. Wave nature only for subatomic particles"},
  "Quantum Numbers": {r:"3p orbital: n=3, l=1 (p), m_l = −1,0,+1 (3 orbitals), m_s = +½ or −½. 3d: l=2, 5 orbitals",n:"m_l values from −l to +l give the number of orbitals. Total orbitals in shell n = n²"},
  "Hund's Rule": {r:"Carbon (2p²): ↑_ ↑_ (not ↑↓_ _). Both electrons in separate orbitals with same spin",n:"Electrons in degenerate orbitals maximise unpaired spins → lowers energy via exchange interaction"},
  "Exceptions": {r:"Cr: [Ar]3d⁵4s¹ (half-filled 3d). Cu: [Ar]3d¹⁰4s¹ (fully filled 3d). Both more stable than expected",n:"Half-filled (d⁵, f⁷) and fully-filled (d¹⁰, f¹⁴) subshells = extra exchange energy stability"},
  "Formal Charge": {r:"NO₃⁻: N has FC = 5−0−½(8) = +1. Double-bond O: FC = 6−4−½(4) = 0. Single-bond O: 6−6−½(2) = −1",n:"Sum of all formal charges = overall charge of ion/molecule. Smallest FC = best structure"},
  "Bond Order": {r:"O₂: (8 bonding − 4 antibonding)/2 = 2 (double bond). O₂⁺: (8−3)/2 = 2.5 (stronger than O₂)",n:"Higher BO → shorter bond, higher bond energy, more stable. He₂: BO=(2−2)/2=0 → doesn't exist"},
  "Hybridization": {r:"H₂O: O has 2 bonds + 2 lone pairs = 4 → sp³. NH₃: N has 3 bonds + 1 lp = 4 → sp³. CO₂: C has 2 bonds = 2 → sp",n:"Count σ bonds + lone pairs on central atom. Same count = same hybridisation"},
  "VSEPR Geometries": {r:"PCl₅: 5bp = trigonal bipyramidal (120°+90°). SF₆: 6bp = octahedral (90°). XeF₂: 2bp+3lp = linear",n:"Lone pairs repel more → distort geometry. XeF₂ has 3 lp but linear (lp in equatorial positions of TBP)"},
  "Ideal Gas Law": {r:"1 mol ideal gas at STP (273 K, 1 atm): V = nRT/P = 1×0.0821×273/1 = 22.4 L",n:"R = 8.314 J/(mol·K) for energy calculations; R = 0.0821 L·atm/(mol·K) for volume calculations"},
  "Graham's Law": {r:"H₂ (M=2) vs O₂ (M=32): r_H₂/r_O₂ = √(32/2) = √16 = 4. H₂ effuses 4× faster than O₂",n:"Lighter gases effuse faster. Application: UF₆ isotope separation (²³⁵UF₆ vs ²³⁸UF₆)"},
  "Henry's Law": {r:"CO₂ in cola: bottled at high P → CO₂ highly soluble. Open cap → P drops → CO₂ escapes → fizzing",n:"Applies only to dilute solutions and relatively inert gases. Temperature increase decreases gas solubility"},
  "Raoult's Law": {r:"Benzene (P°=75 mmHg, χ=0.6) + Toluene (P°=25, χ=0.4): P_total = 75×0.6 + 25×0.4 = 55 mmHg",n:"Ideal solution: components have similar intermolecular forces. Non-ideal: positive or negative deviation"},
  "Elevation Boiling Pt": {r:"6 g urea (M=60) in 100 g water: m = (6/60)/0.1 = 1 mol/kg. ΔTb = 1×0.52 = 0.52°C → bp = 100.52°C",n:"Electrolytes: multiply by i (van't Hoff factor). NaCl (i≈2) doubles the effect"},
  "Depression Freezing Pt": {r:"9 g glucose in 100 g water: m = (9/180)/0.1 = 0.5 mol/kg. ΔTf = 0.5×1.86 = 0.93°C → freezes at −0.93°C",n:"Antifreeze (ethylene glycol) in car radiators: lowers freezing point well below 0°C"},
  "Gibbs Free Energy": {r:"Ice melting: ΔH=+6 kJ, ΔS=+22 J/K at 273K: ΔG=6000−273×22 = 0 (at equilibrium at 0°C!)",n:"ΔH<0 and ΔS>0: always spontaneous. ΔH>0 and ΔS<0: never. Others: depends on T"},
  "Kc and Kp": {r:"N₂+3H₂⇌2NH₃: Δn=2−4=−2. Kp=Kc(RT)^(−2). At 500 K: Kp=Kc/(0.0821×500)² = Kc/1690",n:"Δn=0: Kp=Kc. Δn>0: Kp>Kc. Δn<0: Kp<Kc"},
  "pH Scale": {r:"HCl: [H⁺]=0.01 M → pH=2. NaOH: [OH⁻]=0.001 M → pOH=3 → pH=11. Pure water: pH=7",n:"Each pH unit = 10× change in [H⁺]. pH<7: acidic. pH=7: neutral. pH>7: basic (at 25°C)"},
  "Weak Acid": {r:"CH₃COOH (Ka=1.8×10⁻⁵, C=0.1 M): [H⁺]=√(1.8×10⁻⁵×0.1)=1.34×10⁻³ M → pH=2.87",n:"Diluting 10× increases α (degree of dissociation) but decreases [H⁺] and raises pH"},
  "Buffer": {r:"Acetate buffer: [CH₃COOH]=[CH₃COO⁻]=0.1 M, pKa=4.74 → pH = 4.74+log(1) = 4.74",n:"Equal acid and conjugate base concentrations: pH = pKa. Buffer capacity is maximum at this point"},
  "Ksp": {r:"BaSO₄: Ksp=1.08×10⁻¹⁰=s². s=1.04×10⁻⁵ mol/L. Adding Na₂SO₄ (common ion) reduces s further",n:"Common ion effect: adding Ba²⁺ or SO₄²⁻ to BaSO₄ solution drastically reduces solubility"},
  "Cell EMF": {r:"Zn|Zn²⁺‖Cu²⁺|Cu: E°=0.34−(−0.76)=+1.10 V. Zn oxidised at anode, Cu²⁺ reduced at cathode",n:"Higher E°_red = cathode (better oxidising agent). More negative = anode (better reducing agent)"},
  "Nernst Equation": {r:"Zn-Cu at [Zn²⁺]=0.01M, [Cu²⁺]=1M: E=1.10−(0.0591/2)log(0.01/1)=1.10+0.059=1.159 V",n:"Q<K: E>E° (forward reaction not at equilibrium). At equilibrium: E=0, Q=K"},
  "Faraday's 1st Law": {r:"Deposit Cu with 2A for 1930s: Q=2×1930=3860 C. mol e⁻=3860/96500=0.04. mol Cu=0.02. mass=0.02×63.5=1.27 g",n:"Charge = Current × Time. At cathode: reduction (metals deposited). At anode: oxidation"},
  "Rate Law": {r:"2NO+O₂→2NO₂: experimentally found rate=k[NO]²[O₂]. Order=3 (not 3 from stoich alone)",n:"Order ≠ stoichiometric coefficient for complex reactions. Must be determined experimentally"},
  "First Order": {r:"¹⁴C decay: t½=5730 yr. k=0.693/5730=1.21×10⁻⁴ yr⁻¹. After 11460 yr: amount = (1/2)² = 25% remains",n:"First order: t½ is constant (independent of initial concentration). Drug metabolism, radioactive decay"},
  "Arrhenius": {r:"Ea=50 kJ/mol, T₁=300K→T₂=310K: ln(k₂/k₁)=(50000/8.314)(1/300−1/310)=0.65→k₂/k₁=1.9",n:"Rule of thumb: rate ~doubles per 10°C rise. Catalyst lowers Ea → exponential increase in rate"},
  "DoU (IHD)": {r:"Aniline C₆H₅NH₂: DoU=(2×6+2+1−5)/2=5. Benzene ring=4(1 ring+3 π bonds), NH₂ contributes +1 from N",n:"DoU ≥ 4 with C>5: likely benzene ring. Each ring=1, each π bond=1, N adds ½, halogens subtract ½"},
  "Inductive Effect": {r:"ClCH₂COOH (pKa=2.86) vs CH₃COOH (pKa=4.74): Cl withdraws e⁻ → stabilises carboxylate → 75× stronger acid",n:"Effect transmitted through σ bonds. Decreases rapidly with distance. +I: alkyl groups. −I: halogens, NO₂"},
  "Mesomeric Effect": {r:"Aniline: NH₂ lone pair → ring (+M) → ring electron-rich → EAS at o/p. Nitrobenzene: NO₂ withdraws (−M) → meta EAS",n:"+M: OH, NH₂, OR, halogens (donate lone pair). −M: NO₂, CHO, COOH, COR (withdraw via π system)"},
  "Carbocation Stability": {r:"HBr adds to 2-methylpropene: forms 3° carbocation (CH₃)₃C⁺ → Br adds → 2-bromo-2-methylpropane (major product)",n:"3°>2°>1° by hyperconjugation and induction. Allylic=benzylic by resonance (charge delocalized)"},
  "SN1 Rate Law": {r:"t-BuBr + H₂O → (CH₃)₃COH: rate = k[t-BuBr] only. Protic solvent stabilises carbocation and Br⁻",n:"Racemisation: planar sp² carbocation attacked from both faces. 50:50 enantiomers typically"},
  "SN2 Rate Law": {r:"CH₃Br + OH⁻ (acetone) → CH₃OH: rate = k[CH₃Br][OH⁻]. Single-step backside attack. Inversion of config",n:"Walden inversion: R-substrate → S-product (or vice versa). Steric hindrance: CH₃ >> 1° > 2° >> 3°"},
  "Markovnikov": {r:"Propene + HBr → 2-bromopropane (major). H goes to CH₂ (more H), Br to CH (forms more stable 2° C⁺)",n:"Ionic mechanism: H⁺ adds first (electrophile) to give more stable carbocation. Then Br⁻ attacks"},
  "Anti-Markovnikov": {r:"Propene + HBr + (PhCOO)₂ → 1-bromopropane (major). Br adds to less substituted C via radical",n:"Only HBr (not HCl, HI). Peroxide initiates radical chain. More stable radical at more substituted C → but Br adds FIRST to less substituted"},
  "EAS Mechanism": {r:"Benzene + Br₂/FeBr₃ → bromobenzene + HBr. FeBr₃ makes Br⁺ electrophile → attacks π → σ complex → lose H⁺",n:"Key: aromaticity lost in σ-complex intermediate (rate-determining step), then restored by proton loss"},
  "o/p Directors": {r:"Toluene + HNO₃/H₂SO₄ → 58% ortho + 38% para + 4% meta nitrotoluene (CH₃ is activating, o/p director)",n:"OH, NH₂ strongly activate (lone pair resonance). CH₃ weakly activates (hyperconjugation). Halogens deactivate but o/p direct"},
  "m Directors": {r:"Nitrobenzene + HNO₃/H₂SO₄ → 93% meta dinitrobenzene. NO₂ withdraws e⁻ from ring, especially o/p positions → meta attack",n:"All −M groups (NO₂, CHO, COOH, COR, CN) are meta directors. They deactivate and direct meta"},
  "Friedel-Crafts Alkylation": {r:"Benzene + C₂H₅Cl + AlCl₃ → ethylbenzene. Problem: more reactive product → diethyl, triethylbenzene also formed",n:"Limitation 1: polyalkylation. Limitation 2: carbocation rearrangement (1-chloropropane gives isopropyl group)"},
  "Friedel-Crafts Acylation": {r:"Benzene + CH₃COCl + AlCl₃ → acetophenone (PhCOCH₃). Product deactivated (C=O withdraws) → no further acylation",n:"No rearrangement (acylium R-C≡O⁺ is stable). Cleaner than alkylation. Reduce C=O → CH₂ via Clemmensen to get alkyl group"},
  "Birch Reduction": {r:"Benzene + Na/NH₃(l)/t-BuOH → 1,4-cyclohexadiene (non-conjugated). Reduction of 1,4 positions",n:"EDG-substituted ring: substituent ring retains double bond (reduces away from EDG). EWG: reduces towards EWG"},
  "Diels-Alder": {r:"Butadiene (s-cis conf) + maleic anhydride (dienophile) → cis bicyclic anhydride. Endo product (kinetic)",n:"Diene must be s-cis. Stereospecific syn addition. Endo rule (kinetic). Concerted [4+2] cycloaddition"},
  "Ozonolysis Products": {r:"But-2-ene (CH₃CH=CHCH₃) + O₃ then Zn/H₂O → 2 molecules of CH₃CHO (ethanal)",n:"Reductive (Zn/H₂O): aldehydes + ketones. Oxidative (H₂O₂): aldehydes → carboxylic acids"},
  "KMnO₄ Oxidation": {r:"Propene + cold dil KMnO₄ (purple) → propane-1,2-diol (colourless). Hot acidic: CH₃CH=CH₂ → CH₃COOH + CO₂",n:"Cold dilute (Baeyer's test): dihydroxylation, syn addition. Hot acidic: C=C cleavage"},
  "Alkyne Reduction": {r:"But-2-yne + H₂/Lindlar → cis-but-2-ene. But-2-yne + Na/NH₃(l) → trans-but-2-ene",n:"Lindlar = Pd/CaCO₃/quinoline: syn addition → cis alkene. Birch (Na/liq NH₃): anti addition → trans alkene"},
  "Alkyne Hydration": {r:"HC≡CH + H₂O/HgSO₄/H₂SO₄ → [CH₂=CHOH] (vinyl alcohol/enol) → tautomerises → CH₃CHO (ethanal)",n:"Terminal alkynes: Markovnikov → methyl ketone. Acetylene exception: gives acetaldehyde. Enol → keto tautomerism"},
  "Alcohol Oxidation": {r:"Ethanol + PCC/DCM → ethanal (stops at aldehyde). Ethanol + KMnO₄/H₂SO₄ → acetic acid (goes further)",n:"1° + PCC = aldehyde. 1° + KMnO₄/Cr₂O₇ = carboxylic acid. 2° always → ketone. 3° = no oxidation (no α-H for oxidant)"},
  "Fischer Esterification": {r:"CH₃COOH + C₂H₅OH → CH₃COOC₂H₅ + H₂O (H₂SO₄ cat). Kc≈4. Remove H₂O to push equilibrium right",n:"¹⁸O labelling: bond breaks at C−OH of acid (not C−O of alcohol). O of ester comes from alcohol"},
  "Phenol Acidity": {r:"PhOH pKa=10 vs C₂H₅OH pKa=16. Phenoxide ion stabilised by resonance over 5 positions → 10⁶× more acidic than ethanol",n:"p-Nitrophenol pKa=7.15 (NO₂ stabilises phenoxide by −M effect). p-Cresol pKa=10.2 (CH₃ is +I, slightly destabilises)"},
  "Kolbe-Schmitt": {r:"PhONa + CO₂ (4 atm, 125°C) → sodium salicylate. + HCl → salicylic acid. + CH₃CO₂H/H₂SO₄ → aspirin",n:"Electrophilic CO₂ attacks ortho of phenoxide (meta-director in acid, but o-director in phenoxide). Basis of aspirin synthesis"},
  "Reimer-Tiemann": {r:"PhOH + CHCl₃ + NaOH → 2-hydroxybenzaldehyde (salicylaldehyde, o-CHO). CHCl₃/NaOH → :CCl₂ electrophile",n:"Gives aldehyde ortho to OH. :CCl₂ (dichlorocarbene) is the electrophile. o-Product major (favoured by phenoxide coordination)"},
  "Williamson Synthesis": {r:"NaOEt + CH₃I → diethyl ether CH₃OC₂H₅? No: C₂H₅ONa + CH₃Br → CH₃OC₂H₅ + NaBr via SN2",n:"Must use 1° alkyl halide for SN2 (3° gives E2 elimination). Alkoxide + primary RX = ether. Best method for unsymmetric ethers"},
  "HCN Addition": {r:"Acetone + HCN → (CH₃)₂C(OH)CN (acetone cyanohydrin). Hydrolysis → (CH₃)₂C(OH)COOH (α-hydroxy acid)",n:"Industrial: acetone cyanohydrin → methacrylic acid → Plexiglas/PMMA. Mechanism: CN⁻ is nucleophile, H⁺ protonates O"},
  "Grignard Addition": {r:"CH₃MgBr + HCHO → (after workup) C₂H₅OH (ethanol, 1°). + CH₃CHO → propan-2-ol (2°). + CO₂ → CH₃COOH",n:"HCHO → 1° (adds 1C). RCHO → 2°. R₂CO → 3°. CO₂ → carboxylic acid. Ester → 3° alcohol"},
  "NaBH₄ Reduction": {r:"Cyclohexanone + NaBH₄/MeOH → cyclohexanol. Ethyl acetate + NaBH₄ → NO REACTION (ester not reduced)",n:"Mild, selective. Reduces only carbonyl (C=O in aldehydes and ketones). Works in water/protic solvents"},
  "LiAlH₄ Reduction": {r:"Acetic acid + LiAlH₄/ether → ethanol. Acetamide + LiAlH₄ → ethylamine. Nitrile + LiAlH₄ → amine",n:"Reduces everything: C=O, COOH, ester, amide, C≡N. NOT isolated C=C (unlike H₂/Ni which is non-selective)"},
  "Clemmensen Reduction": {r:"Acetophenone (PhCOCH₃) + Zn-Hg/conc HCl → ethylbenzene (PhCH₂CH₃). Acid-tolerant substrate needed",n:"C=O → CH₂ in acidic conditions. For base-sensitive substrates use Clemmensen. For acid-sensitive: Wolff-Kishner"},
  "Wolff-Kishner": {r:"Cyclohexanone + N₂H₄/KOH, ethylene glycol, Δ → cyclohexane. C=O → CH₂ under basic conditions",n:"Basic conditions (KOH). Good for acid-sensitive ketones. Huang Minlon modification uses simpler conditions"},
  "Tollens' Test": {r:"Ethanal + Tollens' reagent → silver mirror on flask wall. Ketone (propanone) → NO silver mirror formed",n:"All aldehydes (aliphatic AND aromatic) give positive Tollens'. Ketones do NOT (except α-ketols). Glucose gives positive"},
  "Fehling's Test": {r:"Butanal + Fehling's solution → Cu₂O brick-red precipitate. Benzaldehyde → NO red precipitate",n:"Aliphatic aldehydes react. Aromatic aldehydes (PhCHO) do NOT reduce Fehling's. Ketones do NOT react"},
  "Aldol Condensation": {r:"2CH₃CHO + NaOH → CH₃CH(OH)CH₂CHO (3-hydroxybutanal/aldol). Heat → CH₃CH=CHCHO + H₂O",n:"Needs α-H. OH⁻ deprotonates α-H → enolate attacks C=O of second molecule. Dehydration gives α,β-unsaturated carbonyl"},
  "Cannizzaro Reaction": {r:"2HCHO + NaOH (conc) → CH₃OH + HCOONa. 2PhCHO + NaOH → PhCH₂OH + PhCOO⁻Na⁺",n:"No α-H → no aldol possible. One molecule oxidised (to carboxylate), one reduced (to alcohol). Hydride transfer"},
  "Iodoform Test": {r:"Ethanol + I₂/NaOH → CHI₃↓ (yellow, characteristic iodoform smell). 2-Propanol → positive. 1-Propanol → NEGATIVE",n:"Positive: CH₃CO−R (methyl ketones incl. acetone), CH₃CHO, CH₃CHOH−R (methyl secondary alcohols)"},
  "Reactivity of Acid Derivs": {r:"CH₃COCl + H₂O → instant. CH₃CO₂C₂H₅ + H₂O → slow (hours). CH₃CONH₂ + H₂O → very slow (needs conc acid/base)",n:"Leaving group: Cl⁻ >> RCO₂⁻ >> RO⁻ >> NH₂⁻. Also: resonance stabilisation of derivatives increases going from Cl to NH₂"},
  "HVZ Reaction": {r:"CH₃CH₂COOH + Br₂/P → CH₃CHBrCOOH (2-bromopropanoic acid). Further SN2 with NaCN → CH₃CH(CN)COOH",n:"α-bromination via enol intermediate. P (red) converts COOH to COBr (acid bromide), then enolisation and α-bromination"},
  "Hoffmann Bromamide": {r:"CH₃CONH₂ + Br₂ + 4NaOH → CH₃NH₂ (methylamine) + Na₂CO₃ + 2NaBr + 2H₂O. Product has 1 LESS carbon",n:"Amide (RCONH₂) → primary amine (RNH₂). Migration of R group from C to N. Chain shortens by one carbon"},
  "Gabriel Phthalimide": {r:"Phthalimide + KOH → K-phthalimide. + C₂H₅Br → N-ethylphthalimide. + N₂H₄ → ethylamine (pure 1° amine)",n:"Gives ONLY primary amines (no contamination with 2° or 3°). Hydrazinolysis cleaves phthalimide ring"},
  "Carbylamine Test": {r:"CH₃NH₂ (methylamine, 1°) + CHCl₃ + 3KOH → CH₃NC (methyl isocyanide, foul smell). (CH₃)₂NH (2°) → NO reaction",n:"Only primary amines (aliphatic and aromatic) give foul-smelling isocyanide. Confirmatory test for RNH₂"},
  "Hinsberg Test": {r:"Aniline (1°) + C₆H₅SO₂Cl → C₆H₅SO₂NHC₆H₅ (dissolves in NaOH). Me₂NH (2°) → sulfonamide insoluble in NaOH. Et₃N (3°) → no reaction",n:"1°: sulfonamide has N-H → acidic → soluble in NaOH. 2°: no N-H → insoluble. 3°: does not react with sulfonyl chloride"},
  "NaNO₂/HCl (0°C)": {r:"Aniline + NaNO₂ + HCl at 0-5°C → benzenediazonium chloride (PhN₂⁺Cl⁻, stable below 5°C)",n:"1° aliphatic amines: unstable diazonium decomposes instantly → alcohol + N₂ + HX. Aromatic: stable due to resonance"},
  "Sandmeyer Reaction": {r:"PhN₂⁺Cl⁻ + CuCl → PhCl + N₂. Same reaction: +CuBr→PhBr, +CuCN→PhCN, +HBF₄→[ArN₂]BF₄→heat→PhF",n:"Replace diazonium group with Cl, Br, CN, F. N₂ is driving force (very stable leaving group). Gattermann: uses Cu metal"},
  "Azo Coupling": {r:"PhN₂⁺ + β-naphthol (in NaOH solution) → 1-phenylazo-2-naphthol (red azo dye). EAS at para position",n:"Weak electrophile: requires activated ring (phenols or anilines). Phenols: alkaline conditions. Anilines: mildly acidic"},
  "Haber Process": {r:"N₂ + 3H₂ ⇌ 2NH₃ (ΔH=−92 kJ). Fe/Al₂O₃/K₂O catalyst. 450°C and 200 atm give ~15% yield per pass",n:"Low T → more NH₃ (exothermic) but too slow. High P → more NH₃ (fewer moles) but costly. 450°C is economic optimum"},
  "Contact Process": {r:"2SO₂ + O₂ ⇌ 2SO₃ (V₂O₅, 450°C). SO₃ + H₂SO₄ → H₂S₂O₇ (oleum) + H₂O → 2H₂SO₄",n:"Cannot absorb SO₃ directly in water (acid mist). Must absorb in conc H₂SO₄ to form oleum first"},
  "HNO₃ Preparation": {r:"Ostwald: 4NH₃ + 5O₂ → 4NO + 6H₂O (Pt, 850°C). 4NO + 3O₂ + 2H₂O → 4HNO₃",n:"Three stages: NH₃ oxidation → NO → NO₂ → HNO₃. Pt is catalyst for the first oxidation step"},
  "HNO₃ Reactions": {r:"Cu + 4HNO₃(conc) → Cu(NO₃)₂ + 2NO₂↑ + 2H₂O. 3Cu + 8HNO₃(dil) → 3Cu(NO₃)₂ + 2NO↑ + 4H₂O",n:"Conc HNO₃: NO₂ (brown). Dilute HNO₃: NO (colourless). Very dilute with Mg/Zn: N₂O or NH₄⁺"},
  "H₂O₂ Reactions": {r:"As oxidant: PbS + 4H₂O₂ → PbSO₄ + 4H₂O. As reductant: 2KMnO₄ + 5H₂O₂ + 3H₂SO₄ → 2MnSO₄ + 8H₂O + 5O₂",n:"H₂O₂ is amphoteric redox: acts as oxidant with weak reductants (PbS) and as reductant with strong oxidants (KMnO₄)"},
  "NaOH Preparation": {r:"2NaCl + 2H₂O → electrolysis → 2NaOH + Cl₂↑ + H₂↑. Mercury cathode (Castner-Kellner) or membrane cell",n:"Important industrial process (chlor-alkali). Three products: NaOH (cathode), Cl₂ (anode), H₂ (cathode)"},
  "Na₂CO₃ Solvay Process": {r:"Brine + NH₃ + CO₂ → NaHCO₃↓ + NH₄Cl. Heat NaHCO₃ → Na₂CO₃ + CO₂ + H₂O. CO₂ and NH₃ recycled",n:"Net reaction: 2NaCl + CaCO₃ → Na₂CO₃ + CaCl₂. Solvay process is continuous with NH₃ recovery"},
  "CFSE Octahedral": {r:"[Fe(H₂O)₆]²⁺: weak field, d⁶ high spin t₂g⁴eᵍ². CFSE=4(−0.4)+2(+0.6)=−0.4Δ₀. [Fe(CN)₆]⁴⁻: strong field, t₂g⁶eᵍ⁰. CFSE=6(−0.4)=−2.4Δ₀",n:"Strong field (CN⁻, CO): low spin, more stable, fewer unpaired e⁻. Weak field (H₂O, Cl⁻): high spin, more unpaired"},
  "Geometric Isomerism": {r:"Cisplatin [Pt(NH₃)₂Cl₂] cis-isomer: Cl's adjacent → anticancer drug. Trans-isomer: Cl's opposite → inactive clinically",n:"Cis-platin binds DNA (two N's of guanine). Trans cannot achieve same geometry. Classic example of isomer bioactivity difference"},
  "Magnetic Moment": {r:"[Fe(CN)₆]⁴⁻: Fe²⁺ d⁶ low spin → 0 unpaired → μ=0 (diamagnetic). [Fe(H₂O)₆]²⁺: 4 unpaired → μ=√24=4.9 BM (paramagnetic)",n:"μ = √n(n+2). Mn²⁺ and Fe³⁺ (d⁵ high spin): 5 unpaired → μ=5.92 BM (maximum for first row TM)"},
  "Density (cubic)": {r:"NaCl: Z=4, M=58.5 g/mol, a=564 pm=5.64×10⁻⁸ cm. ρ=4×58.5/(6.022×10²³×(5.64×10⁻⁸)³)=2.16 g/cm³",n:"Z: SC=1, BCC=2, FCC=4. Convert a to cm. M = molar mass of all atoms in one unit cell"},
  "NaCl Structure": {r:"NaCl: Cl⁻ at FCC positions, Na⁺ in octahedral voids. Each Na⁺ surrounded by 6 Cl⁻ (octahedral), and vice versa. CN=6",n:"Z=4 formula units per unit cell. Also adopts this structure: KBr, MgO, CaO, FeO. r+/r- = 0.414-0.732 range"},
  "Schottky Defect": {r:"NaCl at high T: equal numbers of Na⁺ and Cl⁻ vacancies. Crystal becomes less dense. Found in highly ionic, similar-sized ion crystals",n:"Density decreases. Electrical conductivity increases slightly (easier ion movement). NaCl, KCl, KBr, AgBr"},
  "Freundlich Isotherm": {r:"Charcoal adsorbs acetic acid: x/m = k×C^(1/n). log-log plot → straight line. Slope=1/n (usually 0.1-1.0)",n:"Empirical equation. At high P: adsorption keeps increasing (no saturation predicted — differs from Langmuir)"},
  "Hardy-Schulze Rule": {r:"Fe(OH)₃ sol (+ve): Al³⁺ coagulates at 0.009 mmol/L; Ca²⁺ at 0.65; Na⁺ at 9.0. Higher charge = 1000× more effective",n:"Only counter-ions (opposite charge to colloid) cause coagulation. Higher charge → fewer needed (Hardy-Schulze)"},
  "Blast Furnace": {r:"Zone 1 (900-1500°C): Fe₂O₃+3CO→2Fe+3CO₂. Zone 2: CaO+SiO₂→CaSiO₃ (slag). Zone 3: C+O₂→CO₂; CO₂+C→2CO",n:"CO is reducing agent. CaO (from limestone) removes acidic SiO₂ impurity as slag. Pig iron contains 4% C"},
  "Thermite": {r:"2Al + Fe₂O₃ → Al₂O₃ + 2Fe (ΔH=−850 kJ/mol). Reaches 3000°C. Used in rail welding (thermite welding)",n:"Al has greater O affinity than Fe (Al higher in activity series, lower in Ellingham diagram). Highly exothermic"},
  "Hall-Héroult": {r:"Al₂O₃ in molten cryolite (950°C) → electrolysis. Cathode: Al³⁺+3e⁻→Al(l). Anode: 2O²⁻→O₂ (burns C anode as CO₂)",n:"Pure Al₂O₃ melts at 2000°C. Cryolite Na₃AlF₆ lowers mp to 950°C. C anodes consumed and replaced periodically"},
  "KMnO₄ Acidic": {r:"KMnO₄ (purple) + H₂C₂O₄ + H₂SO₄ → colourless (Mn²⁺). 2MnO₄⁻+5C₂O₄²⁻+16H⁺→2Mn²⁺+10CO₂+8H₂O",n:"n-factor=5 (Mn: +7→+2). Self-indicating (purple disappears at endpoint). 1 MnO₄⁻ oxidises 5 Fe²⁺ or 2.5 C₂O₄²⁻"},
  "K₂Cr₂O₇ Acidic": {r:"K₂Cr₂O₇ (orange) + 6FeSO₄ + 7H₂SO₄ → Cr₂(SO₄)₃ (green) + 3Fe₂(SO₄)₃ + K₂SO₄ + 7H₂O",n:"n-factor=6 per Cr₂O₇²⁻ (each Cr: +6→+3). Orange→green colour change. Diphenylamine used as indicator"},
  "DNA Base Pairing": {r:"DNA: A pairs with T (2 H-bonds): A---T. G pairs with C (3 H-bonds): G≡≡≡C. In RNA: A pairs with U (no thymine)",n:"G-C rich DNA needs more energy to denature (higher Tm). Complementary pairing enables replication and transcription"},
  "Reducing Sugars": {r:"Glucose (free CHO group) + Tollens' → silver mirror ✓. Sucrose (no free anomeric OH) → no reaction ✗",n:"All monosaccharides are reducing. Disaccharides: maltose ✓, lactose ✓, sucrose ✗ (C1-C2 bond locks both anomers)"},
  "Nylon-6,6": {r:"H₂N(CH₂)₆NH₂ + HOOC(CH₂)₄COOH → [−NH(CH₂)₆NHCO(CH₂)₄CO−]ₙ + H₂O. Condensation polymer (amide bonds)",n:"6,6: 6 carbons in diamine (hexamethylenediamine) + 6 in diacid (adipic acid). Used in textiles, ropes, tyres"},
  "Vulcanization": {r:"Raw rubber (sticky, low strength) + 3-5% S + heat → S cross-links between chains → elastic, hard, durable vulcanised rubber",n:"More S = harder rubber (ebonite: 30% S). Cross-links prevent chains sliding over each other. Discovered by Goodyear"},
  "Bakelite": {r:"Phenol + HCHO (acid cat) → o/p-hydroxymethyl phenol → cross-links with more HCHO → 3D network Bakelite",n:"Thermosetting (cannot remould once set). 3D cross-linked network. Applications: electrical fittings, handles, early telephones"},
  "Flame Tests": {r:"NaCl: golden yellow flame (Na). KCl: violet (K). LiCl: crimson red (Li). CaCl₂: brick red (Ca). BaCl₂: apple green (Ba)",n:"Each metal's valence electrons excited by flame energy → emit specific wavelength on returning to ground state → colour"},
  "IE Trend": {r:"IE₁: Li<Be>B<C<N>O<F<Ne. Be>B (2s > 2p). N>O (N: half-filled 2p extra stable, O: paired electron repulsion)",n:"General trend across period: increases (Zeff increases). Exceptions at group 2→3 and group 5→6 in each period"},
  "Lucas Test": {r:"1-butanol (1°): no turbidity at 25°C. 2-butanol (2°): turbid after 5 min. 2-methyl-2-propanol (3°): immediate turbidity",n:"Turbidity = formation of alkyl chloride (insoluble). 3°>>2°>1° reaction rate via SN1. Primary needs heat"},
  "Brown Ring Test": {r:"FeSO₄ solution + KNO₃ + conc H₂SO₄ (carefully down the side) → brown ring at interface: [Fe(NO)(H₂O)₅]SO₄",n:"Confirms NO₃⁻. The brown nitrosyl complex forms at liquid-liquid interface. Do NOT mix the layers"},
};

function getFormulaHint(fStr){
  const splits=["=","⟺","⟹","↔","→","≡","≈","∝"];
  for(const ch of splits){
    const idx=fStr.indexOf(ch);
    if(idx>1&&idx<fStr.length-1){
      const lhs=fStr.substring(0,idx).trim();
      if(lhs.length>0)return lhs.length>28?lhs.substring(0,27)+"…":lhs;
    }
  }
  return fStr.length>28?fStr.substring(0,27)+"…":fStr;
}

const XP_LEVELS=[
  {min:0,    max:500,   label:"JEE Aspirant",icon:"🌱",col:"#6b7280"},
  {min:500,  max:1500,  label:"JEE Explorer",icon:"⚡",col:"#3b82f6"},
  {min:1500, max:3500,  label:"JEE Scholar", icon:"📚",col:"#7c3aed"},
  {min:3500, max:6000,  label:"JEE Expert",  icon:"🔥",col:"#d97706"},
  {min:6000, max:10000, label:"JEE Advanced",icon:"💎",col:"#059669"},
  {min:10000,max:99999, label:"IIT Bound",   icon:"🚀",col:"#dc2626"},
];
const BOTTOM_NAV=[
  {k:"home",    label:"Home",    emoji:"🏠"},
  {k:"progress",label:"Progress",emoji:"📊"},
  {k:"journal", label:"Journal", emoji:"📔"},
];


// ── DATA ──────────────────────────────────────────────────────────────
const CHAPS=[
// ╔═══════════════════════ MATHEMATICS ════════════════════════╗
{id:"m1",sub:"math",name:"Sets, Relations & Functions",weight:"Medium",est:3,
 syllabus:[
  {topic:"Set Theory",subtopics:[
    {name:"Representation of Sets",concepts:["Roster (tabular) form — listing elements inside braces","Set-builder form {x : condition}","Empty set ∅ or {} — no elements","Singleton set — exactly one element","Finite set — finite number of elements","Infinite set — infinite number of elements","Universal set U — all objects under consideration"]},
    {name:"Subsets & Power Set",concepts:["Subset A⊆B — every element of A is in B","Proper subset A⊂B — A⊆B and A≠B","Power set P(A) — set of all subsets; |P(A)|=2^n","Comparable sets — A⊆B or B⊆A"]},
    {name:"Set Operations",concepts:["Union A∪B = {x: x∈A or x∈B}","Intersection A∩B = {x: x∈A and x∈B}","Difference A−B = {x: x∈A and x∉B}","Symmetric difference AΔB = (A−B)∪(B−A)","Complement A' or Aᶜ = U−A","De Morgan's 1: (A∪B)'=A'∩B'","De Morgan's 2: (A∩B)'=A'∪B'","Cartesian product A×B = {(a,b): a∈A, b∈B}; |A×B|=|A|·|B|","Venn diagrams — inclusion-exclusion for 2 & 3 sets"]}
  ]},
  {topic:"Relations",subtopics:[
    {name:"Basic Concepts",concepts:["Relation — subset of A×B","Domain — set of first elements","Codomain — set B","Range — second elements that actually appear","Representations: roster, set-builder, arrow diagram, matrix"]},
    {name:"Types of Relations on Set A",concepts:["Reflexive — (a,a)∈R for all a∈A","Symmetric — if (a,b)∈R then (b,a)∈R","Transitive — if (a,b)∈R and (b,c)∈R then (a,c)∈R","Anti-symmetric — (a,b)∈R and (b,a)∈R ⟹ a=b","Equivalence relation — reflexive + symmetric + transitive","Equivalence class [a]={x∈A:(a,x)∈R} — forms a partition","Partial order — reflexive, anti-symmetric, transitive"]}
  ]},
  {topic:"Functions",subtopics:[
    {name:"Basic Definitions",concepts:["Function — each domain element has exactly one image","Domain, codomain, range","Real-valued function — codomain ⊆ ℝ","Equality of functions — same domain, same rule"]},
    {name:"Types of Mappings",concepts:["Injective (one-one): f(x₁)=f(x₂)⟹x₁=x₂; horizontal line test","Surjective (onto): range=codomain","Bijective: both injective and onto","Composite (f∘g)(x)=f(g(x)); domain of f∘g","Associativity: (f∘g)∘h=f∘(g∘h)","Invertible — f bijective; f∘f⁻¹=I; find by swapping x,y"]},
    {name:"Classification of Real Functions",concepts:["Polynomial functions — degree, leading coeff, roots","Rational p(x)/q(x) — domain q(x)≠0, asymptotes","Constant f(x)=c; Identity f(x)=x","Modulus |x| — graph, properties","Floor ⌊x⌋ greatest integer — graph, properties","Fractional part {x}=x−⌊x⌋ — period 1","Ceiling ⌈x⌉ (least integer function)","Signum function: 1 for x>0, 0 for x=0, −1 for x<0","Exponential f(x)=aˣ (a>0,a≠1) — properties, graph","Logarithmic f(x)=logₐx — properties, graph","Even f(−x)=f(x) — symmetric about y-axis","Odd f(−x)=−f(x) — symmetric about origin","Periodic f(x+T)=f(x); smallest T>0 = fundamental period"]},
    {name:"Graph Transformations",concepts:["Horizontal shift: y=f(x−h) right, y=f(x+h) left","Vertical shift: y=f(x)+k up, y=f(x)−k down","Vertical scaling: y=af(x) stretch/shrink","Horizontal scaling: y=f(ax) compress/stretch","Reflection: y=−f(x) about x-axis; y=f(−x) about y-axis","Modulus: y=|f(x)| — reflect negative parts up","Reciprocal: y=1/f(x) — asymptotes at zeros of f"]}
  ]}
 ],
 topics:["Types of sets: empty, singleton, finite, infinite, universal","Subsets, power set — counting subsets: 2ⁿ","Set operations: union A∪B, intersection A∩B, difference A−B, complement A'","De Morgan's laws: (A∪B)'=A'∩B', (A∩B)'=A'∪B'","Cartesian product A×B and ordered pairs","Venn diagrams and inclusion-exclusion principle","Relations: domain, range, codomain","Types: reflexive, symmetric, antisymmetric, transitive","Equivalence relation (all three); equivalence classes","Types of functions: injective, surjective, bijective","Composition of functions (f∘g)(x)=f(g(x))","Inverse function: existence, graph reflection","Floor ⌊x⌋, ceiling ⌈x⌉, fractional part {x}=x−⌊x⌋","Even, odd, periodic functions","Graph transformations: shift, stretch, reflection, modulus","Domain and range of composite/inverse functions"],
 formulas:[{t:"Inclusion-Exclusion 2",f:"|A∪B|=|A|+|B|−|A∩B|"},{t:"Inclusion-Exclusion 3",f:"|A∪B∪C|=|A|+|B|+|C|−|A∩B|−|B∩C|−|A∩C|+|A∩B∩C|"},{t:"Power Set",f:"|A|=n ⟹ |P(A)|=2ⁿ; P(∅)={∅}"},{t:"De Morgan 1",f:"(A∪B)ʼ=Aʼ∩Bʼ"},{t:"De Morgan 2",f:"(A∩B)ʼ=Aʼ∪Bʼ"},{t:"Symmetric Diff",f:"AΔB=(A∪B)−(A∩B)=(A−B)∪(B−A)"},{t:"Cartesian Product",f:"|A×B|=|A|×|B|; A×B≠B×A unless A=B"},{t:"Injections A→B",f:"ⁿPₘ=n!/(n−m)! ; surjections: inclusion-exclusion"},{t:"Bijections",f:"Bijective f:A→B ⟺ |A|=|B|; count = n!"},{t:"Even/Odd",f:"Even: f(−x)=f(x); Odd: f(−x)=−f(x)"},{t:"Periodic",f:"f(x+T)=f(x); sin,cos→2π; tan,cot→π"},{t:"Floor/Ceiling",f:"⌊x⌋≤x<⌊x⌋+1; ⌈x⌉−1<x≤⌈x⌉"},{t:"Fractional Part",f:"{x}=x−⌊x⌋; 0≤{x}<1"},{t:"Composition Domain",f:"Domain(f∘g)⊆Domain(g); range(g)⊆domain(f)"},{t:"Inverse Exists",f:"f⁻¹ exists iff f is bijective; (f∘f⁻¹)(x)=x"},{t:"Graph y=|f(x)|",f:"Reflect portion below x-axis upward; y=f(|x|): fold right half"},{t:"Modulus Splitting",f:"|x|<a ⟺ −a<x<a; |x|>a ⟺ x>a or x<−a"},{t:"Signum Function",f:"sgn(x)=1 (x>0), 0 (x=0), −1 (x<0); |x|=x·sgn(x)"},{t:"Equivalence Class",f:"[a]={x∈A:(a,x)∈R}; partition: disjoint, exhaustive"},{t:"Injection Count",f:"f:A→B injective: P(|B|,|A|)=|B|!/(|B|−|A|)!"},{t:"Number of Relations",f:"Total relations on A: 2^(n²); equivalence relations: Bell number Bₙ"},{t:"Period of Composition",f:"Period of f(g(x)): LCM of individual periods if applicable"},{t:"Horizontal Line Test",f:"f is injective iff every horizontal line meets graph at most once"},{t:"Increasing Function",f:"x₁<x₂ ⟹ f(x₁)<f(x₂); derivative f′(x)>0"}],
 keyPoints:["A−B=A∩B' (elements in A but not B)","Equivalence relation → partition into disjoint classes","f injective ⟺ f(x₁)=f(x₂)⟹x₁=x₂","Graph of y=|f(x)|: reflect below x-axis upward","∫₋ₐᵃf dx=0 if f odd; =2∫₀ᵃf dx if f even"],
 mindmap:{root:"Sets, Relations\n& Functions",branches:[{n:"Set Theory",col:"#7c3aed",nodes:["Operations ∪∩−","De Morgan's Laws","Power Set 2ⁿ","Venn Counting"]},{n:"Relations",col:"#a78bfa",nodes:["Reflexive","Symmetric","Transitive","Equivalence Class"]},{n:"Functions",col:"#6d28d9",nodes:["Injective 1-1","Surjective Onto","Bijective","f∘g Composition"]},{n:"Special Fns",col:"#4c1d95",nodes:["Floor ⌊x⌋","{x} Fractional","Even/Odd","Periodic T"]}]}},

{id:"m2",sub:"math",name:"Complex Numbers",weight:"High",est:3,
 syllabus:[
  {topic:"Basics of Complex Numbers",subtopics:[
    {name:"Definition & Operations",concepts:["i=√(−1); i²=−1; i³=−i; i⁴=1 (periodic)","z=x+iy; Re(z)=x; Im(z)=y","Equality: a+ib=c+id ⟺ a=c and b=d","Addition: (a+ib)±(c+id)=(a±c)+i(b±d)","Multiplication: (a+ib)(c+id)=(ac−bd)+i(ad+bc)","Division: multiply num & denom by conjugate of denom"]},
    {name:"Modulus & Conjugate",concepts:["Conjugate z̄=x−iy; z+z̄=2Re(z); z−z̄=2i·Im(z)","z̄₁+z̄₂=z̄₁+z̄₂; z̄₁·z̄₂=z̄₁·z̄₂; z̄₁/z̄₂=z̄₁/z̄₂","Modulus |z|=√(x²+y²); |z|²=zz̄","|z₁z₂|=|z₁||z₂|; |z₁/z₂|=|z₁|/|z₂|","Triangle inequality |z₁+z₂|≤|z₁|+|z₂|; ||z₁|−|z₂||≤|z₁−z₂|","z real ⟺ z=z̄; z purely imaginary ⟺ z+z̄=0"]}
  ]},
  {topic:"Polar & Exponential Forms",subtopics:[
    {name:"Polar Form",concepts:["Argument θ=arg(z)=tan⁻¹(y/x) with quadrant adjustment","Principal argument Arg(z)∈(−π,π]","Polar form z=r(cosθ+i sinθ); r=|z|","Multiplication: r₁r₂·e^(i(θ₁+θ₂)) — multiply moduli, add args","Division: (r₁/r₂)·e^(i(θ₁−θ₂))","arg(z₁z₂)=arg(z₁)+arg(z₂); arg(z₁/z₂)=arg(z₁)−arg(z₂)"]},
    {name:"Euler's Formula & De Moivre",concepts:["Euler: e^(iθ)=cosθ+i sinθ; z=re^(iθ)","e^(iπ)+1=0 (Euler's identity)","De Moivre: (cosθ+i sinθ)ⁿ=cos nθ+i sin nθ (integer n)","For rational n: used to find nth roots","Expanding cos nθ and sin nθ as polynomials in cosθ","Summation of series involving sines/cosines in GP"]}
  ]},
  {topic:"Roots of Unity & Square Roots",subtopics:[
    {name:"nth Roots",concepts:["zⁿ=1: zₖ=e^(i2kπ/n), k=0,1,…,n−1; equally spaced on unit circle","Sum of all nth roots=0; product=(−1)^(n−1)","Cube roots: 1, ω, ω²; ω=e^(i2π/3)=(−1+i√3)/2","1+ω+ω²=0; ω³=1; ω̄=ω²","nth roots of general z=re^(iθ): r^(1/n)e^(i(θ+2kπ)/n)"]},
    {name:"Square Root & Logarithm",concepts:["Square root: set √(x+iy)=a+ib, solve a²−b²=x, 2ab=y","Using polar: √(re^(iθ))=±√r·e^(iθ/2)","Principal log: Log z=ln|z|+i·Arg(z)","General log: log z=ln|z|+i(Arg(z)+2nπ)"]}
  ]},
  {topic:"Geometry & Loci",subtopics:[
    {name:"Argand Plane",concepts:["Point representation (x,y) ↔ x+iy","Distance |z₁−z₂|","Internal section formula: (mz₂+nz₁)/(m+n)","Rotation theorem: (z₃−z₁)/(z₂−z₁)=|z₃−z₁|/|z₂−z₁|·e^(iα)"]},
    {name:"Loci & Regions",concepts:["|z−z₀|=r: circle center z₀ radius r","Apollonius circle |z−z₁|=k|z−z₂| (k≠1)","|z−z₁|=|z−z₂|: perpendicular bisector","arg((z−z₁)/(z−z₂))=0 or π: straight line","arg((z−z₁)/(z−z₂))=α: arc of circle","Ellipse |z−z₁|+|z−z₂|=2a; Hyperbola ||z−z₁|−|z−z₂||=2a","Half-plane: Im(z)>0, Re(z)<0; sector α<arg(z)<β"]}
  ]}
 ],
 topics:["Definition z=a+bi; Re(z)=a; Im(z)=b","Powers of i: i²=−1; iⁿ by n mod 4","Argand plane: complex number as point/vector","Modulus |z|=√(a²+b²) and properties","Conjugate z̄=a−bi and its properties","Argument arg(z)=θ; principal argument in (−π,π]","Polar form z=r(cosθ+i sinθ); z=re^(iθ)","Euler's formula: e^(iθ)=cosθ+i sinθ","Algebraic operations in standard and polar forms","De Moivre's theorem for integer and fractional powers","nth roots of unity: equally spaced on unit circle","Cube roots of unity: 1,ω,ω²; 1+ω+ω²=0, ω³=1","Rotation: multiply by e^(iα)","Triangle inequality","Locus problems: circle, line, arc"],
 formulas:[{t:"Standard Form",f:"z=a+bi; Re(z)=a; Im(z)=b; i²=−1"},{t:"Powers of i",f:"i¹=i; i²=−1; i³=−i; i⁴=1; iⁿ→n mod 4"},{t:"Modulus",f:"|z|=√(a²+b²); |z|²=zz̄; |z₁z₂|=|z₁||z₂|"},{t:"Modulus Quotient",f:"|z₁/z₂|=|z₁|/|z₂|; |zⁿ|=|z|ⁿ"},{t:"Conjugate Props",f:"z+z̄=2Re(z); z−z̄=2i·Im(z); z̄₁+z̄₂=z̄₁+z̄₂"},{t:"Division",f:"z₁/z₂=(z₁z̄₂)/|z₂|²; multiply num&denom by conjugate"},{t:"Polar Form",f:"z=r(cosθ+i sinθ)=re^(iθ); r=|z|; θ=arg(z)"},{t:"Euler Formula",f:"e^(iθ)=cosθ+i sinθ; e^(iπ)+1=0"},{t:"Product/Quotient",f:"z₁z₂=r₁r₂·e^i(θ₁+θ₂); z₁/z₂=(r₁/r₂)·e^i(θ₁−θ₂)"},{t:"De Moivre",f:"(cosθ+isinθ)ⁿ=cosnθ+isinnθ; (re^iθ)ⁿ=rⁿe^(inθ)"},{t:"nth Roots",f:"zₖ=r^(1/n)·e^(i(θ+2kπ)/n), k=0,1,…,n−1; equally spaced"},{t:"Cube Roots of Unity",f:"ω=e^(2πi/3)=(−1+i√3)/2; ω³=1; 1+ω+ω²=0; ω²=ω̄"},{t:"Sum nth Roots",f:"Sum of all nth roots of unity=0; product=(−1)^(n+1)"},{t:"Rotation",f:"Rotating z₁ about z₀ by α: z₂=z₀+(z₁−z₀)e^(iα)"},{t:"Triangle Inequality",f:"||z₁|−|z₂||≤|z₁±z₂|≤|z₁|+|z₂|"},{t:"|z₁+z₂|²",f:"|z₁+z₂|²=|z₁|²+|z₂|²+2Re(z₁z̄₂)"},{t:"Locus Circle",f:"|z−z₀|=r is circle center z₀ radius r"},{t:"arg Formula",f:"arg(z₁/z₂)=arg(z₁)−arg(z₂); arg(z̄)=−arg(z)"},{t:"Section Formula",f:"Internal m:n → z=(mz₂+nz₁)/(m+n); midpoint=(z₁+z₂)/2"},{t:"Apollonius Circle",f:"|z−z₁|=k|z−z₂| (k≠1) is a circle; k=1 → perp bisector"},{t:"Collinearity",f:"z₁,z₂,z₃ collinear iff Im((z₃−z₁)/(z₂−z₁))=0"},{t:"Square Root",f:"√(a+ib): set (x+iy)²=a+ib; x²−y²=a, 2xy=b; solve"},{t:"a³+b³+c³ Identity",f:"a³+b³+c³−3abc=(a+b+c)(a+ωb+ω²c)(a+ω²b+ωc)"},{t:"Logarithm of Complex",f:"Log z=ln|z|+i·Arg(z); general: ln|z|+i(θ+2nπ)"}],
 keyPoints:["z real ⟺ z=z̄; z purely imaginary ⟺ z+z̄=0","On unit circle |z|=1: z̄=1/z","Sum of nth roots = 0; product = (−1)^(n+1)","a³+b³+c³−3abc=(a+b+c)(a+ωb+ω²c)(a+ω²b+ωc)"],
 mindmap:{root:"Complex\nNumbers",branches:[{n:"Forms",col:"#7c3aed",nodes:["a+bi Standard","Polar re^iθ","Euler e^iθ","Argand Plane"]},{n:"Properties",col:"#a78bfa",nodes:["Modulus |z|","Conjugate z̄","Argument θ","Triangle Ineq"]},{n:"Theorems",col:"#6d28d9",nodes:["De Moivre","nth Roots","Cube Roots ω","Rotation e^iα"]},{n:"Geometry",col:"#4c1d95",nodes:["Circle |z−z₀|=r","Perp Bisector","Collinearity","Apollonius"]}]}},

{id:"m3",sub:"math",name:"Quadratic Equations & Polynomials",weight:"High",est:3,
 syllabus:[
  {topic:"Quadratic Equations",subtopics:[
    {name:"Nature of Roots",concepts:["Standard form ax²+bx+c=0, a≠0","Discriminant D=b²−4ac","D>0: two real distinct roots","D=0: real and equal roots x=−b/2a","D<0: complex conjugate pair","Quadratic formula x=(−b±√D)/2a","Roots formula from completing the square"]},
    {name:"Vieta's Formulas",concepts:["Sum of roots: α+β=−b/a","Product of roots: αβ=c/a","Forming equation from roots: x²−(sum)x+product=0","α²+β²=(α+β)²−2αβ","α³+β³=(α+β)³−3αβ(α+β)","α−β=√[(α+β)²−4αβ]=√D/|a|"]}
  ]},
  {topic:"Polynomial Equations",subtopics:[
    {name:"Common Roots",concepts:["One common root: (c₁a₂−c₂a₁)²=(a₁b₂−a₂b₁)(b₁c₂−b₂c₁)","Both common roots: a₁/a₂=b₁/b₂=c₁/c₂","Cubic Vieta: Σα=−b/a; Σαβ=c/a; αβγ=−d/a","Quartic Vieta: Σα=−b/a; Σαβ=c/a; Σαβγ=−d/a; αβγδ=e/a","Complex roots come in conjugate pairs","Descartes' rule of signs","Newton's power sums Sₙ=αⁿ+βⁿ recurrence"]}
  ]},
  {topic:"Location of Roots",subtopics:[
    {name:"Conditions for Root Position",concepts:["Both roots>k: D≥0, −b/2a>k, a·f(k)>0","Both roots<k: D≥0, −b/2a<k, a·f(k)>0","k lies between roots: a·f(k)<0","Exactly one root in (k₁,k₂): f(k₁)·f(k₂)<0","Both roots in (k₁,k₂): D≥0, k₁<−b/2a<k₂, a·f(k₁)>0, a·f(k₂)>0"]},
    {name:"Sign Analysis & Inequalities",concepts:["a>0, D<0: always positive","a<0, D<0: always negative","Range ax²+bx+c: max/min at vertex x=−b/2a","Wavy-curve (method of intervals) for polynomial/rational inequalities","Sign changes at odd-power zeros only","Quadratic inequalities: sign of ax²+bx+c between/outside roots"]}
  ]},
  {topic:"Special Forms",subtopics:[
    {name:"Equations Reducible to Quadratic",concepts:["Biquadratic: ax⁴+bx²+c=0; substitute t=x²","Exponential: a·p^(2x)+b·pˣ+c=0; substitute t=pˣ","Range of rational expression y=f(x)/g(x): form quadratic in x, D≥0","Parametric family of equations","Equations with logarithmic/trigonometric substitution"]}
  ]}
 ],
 topics:["Standard form ax²+bx+c=0; discriminant D=b²−4ac","Nature of roots from D","Quadratic formula; completing the square","Vieta's formulas: sum α+β=−b/a, product αβ=c/a","Symmetric functions: α²+β², α³+β³","Formation from given roots","Common roots conditions","Sign analysis of quadratic expression","Position of roots w.r.t. point k or interval (p,q)","Wavy curve method for polynomial inequalities","Range of rational expressions f(x)/g(x)","Max/min value of quadratic","Descartes' rule of signs"],
 formulas:[{t:"Quadratic Formula",f:"x=(−b±√D)/2a; D=b²−4ac"},{t:"Nature of Roots",f:"D>0: 2 real distinct; D=0: equal; D<0: complex conjugate pair"},{t:"Vieta Sum",f:"α+β=−b/a (for ax²+bx+c=0)"},{t:"Vieta Product",f:"αβ=c/a"},{t:"|α−β|",f:"|α−β|=√D/|a|; (α−β)²=(α+β)²−4αβ"},{t:"Sum of Squares",f:"α²+β²=(α+β)²−2αβ"},{t:"Sum of Cubes",f:"α³+β³=(α+β)³−3αβ(α+β)"},{t:"Sum α⁴+β⁴",f:"(α²+β²)²−2(αβ)²=[(α+β)²−2αβ]²−2(αβ)²"},{t:"Sum α⁵+β⁵",f:"(α³+β³)(α²+β²)−(αβ)²(α+β)"},{t:"Cubic Vieta",f:"ax³+bx²+cx+d: Σα=−b/a; Σαβ=c/a; αβγ=−d/a"},{t:"Quartic Vieta",f:"Σα=−b/a; Σαβ=c/a; Σαβγ=−d/a; αβγδ=e/a"},{t:"Newton Sums",f:"Sₙ=αⁿ+βⁿ; S₁=(α+β); Sₙ=(α+β)Sₙ₋₁−αβSₙ₋₂"},{t:"Both Roots >k",f:"D≥0 AND af(k)>0 AND vertex=−b/2a>k"},{t:"Roots in (p,q)",f:"D≥0; af(p)>0; af(q)>0; p<−b/2a<q"},{t:"One Root Each Side",f:"f(p)·f(q)<0 (signs opposite, D automatically satisfied)"},{t:"Always Positive",f:"a>0 and D<0 ⟹ ax²+bx+c>0 for all x∈ℝ"},{t:"Max/Min of Quadratic",f:"Vertex at x=−b/2a; min=c−b²/4a if a>0; max if a<0"},{t:"Wavy Curve",f:"For (x−a₁)^n₁·(x−a₂)^n₂…; rightmost +; sign changes at odd powers"},{t:"Range Rational",f:"y=f(x)/g(x): form quadratic in x, D≥0 for real x"},{t:"Transformed Roots (k·α,k·β)",f:"x²−k(α+β)x+k²αβ=0; i.e. replace x by x/k"},{t:"Roots (1/α,1/β)",f:"cx²+bx+a=0; reverse coefficients"},{t:"One Common Root Cond",f:"(c₁a₂−c₂a₁)²=(a₁b₂−a₂b₁)(b₁c₂−b₂c₁)"},{t:"Both Roots Common",f:"a₁/a₂=b₁/b₂=c₁/c₂"},{t:"Descartes Rule",f:"Max +ve real roots = sign changes in f(x); −ve roots = sign changes in f(−x)"}],
 keyPoints:["αβ>0 and α+β>0 → both positive; αβ<0 → opposite signs","Complex roots appear as conjugate pairs","Wavy curve: rightmost region +ve if leading coeff>0","For cubic: sum=−b/a; sum products pairwise=c/a; product=−d/a"],
 mindmap:{root:"Quadratic\nEquations",branches:[{n:"Roots & Nature",col:"#7c3aed",nodes:["Discriminant D","Real/Complex","Equal Roots D=0","Irrational Pairs"]},{n:"Vieta's",col:"#a78bfa",nodes:["Sum α+β=−b/a","Product αβ=c/a","α²+β²","α³+β³"]},{n:"Root Location",col:"#6d28d9",nodes:["Both > k","One Each Side","Both in (p,q)","Sign Analysis"]},{n:"Inequalities",col:"#4c1d95",nodes:["Wavy Curve","ax²+bx+c>0","Max/Min Vertex","Common Roots"]}]}},

{id:"m4",sub:"math",name:"Sequences & Series",weight:"High",est:4,
 syllabus:[
  {topic:"Arithmetic Progression",subtopics:[
    {name:"AP Fundamentals",concepts:["First term a, common difference d","nth term: Tₙ=a+(n−1)d","Sum: Sₙ=n/2[2a+(n−1)d]=n/2(a+l); l=last term","aₙ=Sₙ−Sₙ₋₁","3-term AP: a−d, a, a+d; 4-term: a−3d,a−d,a+d,a+3d","Sum of terms equidistant from ends is constant","a,b,c in AP iff 2b=a+c"]},
    {name:"Arithmetic Mean",concepts:["AM of a,b = (a+b)/2","Insertion of n AMs: d=(b−a)/(n+1)","Sum of n AMs inserted = n×AM","Sum of first n odd numbers = n²"]}
  ]},
  {topic:"Geometric Progression",subtopics:[
    {name:"GP Fundamentals",concepts:["First term a, common ratio r; Tₙ=arⁿ⁻¹","Sum (r≠1): Sₙ=a(rⁿ−1)/(r−1); r=1: Sₙ=na","Infinite GP: S∞=a/(1−r) for |r|<1","3-term GP: a/r, a, ar; product=a³; b²=ac","Product of terms equidistant from ends is constant"]},
    {name:"Geometric Mean",concepts:["GM of a,b = √(ab) (positive numbers)","n GMs between a,b: r=(b/a)^(1/(n+1))","a,b,c in GP iff b²=ac","G²=AM×HM (for 2 numbers)"]}
  ]},
  {topic:"Harmonic Progression & Means",subtopics:[
    {name:"HP & HM",concepts:["HP: reciprocals form an AP","HM of a,b = 2ab/(a+b)","a,b,c in HP iff 2/b=1/a+1/c","nth term of HP via reciprocal of AP"]},
    {name:"Inequalities of Means",concepts:["AM≥GM≥HM for positive numbers; equality iff all equal","G²=AH for 2 positive terms","Weighted AM-GM inequality"]}
  ]},
  {topic:"Special Series & Summation",subtopics:[
    {name:"Standard Summations",concepts:["Σk=n(n+1)/2","Σk²=n(n+1)(2n+1)/6","Σk³=[n(n+1)/2]²=(Σk)²","Σ(2k−1)=n² (first n odd); Σ(2k)=n(n+1) (first n even)"]},
    {name:"AGP & Method of Differences",concepts:["Arithmetico-Geometric: a,(a+d)r,(a+2d)r²,…","AGP sum S: use S−rS trick","AGP sum to infinity S∞=a/(1−r)+dr/(1−r)², |r|<1","Method of differences — telescoping: if Tₖ=f(k)−f(k+1), sum=f(1)−f(n+1)","Vn method for products in denominators"]}
  ]}
 ],
 topics:["Arithmetic Progression (AP): nth term, sum, inserting AMs","3-term AP trick: a−d, a, a+d","Geometric Progression (GP): nth term, sum, infinite sum S∞","3-term GP trick: a/r, a, ar; convergence |r|<1","Harmonic Progression (HP): reciprocals in AP","AM, GM, HM: definitions and relations","AM≥GM≥HM for positive numbers; G²=AH","Arithmetico-Geometric Progression (AGP)","Method of differences","Sum of special series: Σn, Σn², Σn³"],
 formulas:[{t:"AP nth Term",f:"aₙ=a+(n−1)d; a=first term; d=common difference"},{t:"AP Sum",f:"Sₙ=n/2·[2a+(n−1)d]=n/2·(a+l); l=last term"},{t:"AP Sₙ−Sₙ₋₁",f:"aₙ=Sₙ−Sₙ₋₁; if Sₙ=An²+Bn then aₙ=A(2n−1)+B"},{t:"Arithmetic Mean",f:"Insert n AMs between a,b: d=(b−a)/(n+1); Aₖ=a+k·d"},{t:"3-term AP",f:"Take a−d, a, a+d; sum=3a; use if sum given"},{t:"4-term AP",f:"Take a−3d, a−d, a+d, a+3d; sum=4a"},{t:"GP nth Term",f:"aₙ=arⁿ⁻¹; a=first term; r=common ratio"},{t:"GP Sum Finite",f:"Sₙ=a(rⁿ−1)/(r−1) for r≠1; Sₙ=na if r=1"},{t:"GP Infinite",f:"S∞=a/(1−r) for |r|<1"},{t:"GP Geometric Mean",f:"Insert n GMs: r=(b/a)^(1/(n+1)); Gₖ=a·rᵏ"},{t:"3-term GP",f:"a/r, a, ar; product=a³; ratio of consecutive terms=r"},{t:"HP & HM",f:"HM of a,b: H=2ab/(a+b); reciprocals form AP: 1/aₙ in AP"},{t:"AM≥GM≥HM",f:"(a+b)/2≥√(ab)≥2ab/(a+b); G²=AH (for 2 positive numbers)"},{t:"AGP Sum n terms",f:"Sₙ=a/(1−r)+dr(1−rⁿ⁻¹)/(1−r)²−[a+(n−1)d]rⁿ/(1−r)"},{t:"AGP Sum Infinity",f:"S∞=a/(1−r)+dr/(1−r)²; |r|<1"},{t:"Σn",f:"1+2+…+n=n(n+1)/2"},{t:"Σn²",f:"1²+2²+…+n²=n(n+1)(2n+1)/6"},{t:"Σn³",f:"1³+2³+…+n³=[n(n+1)/2]²=(Σn)²"},{t:"Σn⁴",f:"n(n+1)(2n+1)(3n²+3n−1)/30"},{t:"Σ(2n−1)",f:"Sum first n odd numbers=n²; Sum first n even=n(n+1)"},{t:"Telescoping (Differences)",f:"If Tₖ=f(k)−f(k+1): ΣTₖ=f(1)−f(n+1)"},{t:"Method of Differences",f:"If bₙ=aₙ₊₁−aₙ is GP or AP, find Sₙ by telescoping"},{t:"AM-GM Equality",f:"AM=GM iff all terms are equal; use to find extrema"},{t:"Partial Fractions in Series",f:"1/k(k+1)=1/k−1/(k+1); sum telescopes to 1−1/(n+1)"}],
 keyPoints:["3-term AP: sum=3a; 3-term GP: product=a³","a,b,c in AP iff 2b=a+c; GP: b²=ac; HP: 2/b=1/a+1/c","Sum of first n odd = n²; first n even = n(n+1)"],
 mindmap:{root:"Sequences\n& Series",branches:[{n:"AP",col:"#7c3aed",nodes:["aₙ=a+(n−1)d","Sₙ=n/2[2a+(n-1)d]","Insert n AMs","3-term Trick"]},{n:"GP",col:"#a78bfa",nodes:["aₙ=arⁿ⁻¹","Sₙ finite","S∞=a/(1−r)","3-term Trick"]},{n:"HP & Means",col:"#6d28d9",nodes:["HP Reciprocals","HM=2ab/(a+b)","AM≥GM≥HM","G²=AH"]},{n:"Special Sums",col:"#4c1d95",nodes:["Σn n(n+1)/2","Σn² (2n+1)/6","Σn³ square","Differences Method"]}]}},

{id:"m5",sub:"math",name:"Permutations, Combinations & Binomial",weight:"High",est:4,
 syllabus:[
  {topic:"Permutations",subtopics:[
    {name:"Fundamental Counting",concepts:["Multiplication principle: m×n events","Addition principle: m+n mutually exclusive events","Factorial: n!=n×(n−1)×…×1; 0!=1","ⁿPᵣ=n!/(n−r)! — arrangements of r from n"]},
    {name:"Special Permutations",concepts:["Circular permutation (n−1)! for distinct","Necklace (undirected): (n−1)!/2","Identical objects: n!/(p!q!r!…)","Arrangements with specified objects together (treat as unit)","Arrangements with objects NOT together: total − together","Rank of word in dictionary"]}
  ]},
  {topic:"Combinations",subtopics:[
    {name:"Basics",concepts:["ⁿCᵣ=n!/[r!(n−r)!]; ⁿCᵣ=ⁿCₙ₋ᵣ (symmetry)","Pascal's identity: ⁽ⁿ⁻¹⁾Cᵣ₋₁+⁽ⁿ⁻¹⁾Cᵣ=ⁿCᵣ","Vandermonde's identity: ⁽ᵐ⁺ⁿ⁾Cᵣ=Σₖ ᵐCₖ·ⁿCᵣ₋ₖ","Hockey stick identity: Σₖ₌ᵣⁿ ᵏCᵣ=⁽ⁿ⁺¹⁾Cᵣ₊₁"]},
    {name:"Advanced Combinations",concepts:["Division into labelled groups: n!/(n₁!n₂!…)","Unlabelled equal-size groups: divide by k!","Derangements D(n)=n!Σ(−1)ᵏ/k!; D(1)=0;D(2)=1;D(3)=2;D(4)=9","Stars & bars (non-negative): ⁽ⁿ⁺ᵏ⁻¹⁾Cₖ₋₁","Stars & bars (positive xᵢ≥1): ⁽ⁿ⁻¹⁾Cₖ₋₁","Distinct objects into distinct boxes: boxⁿ","Identical into distinct boxes: stars and bars"]}
  ]},
  {topic:"Binomial Theorem",subtopics:[
    {name:"Expansion & Terms",concepts:["(a+b)ⁿ=Σᵣ₌₀ⁿ ⁿCᵣ·aⁿ⁻ʳ·bʳ","General term: Tᵣ₊₁=ⁿCᵣ·aⁿ⁻ʳ·bʳ","Middle term: n even — one middle T_{n/2+1}; n odd — two T_{(n+1)/2} and T_{(n+3)/2}","Term independent of x: set power of x in Tᵣ₊₁ to zero","Numerically greatest term: find r where Tᵣ₊₁/Tᵣ≥1","Greatest binomial coefficient: ⁿCᵣ max at r=⌊n/2⌋"]},
    {name:"Properties of Coefficients",concepts:["Sum of all coefficients ΣⁿCᵣ=2ⁿ (put x=y=1)","Alternating sum Σ(−1)ʳⁿCᵣ=0 (put x=1,y=−1)","Sum even + odd terms each = 2ⁿ⁻¹","Σr·ⁿCᵣ=n·2ⁿ⁻¹","Sum of squares: Σ(ⁿCᵣ)²=²ⁿCₙ","Binomial for negative/fractional index (1+x)ⁿ=Σ... for |x|<1; n∈ℝ"]}
  ]},
  {topic:"Multinomial Theorem",subtopics:[
    {name:"Multinomial",concepts:["(x₁+x₂+…+xₖ)ⁿ=Σ(n!/r₁!…rₖ!) x₁^r₁…xₖ^rₖ; r₁+…+rₖ=n","Number of terms = C(n+k−1,k−1)"]}
  ]}
 ],
 topics:["Fundamental counting principle","Factorial: n!, 0!=1","Permutations ⁿPᵣ; circular (n−1)!; necklace (n−1)!/2","Permutations with identical objects: n!/(p!q!r!)","Combinations ⁿCᵣ; Pascal's identity","Division into groups (ordered/unordered)","Derangements D(n)","Binomial theorem: general term Tᵣ₊₁=ⁿCᵣaⁿ⁻ʳbʳ","Middle term; greatest coefficient; numerically greatest term","Sum of binomial coefficients: 2ⁿ; alternating: 0","Binomial for negative/fractional index (|x|<1)","Stars and bars"],
 formulas:[{t:"Fundamental Principle",f:"If task A done in m ways and B in n ways: A then B = mn ways"},{t:"Permutation",f:"ⁿPᵣ=n!/(n−r)!; ⁿP₀=1; ⁿPₙ=n!"},{t:"Circular Permutation",f:"(n−1)! for distinct objects in a circle; (n−1)!/2 for necklace"},{t:"Identical Objects",f:"Arrangements of n objects with p alike, q alike: n!/(p!q!r!…)"},{t:"Combination",f:"ⁿCᵣ=n!/[r!(n−r)!]=ⁿPᵣ/r!; ⁿCᵣ=ⁿCₙ₋ᵣ"},{t:"Pascal Identity",f:"ⁿCᵣ=⁽ⁿ⁻¹⁾Cᵣ₋₁+⁽ⁿ⁻¹⁾Cᵣ"},{t:"Vandermonde",f:"⁽ᵐ⁺ⁿ⁾Cᵣ=Σₖ ᵐCₖ·ⁿCᵣ₋ₖ"},{t:"Hockey Stick",f:"Σₖ₌ᵣⁿ ᵏCᵣ=⁽ⁿ⁺¹⁾Cᵣ₊₁"},{t:"Derangements",f:"D(n)=n!·Σₖ₌₀ⁿ (−1)ᵏ/k! ≈ n!/e; D(1)=0;D(2)=1;D(3)=2;D(4)=9"},{t:"Division Groups",f:"n into groups of p,q,r (p+q+r=n): n!/(p!q!r!); if equal unordered ÷k!"},{t:"Stars & Bars",f:"Non-negative integer solutions to x₁+…+xₖ=n: ⁽ⁿ⁺ᵏ⁻¹⁾Cₖ₋₁"},{t:"Stars & Bars Positive",f:"Positive solutions x₁+…+xₖ=n (xᵢ≥1): ⁽ⁿ⁻¹⁾Cₖ₋₁"},{t:"Binomial Theorem",f:"(a+b)ⁿ=Σᵣ₌₀ⁿ ⁿCᵣ·aⁿ⁻ʳ·bʳ"},{t:"General Term",f:"Tᵣ₊₁=ⁿCᵣ·aⁿ⁻ʳ·bʳ; r starts at 0"},{t:"Middle Term",f:"n even: T_{n/2+1}; n odd: T_{(n+1)/2} and T_{(n+3)/2}"},{t:"Binomial Coeff Sums",f:"ΣⁿCᵣ=2ⁿ; Σ(−1)ʳⁿCᵣ=0; ΣⁿC₂ᵣ=2ⁿ⁻¹; Σr·ⁿCᵣ=n·2ⁿ⁻¹"},{t:"Sum of Squares of Coeffs",f:"Σ(ⁿCᵣ)²=²ⁿCₙ"},{t:"Greatest Coefficient",f:"ⁿCᵣ max at r=⌊n/2⌋; greatest term: compare Tᵣ₊₁/Tᵣ≥1"},{t:"Neg/Frac Index",f:"(1+x)ⁿ=1+nx+n(n-1)x²/2!+… valid for |x|<1; n∈ℚ"},{t:"Multinomial Theorem",f:"(x₁+…+xₖ)ⁿ=Σ[n!/(r₁!…rₖ!)]x₁^r₁…xₖ^rᵣ; r₁+…+rₖ=n"},{t:"Multinomial Terms Count",f:"Number of terms in expansion: ⁽ⁿ⁺ᵏ⁻¹⁾Cₖ₋₁"},{t:"Σr²·ⁿCᵣ",f:"n(n+1)·2ⁿ⁻²"},{t:"Coefficient of xʳ in (1+x)ⁿ",f:"ⁿCᵣ; in (1−x)⁻ⁿ: ⁽ⁿ⁺ʳ⁻¹⁾Cᵣ"}],
 keyPoints:["Term independent of x: set power of x in Tᵣ₊₁ to zero","ⁿCᵣ maximum at r=⌊n/2⌋","Vandermonde: ⁽ᵐ⁺ⁿ⁾Cᵣ=Σᵐcₖ·ⁿCᵣ₋ₖ"],
 mindmap:{root:"P&C &\nBinomial",branches:[{n:"Permutations",col:"#7c3aed",nodes:["ⁿPᵣ=n!/(n-r)!","Circular (n-1)!","Identical Objects","Derangements D(n)"]},{n:"Combinations",col:"#a78bfa",nodes:["ⁿCᵣ Formula","Pascal's Identity","Group Division","Stars & Bars"]},{n:"Binomial",col:"#6d28d9",nodes:["Tᵣ₊₁ General","Middle Term","Numerically Greatest","Neg/Frac Index"]},{n:"Coeff Props",col:"#4c1d95",nodes:["Sum=2ⁿ","Alt Sum=0","Odd+Even=2^(n-1)","Σr·ⁿCᵣ=n·2^(n-1)"]}]}},

{id:"m6",sub:"math",name:"Trigonometry",weight:"High",est:5,
 syllabus:[
  {topic:"Trigonometric Ratios & Identities",subtopics:[
    {name:"Basics & Standard Angles",concepts:["Radian: s=rθ; sector area A=½r²θ","sinθ,cosθ,tanθ,cotθ,secθ,cosecθ via right triangle & unit circle","Reciprocal: cosec=1/sin; sec=1/cos; cot=1/tan","Values at 0°,30°,45°,60°,90°,120°,150°,180°","ASTC rule for quadrant signs","Pythagorean: sin²θ+cos²θ=1; 1+tan²θ=sec²θ; 1+cot²θ=cosec²θ","Graphs: period, amplitude, symmetry of each ratio"]},
    {name:"Compound Angles",concepts:["sin(A±B)=sinAcosB±cosAsinB","cos(A±B)=cosAcosB∓sinAsinB","tan(A±B)=(tanA±tanB)/(1∓tanAtanB)","Reduction formulas: 90°±θ (switch ratios); 180°±θ (sign change)"]},
    {name:"Multiple & Sub-multiple Angles",concepts:["sin2A=2sinAcosA=2tanA/(1+tan²A)","cos2A=cos²A−sin²A=1−2sin²A=2cos²A−1=(1−tan²A)/(1+tan²A)","tan2A=2tanA/(1−tan²A)","sin3A=3sinA−4sin³A; cos3A=4cos³A−3cosA; tan3A=(3t−t³)/(1−3t²)","Half-angle: sin(A/2)=±√((1−cosA)/2); cos(A/2)=±√((1+cosA)/2)","tan(A/2)=sinA/(1+cosA)=(1−cosA)/sinA","t-substitution: t=tan(θ/2); sinθ=2t/(1+t²); cosθ=(1−t²)/(1+t²)"]},
    {name:"Sum-to-Product & Product-to-Sum",concepts:["sinC+sinD=2sin((C+D)/2)cos((C−D)/2)","sinC−sinD=2cos((C+D)/2)sin((C−D)/2)","cosC+cosD=2cos((C+D)/2)cos((C−D)/2)","cosC−cosD=−2sin((C+D)/2)sin((C−D)/2)","2sinAcosB=sin(A+B)+sin(A−B)","2cosAcosB=cos(A+B)+cos(A−B)","2sinAsinB=cos(A−B)−cos(A+B)","Max of a sinθ+b cosθ=√(a²+b²); min=−√(a²+b²)"]}
  ]},
  {topic:"Trigonometric Equations",subtopics:[
    {name:"General Solutions",concepts:["sinθ=sinα ⟹ θ=nπ+(−1)ⁿα, n∈ℤ","cosθ=cosα ⟹ θ=2nπ±α, n∈ℤ","tanθ=tanα ⟹ θ=nπ+α, n∈ℤ","Principal solutions in [0,2π) or [0,π)","Equations of form a sinθ+b cosθ=c: max|value|=√(a²+b²)","Domain restrictions: check for validity","Solving sinⁿθ=k type equations"]}
  ]},
  {topic:"Inverse Trigonometry",subtopics:[
    {name:"Domains & Ranges",concepts:["sin⁻¹: [−1,1]→[−π/2,π/2]","cos⁻¹: [−1,1]→[0,π]","tan⁻¹: ℝ→(−π/2,π/2)","cot⁻¹: ℝ→(0,π)","sec⁻¹: (−∞,−1]∪[1,∞)→[0,π]−{π/2}","cosec⁻¹: (−∞,−1]∪[1,∞)→[−π/2,π/2]−{0}"]},
    {name:"Properties",concepts:["sin⁻¹x+cos⁻¹x=π/2; tan⁻¹x+cot⁻¹x=π/2; sec⁻¹x+cosec⁻¹x=π/2","sin⁻¹(−x)=−sin⁻¹x (odd); cos⁻¹(−x)=π−cos⁻¹x; tan⁻¹(−x)=−tan⁻¹x","tan⁻¹x+tan⁻¹y=tan⁻¹((x+y)/(1−xy)) if xy<1 (with quadrant adjustment)","sin⁻¹x+sin⁻¹y=sin⁻¹(x√(1−y²)+y√(1−x²)) if x²+y²≤1"]}
  ]}
 ],
 topics:["Radian measure; arc length s=rθ; sector area A=½r²θ","All trig ratios for standard angles","Reciprocal & Pythagorean identities","ASTC rule; cofunction and reduction identities","Compound angles: sin(A±B), cos(A±B), tan(A±B)","Double angle: sin2A, cos2A (3 forms), tan2A","Triple angle: sin3A, cos3A, tan3A","Half angle; t-substitution tan(θ/2)","Sum-to-product and product-to-sum","Max/min of a sinθ+b cosθ=±√(a²+b²)","General solutions of sinθ=k, cosθ=k, tanθ=k","Inverse trig: domains, ranges, graphs, properties"],
 formulas:[{t:"Pythagorean",f:"sin²θ+cos²θ=1; 1+tan²θ=sec²θ; 1+cot²θ=cosec²θ"},{t:"Reciprocal",f:"sinθ·cosecθ=1; cosθ·secθ=1; tanθ·cotθ=1"},{t:"sin(A±B)",f:"sin(A+B)=sinAcosB+cosAsinB; sin(A−B)=sinAcosB−cosAsinB"},{t:"cos(A±B)",f:"cos(A+B)=cosAcosB−sinAsinB; cos(A−B)=cosAcosB+sinAsinB"},{t:"tan(A±B)",f:"tan(A±B)=(tanA±tanB)/(1∓tanAtanB)"},{t:"Double Angle sin",f:"sin2A=2sinAcosA=2tanA/(1+tan²A)"},{t:"Double Angle cos",f:"cos2A=cos²A−sin²A=1−2sin²A=2cos²A−1=(1−tan²A)/(1+tan²A)"},{t:"Double Angle tan",f:"tan2A=2tanA/(1−tan²A)"},{t:"Half Angle",f:"sin(A/2)=±√((1−cosA)/2); cos(A/2)=±√((1+cosA)/2); tan(A/2)=(1−cosA)/sinA"},{t:"t-substitution",f:"t=tan(θ/2): sinθ=2t/(1+t²); cosθ=(1−t²)/(1+t²)"},{t:"Triple Angle",f:"sin3A=3sinA−4sin³A; cos3A=4cos³A−3cosA; tan3A=(3tanA−tan³A)/(1−3tan²A)"},{t:"Sum-to-Product",f:"sinC+sinD=2sin((C+D)/2)cos((C−D)/2); sinC−sinD=2cos((C+D)/2)sin((C−D)/2)"},{t:"cosC±cosD",f:"cosC+cosD=2cos((C+D)/2)cos((C−D)/2); cosC−cosD=−2sin((C+D)/2)sin((C−D)/2)"},{t:"Product-to-Sum",f:"2sinAcosB=sin(A+B)+sin(A−B); 2cosAcosB=cos(A+B)+cos(A−B)"},{t:"2sinAsinB",f:"cos(A−B)−cos(A+B)"},{t:"Max a sinθ+b cosθ",f:"=√(a²+b²)·sin(θ+φ); max=√(a²+b²); min=−√(a²+b²)"},{t:"General sinθ=sinα",f:"θ=nπ+(−1)ⁿα, n∈ℤ"},{t:"General cosθ=cosα",f:"θ=2nπ±α, n∈ℤ"},{t:"General tanθ=tanα",f:"θ=nπ+α, n∈ℤ"},{t:"Inverse Domains",f:"sin⁻¹: [−1,1]→[−π/2,π/2]; cos⁻¹: [−1,1]→[0,π]; tan⁻¹: ℝ→(−π/2,π/2)"},{t:"Inverse Properties",f:"sin⁻¹x+cos⁻¹x=π/2; tan⁻¹x+cot⁻¹x=π/2; sin⁻¹(−x)=−sin⁻¹x"},{t:"tan⁻¹ Addition",f:"tan⁻¹x+tan⁻¹y=tan⁻¹((x+y)/(1−xy)) if xy<1; +π if xy>1,x>0"},{t:"tan⁻¹ Subtraction",f:"tan⁻¹x−tan⁻¹y=tan⁻¹((x−y)/(1+xy))"},{t:"sin⁻¹ Addition",f:"sin⁻¹x+sin⁻¹y=sin⁻¹(x√(1−y²)+y√(1−x²)) if x²+y²≤1"},{t:"2tan⁻¹x",f:"=sin⁻¹(2x/(1+x²))=cos⁻¹((1−x²)/(1+x²))=tan⁻¹(2x/(1−x²))"},{t:"sin⁻¹x in terms of tan⁻¹",f:"sin⁻¹x=tan⁻¹(x/√(1−x²)); cos⁻¹x=tan⁻¹(√(1−x²)/x)"},{t:"Reduction 90°±θ",f:"sin(90°+θ)=cosθ; cos(90°+θ)=−sinθ; tan(90°+θ)=−cotθ"},{t:"Reduction 180°±θ",f:"sin(180°−θ)=sinθ; cos(180°−θ)=−cosθ; tan(180°+θ)=tanθ"}],
 keyPoints:["ASTC: All(Q1), Sin(Q2), Tan(Q3), Cos(Q4) positive","(90°±θ) → switch sin↔cos; sign by ASTC","sin15°=(√6−√2)/4; cos15°=(√6+√2)/4","sin⁻¹x+cos⁻¹x=π/2"],
 mindmap:{root:"Trigonometry",branches:[{n:"Identities",col:"#7c3aed",nodes:["Pythagorean","Compound Angles","Double/Triple","Half Angle"]},{n:"Transformations",col:"#a78bfa",nodes:["Sum-to-Product","Product-to-Sum","Max a sinθ+b cosθ","Reduction ASTC"]},{n:"Equations",col:"#6d28d9",nodes:["sinθ=sinα","cosθ=cosα","tanθ=tanα","Domain Check"]},{n:"Inverse Trig",col:"#4c1d95",nodes:["Domains & Ranges","sin⁻¹+cos⁻¹=π/2","Even/Odd Props","tan⁻¹ Addition"]}]}},

{id:"m7",sub:"math",name:"Properties of Triangles",weight:"High",est:3, syllabus:[
  {topic:"Properties of Triangles",subtopics:[
    {name:"Sine & Cosine Rules",concepts:["Sine rule: a/sinA=b/sinB=c/sinC=2R (R=circumradius)","Cosine rule: a²=b²+c²−2bc cosA; cosA=(b²+c²−a²)/2bc","Projection formula: a=bcosC+ccosB; b=ccosA+acosC","Napier's analogies","Ambiguous case (SSA): 0, 1, or 2 triangles"]},
    {name:"Area Formulas",concepts:["Area Δ=½ab sinC=½bc sinA=½ca sinB","Heron's formula: Δ=√[s(s−a)(s−b)(s−c)]; s=(a+b+c)/2","Area using coordinates: shoelace formula","Δ=abc/(4R)=rs (r=inradius, s=semi-perimeter)"]},
    {name:"Half-Angle Formulas",concepts:["sin(A/2)=√[(s−b)(s−c)/bc]","cos(A/2)=√[s(s−a)/bc]","tan(A/2)=√[(s−b)(s−c)/s(s−a)]=r/(s−a)=Δ/[s(s−a)]"]}
  ]},
  {topic:"Special Radii & Lines",subtopics:[
    {name:"In-radius & Ex-radii",concepts:["In-radius r=Δ/s=(s−a)tan(A/2)=4R·sin(A/2)sin(B/2)sin(C/2)","Ex-radius r₁=Δ/(s−a); r₂=Δ/(s−b); r₃=Δ/(s−c)","r₁=s·tan(A/2)=4R·sin(A/2)cos(B/2)cos(C/2)","Relations: r₁+r₂+r₃−r=4R; 1/r=1/r₁+1/r₂+1/r₃; r·r₁·r₂·r₃=Δ²"]},
    {name:"Circumradius & Special Lines",concepts:["Circumradius R=abc/4Δ=a/(2sinA)","Median: mₐ=½√(2b²+2c²−a²); 3(a²+b²+c²)=4(mₐ²+mb²+mc²)","Altitude: hₐ=2Δ/a; hb=2Δ/b; hc=2Δ/c","Angle bisector: tₐ=2bc·cos(A/2)/(b+c); tₐ²=bc[(b+c)²−a²]/(b+c)²","Euler's formula: OI²=R(R−2r); implies R≥2r","Euler line: O,G,H collinear; OG:GH=1:2","Pedal triangle sides: a cosA, b cosB, c cosC; circumradius=R/2"]}
  ]}
 ],
 topics:["Sine rule: a/sinA=b/sinB=c/sinC=2R","Cosine rule; projection formulas","Area: ½ab sinC; Heron's formula s=(a+b+c)/2","Half-angle formulas in terms of s","In-radius r=Δ/s","Ex-radii r₁=Δ/(s−a), r₂, r₃","Circumradius R=abc/4Δ","Relations: 1/r=1/r₁+1/r₂+1/r₃; r₁+r₂+r₃−r=4R","Medians: Apollonius theorem","Altitudes and angle bisector lengths","Euler's formula: OI²=R²−2Rr","Ambiguous case SSA"],
 formulas:[{t:"Sine Rule",f:"a/sinA=b/sinB=c/sinC=2R"},{t:"Cosine Rule",f:"cosA=(b²+c²−a²)/2bc; a²=b²+c²−2bc·cosA"},{t:"Projection Formula",f:"a=b·cosC+c·cosB; b=c·cosA+a·cosC; c=a·cosB+b·cosA"},{t:"Area Formulas",f:"Δ=½ab sinC=½bc sinA=½ca sinB"},{t:"Heron Formula",f:"Δ=√[s(s−a)(s−b)(s−c)]; s=(a+b+c)/2"},{t:"Half-angle sin",f:"sin(A/2)=√[(s−b)(s−c)/bc]"},{t:"Half-angle cos",f:"cos(A/2)=√[s(s−a)/bc]"},{t:"Half-angle tan",f:"tan(A/2)=√[(s−b)(s−c)/s(s−a)]=Δ/[s(s−a)]=r/(s−a)"},{t:"In-radius",f:"r=Δ/s=4R·sin(A/2)sin(B/2)sin(C/2)=(s−a)tan(A/2)"},{t:"Ex-radii",f:"r₁=Δ/(s−a); r₂=Δ/(s−b); r₃=Δ/(s−c)"},{t:"Ex-radius tangent",f:"r₁=s·tan(A/2)=4R·sin(A/2)cos(B/2)cos(C/2)"},{t:"Circumradius",f:"R=abc/4Δ=a/(2sinA)"},{t:"r Relations",f:"r₁+r₂+r₃−r=4R; 1/r=1/r₁+1/r₂+1/r₃; r·r₁·r₂·r₃=Δ²"},{t:"Median",f:"mₐ²=(2b²+2c²−a²)/4; similarly mb,mc"},{t:"Median-sides",f:"mₐ=½√(2b²+2c²−a²); 3(a²+b²+c²)=4(mₐ²+mb²+mc²)"},{t:"Altitude",f:"hₐ=2Δ/a; hb=2Δ/b; hc=2Δ/c"},{t:"Angle Bisector",f:"tₐ=2bc·cos(A/2)/(b+c); tₐ²=bc[(b+c)²−a²]/(b+c)²"},{t:"Euler Formula",f:"OI²=R(R−2r)=R²−2Rr; always OI≥0 so R≥2r"},{t:"Pedal Triangle",f:"Sides: a cosA, b cosB, c cosC; Circum-radius=R/2"},{t:"Napier's Analogy",f:"tan((B−C)/2)=(b−c)/(b+c)·cot(A/2)"},{t:"r₁r₂r₃ Product",f:"r₁r₂r₃=rΔ²/s·(1/r)=Δ·s; also r₁r₂r₃=Δ²/r"},{t:"Sum 1/hₐ",f:"1/hₐ+1/hᵦ+1/hᶜ=1/r"},{t:"OI² Generalization",f:"OI²=R²−2Rr (Euler); similarly for ex-centers"},{t:"Angle A in terms of sides",f:"tan(A/2)=r/(s−a); tanA=2Δ/(b²+c²−a²)"}],
 keyPoints:["Largest side opposite largest angle","Ambiguous case SSA: 0, 1, or 2 triangles","Euler line: O, G, H collinear; OG:GH=1:2","Area with coordinates: Δ=½|x₁(y₂−y₃)+x₂(y₃−y₁)+x₃(y₁−y₂)|"],
 mindmap:{root:"Properties\nof Triangles",branches:[{n:"Rules",col:"#7c3aed",nodes:["Sine Rule 2R","Cosine Rule","Projection Formula","Ambiguous Case"]},{n:"Area",col:"#a78bfa",nodes:["½ab sinC","Heron's Formula","Coordinates","r·s=Δ"]},{n:"Special Radii",col:"#6d28d9",nodes:["In-radius r=Δ/s","Ex-radii r₁,r₂,r₃","Circumradius R","OI²=R²-2Rr"]},{n:"Lines & Centers",col:"#4c1d95",nodes:["Median Apollonius","Altitude hₐ=2Δ/a","Angle Bisector","Euler Line"]}]}},

{id:"m8",sub:"math",name:"Straight Lines & Pair of Lines",weight:"High",est:4, syllabus:[
  {topic:"Coordinate Geometry Basics",subtopics:[
    {name:"Distance & Division",concepts:["Distance: √[(x₂−x₁)²+(y₂−y₁)²]","Internal section m:n: ((mx₂+nx₁)/(m+n),(my₂+ny₁)/(m+n))","External section: ((mx₂−nx₁)/(m−n),(my₂−ny₁)/(m−n))","Midpoint; Centroid G=((x₁+x₂+x₃)/3,(y₁+y₂+y₃)/3)","Area of triangle (shoelace): Δ=½|x₁(y₂−y₃)+x₂(y₃−y₁)+x₃(y₁−y₂)|"]},
    {name:"Special Points of Triangle",concepts:["Centroid divides median 2:1 from vertex","Circumcenter — equidistant from vertices","Incenter — angle bisectors meet; coordinates via angle-weighted vertices","Orthocenter — altitudes meet","Euler line: O,G,H collinear; OG:GH=1:2"]}
  ]},
  {topic:"Straight Lines",subtopics:[
    {name:"Equations of Lines",concepts:["Slope-intercept: y=mx+c","Point-slope: y−y₁=m(x−x₁)","Two-point form: (y−y₁)/(y₂−y₁)=(x−x₁)/(x₂−x₁)","Intercept form: x/a+y/b=1","Normal form: x cosα+y sinα=p","General: ax+by+c=0; slope=−a/b; x-int=−c/a; y-int=−c/b"]},
    {name:"Angles, Distances & Intersections",concepts:["Angle between lines: tanθ=|(m₁−m₂)/(1+m₁m₂)|","Parallel: m₁=m₂; Perpendicular: m₁m₂=−1","Distance from (x₁,y₁) to ax+by+c=0: |ax₁+by₁+c|/√(a²+b²)","Distance between parallel lines |C₁−C₂|/√(a²+b²)","Foot of perpendicular: (x−x₁)/a=(y−y₁)/b=−(ax₁+by₁+c)/(a²+b²)","Image of point in line: (h−x₁)/a=(k−y₁)/b=−2(ax₁+by₁+c)/(a²+b²)","Concurrency of 3 lines: determinant of coefficients=0"]},
    {name:"Family & Bisectors",concepts:["Family through intersection: L₁+λL₂=0","Angular bisectors: (ax+by+c)/√(a²+b²)=±(a'x+b'y+c')/√(a'²+b'²)","Identifying acute bisector (use angle condition)","Locus problems: set up condition, eliminate parameter"]}
  ]},
  {topic:"Pair of Lines",subtopics:[
    {name:"Pair Through Origin",concepts:["ax²+2hxy+by²=0 represents two lines through origin","Angle: tanθ=2√(h²−ab)/(a+b); perpendicular pair: a+b=0","Bisectors of pair: (x²−y²)/(a−b)=xy/h","Combined equation of two given lines: (y−m₁x)(y−m₂x)=0"]},
    {name:"General Second-Degree Curve",concepts:["ax²+2hxy+by²+2gx+2fy+c=0 is pair of lines iff Δ=abc+2fgh−af²−bg²−ch²=0","Homogenisation: S+λ(lx+my+n)²=0 gives lines joining origin to intersection"]}
  ]}
 ],
 topics:["Distance formula; section formula (internal/external)","Area of triangle using coordinates (shoelace)","Centroid, circumcenter, incenter, orthocenter","Slope; parallel and perpendicular conditions","All forms: slope-intercept, point-slope, two-point, intercept, normal","Angle between two lines; angular bisectors","Distance from point to line; foot of perpendicular; image","Family of lines L₁+λL₂=0","Concurrency condition of three lines (determinant)","Pair ax²+2hxy+by²=0; angle, bisectors","Homogenisation"],
 formulas:[{t:"Distance Formula",f:"d=√[(x₂−x₁)²+(y₂−y₁)²]"},{t:"Section Formula",f:"Internal m:n: P=((mx₂+nx₁)/(m+n),(my₂+ny₁)/(m+n))"},{t:"External Section",f:"P=((mx₂−nx₁)/(m−n),(my₂−ny₁)/(m−n))"},{t:"Area of Triangle",f:"Δ=½|x₁(y₂−y₃)+x₂(y₃−y₁)+x₃(y₁−y₂)|"},{t:"Centroid",f:"G=((x₁+x₂+x₃)/3,(y₁+y₂+y₃)/3)"},{t:"Slope",f:"m=tanθ=(y₂−y₁)/(x₂−x₁); m₁=m₂ parallel; m₁m₂=−1 perpendicular"},{t:"All Line Forms",f:"Slope-intercept: y=mx+c; Point-slope: y−y₁=m(x−x₁)"},{t:"Two-Point Form",f:"(y−y₁)/(y₂−y₁)=(x−x₁)/(x₂−x₁)"},{t:"Intercept Form",f:"x/a+y/b=1; Normal: x cosα+y sinα=p"},{t:"General Form",f:"ax+by+c=0; slope=−a/b; x-int=−c/a; y-int=−c/b"},{t:"Angle Between Lines",f:"tanθ=|(m₁−m₂)/(1+m₁m₂)|; for a₁x+b₁y: tanθ=|(a₁b₂−a₂b₁)/(a₁a₂+b₁b₂)|"},{t:"Point to Line Dist",f:"d=|ax₀+by₀+c|/√(a²+b²)"},{t:"Foot of Perp",f:"(x−x₁)/a=(y−y₁)/b=−(ax₁+by₁+c)/(a²+b²)"},{t:"Image of Point",f:"(h−x₁)/a=(k−y₁)/b=−2(ax₁+by₁+c)/(a²+b²)"},{t:"Angular Bisectors",f:"(ax+by+c)/√(a²+b²)=±(a'x+b'y+c')/√(a'²+b'²)"},{t:"Family of Lines",f:"L₁+λL₂=0 passes through intersection of L₁=0 and L₂=0"},{t:"Concurrent Condition",f:"3 lines concurrent: |a₁b₁c₁; a₂b₂c₂; a₃b₃c₃|=0"},{t:"Pair (origin)",f:"ax²+2hxy+by²=0; tanθ=2√(h²−ab)/(a+b); perp if a+b=0"},{t:"Bisectors of Pair",f:"(x²−y²)/(a−b)=xy/h"},{t:"Homogenisation",f:"ax²+2hxy+by²+2gx+2fy+c=0: Δ=abc+2fgh−af²−bg²−ch²=0 for pair"}],
 keyPoints:["Homogenisation: S+λ(lx+my+n)² gives lines joining origin to intersection","Pair ax²+2hxy+by²+...=0 iff Δ=abc+2fgh−af²−bg²−ch²=0","Angular bisectors: equidistant from both lines"],
 mindmap:{root:"Straight Lines\n& Pair",branches:[{n:"Points & Line",col:"#7c3aed",nodes:["Distance Formula","Section Formula","Pt to Line Dist","Foot & Image"]},{n:"Line Equations",col:"#a78bfa",nodes:["5 Forms of Line","Slope m=−a/b","Angle Between","Concurrent det=0"]},{n:"Family & Locus",col:"#6d28d9",nodes:["Family L₁+λL₂=0","Locus Technique","Angular Bisectors","Shift of Origin"]},{n:"Pair of Lines",col:"#4c1d95",nodes:["ax²+2hxy+by²=0","Angle Formula","Perp Cond a+b=0","Bisectors"]}]}},

{id:"m9",sub:"math",name:"Circles",weight:"High",est:4, syllabus:[
  {topic:"Equations of Circle",subtopics:[
    {name:"Standard Forms",concepts:["Standard: (x−h)²+(y−k)²=r²; centre (h,k), radius r","General: x²+y²+2gx+2fy+c=0; centre=(−g,−f); r=√(g²+f²−c)","Diametric form: (x−x₁)(x−x₂)+(y−y₁)(y−y₂)=0","Parametric: x=h+rcosθ; y=k+rsinθ","Point position: S₁=x₁²+y₁²+2gx₁+2fy₁+c; S₁>0 outside; =0 on; <0 inside","Length of tangent from (x₁,y₁): L=√S₁"]},
    {name:"Condition for Line to Touch Circle",concepts:["y=mx+c tangent to x²+y²=r²: c²=r²(1+m²)","Condition for line ax+by+c=0 to touch general circle: perpendicular from centre=radius","Normal — line through centre and point of tangency; slope=−1/slope_of_tangent"]}
  ]},
  {topic:"Chord, Tangent & Normals",subtopics:[
    {name:"Tangent & Contact",concepts:["Tangent at (x₁,y₁): T=0 i.e. xx₁+yy₁+g(x+x₁)+f(y+y₁)+c=0","Slope form tangent to x²+y²=r²: y=mx±r√(1+m²)","Chord of contact from (x₁,y₁): T=0","Pair of tangents from external point: SS₁=T²","Director circle: locus where tangents are perpendicular — x²+y²=2r²","Length of external tangent between two circles: √(d²−(r₁−r₂)²)"]},
    {name:"Chord with Midpoint & Power",concepts:["Equation of chord with given midpoint (x₁,y₁): T=S₁","Common chord of two circles: S₁−S₂=0","Power of a point: P=S₁; for external point = (tangent length)²","Radical axis S₁−S₂=0 — perpendicular to line joining centres","Radical centre — intersection of radical axes of three circles"]}
  ]},
  {topic:"Two Circles",subtopics:[
    {name:"Relative Position",concepts:["d>r₁+r₂: external (4 common tangents)","d=r₁+r₂: external tangency (3 tangents)","|r₁−r₂|<d<r₁+r₂: intersecting (2 common tangents)","d=|r₁−r₂|: internal tangency (1 tangent)","d<|r₁−r₂|: one inside other (0 tangents)","Length of external transverse tangent: √(d²−(r₁+r₂)²)"]},
    {name:"Special Families",concepts:["Orthogonal circles: 2g₁g₂+2f₁f₂=c₁+c₂","Family through intersection: S₁+λS₂=0","Family through circle-line intersection: S+λL=0"]}
  ]}
 ],
 topics:["Standard and general equations of circle","Center and radius from x²+y²+2gx+2fy+c=0","Diametric form; position of point (S₁)","Tangent at point (T=0); condition y=mx+c","Normal; chord of contact; chord with given midpoint T=S₁","Pair of tangents SS₁=T²; power of point","Radical axis S₁−S₂=0; radical center","Common tangents to two circles (all cases)","Family of circles S₁+λS₂=0 and S+λL=0","Orthogonal circles: 2g₁g₂+2f₁f₂=c₁+c₂"],
 formulas:[{t:"Standard Circle",f:"(x−h)²+(y−k)²=r²; center (h,k); radius r"},{t:"General Circle",f:"x²+y²+2gx+2fy+c=0; center=(−g,−f); r=√(g²+f²−c)"},{t:"Diametric Form",f:"(x−x₁)(x−x₂)+(y−y₁)(y−y₂)=0; diameter endpoints (x₁,y₁),(x₂,y₂)"},{t:"Point Position",f:"S₁=x₁²+y₁²+2gx₁+2fy₁+c; S₁>0 outside; =0 on; <0 inside"},{t:"Length of Tangent",f:"From (x₁,y₁): L=√S₁=√(x₁²+y₁²+2gx₁+2fy₁+c)"},{t:"Tangent at Point",f:"T=0: xx₁+yy₁+g(x+x₁)+f(y+y₁)+c=0"},{t:"Tangent Slope Form",f:"y=mx+c tangent to x²+y²=r² iff c²=r²(1+m²); tangent: y=mx±r√(1+m²)"},{t:"Normal at Point",f:"Normal at (x₁,y₁): passes through center; slope=−1/slope_of_tangent"},{t:"Chord of Contact",f:"From external (x₁,y₁): T=0 i.e. xx₁+yy₁+g(x+x₁)+f(y+y₁)+c=0"},{t:"Chord with Midpoint",f:"T=S₁; equation of chord with midpoint (x₁,y₁)"},{t:"Pair of Tangents",f:"SS₁=T²; locus of tangents from external point"},{t:"Power of Point",f:"Power=S₁=|PA·PB| for any chord through P; constant for a point"},{t:"Radical Axis",f:"S₁−S₂=0; perpendicular to line joining centers"},{t:"Radical Center",f:"Radical axes of 3 circles are concurrent at radical center"},{t:"Orthogonal Circles",f:"2g₁g₂+2f₁f₂=c₁+c₂"},{t:"Common Chord",f:"S₁−S₂=0 is the common chord equation of two circles"},{t:"Common Tangents",f:"d=dist between centers; d>r₁+r₂:4 CT; d=r₁+r₂:3; |r₁−r₂|<d<r₁+r₂:2; d=|r₁−r₂|:1"},{t:"Family of Circles",f:"S₁+λS₂=0: circles through intersection of S₁,S₂; S+λL=0: through circle-line intersection"},{t:"Director Circle",f:"x²+y²=2r² for circle x²+y²=r²; locus of point where tangents are perpendicular"}],
 keyPoints:["At tangency: radius ⊥ tangent","Two tangents from external point are equal","Radical axis ⊥ line of centers","Director circle: x²+y²=2r²"],
 mindmap:{root:"Circles",branches:[{n:"Equations",col:"#7c3aed",nodes:["Standard Form","General Form","Diametric Form","Center & Radius"]},{n:"Point & Line",col:"#a78bfa",nodes:["Position S₁","Tangent T=0","Length √S₁","Chord of Contact"]},{n:"Special",col:"#6d28d9",nodes:["Pair SS₁=T²","Chord Midpoint","Power of Point","Orthogonal"]},{n:"Two Circles",col:"#4c1d95",nodes:["Common Tangents","Radical Axis","Family S₁+λS₂","Director Circle"]}]}},

{id:"m10",sub:"math",name:"Conic Sections",weight:"High",est:5, syllabus:[
  {topic:"Parabola",subtopics:[
    {name:"Standard Forms & Properties",concepts:["y²=4ax: vertex(0,0); focus(a,0); directrix x=−a; axis y=0; LR=4a","x²=4ay: focus(0,a); directrix y=−a; opens upward","Parametric: (at²,2at) on y²=4ax; focal distance SP=a+at²=a(1+t²)","Focal chord: t₁t₂=−1; chord length=a(t₁−t₂)²; min focal chord=4a (LR)","Endpoint of LR: (a,2a) and (a,−2a)"]},
    {name:"Tangent & Normal",concepts:["Tangent at param t: ty=x+at²; Tangent at (x₁,y₁): yy₁=2a(x+x₁)","Slope form: y=mx+a/m (m≠0)","Normal at param t: y=−tx+2at+at³; slope form y=mx−2am−am³","Chord of contact from (x₁,y₁): yy₁=2a(x+x₁)","Chord with midpoint (h,k): ky=x·(k/a)+?? — use T=S₁","Director circle of parabola: directrix itself (x=−a)"]}
  ]},
  {topic:"Ellipse",subtopics:[
    {name:"Standard Form & Properties",concepts:["x²/a²+y²/b²=1 (a>b>0); c²=a²−b²; e=c/a<1","Foci (±c,0); vertices (±a,0); co-vertices (0,±b)","Latus rectum length=2b²/a; directrices x=±a/e","Sum of focal radii: PS₁+PS₂=2a","Parametric: (acosθ, bsinθ); eccentric angle θ","Auxiliary circle x²+y²=a²; Director circle x²+y²=a²+b²"]},
    {name:"Tangent & Normal",concepts:["Tangent at (x₁,y₁): xx₁/a²+yy₁/b²=1","Parametric tangent: (xcosθ)/a+(ysinθ)/b=1","Slope form: y=mx±√(a²m²+b²); condition c²=a²m²+b²","Focal radii: r₁=a−ex; r₂=a+ex"]}
  ]},
  {topic:"Hyperbola",subtopics:[
    {name:"Standard Form & Properties",concepts:["x²/a²−y²/b²=1; c²=a²+b²; e=c/a>1","Foci (±c,0); vertices (±a,0); asymptotes y=±(b/a)x","Difference of focal radii: |PS₁−PS₂|=2a","Latus rectum=2b²/a; directrices x=±a/e","Parametric: (asecθ, btanθ) or (acosht, bsinht)","Rectangular hyperbola xy=c²; e=√2; param (ct, c/t); asymptotes x=0,y=0"]},
    {name:"Tangent & Common Tools",concepts:["Tangent at (x₁,y₁): xx₁/a²−yy₁/b²=1","Slope form: y=mx±√(a²m²−b²) (valid when m²>b²/a²)","Chord with given midpoint: T=S₁ (all conics)","Pole and polar; conjugate diameters","Condition of tangency for any conic","Director circle of hyperbola: x²+y²=a²−b² (exists only if a>b)"]}
  ]}
 ],
 topics:["General conic: Δ and h²−ab classification","Parabola y²=4ax: focus, directrix, LR, e=1","Parametric (at²,2at); tangent ty=x+at²","Focal chord: t₁t₂=−1; normals (cubic in t)","Ellipse x²/a²+y²/b²=1: axes, foci, e<1","Eccentric angle; tangent and normal to ellipse","Focal distance sum: r₁+r₂=2a","Hyperbola x²/a²−y²/b²=1; asymptotes y=±(b/a)x","Rectangular hyperbola xy=c²; param (ct,c/t)","Chord with given midpoint T=S₁","Pole and polar; conjugate diameters"],
 formulas:[{t:"Parabola y²=4ax",f:"Focus F(a,0); Directrix x=−a; Vertex (0,0); LR=4a; Axis: x-axis"},{t:"Parabola x²=4ay",f:"Focus (0,a); Directrix y=−a; opens upward; LR=4a"},{t:"Parametric Parabola",f:"(at²,2at) on y²=4ax; distance from focus=a+at²=a(1+t²)"},{t:"Tangent Parabola",f:"ty=x+at² (param); y=mx+a/m (slope); xx₁=2a(y+y₁) (point)"},{t:"Normal Parabola",f:"y=−tx+2at+at³ (param form); slope form: y=mx−2am−am³"},{t:"Focal Chord",f:"t₁t₂=−1; length=a(t₁−t₂)²=a(t₁+1/t₁)²; min focal chord=4a (latus rectum)"},{t:"Ellipse Standard",f:"x²/a²+y²/b²=1 (a>b); c²=a²−b²; e=c/a<1; Foci (±c,0)"},{t:"Ellipse Facts",f:"a=semi-major; b=semi-minor; LR=2b²/a; Dir x=±a/e; b²=a²(1−e²)"},{t:"Ellipse Param",f:"(a cosθ, b sinθ); focal radii: r₁=a−ex; r₂=a+ex; r₁+r₂=2a"},{t:"Ellipse Tangent",f:"(x cosθ)/a+(y sinθ)/b=1 (param); xx₁/a²+yy₁/b²=1 (point)"},{t:"Ellipse Slope Tangent",f:"y=mx±√(a²m²+b²)"},{t:"Hyperbola Standard",f:"x²/a²−y²/b²=1; c²=a²+b²; e=c/a>1; Foci (±c,0)"},{t:"Hyperbola Facts",f:"Asymptotes y=±(b/a)x; |r₁−r₂|=2a; LR=2b²/a"},{t:"Rect Hyperbola",f:"xy=c²; Param (ct,c/t); Asymptotes x=0,y=0; e=√2; center (0,0)"},{t:"Hyperbola Tangent",f:"xx₁/a²−yy₁/b²=1 (point); y=mx±√(a²m²−b²) (slope, valid m²>b²/a²)"},{t:"Chord Midpoint",f:"T=S₁ for all conics"},{t:"Director Circle Ellipse",f:"x²+y²=a²+b² (tangents perpendicular)"},{t:"Director Circle Hyperbola",f:"x²+y²=a²−b² (exists only if a>b)"},{t:"Conjugate Diameter Ellipse",f:"m₁m₂=−b²/a²; conjugate diameters"}],
 keyPoints:["Focal chord of parabola: t₁ one end → t₂=−1/t₁","Eccentric angle ≠ actual polar angle","Ellipse reflection: ray from F₁ reflects to F₂"],
 mindmap:{root:"Conic\nSections",branches:[{n:"Parabola",col:"#7c3aed",nodes:["y²=4ax","Focus/Directrix","Tangent ty=x+at²","Focal Chord t₁t₂=−1"]},{n:"Ellipse",col:"#a78bfa",nodes:["x²/a²+y²/b²=1","Eccentric Angle","Sum Focal=2a","Director Circle"]},{n:"Hyperbola",col:"#6d28d9",nodes:["x²/a²−y²/b²=1","Asymptotes ±(b/a)x","Rectangular xy=c²","Diff Focal=2a"]},{n:"Common Tools",col:"#4c1d95",nodes:["T=S₁ Midpoint","Pair of Tangents","Pole & Polar","Family"]}]}},

{id:"m11",sub:"math",name:"Limits & Continuity",weight:"High",est:4, syllabus:[
  {topic:"Limits",subtopics:[
    {name:"Concept & Definition",concepts:["Left-hand limit lim_{x→a⁻} f(x)=L₁; right-hand limit lim_{x→a⁺} f(x)=L₂","Existence: L₁=L₂=finite","ε-δ definition (conceptual understanding)","Limit laws: sum, product, quotient, scalar multiple"]},
    {name:"Standard Limits",concepts:["lim(x→0) sinx/x=1; lim tanx/x=1; lim (1−cosx)/x²=½","lim(x→0)(eˣ−1)/x=1; lim(aˣ−1)/x=lna; lim ln(1+x)/x=1","lim(x→a)(xⁿ−aⁿ)/(x−a)=naⁿ⁻¹","e definition: lim(1+1/n)ⁿ=e; lim(1+x)^(1/x)=e (x→0)","General eᵏ: lim(1+k/n)ⁿ=eᵏ","Sandwich (squeeze) theorem: g≤f≤h and g,h→L ⟹ f→L"]},
    {name:"Indeterminate Forms & Techniques",concepts:["0/0: L'Hôpital or factorise/rationalise","∞/∞: L'Hôpital or divide by highest power","0·∞: convert to 0/0 or ∞/∞","1^∞: e^[lim g·(f−1)] or e^[lim g·ln f]","0⁰, ∞⁰: take log then exponentiate","∞−∞: rationalise or factor","Leading term for rational functions at infinity"]}
  ]},
  {topic:"Continuity",subtopics:[
    {name:"Continuity at a Point",concepts:["f(a) defined; lim_{x→a} f(x) exists; limit = f(a)","Left/right continuity — one-sided","Continuity on an interval — continuous at every point","IVT: f continuous on [a,b], k between f(a)&f(b) ⟹ ∃c with f(c)=k"]},
    {name:"Types of Discontinuity",concepts:["Removable — limit exists but ≠f(a) or f(a) undefined","Jump — LHL and RHL finite but unequal","Infinite — limit tends to ±∞","Oscillatory — limit doesn't exist (e.g. sin(1/x) at 0)","Continuity of composite functions"]}
  ]},
  {topic:"Differentiability",subtopics:[
    {name:"Definition & Tests",concepts:["Derivative f'(a)=lim_{h→0}[f(a+h)−f(a)]/h","LHD=lim_{h→0⁻}[f(a+h)−f(a)]/h; RHD=lim_{h→0⁺}","Differentiable at a iff LHD=RHD","Differentiability implies continuity; converse FALSE","Non-differentiable at: corners, cusps, vertical tangents","lim x·sin(1/x)=0 by squeeze; lim sin(1/x) does NOT exist"]},
    {name:"Mean Value Theorems",concepts:["Rolle's theorem: f contin [a,b], diff (a,b), f(a)=f(b) ⟹ ∃c: f'(c)=0","LMVT: ∃c∈(a,b): f'(c)=[f(b)−f(a)]/(b−a); geometric: slope of chord = tangent slope","Cauchy's MVT: f'(c)/g'(c)=[f(b)−f(a)]/[g(b)−g(a)]"]}
  ]}
 ],
 topics:["Concept of limit; LHL and RHL","Limit laws; standard limits","L'Hôpital's rule for 0/0 and ∞/∞","Indeterminate forms: 0·∞, ∞−∞, 0⁰, ∞⁰, 1^∞","Sandwich (squeeze) theorem","(1+1/n)ⁿ→e; 1^∞ form: e^[lim g(x)(f(x)−1)]","Continuity: LHL=RHL=f(a); types of discontinuity","Differentiability: LHD=RHD; non-differentiable points"],
 formulas:[{t:"Standard Trig Limits",f:"lim(x→0) sinx/x=1; lim tanx/x=1; lim (1−cosx)/x²=½"},{t:"Standard Exp",f:"lim(x→0)(eˣ−1)/x=1; lim(aˣ−1)/x=lna; lim ln(1+x)/x=1"},{t:"Polynomial Limits",f:"lim(x→a)(xⁿ−aⁿ)/(x−a)=naⁿ⁻¹"},{t:"e Definition",f:"lim(n→∞)(1+1/n)ⁿ=e; lim(x→0)(1+x)^(1/x)=e; e≈2.718"},{t:"General eᵏ",f:"lim(1+k/n)ⁿ=eᵏ; lim(f(x))^(g(x)) if f→1: e^[lim g·(f−1)]"},{t:"Sandwich Theorem",f:"If g(x)≤f(x)≤h(x) and lim g=lim h=L then lim f=L"},{t:"L'Hôpital 0/0",f:"lim f/g (0/0): differentiate both; lim f'/g'; apply repeatedly if needed"},{t:"L'Hôpital ∞/∞",f:"Same rule applies; also for 0·∞,∞−∞,0⁰,∞⁰,1^∞ forms"},{t:"0·∞ Form",f:"lim f·g (0·∞): write as f/(1/g) or g/(1/f) → 0/0 or ∞/∞"},{t:"1^∞ Form",f:"lim u^v = e^[lim v·(u−1)] when u→1; or e^[lim v·ln u]"},{t:"Continuity",f:"f continuous at a iff lim(x→a)f(x)=f(a) iff LHL=RHL=f(a)"},{t:"Discontinuity Types",f:"Removable: lim exists ≠f(a); Jump: LHL≠RHL; Infinite: lim→∞"},{t:"IVT",f:"f continuous on [a,b]; f(a) and f(b) have opposite signs ⟹ ∃c∈(a,b): f(c)=0"},{t:"Differentiability",f:"f'(a)=lim(h→0)[f(a+h)−f(a)]/h; LHD=lim(h→0⁻); RHD=lim(h→0⁺)"},{t:"LHD=RHD Condition",f:"Differentiable at a iff LHD=RHD; Diff⟹Continuous; NOT vice versa"},{t:"Oscillation",f:"lim(x→0) sin(1/x) does NOT exist (oscillates); x·sin(1/x)→0"},{t:"lim(x→0)(sinx)/x=1 Extensions",f:"lim sin(ax)/bx=a/b; lim sin(f(x))/f(x)=1 if f(x)→0"},{t:"Asymptotes",f:"Vertical: lim→±∞ as x→a; Horizontal: lim f(x) as x→±∞; Oblique: y=mx+c"},{t:"Infinite Limits",f:"lim(x→0⁺) lnx=−∞; lim(x→∞) xⁿe^(−x)=0; e dominates poly"},{t:"Limit of Sequences",f:"lim(1+n)^(1/n)=1; lim n^(1/n)=1; lim n!/nⁿ→0 (Stirling)"}],
 keyPoints:["lim x·sin(1/x)=0 by squeeze","lim sin(1/x) does NOT exist (oscillates)","|x| continuous at 0 but NOT differentiable","Differentiable ⟹ Continuous; converse FALSE"],
 mindmap:{root:"Limits &\nContinuity",branches:[{n:"Standard Limits",col:"#7c3aed",nodes:["sinx/x→1","(eˣ−1)/x→1","(1+1/n)ⁿ→e","Polynomial"]},{n:"Indeterminate",col:"#a78bfa",nodes:["0/0 L'Hôpital","∞/∞ L'Hôpital","1^∞ Form","Sandwich Thm"]},{n:"Continuity",col:"#6d28d9",nodes:["LHL=RHL=f(a)","Removable Disc","Jump Disc","IVT"]},{n:"Differentiability",col:"#4c1d95",nodes:["LHD=RHD","Corner/Cusp","Diff⟹Contin","f'(a) Definition"]}]}},

{id:"m12",sub:"math",name:"Differentiation & Applications",weight:"High",est:5, syllabus:[
  {topic:"Differentiation",subtopics:[
    {name:"Rules & Standard Derivatives",concepts:["d/dx(xⁿ)=nxⁿ⁻¹","d/dx(eˣ)=eˣ; d/dx(aˣ)=aˣ lna","d/dx(lnx)=1/x; d/dx(logₐx)=1/(x lna)","d/dx(sinx)=cosx; d/dx(cosx)=−sinx; d/dx(tanx)=sec²x","d/dx(cotx)=−cosec²x; d/dx(secx)=secx tanx; d/dx(cosecx)=−cosecx cotx","d/dx(sin⁻¹x)=1/√(1−x²); d/dx(cos⁻¹x)=−1/√(1−x²)","d/dx(tan⁻¹x)=1/(1+x²); d/dx(cot⁻¹x)=−1/(1+x²)"]},
    {name:"Chain, Product, Quotient & Special",concepts:["Chain rule: d/dx[f(g(x))]=f'(g(x))·g'(x)","Product rule: (uv)'=u'v+uv'","Quotient rule: (u/v)'=(u'v−uv')/v²","Implicit differentiation: dy/dx=−Fₓ/Fy; differentiate both sides","Parametric: dy/dx=(dy/dt)/(dx/dt); d²y/dx²=(d/dt(dy/dx))/(dx/dt)","Logarithmic differentiation: y=xˣ ⟹ lny=xlnx ⟹ dy/dx=xˣ(1+lnx)","Leibniz theorem: (uv)ₙ=Σ ⁿCₖ·u^(k)·v^(n−k)"]}
  ]},
  {topic:"Applications of Derivatives",subtopics:[
    {name:"Tangents, Normals & Rates",concepts:["Tangent at (x₀,y₀): y−y₀=f'(x₀)(x−x₀)","Normal slope=−1/f'(x₀) if f'(x₀)≠0","Angle between curves: tanθ=|(m₁−m₂)/(1+m₁m₂)|; orthogonal if m₁m₂=−1","Rate of change: dy/dt=dy/dx·dx/dt (chain rule)","Approximation: Δy≈f'(x)Δx; relative error=dy/y"]},
    {name:"Monotonicity & Extrema",concepts:["f'(x)≥0 (not all zero) ⟹ increasing; f'(x)≤0 ⟹ decreasing","Critical point: f'(c)=0 or undefined","First derivative test: f' changes +→−: local max; −→+: local min","Second derivative test: f'(c)=0, f''(c)<0→max; f''(c)>0→min; f''=0: inconclusive","Absolute extrema on [a,b]: check critical + endpoints","Inflection point: f''=0 and concavity changes; f''(x)>0 concave up; <0 concave down"]},
    {name:"Mean Value Theorems & Series",concepts:["Rolle's: f(a)=f(b) ⟹ ∃c: f'(c)=0","LMVT: ∃c: f'(c)=[f(b)−f(a)]/(b−a)","Maclaurin: eˣ=Σxⁿ/n!; sinx=x−x³/3!+x⁵/5!−…; cosx=1−x²/2!+…","Taylor about a: f(x)=f(a)+f'(a)(x−a)+f''(a)(x−a)²/2!+…"]}
  ]}
 ],
 topics:["Complete standard derivatives table","Chain, product, quotient rules","Implicit differentiation: −Fₓ/Fy","Parametric: dy/dx=(dy/dt)/(dx/dt)","Logarithmic differentiation for xˣ type","Second and higher-order derivatives; Leibniz theorem","Tangent and normal: slope, equation","Increasing/decreasing; monotonicity","Local maxima/minima: first and second derivative tests","Global extrema; inflection points","Rolle's theorem and LMVT","Maclaurin and Taylor series"],
 formulas:[{t:"Basic Derivatives",f:"d/dx(xⁿ)=nxⁿ⁻¹; d/dx(eˣ)=eˣ; d/dx(aˣ)=aˣ·lna"},{t:"Log Derivatives",f:"d/dx(lnx)=1/x; d/dx(logₐx)=1/(x·lna)"},{t:"Trig Derivatives",f:"(sinx)'=cosx; (cosx)'=−sinx; (tanx)'=sec²x; (cotx)'=−cosec²x"},{t:"Sec/Cosec Deriv",f:"(secx)'=secx·tanx; (cosecx)'=−cosecx·cotx"},{t:"Inverse Trig",f:"(sin⁻¹x)'=1/√(1−x²); (cos⁻¹x)'=−1/√(1−x²); (tan⁻¹x)'=1/(1+x²)"},{t:"(cot⁻¹x)' and (sec⁻¹x)'",f:"(cot⁻¹x)'=−1/(1+x²); (sec⁻¹x)'=1/(|x|√(x²−1))"},{t:"Chain Rule",f:"d/dx[f(g(x))]=f'(g(x))·g'(x)"},{t:"Product Rule",f:"d/dx(uv)=u'v+uv'"},{t:"Quotient Rule",f:"d/dx(u/v)=(u'v−uv')/v²"},{t:"Implicit Diff",f:"F(x,y)=0: dy/dx=−Fₓ/Fy; diff both sides treating y as f(x)"},{t:"Parametric",f:"dy/dx=(dy/dt)/(dx/dt); d²y/dx²=(d/dt(dy/dx))/(dx/dt)"},{t:"Log Differentiation",f:"y=xˣ: lny=xlnx; 1/y·dy/dx=1+lnx; dy/dx=xˣ(1+lnx)"},{t:"Leibniz Theorem",f:"(uv)ⁿ=Σₖ₌₀ⁿ ⁿCₖ·u^(k)·v^(n−k)"},{t:"Tangent/Normal",f:"Tangent: y−y₁=f'(x₁)(x−x₁); Normal: y−y₁=−1/f'(x₁)·(x−x₁)"},{t:"Angle of Intersection",f:"tanθ=|(m₁−m₂)/(1+m₁m₂)|; orthogonal if m₁m₂=−1"},{t:"Increasing/Decreasing",f:"f'(x)>0 ⟹ increasing; f'(x)<0 ⟹ decreasing; f'=0 at critical point"},{t:"First Derivative Test",f:"f' changes +→−: local max; −→+: local min; no change: inflection"},{t:"Second Derivative Test",f:"f'(c)=0; f''(c)<0: local max; f''(c)>0: local min; f''=0: inconclusive"},{t:"Rolle's Theorem",f:"f contin on [a,b]; diff on (a,b); f(a)=f(b) ⟹ ∃c: f'(c)=0"},{t:"LMVT",f:"∃c∈(a,b): f'(c)=[f(b)−f(a)]/(b−a)"},{t:"Cauchy MVT",f:"[f(b)−f(a)]/[g(b)−g(a)]=f'(c)/g'(c) for some c∈(a,b)"},{t:"Maclaurin Series",f:"f(x)=f(0)+xf'(0)+x²f''(0)/2!+…; eˣ=Σxⁿ/n!; sinx=x−x³/3!+…"},{t:"Taylor Series",f:"f(x)=f(a)+f'(a)(x−a)+f''(a)(x−a)²/2!+…"},{t:"Approximation",f:"Δy≈dy=f'(x)·dx; relative error=dy/y; % error=100·dy/y"},{t:"Concavity",f:"f''(x)>0: concave up; f''(x)<0: concave down; inflection where f''=0"}],
 keyPoints:["d/dx(xˣ)=xˣ(1+lnx); use log differentiation","At inflection: f''=0 AND f'' changes sign","f''>0 concave up (∪); f''<0 concave down (∩)","Global: compare critical points AND boundary values"],
 mindmap:{root:"Differentiation\n& Applications",branches:[{n:"Rules",col:"#7c3aed",nodes:["Chain Rule","Product Rule","Quotient Rule","Implicit −Fx/Fy"]},{n:"Special",col:"#a78bfa",nodes:["Parametric dy/dx","Log Diff xˣ","Higher Order","Leibniz Thm"]},{n:"Curve Analysis",col:"#6d28d9",nodes:["Increasing f'>0","Maxima/Minima","Concavity f''","Inflection Point"]},{n:"Theorems",col:"#4c1d95",nodes:["Rolle's f(a)=f(b)","LMVT","Cauchy MVT","Maclaurin Series"]}]}},

{id:"m13",sub:"math",name:"Integral Calculus",weight:"High",est:6, syllabus:[
  {topic:"Indefinite Integration",subtopics:[
    {name:"Standard Integrals",concepts:["∫xⁿdx=xⁿ⁺¹/(n+1)+C (n≠−1); ∫1/x dx=ln|x|+C","∫eˣdx=eˣ+C; ∫aˣdx=aˣ/lna+C","∫sinx dx=−cosx+C; ∫cosx dx=sinx+C","∫sec²x dx=tanx+C; ∫cosec²x dx=−cotx+C","∫secx tanx dx=secx+C; ∫cosecx cotx dx=−cosecx+C","∫tanx dx=ln|secx|+C; ∫cotx dx=ln|sinx|+C","∫secx dx=ln|secx+tanx|+C; ∫cosecx dx=ln|cosecx−cotx|+C","∫dx/√(a²−x²)=sin⁻¹(x/a)+C; ∫dx/(a²+x²)=(1/a)tan⁻¹(x/a)+C","∫dx/(x√(x²−a²))=(1/a)sec⁻¹|x/a|+C"]},
    {name:"Methods of Integration",concepts:["Substitution: choose u=g(x), du=g'(x)dx","Trig substitution: √(a²−x²)→x=asinθ; √(a²+x²)→x=atanθ; √(x²−a²)→x=asecθ","Integration by parts: ∫u dv=uv−∫v du; ILATE rule","Partial fractions: linear, repeated, irreducible quadratic factors","∫f'(x)/f(x)dx=ln|f(x)|+C","∫eˣ[f(x)+f'(x)]dx=eˣf(x)+C","Special: ∫dx/(x²±a²); ∫dx/√(x²±a²); ∫√(x²±a²)dx — standard results"]}
  ]},
  {topic:"Definite Integration",subtopics:[
    {name:"Fundamental Theorem & Properties",concepts:["FTC: ∫ₐᵇf(x)dx=F(b)−F(a); definite integral as limit of Riemann sum","∫ₐᵇf dx=−∫ᵦₐf dx; ∫ₐᵇf=∫ₐᶜf+∫ᶜᵇf (splitting)","∫ₐᵇf(x)dx=∫ₐᵇf(a+b−x)dx (King's property)","∫₀ᵃf(x)dx=∫₀ᵃf(a−x)dx","∫₋ₐᵃf dx=2∫₀ᵃf dx if f even; =0 if f odd","Leibniz rule: d/dx∫_{g(x)}^{h(x)}f(t)dt=f(h(x))h'(x)−f(g(x))g'(x)","Walli's formula for ∫₀^(π/2)sinⁿx dx"]},
    {name:"Applications",concepts:["Area under curve: A=∫ₐᵇ|f(x)|dx","Area between curves: A=∫ₐᵇ|f(x)−g(x)|dx (vertical strip)","Horizontal strip: A=∫[φ(y)−ψ(y)]dy","Definite integral → area: geometrical interpretation","Improper integrals type 1 (infinite limits) and type 2 (unbounded integrand)"]}
  ]},
  {topic:"Differential Equations",subtopics:[
    {name:"Formation & Classification",concepts:["Order = highest derivative; Degree = power of highest derivative (after clearing surds)","Formation by eliminating n arbitrary constants → order n ODE","General solution vs particular solution"]},
    {name:"Solution Methods",concepts:["Variable separable: dy/dx=g(x)h(y) ⟹ ∫dy/h(y)=∫g(x)dx","Homogeneous: dy/dx=f(y/x); substitute y=vx ⟹ separable","Linear: dy/dx+P(x)y=Q(x); IF=e^(∫P dx); y·IF=∫Q·IF dx","Exact: M dx+N dy=0; ∂M/∂y=∂N/∂x; find potential function","Bernoulli: dy/dx+Py=Qyⁿ; substitute v=y^(1−n)"]},
    {name:"Applications",concepts:["Growth/decay: dy/dt=ky; y=y₀eᵏᵗ","Newton's law of cooling: dT/dt=k(T−Tₘ)","Orthogonal trajectories: replace dy/dx by −dx/dy","Clairaut's equation: y=xy'+f(y'); general: y=cx+f(c)"]}
  ]}
 ],
 topics:["Standard integration table","Substitution; trig substitutions","Integration by parts (ILATE rule)","Partial fractions: all cases","Special integrals √(ax²+bx+c) types","∫f'(x)/f(x)dx=ln|f(x)|; ∫eˣ[f+f']dx=eˣf(x)","Definite integrals: Newton-Leibniz theorem","Properties: linearity, split, symmetry","King's property ∫ₐᵇf(x)dx=∫ₐᵇf(a+b−x)dx","Odd/even function property over [−a,a]","Leibniz rule; Walli's formula","Area under curve and between curves"],
 formulas:[{t:"Power & Expo",f:"∫xⁿdx=xⁿ⁺¹/(n+1)+C; ∫eˣdx=eˣ+C; ∫aˣdx=aˣ/lna+C"},{t:"Trig Integrals",f:"∫sinx dx=−cosx+C; ∫cosx dx=sinx+C; ∫sec²x dx=tanx+C"},{t:"∫cosec² & sec tan",f:"∫cosec²x dx=−cotx+C; ∫secx tanx dx=secx+C; ∫cosecx cotx dx=−cosecx+C"},{t:"∫tanx & cotx",f:"∫tanx dx=ln|secx|+C; ∫cotx dx=ln|sinx|+C"},{t:"∫secx & cosecx",f:"∫secx dx=ln|secx+tanx|+C; ∫cosecx dx=ln|cosecx−cotx|+C"},{t:"∫1/(a²+x²)",f:"(1/a)tan⁻¹(x/a)+C"},{t:"∫1/√(a²−x²)",f:"sin⁻¹(x/a)+C"},{t:"∫1/√(x²±a²)",f:"ln|x+√(x²±a²)|+C"},{t:"∫√(a²−x²)",f:"(x/2)√(a²−x²)+(a²/2)sin⁻¹(x/a)+C"},{t:"∫√(x²+a²)",f:"(x/2)√(x²+a²)+(a²/2)ln|x+√(x²+a²)|+C"},{t:"∫√(x²−a²)",f:"(x/2)√(x²−a²)−(a²/2)ln|x+√(x²−a²)|+C"},{t:"f'/f Integral",f:"∫f'(x)/f(x)dx=ln|f(x)|+C"},{t:"eˣ[f+f'] Form",f:"∫eˣ[f(x)+f'(x)]dx=eˣf(x)+C"},{t:"Substitution",f:"∫f(g(x))g'(x)dx=∫f(t)dt where t=g(x)"},{t:"By Parts (ILATE)",f:"∫u dv=uv−∫v du; priority: Inverse trig > Log > Algebraic > Trig > Exp"},{t:"Partial Fractions",f:"1/(x−a)(x−b): A/(x−a)+B/(x−b); 1/(x−a)²: add A/(x−a)+B/(x−a)²"},{t:"Trig Substitution",f:"√(a²−x²): x=asinθ; √(a²+x²): x=atanθ; √(x²−a²): x=asecθ"},{t:"∫√(ax²+bx+c)",f:"Complete the square then use standard forms"},{t:"Newton-Leibniz",f:"∫ₐᵇf(x)dx=F(b)−F(a) where F'=f"},{t:"King's Property",f:"∫ₐᵇf(x)dx=∫ₐᵇf(a+b−x)dx"},{t:"Odd/Even on [−a,a]",f:"∫₋ₐᵃf dx=0 if f odd; =2∫₀ᵃf dx if f even"},{t:"∫₀^(π/2) reduction",f:"∫₀^(π/2)sinⁿx/(sinⁿx+cosⁿx)dx=π/4 (King's property)"},{t:"Walli's Formula",f:"∫₀^(π/2)sinⁿx dx: n even→π/2·(n−1)!!/n!!; n odd→(n−1)!!/n!!"},{t:"Leibniz Rule",f:"d/dx[∫_{g(x)}^{h(x)}f(t)dt]=f(h(x))·h'(x)−f(g(x))·g'(x)"},{t:"Area Formula",f:"A=∫ₐᵇ|f(x)|dx; between curves: ∫ₐᵇ|f(x)−g(x)|dx"},{t:"Volume of Revolution",f:"V=π∫ₐᵇ[f(x)]²dx (about x-axis); V=π∫ₐᵇ[f(y)]²dy (about y-axis)"},{t:"∫1/(x²−a²)",f:"1/(2a)·ln|(x−a)/(x+a)|+C"},{t:"∫1/(a²−x²)",f:"1/(2a)·ln|(a+x)/(a−x)|+C"}],
 keyPoints:["ILATE: Inverse trig>Log>Algebraic>Trig>Exp","King's: ∫₀^(π/2)sinⁿx/(sinⁿx+cosⁿx)dx=π/4","Walli's: even n multiply by π/2; odd n multiply by 1","Area ellipse x²/a²+y²/b²=1: πab"],
 mindmap:{root:"Integral\nCalculus",branches:[{n:"Standard Forms",col:"#7c3aed",nodes:["∫xⁿ,∫eˣ,∫aˣ","∫trig","∫inv trig","∫1/(a²±x²)"]},{n:"Methods",col:"#a78bfa",nodes:["Substitution","By Parts ILATE","Partial Fractions","∫eˣ[f+f']dx"]},{n:"Definite Int",col:"#6d28d9",nodes:["Newton-Leibniz","King's Property","Odd/Even","Walli's Formula"]},{n:"Applications",col:"#4c1d95",nodes:["Area=∫|f|dx","Between Curves","Leibniz Rule","Symmetry"]}]}},

{id:"m14",sub:"math",name:"Differential Equations",weight:"High",est:3, syllabus:[
  {topic:"Differential Equations",subtopics:[
    {name:"Formation",concepts:["Order = highest derivative; Degree = power after clearing surds","Eliminating n constants → order n ODE","General vs particular vs singular solution"]},
    {name:"Solution Methods",concepts:["Variable separable: dy/dx=f(x)g(y) ⟹ ∫dy/g(y)=∫f(x)dx","Homogeneous: dy/dx=f(y/x); substitute y=vx ⟹ x·dv/dx+v=f(v) — separable","Linear first-order: dy/dx+P(x)y=Q(x); IF=e^(∫P dx); y·IF=∫Q·IF dx+C","Exact DE: M dx+N dy=0; condition ∂M/∂y=∂N/∂x; solve for potential function","Bernoulli: dy/dx+Py=Qyⁿ; divide yⁿ; let v=y^(1−n) → linear in v","Clairaut: y=xy'+f(y'); general y=cx+f(c); singular=envelope"]},
    {name:"Applications",concepts:["Population growth: dN/dt=kN; N=N₀eᵏᵗ","Radioactive decay: half-life t½=ln2/k","Newton's cooling: dT/dt=−k(T−T₀); T=T₀+(Tᵢ−T₀)e^(−kt)","Mixing problems (rate in − rate out)","Orthogonal trajectories: replace dy/dx by −dx/dy in the family's DE"]}
  ]}
 ],
 topics:["Order and degree; formation by eliminating constants","Variable separable: dy/dx=f(x)g(y)","Homogeneous DE: y=vx substitution","Linear first-order: dy/dx+P(x)y=Q(x); IF=e^(∫P dx)","Bernoulli's equation; Exact DEs","Orthogonal trajectories","Growth, decay, Newton's cooling","Clairaut's equation y=xy'+f(y')"],
 formulas:[{t:"Order & Degree",f:"Order=highest derivative; Degree=power after clearing fractional/surd"},{t:"Variable Separable",f:"dy/dx=f(x)·g(y): ∫dy/g(y)=∫f(x)dx+C"},{t:"Homogeneous DE",f:"dy/dx=f(y/x): substitute y=vx; v+x·dv/dx=f(v) → separable"},{t:"Linear DE (y)",f:"dy/dx+P(x)y=Q(x); IF=e^(∫P dx); y·IF=∫Q·IF dx+C"},{t:"Linear DE (x)",f:"dx/dy+P(y)x=Q(y); IF=e^(∫P dy); x·IF=∫Q·IF dy+C"},{t:"Bernoulli DE",f:"dy/dx+Py=Qyⁿ; divide by yⁿ; let v=y^(1−n): linear in v"},{t:"Exact DE",f:"M dx+N dy=0 exact if ∂M/∂y=∂N/∂x; solution: ∫M dx+∫(N−∂/∂y∫M dx)dy=C"},{t:"Growth/Decay",f:"dN/dt=±kN; N=N₀e^(±kt); t½=ln2/k"},{t:"Newton's Cooling",f:"dT/dt=−k(T−T₀); T=T₀+(Tᵢ−T₀)e^(−kt)"},{t:"Clairaut's Equation",f:"y=xy'+f(y'); general soln y=cx+f(c); singular soln: envelope"},{t:"Orthogonal Trajectories",f:"Replace dy/dx by −dx/dy in the family's DE"},{t:"Second Order (const coeff)",f:"y''+py'+qy=0; char eqn m²+pm+q=0; roots give general solution"},{t:"Complementary Function",f:"Real distinct roots m₁,m₂: y=Ae^(m₁x)+Be^(m₂x)"},{t:"Equal Roots",f:"m₁=m₂=m: y=(A+Bx)e^(mx)"},{t:"Complex Roots",f:"m=α±βi: y=e^(αx)(AcosβX+BsinβX)"},{t:"Particular Integral",f:"For y''+py'+qy=f(x): use undetermined coefficients or variation of parameters"},{t:"Degree not defined",f:"Degree undefined if DE has terms like sin(y'), e^(y'), ln(y')"},{t:"Integrating Factor for Non-Exact",f:"IF=e^∫(Mₓ−Nᵧ)/N dx (if depends on x only)"},{t:"Logistic Growth",f:"dP/dt=kP(1−P/M); S-curve solution: P=M/(1+Ce^(−kt))"}],
 keyPoints:["Order=highest derivative; degree=power (after clearing surds)","Homogeneous: y=vx always leads to separable","Clairaut y=xy'+f(y'): general solution y=cx+f(c)"],
 mindmap:{root:"Differential\nEquations",branches:[{n:"Methods",col:"#7c3aed",nodes:["Variable Separable","Homogeneous y=vx","Linear IF=e^∫P","Bernoulli"]},{n:"Formation",col:"#a78bfa",nodes:["Eliminate Constants","Order=Constants","Degree","Exact ∂M/∂y=∂N/∂x"]},{n:"Applications",col:"#6d28d9",nodes:["Growth N=N₀eᵏᵗ","Newton's Cooling","Mixing Problems","Orthogonal Traj"]},{n:"Special",col:"#4c1d95",nodes:["Clairaut's Eqn","Reducible to Linear","Bernoulli","Exact DE"]}]}},

{id:"m15",sub:"math",name:"Vectors & 3D Geometry",weight:"High",est:5, syllabus:[
  {topic:"Vectors",subtopics:[
    {name:"Basic Concepts & Operations",concepts:["Vector — magnitude + direction; zero vector; unit vector â=a⃗/|a⃗|","Position vector r⃗=OP⃗; collinear vectors a⃗=λb⃗","Triangle law of addition; parallelogram law","Subtraction a⃗−b⃗=a⃗+(−b⃗); scalar multiplication λa⃗","Linear combination αa⃗+βb⃗; linear dependence/independence","Section formula (internal): r⃗=(mb⃗+na⃗)/(m+n)"]},
    {name:"Dot Product",concepts:["Definition: a⃗·b⃗=|a⃗||b⃗|cosθ; a⃗·a⃗=|a⃗|²","Cartesian: a⃗·b⃗=a₁b₁+a₂b₂+a₃b₃","Commutative and distributive; projection of a⃗ on b⃗=(a⃗·b̂)","Angle: cosθ=(a⃗·b⃗)/(|a⃗||b⃗|); perpendicular iff a⃗·b⃗=0"]},
    {name:"Cross Product",concepts:["Definition: |a⃗×b⃗|=|a⃗||b⃗|sinθ; direction by right-hand rule","a⃗×b⃗=det(î ĵ k̂; a₁ a₂ a₃; b₁ b₂ b₃)","Anti-commutative: a⃗×b⃗=−b⃗×a⃗; distributive","Area of triangle=½|a⃗×b⃗|; area of parallelogram=|a⃗×b⃗|","Parallel vectors iff a⃗×b⃗=0"]},
    {name:"Triple Products",concepts:["Scalar triple product [a⃗ b⃗ c⃗]=a⃗·(b⃗×c⃗)=determinant of 3×3 matrix","Volume of parallelepiped=|[a⃗ b⃗ c⃗]|","Cyclic property: [a b c]=[b c a]=[c a b]","Coplanar iff [a⃗ b⃗ c⃗]=0","Vector triple product: a⃗×(b⃗×c⃗)=(a⃗·c⃗)b⃗−(a⃗·b⃗)c⃗ (BAC−CAB)"]}
  ]},
  {topic:"3D Geometry",subtopics:[
    {name:"Coordinate System & Direction Cosines",concepts:["3D coordinates; distance √[(x₂−x₁)²+(y₂−y₁)²+(z₂−z₁)²]","Direction cosines l=cosα,m=cosβ,n=cosγ; l²+m²+n²=1","Direction ratios a,b,c: l=a/√(a²+b²+c²) etc","Section formula (internal/external) in 3D"]},
    {name:"Lines in 3D",concepts:["Vector form: r⃗=a⃗+λb⃗","Cartesian: (x−x₁)/a=(y−y₁)/b=(z−z₁)/c","Two-point form: (x−x₁)/(x₂−x₁)=(y−y₁)/(y₂−y₁)=(z−z₁)/(z₂−z₁)","Angle: cosθ=|l₁l₂+m₁m₂+n₁n₂|","Shortest distance between skew lines: |(b⃗₁×b⃗₂)·(a⃗₂−a⃗₁)|/|b⃗₁×b⃗₂|","Foot of perpendicular from point to line"]},
    {name:"Planes",concepts:["Vector: (r⃗−a⃗)·n⃗=0 ⟹ r⃗·n⃗=d","Cartesian: ax+by+cz+d=0; normal vector=(a,b,c)","Through a point: a(x−x₁)+b(y−y₁)+c(z−z₁)=0","Three-point form: determinant=0; intercept form x/a+y/b+z/c=1","Angle between planes: cosθ=|n⃗₁·n⃗₂|/(|n⃗₁||n⃗₂|)","Angle between line & plane: sinφ=|direction·normal|/(|dir||norm|)","Distance from point to plane=|ax₀+by₀+cz₀+d|/√(a²+b²+c²)","Distance between parallel planes; family P₁+λP₂=0"]},
    {name:"Sphere",concepts:["(x−h)²+(y−k)²+(z−l)²=r²; general: x²+y²+z²+2ux+2vy+2wz+d=0","Centre (−u,−v,−w); radius=√(u²+v²+w²−d)","Tangent plane at (x₁,y₁,z₁); plane-sphere intersection"]}
  ]}
 ],
 topics:["Vectors: addition, subtraction, unit vectors; position vector","Dot product: definition, projection","Cross product: area of triangle/parallelogram","Scalar triple product [a b c]: volume, coplanarity","Vector triple product BAC−CAB rule","Lines in 3D: vector r=a+λb; skew lines shortest distance","Planes: vector and Cartesian; angle; distance from point","Line of intersection of planes; image in plane","Sphere equation"],
 formulas:[{t:"Vector Basics",f:"a⃗=a₁î+a₂ĵ+a₃k̂; |a⃗|=√(a₁²+a₂²+a₃²); unit â=a⃗/|a⃗|"},{t:"Dot Product",f:"a⃗·b⃗=|a||b|cosθ=a₁b₁+a₂b₂+a₃b₃; a⃗·a⃗=|a|²"},{t:"Projection",f:"Proj of b on a = (a⃗·b⃗)/|a⃗|; vector proj=(a⃗·b⃗/|a|²)a⃗"},{t:"Cross Product",f:"|a⃗×b⃗|=|a||b|sinθ; direction by right-hand rule; î×ĵ=k̂; ĵ×k̂=î; k̂×î=ĵ"},{t:"Cross Product Det",f:"a×b=|î ĵ k̂; a₁ a₂ a₃; b₁ b₂ b₃|"},{t:"Area Triangle",f:"Area=½|a⃗×b⃗|; Area parallelogram=|a⃗×b⃗|"},{t:"Scalar Triple Product",f:"[a b c]=a⃗·(b⃗×c⃗)=|a₁a₂a₃;b₁b₂b₃;c₁c₂c₃|; =0 iff coplanar"},{t:"Vector Triple Product",f:"a⃗×(b⃗×c⃗)=(a⃗·c⃗)b⃗−(a⃗·b⃗)c⃗ (BAC−CAB)"},{t:"Volume Parallelepiped",f:"V=|[a b c]|; Volume tetrahedron=(1/6)|[a b c]|"},{t:"Direction Cosines",f:"l=cosα, m=cosβ, n=cosγ; l²+m²+n²=1; l=a/|a|"},{t:"Line Vector Form",f:"r⃗=a⃗+λb⃗; direction b⃗; through point a⃗"},{t:"Line Cartesian",f:"(x−x₁)/l=(y−y₁)/m=(z−z₁)/n=λ"},{t:"Angle Between Lines",f:"cosθ=|l₁l₂+m₁m₂+n₁n₂|; perp: l₁l₂+m₁m₂+n₁n₂=0"},{t:"Skew Lines SD",f:"d=|(a₂⃗−a₁⃗)·(b₁⃗×b₂⃗)|/|b₁⃗×b₂⃗|"},{t:"Plane Vector Form",f:"r⃗·n̂=d; n̂=unit normal; (r⃗−a⃗)·n⃗=0"},{t:"Plane Cartesian",f:"ax+by+cz+d=0; normal (a,b,c); dist from origin=|d|/√(a²+b²+c²)"},{t:"Pt to Plane Dist",f:"|ax₀+by₀+cz₀+d|/√(a²+b²+c²)"},{t:"Angle Between Planes",f:"cosθ=|a₁a₂+b₁b₂+c₁c₂|/(√(a₁²+b₁²+c₁²)·√(a₂²+b₂²+c₂²))"},{t:"Plane Family",f:"P₁+λP₂=0; passes through intersection line of P₁=0 and P₂=0"},{t:"Line-Plane Angle",f:"sinθ=|(al+bm+cn)|/√(a²+b²+c²)·√(l²+m²+n²)"},{t:"Foot of Perpendicular (line)",f:"P'=P+t·d̂ where t=−(AP⃗·b̂); shortest distance point"},{t:"Image of Point in Plane",f:"(h−x₁)/a=(k−y₁)/b=(l−z₁)/c=−2(ax₁+by₁+cz₁+d)/(a²+b²+c²)"},{t:"Section Formula 3D",f:"Internal m:n: r⃗=(mb⃗+na⃗)/(m+n); midpoint=(a⃗+b⃗)/2"},{t:"Collinear Points",f:"A,B,C collinear iff AB⃗×AC⃗=0 (cross product zero)"}],
 keyPoints:["l²+m²+n²=1 for direction cosines","Line of intersection of planes: direction=n₁×n₂","Volume tetrahedron=(1/6)|[a b c]|","Family of planes through P₁∩P₂: P₁+λP₂=0"],
 mindmap:{root:"Vectors &\n3D Geometry",branches:[{n:"Vector Algebra",col:"#7c3aed",nodes:["Dot Product a·b","Cross Product a×b","[a b c] Triple","BAC-CAB Rule"]},{n:"Lines in 3D",col:"#a78bfa",nodes:["r=a+λb","Cartesian Form","Skew Lines SD","Coplanar"]},{n:"Planes",col:"#6d28d9",nodes:["ax+by+cz+d=0","Pt to Plane","Angle Between","Line∩Plane"]},{n:"Applications",col:"#4c1d95",nodes:["Area ½|a×b|","Volume 1/6[abc]","Foot of Perp","Image of Point"]}]}},

{id:"m16",sub:"math",name:"Matrices, Determinants & Probability",weight:"High",est:5, syllabus:[
  {topic:"Matrices",subtopics:[
    {name:"Types & Definitions",concepts:["Order m×n; square (m=n); row/column/zero/identity matrices","Diagonal matrix — non-zero only on main diagonal","Scalar matrix — diagonal with all equal diagonal entries","Upper/lower triangular; symmetric Aᵀ=A; skew-symmetric Aᵀ=−A","Orthogonal AᵀA=I; Idempotent A²=A; Involutory A²=I; Nilpotent Aᵏ=O","Trace = sum of diagonal elements"]},
    {name:"Operations",concepts:["Addition (same order, entry-wise); scalar multiplication","Multiplication (AB)ᵢⱼ=Σaᵢₖbₖⱼ; need cols of A=rows of B","Associative; distributive; NOT commutative in general","Transpose (Aᵀ)ᵀ=A; (AB)ᵀ=BᵀAᵀ; (kA)ᵀ=kAᵀ","Any A = ½(A+Aᵀ) + ½(A−Aᵀ) (symmetric + skew-symmetric)"]},
    {name:"Determinants & Inverse",concepts:["2×2: det=ad−bc; 3×3 by first-row cofactor expansion","Minor Mᵢⱼ — det after deleting row i col j; Cofactor Cᵢⱼ=(−1)^(i+j)Mᵢⱼ","Properties: det(Aᵀ)=det(A); det(AB)=det(A)det(B); det(kA)=kⁿdet(A)","Swapping rows/cols changes sign; scaling multiplies det; row-add unchanged","Adjugate adj(A) = transpose of cofactor matrix; A·adj(A)=det(A)·I","Inverse: A⁻¹=adj(A)/det(A); exists iff det(A)≠0","(AB)⁻¹=B⁻¹A⁻¹; (Aᵀ)⁻¹=(A⁻¹)ᵀ","Rank — max linearly independent rows/cols; reduce to row echelon form"]}
  ]},
  {topic:"System of Linear Equations",subtopics:[
    {name:"Solving Systems",concepts:["Homogeneous AX=0: trivial X=0 always; non-trivial iff rank(A)<n","Non-homogeneous AX=B: consistent iff rank(A)=rank([A|B])","Unique solution: rank(A)=n; infinite: rank<n; no solution: ranks differ","Cramer's rule: xᵢ=det(Aᵢ)/det(A) (replace col i with B)","Inverse method: X=A⁻¹B (when det≠0)","Gaussian elimination — row reduction"]}
  ]},
  {topic:"Probability",subtopics:[
    {name:"Classical Probability",concepts:["Sample space S; event = subset of S; mutually exclusive A∩B=∅; exhaustive: union=S","Classical: P(A)=|A|/|S| for equally likely; Axiomatic: 0≤P(A)≤1, P(S)=1","P(A∪B)=P(A)+P(B)−P(A∩B); for 3 events: inclusion-exclusion","P(A')=1−P(A)"]},
    {name:"Conditional & Independence",concepts:["P(A|B)=P(A∩B)/P(B); Multiplication: P(A∩B)=P(A)P(B|A)","Independent events: P(A∩B)=P(A)P(B); ME ≠ Independent","Pairwise vs mutual independence","Total probability: P(B)=ΣP(B|Eᵢ)P(Eᵢ) for partition E₁,…,Eₙ","Bayes' theorem: P(Eᵢ|B)=P(B|Eᵢ)P(Eᵢ)/ΣP(B|Eⱼ)P(Eⱼ)"]},
    {name:"Random Variables & Distributions",concepts:["Discrete RV: PMF p(x)=P(X=x); Σp(x)=1","E(X)=Σx·p(x); Var(X)=E(X²)−[E(X)]²","Properties: E(aX+b)=aE(X)+b; Var(aX+b)=a²Var(X)","Bernoulli trial: success p, failure q=1−p","Binomial(n,p): P(X=r)=ⁿCᵣpʳqⁿ⁻ʳ; mean=np; variance=npq","PDF for continuous: P(a≤X≤b)=∫ₐᵇf(x)dx; CDF F(x)=P(X≤x)","Normal distribution — qualitative (bell curve, symmetric)"]}
  ]}
 ],
 topics:["Matrix types; operations; transpose; symmetric/skew","Determinants 2×2 and 3×3; properties; cofactor expansion","Minors, cofactors, adjugate; inverse A⁻¹=adj(A)/det(A)","Rank; Rouché-Capelli; Cramer's rule","Classical probability; addition theorem P(A∪B)","Conditional P(A|B)=P(A∩B)/P(B)","Multiplication theorem; independent events","Total probability; Bayes' theorem","Binomial distribution: mean=np, var=npq"],
 formulas:[{t:"Matrix Operations",f:"(A+B)ᵀ=Aᵀ+Bᵀ; (AB)ᵀ=BᵀAᵀ; (AB)⁻¹=B⁻¹A⁻¹"},{t:"Symmetric/Skew",f:"Sym: A=Aᵀ; Skew: A=−Aᵀ; Any A=½(A+Aᵀ)+½(A−Aᵀ)"},{t:"Determinant 2×2",f:"|a b; c d|=ad−bc"},{t:"Cofactor Expansion",f:"det(A)=Σⱼ aᵢⱼ·Cᵢⱼ along any row/column"},{t:"Properties of Det",f:"det(AB)=det(A)·det(B); det(Aᵀ)=det(A); det(kA)=kⁿ·det(A)"},{t:"Inverse",f:"A⁻¹=adj(A)/det(A); A·A⁻¹=I; (A⁻¹)ᵀ=(Aᵀ)⁻¹"},{t:"Adjugate",f:"adj(A)ᵀ=matrix of cofactors; A·adj(A)=det(A)·I"},{t:"Rank",f:"Rank=max linearly independent rows/cols; from row echelon: count non-zero rows"},{t:"Cramer's Rule",f:"x₁=D₁/D; x₂=D₂/D; x₃=D₃/D; where D=det(coeff matrix)"},{t:"Consistency",f:"AX=B: unique soln if det≠0; det=0,B consistent: ∞ solns; det=0,inconsistent: no soln"},{t:"Cayley-Hamilton",f:"Every matrix satisfies its own characteristic equation; A²−(tr A)A+(det A)I=0 for 2×2"},{t:"Probability Addition",f:"P(A∪B)=P(A)+P(B)−P(A∩B)"},{t:"Conditional",f:"P(A|B)=P(A∩B)/P(B); P(A∩B)=P(A|B)·P(B)"},{t:"Multiplication Theorem",f:"P(A₁∩A₂∩…∩Aₙ)=P(A₁)·P(A₂|A₁)·P(A₃|A₁A₂)…"},{t:"Independent Events",f:"P(A∩B)=P(A)·P(B); P(A|B)=P(A); P(B|A)=P(B)"},{t:"Total Probability",f:"P(B)=ΣP(B|Aᵢ)·P(Aᵢ); partition Aᵢ exhaustive & mutually exclusive"},{t:"Bayes' Theorem",f:"P(Aᵢ|B)=P(B|Aᵢ)·P(Aᵢ)/ΣP(B|Aⱼ)·P(Aⱼ)"},{t:"Binomial Distribution",f:"P(X=r)=ⁿCᵣpʳqⁿ⁻ʳ; E(X)=np; Var(X)=npq; σ=√(npq)"},{t:"Binomial Mode",f:"Mode≈(n+1)p; if (n+1)p integer: two modes"},{t:"Poisson",f:"P(X=r)=e⁻λλʳ/r!; E(X)=λ; Var(X)=λ; λ=np for large n,small p"},{t:"E[aX+b]",f:"=aE[X]+b; Var(aX+b)=a²Var(X)"},{t:"adj(adj A)",f:"adj(adj A)=det(A)^(n−2)·A for n×n matrix"},{t:"det(adj A)",f:"det(adj A)=(det A)^(n−1)"},{t:"Geometric Distribution",f:"P(X=k)=(1−p)^(k−1)p; E[X]=1/p; Var(X)=(1−p)/p²"}],
 keyPoints:["ME ≠ Independent: ME: P(A∩B)=0; Indep: P(A∩B)=P(A)P(B)","If A,B independent then A,B' also independent"],
 mindmap:{root:"Matrices &\nProbability",branches:[{n:"Matrices",col:"#7c3aed",nodes:["Types","(AB)ᵀ=BᵀAᵀ","Symmetric/Skew","Orthogonal"]},{n:"Determinants",col:"#a78bfa",nodes:["Cofactor Expansion","Properties","Adj & Inverse","Cramer's Rule"]},{n:"Probability",col:"#6d28d9",nodes:["Addition P(A∪B)","Conditional P(A|B)","Independent","Mutually Exclusive"]},{n:"Distributions",col:"#4c1d95",nodes:["Bayes' Theorem","Binomial ⁿCᵣpʳqⁿ⁻ʳ","Mean=np Var=npq","Total Probability"]}]}},

{id:"m17",sub:"math",name:"Statistics",weight:"Medium",est:2, syllabus:[
  {topic:"Statistics",subtopics:[
    {name:"Measures of Central Tendency",concepts:["Arithmetic mean (raw): x̄=Σxᵢ/n","Grouped data: direct method, assumed mean method, step-deviation method","Median (raw): middle value after sorting; Grouped: L+[(N/2−cf)/f]×h","Mode (raw): most frequent; Grouped: L+[(f₁−f₀)/(2f₁−f₀−f₂)]×h","Relation for moderately skewed: Mode=3·Median−2·Mean","Weighted mean: Σwᵢxᵢ/Σwᵢ"]},
    {name:"Measures of Dispersion",concepts:["Range = max − min","Quartile deviation = (Q₃−Q₁)/2; IQR=Q₃−Q₁","Mean deviation about mean: MD=Σ|xᵢ−x̄|/n; about median: Σ|xᵢ−M|/n","Variance (population): σ²=Σ(xᵢ−x̄)²/n=Σxᵢ²/n−x̄²","Sample variance: Σ(xᵢ−x̄)²/(n−1)","Shortcut: σ²=Σfᵢxᵢ²/N−(x̄)²; step-deviation: σ²=h²[ΣfᵢUᵢ²/N−(ΣfᵢUᵢ/N)²]","Standard deviation σ=√(Variance); always σ≥0","Coefficient of variation CV=(σ/x̄)×100% — compare variability"]},
    {name:"Combined & Other Statistics",concepts:["Combined mean: x̄=(n₁x̄₁+n₂x̄₂)/(n₁+n₂)","Combined variance: [n₁(σ₁²+d₁²)+n₂(σ₂²+d₂²)]/(n₁+n₂); d₁=x̄₁−x̄","Effect of shift: adding k → mean±k; SD unchanged; Var unchanged","Effect of scale: multiply by k → mean×k; SD×|k|; Var×k²","Symmetric: mean=median=mode; positive skew: mean>median>mode","Pearson correlation r=Σ(xᵢ−x̄)(yᵢ−ȳ)/(n·σₓσᵧ); −1≤r≤+1"]}
  ]}
 ],
 topics:["Mean: x̄=Σxᵢ/n; weighted mean","Median: middle value; grouped data formula","Mode: most frequent value","Range; Mean deviation MD=Σ|xᵢ−x̄|/n","Variance σ²=Σ(xᵢ−x̄)²/n","SD σ=√(Variance); shortcut σ²=Σxᵢ²/n−(x̄)²","Grouped data: direct, short-cut, step-deviation","Coefficient of variation CV=σ/x̄×100%"],
 formulas:[{t:"Mean",f:"x̄=Σxᵢ/n=Σfᵢxᵢ/Σfᵢ (grouped data)"},{t:"Median (grouped)",f:"L+[(n/2−cf)/f]×h; L=lower class boundary; cf=cumulative freq before median class"},{t:"Mode (grouped)",f:"L+[(f₁−f₀)/(2f₁−f₀−f₂)]×h; f₁=modal class freq; f₀,f₂=adjacent"},{t:"Range",f:"Max value − Min value"},{t:"Mean Deviation",f:"MD=Σ|xᵢ−x̄|/n (about mean); or Σ|xᵢ−M|/n (about median)"},{t:"Variance",f:"σ²=Σ(xᵢ−x̄)²/n=Σxᵢ²/n−x̄²=Σfᵢxᵢ²/Σfᵢ−x̄²"},{t:"Standard Deviation",f:"σ=√(Variance); always σ≥0"},{t:"Step-Deviation Method",f:"σ²=h²[Σfᵢuᵢ²/N−(Σfᵢuᵢ/N)²]; uᵢ=(xᵢ−A)/h"},{t:"Coefficient of Variation",f:"CV=σ/x̄×100%; used to compare variability when means differ"},{t:"Effect of Shift",f:"Adding constant k: mean±k; SD unchanged; Var unchanged"},{t:"Effect of Scale",f:"Multiplying by k: mean×k; SD×|k|; Var×k²"},{t:"Quartiles",f:"Q₁=25th percentile; Q₂=50th (median); Q₃=75th; IQR=Q₃−Q₁"},{t:"Skewness",f:"Symmetric: mean=median=mode; positive skew: mean>median>mode"},{t:"Pearson Correlation",f:"r=Σ(xᵢ−x̄)(yᵢ−ȳ)/(n·σₓσᵧ); −1≤r≤+1"},{t:"Combined Mean",f:"x̄=（n₁x̄₁+n₂x̄₂)/(n₁+n₂)"},{t:"Combined Variance",f:"σ²=[n₁(σ₁²+d₁²)+n₂(σ₂²+d₂²)]/(n₁+n₂); d₁=x̄₁−x̄, d₂=x̄₂−x̄"},{t:"Median by Linear Interpolation",f:"Median class: freq cumul just exceeds N/2; interpolate within class"},{t:"Relation Mean,Median,Mode",f:"Mode≈3Median−2Mean (empirical formula for moderately skewed data)"},{t:"MD about Mean ≤ SD",f:"Mean deviation ≤ Standard deviation always"},{t:"Regression Line y on x",f:"y−ȳ=b_yx(x−x̄); b_yx=r·(σᵧ/σₓ)"}],
 keyPoints:["SD unchanged by shift; multiplied by |k| by scale","CV used to compare variability when means differ","Symmetric: mean=median=mode"],
 mindmap:{root:"Statistics",branches:[{n:"Central Tendency",col:"#7c3aed",nodes:["Mean Σx/n","Median Middle","Mode Most Freq","Weighted Mean"]},{n:"Dispersion",col:"#a78bfa",nodes:["Range Max−Min","Mean Deviation","Variance σ²","SD σ=√σ²"]},{n:"Grouped Data",col:"#6d28d9",nodes:["Direct Method","Step-Deviation","Median Formula","Mode Formula"]},{n:"Comparison",col:"#4c1d95",nodes:["CV=σ/x̄×100%","Shift No Change","Scale Multiplies","Symmetric Mean=Mode"]}]}},

{id:"m18",sub:"math",name:"Mathematical Reasoning",weight:"Low",est:1, syllabus:[
  {topic:"Mathematical Reasoning",subtopics:[
    {name:"Statements & Connectives",concepts:["Proposition — declarative sentence with truth value (T or F)","Negation ¬p (NOT); Conjunction p∧q (AND); Disjunction p∨q (OR)","Conditional p→q (IF-THEN); Biconditional p↔q","Truth tables — evaluate compound statement truth values","Tautology — always true (e.g. p∨¬p); Contradiction — always false (p∧¬p)"]},
    {name:"Logical Equivalences",concepts:["Contrapositive of p→q is ¬q→¬p (equivalent to original)","Converse q→p — NOT equivalent to original","Inverse ¬p→¬q — equivalent to converse only","¬(p→q)≡p∧¬q; p→q is FALSE only when p T and q F","De Morgan's: ¬(p∧q)≡¬p∨¬q; ¬(p∨q)≡¬p∧¬q","Distributive: p∧(q∨r)≡(p∧q)∨(p∧r); p∨(q∧r)≡(p∨q)∧(p∨r)"]},
    {name:"Quantifiers & Proofs",concepts:["Universal quantifier ∀ (for all); Existential ∃ (there exists)","Negation of ∀x P(x) is ∃x ¬P(x); negation of ∃x P(x) is ∀x ¬P(x)","Direct proof; Proof by contradiction (assume ¬p, derive contradiction)","Proof by contrapositive (prove ¬q→¬p instead of p→q)","Modus Ponens: p, p→q ⊢ q; Modus Tollens: ¬q, p→q ⊢ ¬p"]}
  ]}
 ],
 topics:["Statements: simple vs compound; truth values","Logical connectives: NOT (¬), AND (∧), OR (∨)","Conditional: p→q; contrapositive, converse, inverse","Biconditional p↔q","Truth tables; tautology and contradiction","Quantifiers: ∀ (for all), ∃ (there exists)","Negation of quantified statements","Proof methods: direct, contradiction, contrapositive"],
 formulas:[{t:"Contrapositive",f:"p→q ≡ ¬q→¬p (logically equivalent; same truth table)"},{t:"Converse",f:"p→q: converse is q→p; NOT equivalent to original"},{t:"Inverse",f:"p→q: inverse is ¬p→¬q; equivalent to converse but NOT original"},{t:"Negation of Conditional",f:"¬(p→q)≡p∧¬q; conditional false only when p true, q false"},{t:"De Morgan's Laws",f:"¬(p∧q)≡¬p∨¬q; ¬(p∨q)≡¬p∧¬q"},{t:"Tautology",f:"p∨¬p=T always; p∧¬p=F always (contradiction)"},{t:"Biconditional",f:"p↔q≡(p→q)∧(q→p); true when p,q have same truth value"},{t:"Distributive Laws",f:"p∧(q∨r)≡(p∧q)∨(p∧r); p∨(q∧r)≡(p∨q)∧(p∨r)"},{t:"Quantifier Negation",f:"¬(∀x P(x))≡∃x¬P(x); ¬(∃x P(x))≡∀x¬P(x)"},{t:"Proof by Contradiction",f:"Assume ¬p; derive contradiction; conclude p is true"},{t:"Proof by Contrapositive",f:"Prove ¬q→¬p instead of p→q (equivalent)"},{t:"Valid Arguments",f:"Modus Ponens: p; p→q ⊢ q; Modus Tollens: ¬q; p→q ⊢ ¬p"},{t:"Truth Table p→q",f:"F only when p=T and q=F; all other cases T"},{t:"Absorption Laws",f:"p∨(p∧q)≡p; p∧(p∨q)≡p"},{t:"Double Negation",f:"¬(¬p)≡p"},{t:"Idempotent Laws",f:"p∨p≡p; p∧p≡p"},{t:"Commutative",f:"p∧q≡q∧p; p∨q≡q∨p"}],
 keyPoints:["p→q is FALSE only when p TRUE and q FALSE","Contrapositive ≡ original; Converse ≠ original","∀x P(x) negated: ∃x ¬P(x)"],
 mindmap:{root:"Mathematical\nReasoning",branches:[{n:"Statements",col:"#7c3aed",nodes:["Simple/Compound","Truth Values","Tautology","Contradiction"]},{n:"Connectives",col:"#a78bfa",nodes:["NOT ¬","AND ∧","OR ∨","Conditional →"]},{n:"Equivalence",col:"#6d28d9",nodes:["Contrapositive","De Morgan's","Biconditional ↔","Truth Tables"]},{n:"Quantifiers",col:"#4c1d95",nodes:["∀ For All","∃ There Exists","Negation Rules","Proof Methods"]}]}},

{id:"m19",sub:"math",name:"Mathematical Induction & Inequalities",weight:"Medium",est:2, syllabus:[
  {topic:"Mathematical Induction",subtopics:[
    {name:"Principle of Induction",concepts:["Step 1: Base case — verify P(1) is true","Step 2: Inductive hypothesis — assume P(k) is true","Step 3: Inductive step — prove P(k+1) follows from P(k)","Strong induction: assume P(1),…,P(k) all true; prove P(k+1)","Applications: proving series sum formulas by PMI","Proving divisibility (e.g. 6|n(n+1)(n+2)) by PMI","Proving inequalities (e.g. 2ⁿ>n²) by PMI"]}
  ]},
  {topic:"Inequalities",subtopics:[
    {name:"Classical Inequalities",concepts:["AM-GM (2 terms): (a+b)/2≥√(ab); equality iff a=b; a,b>0","AM-GM (n terms): (Σaᵢ)/n≥(Πaᵢ)^(1/n); equality iff all equal","AM≥GM≥HM chain for positive numbers; G²=AH (2 terms)","Cauchy-Schwarz: (Σaᵢbᵢ)²≤(Σaᵢ²)(Σbᵢ²); equality iff a₁/b₁=a₂/b₂=…","Triangle inequality: |a+b|≤|a|+|b|; |a−b|≥||a|−|b||","Power mean M_r=(Σaᵢʳ/n)^(1/r); M₋∞≤HM≤GM≤AM≤M∞","Chebyshev's inequality for similarly ordered sequences"]},
    {name:"Optimization via Inequalities",concepts:["Fixed sum S=a+b: max product when a=b=S/2; max product=S²/4","Fixed product P=ab: min sum when a=b=√P; min sum=2√P","Constrained optimization using AM-GM for 3+ variables","For fixed perimeter: square maximizes area; for fixed area: circle maximizes","Applications to geometry (maximum area, minimum perimeter)"]}
  ]}
 ],
 topics:["Principle of mathematical induction: base + inductive step","Proving divisibility, inequalities, identities by PMI","AM-GM inequality for 2 and n numbers","Application for optimization","Cauchy-Schwarz inequality","Triangle inequality |a+b|≤|a|+|b|","Power mean inequality A≥G≥H","Optimization using AM-GM"],
 formulas:[{t:"PMI Steps",f:"(1) Base: P(1) true; (2) Inductive: Assume P(k) true, prove P(k+1)"},{t:"Strong Induction",f:"Assume P(1),…,P(k) all true; prove P(k+1)"},{t:"AM-GM (2 terms)",f:"(a+b)/2≥√(ab); equality iff a=b; a,b>0"},{t:"AM-GM (n terms)",f:"(a₁+a₂+…+aₙ)/n≥(a₁a₂…aₙ)^(1/n); equality iff all equal"},{t:"HM-GM-AM Chain",f:"HM≤GM≤AM for positive numbers; G²=AH (for 2 numbers)"},{t:"Cauchy-Schwarz",f:"(Σaᵢbᵢ)²≤(Σaᵢ²)(Σbᵢ²); equality iff a₁/b₁=a₂/b₂=…"},{t:"Cauchy-Schwarz Alt",f:"(a₁b₁+…+aₙbₙ)²≤(a₁²+…+aₙ²)(b₁²+…+bₙ²)"},{t:"Triangle Inequality",f:"|a+b|≤|a|+|b|; |a−b|≥||a|−|b||"},{t:"Chebyshev's Inequality",f:"If a₁≥…≥aₙ and b₁≥…≥bₙ: n·Σaᵢbᵢ≥(Σaᵢ)(Σbᵢ)"},{t:"Power Mean",f:"M_r=(Σaᵢʳ/n)^(1/r); M₋∞≤HM≤GM≤AM≤M∞"},{t:"Optimization via AM-GM",f:"Fixed sum S=a+b: max product when a=b=S/2; max product=S²/4"},{t:"Fixed Product",f:"Fixed P=ab: min sum when a=b=√P; min sum=2√P"},{t:"Divisibility by PMI",f:"E.g. 3|(n³−n); 6|n(n+1)(n+2); 4|(5ⁿ−1)"},{t:"Inequality Proof PMI",f:"E.g. 2ⁿ>n²  for n≥5; prove base then inductive step"},{t:"Weighted AM-GM",f:"(w₁a₁+…+wₙaₙ)/(Σwᵢ)≥a₁^(w₁/W)·…·aₙ^(wₙ/W); W=Σwᵢ"},{t:"Jensen's Inequality",f:"f convex: f(Σwᵢxᵢ)≤Σwᵢf(xᵢ); equality when all xᵢ equal"}],
 keyPoints:["PMI needs BOTH base AND inductive step","AM=GM only when all numbers are equal","For fixed perimeter: square maximizes area"],
 mindmap:{root:"Induction &\nInequalities",branches:[{n:"PMI",col:"#7c3aed",nodes:["Base Case P(1)","Inductive Step","P(k)→P(k+1)","Divisibility Proofs"]},{n:"AM-GM",col:"#a78bfa",nodes:["(a+b)/2≥√(ab)","n-Number Form","Equality a=b","Optimization"]},{n:"Inequalities",col:"#6d28d9",nodes:["Cauchy-Schwarz","Triangle |a+b|≤","Power Mean A≥G≥H","Jensen's Convex"]},{n:"Applications",col:"#4c1d95",nodes:["Fixed Sum→Max Product","Fixed Product→Min Sum","Geometric Proofs","Extremal Problems"]}]}},

{id:"m20",sub:"math",name:"Heights & Distances",weight:"Medium",est:1, syllabus:[
  {topic:"Heights & Distances",subtopics:[
    {name:"Basic Applications",concepts:["Angle of elevation: observer looks UP at object above horizontal","Angle of depression: observer looks DOWN at object below horizontal","tanθ = height / horizontal distance (right-triangle setup)","Single observer: find height or distance using one angle","Height of tower on a hill — two separate triangles"]},
    {name:"Two-Observer & Advanced Problems",concepts:["Two observers same side at distance d: h=d·tanα·tanβ/(tanα−tanβ)","Observers on opposite sides: h=d·tanα·tanβ/(tanα+tanβ)","Moving observer: if moves distance d closer, h=d·tanα·tanβ/(tanβ−tanα)","River/valley width using elevation angle from bank","Height from two elevation angles using sine rule: h=d·sinα·sinβ/sin(β−α)","Inclined plane — use sine rule when triangle is not right-angled","Bearing problems: North=0°, measured clockwise; resolve into N-S and E-W"]}
  ]}
 ],
 topics:["Angle of elevation and depression: definitions","Single observer: height and distance using tan","Two-observer problems: simultaneous equations","Problems involving inclined planes","Observer movement: change in elevation angle","Practical: towers, poles, cliffs, rivers, ships"],
 formulas:[{t:"Basic Trig Relation",f:"tanθ=Perpendicular/Base=height/horizontal distance"},{t:"Height from Two Angles",f:"h=d·tanα (single angle); d=horizontal distance"},{t:"Two Observer Formula",f:"h=d·tanα·tanβ/(tanα−tanβ); observers same side at distance d"},{t:"Opposite Observers",f:"h=d·tanα·tanβ/(tanα+tanβ); observers on opposite sides"},{t:"Angle of Depression",f:"Same as elevation formula; object below observer; draw below horizontal"},{t:"River Width",f:"Width=h/tanθ; h=height of landmark; θ=angle from riverbank"},{t:"Inclined Plane",f:"Draw perpendicular from foot; use sine rule in non-right triangles"},{t:"Moving Observer",f:"If observer moves distance d toward base: h=d·tanα·tanβ/(tanβ−tanα)"},{t:"Height at Two Elevations",f:"From same line: h=d·sinα·sinβ/sin(β−α) using sine rule"},{t:"Bearing Problems",f:"North=0°; measured clockwise; use components N-S and E-W separately"},{t:"Sine Rule in Heights",f:"a/sinA=b/sinB=c/sinC; use when not a right triangle"},{t:"Shadow Length",f:"shadow length=h/tanθ; θ=elevation angle of sun"},{t:"Pole on Hill",f:"Draw two right triangles; angles of elevation to foot and top separately"},{t:"Combined Elevation",f:"For tower AB on hill: tanθ₁=AC/d (foot); tanθ₂=AB/d; pole height=d(tanθ₂−tanθ₁)"}],
 keyPoints:["Draw a clear diagram before solving","Angle of elevation: looking up; depression: looking down","Both angles usually appear in pairs — simultaneous equations","For moving observer: h=d₁tanα=d₂tanβ"],
 mindmap:{root:"Heights &\nDistances",branches:[{n:"Elevation",col:"#7c3aed",nodes:["Looking Up","tanθ=h/d","Single Tower","Two Observers"]},{n:"Depression",col:"#a78bfa",nodes:["Looking Down","Ship/Valley","Same Formula","Cliff Problems"]},{n:"Techniques",col:"#6d28d9",nodes:["Draw Diagram","Simultaneous Eqns","Similar Triangles","Right Angle Setup"]},{n:"Applied",col:"#4c1d95",nodes:["Towers & Cliffs","River Width","Inclined Planes","Observer Moving"]}]}},

// ╔═══════════════════════ PHYSICS ════════════════════════╗
{id:"p1",sub:"physics",name:"Kinematics",weight:"High",est:3, syllabus:[
  {topic:"1D & 2D Kinematics",subtopics:[
    {name:"Equations of Motion",concepts:["v=u+at","s=ut+½at²","v²=u²+2as","s=½(u+v)t","sₙ=u+a(n−½) nth second","Free fall: a=g downward","Graphs: v-t slope=a; area=s","s-t slope=velocity"]},
    {name:"Projectile Motion",concepts:["Horizontal: x=u cosθ·t (uniform)","Vertical: y=u sinθ·t−½gt²","Range: R=u²sin2θ/g","Max range: θ=45°, R_max=u²/g","Max height: H=u²sin²θ/2g","Time of flight: T=2u sinθ/g","Trajectory: y=x tanθ−gx²/(2u²cos²θ)","θ and 90°−θ give equal range","Horizontal projection from height h: T=√(2h/g), R=u√(2h/g)","Projectile on incline (α): R=u²[sin(2θ−α)−sinα]/(g cos²α)","Max range on incline: θ=45°+α/2","Angle of velocity: tanφ=(usinθ−gt)/(ucosθ)","Variable accel a(t): v=∫a dt; x=∫v dt","Variable a(x): use a=v dv/dx → ∫v dv=∫a(x)dx"]}
  ]},
  {topic:"Relative Motion & Circular",subtopics:[
    {name:"Relative Velocity",concepts:["v⃗_AB=v⃗_A−v⃗_B","1D: same direction v_rel=v_A−v_B","River-boat: min time — head straight","River-boat: min drift — angle upstream","Rain-man problem","Pursuit problem","Shortest path (river): sinθ=v_r/v_b if v_b>v_r; min drift if v_b<v_r: sinθ=v_b/v_r","Collision course condition: a must point from A toward B"]}  ,
    {name:"Circular Motion",concepts:["Angular displacement θ, velocity ω, acceleration α","ω=dθ/dt; α=dω/dt","Linear-angular: v=ωr; aₜ=αr","Centripetal: aₙ=v²/r=ω²r (toward center)","Total acceleration: √(aₜ²+aₙ²)","UCM: constant ω; v changes direction only"]}
  ]}
 ],
 topics:["Scalars vs vectors; unit vectors","Distance vs displacement; speed vs velocity","Uniform acceleration: all SUVAT equations","Displacement in nth second: sₙ=u+a(2n−1)/2","Free fall and motion under gravity","v-t, s-t graphs: slopes and areas","Relative velocity in 1D and 2D","Projectile: horizontal and vertical components","Maximum range (θ=45°), max height, time of flight","River-boat: minimum time and drift cases","Circular: ω, centripetal a_c=v²/r=ω²r"],
 formulas:[{t:"SUVAT v",f:"v=u+at"},{t:"SUVAT s (from u)",f:"s=ut+½at²"},{t:"SUVAT v²",f:"v²=u²+2as"},{t:"SUVAT s (avg)",f:"s=½(u+v)t"},{t:"nth Second",f:"sₙ=u+a(n−½); displacement in nth second"},{t:"Relative Velocity",f:"v⃗_AB=v⃗_A−v⃗_B; for same direction: relative v=v_A−v_B"},{t:"Projectile Range",f:"R=u²sin2θ/g; max R=u²/g at θ=45°"},{t:"Max Height",f:"H=u²sin²θ/(2g)"},{t:"Time of Flight",f:"T=2u sinθ/g"},{t:"Horizontal Range",f:"At any point: x=u cosθ·t; y=u sinθ·t−½gt²"},{t:"Equation of Trajectory",f:"y=x tanθ−gx²/(2u²cos²θ) (parabola)"},{t:"Range complementary",f:"θ and (90°−θ) give equal ranges; R(θ)=R(90°−θ)"},{t:"Circular Motion",f:"a_c=v²/r=ω²r; v=ωr; T=2πr/v=2π/ω"},{t:"Angular Relations",f:"ω=dθ/dt; α=dω/dt; ω²=ω₀²+2αθ; θ=ω₀t+½αt²"},{t:"Tangential Accel",f:"aₜ=rα; a_total=√(aₜ²+a_c²)"},{t:"River Boat Min Time",f:"t_min=d/v_b (head straight across); drift=v_r·t"},{t:"River Boat Min Drift",f:"sinθ=v_r/v_b; if v_r<v_b: boat reaches opposite bank upstream"}],
 keyPoints:["At max height: vertical v=0; KE=½m(ucosθ)²","θ and (90°−θ) give same horizontal range","Centripetal acc always toward center; does NO work","v-t slope=acceleration; area=displacement"],
 mindmap:{root:"Kinematics",branches:[{n:"1D Motion",col:"#ea580c",nodes:["SUVAT Equations","nth Second sₙ","v-t, s-t Graphs","Free Fall g"]},{n:"Projectile",col:"#f97316",nodes:["R=u²sin2θ/g","H=u²sin²θ/2g","T=2usinθ/g","Components"]},{n:"Circular",col:"#dc2626",nodes:["a_c=v²/r=ω²r","Angular ω,α","aₜ=rα","Non-Uniform"]},{n:"Relative Motion",col:"#b45309",nodes:["v_AB=v_A−v_B","River-Boat","Rain-Man","Pursuit Problem"]}]}},

{id:"p2",sub:"physics",name:"Laws of Motion & Friction",weight:"High",est:4, syllabus:[
  {topic:"Newton's Laws of Motion",subtopics:[
    {name:"Three Laws & FBD",concepts:["1st Law: inertia — no net force, no change","2nd Law: F⃗_net=ma⃗=dp⃗/dt","3rd Law: F_AB=−F_BA (different bodies)","Free body diagram technique","Inertial frames: Newton's laws hold","Non-inertial: add pseudo force −ma₀"]},
    {name:"Applications",concepts:["Normal force on incline: N=mgcosθ","Normal in lift: N=m(g±a)","Atwood machine: a=(m₁−m₂)g/(m₁+m₂)","Tension in string over pulley","Constraint equations","Impulse: J=FΔt=Δp"]}
  ]},
  {topic:"Friction & Circular",subtopics:[
    {name:"Friction",concepts:["Static friction fₛ≤μₛN (adjustable)","Kinetic friction fₖ=μₖN (constant)","μₛ>μₖ always","Angle of friction: tanλ=μ","Angle of repose = angle of friction","Motion on rough incline: a=g(sinθ±μcosθ)","Moving wedge: horiz momentum conserved if no external horiz force","Spring cut: k_new=kL/l_piece (inversely proportional to length)","Min force to move block: F_min=μmg/√(1+μ²) at angle tan⁻¹μ below horiz","Friction in circular: max speed unbanked v_max=√(μₛgr)"]},
    {name:"Circular Motion Applications",concepts:["Banking without friction: tanθ=v²/rg","Banking with friction: v_max and v_min","Conical pendulum: T=2π√(lcosθ/g)","Vertical circle: min speed at top=√(gr)","Normal force variation in vertical circle"]}
  ]}
 ],
 topics:["Newton's three laws: inertia, F=ma=dp/dt, action-reaction","Free body diagram (FBD) technique","Inertial and non-inertial frames; pseudo force","Normal force: on incline, in lift, on curve","Tension in strings; massless and massive strings","Constraint equations; Atwood machine","Static friction: max μₛN; kinetic fₖ=μₖN","Angle of friction and angle of repose","Motion on inclined plane","Banking of roads; conical pendulum"],
 formulas:[{t:"Newton's 1st",f:"Body continues in state of rest/uniform motion unless net force acts"},{t:"Newton's 2nd",f:"F⃗_net=ma⃗=dp⃗/dt; p=mv"},{t:"Newton's 3rd",f:"F_AB=−F_BA; action-reaction equal, opposite, different bodies"},{t:"Impulse",f:"J=F·Δt=Δp=m(v−u); area under F-t graph"},{t:"Normal on Incline",f:"N=mg cosθ; on rough incline friction f=μN=μmg cosθ"},{t:"Normal in Lift",f:"Lift up a: N=m(g+a); Lift down a: N=m(g−a); free fall: N=0"},{t:"Normal on Curve",f:"At top of loop: mg+N=mv²/r; min speed: v=√(gr) (N=0)"},{t:"Static Friction",f:"fₛ≤μₛN; acts to prevent motion; adjusts to applied force"},{t:"Kinetic Friction",f:"fₖ=μₖN; always kinetic μₖ<μₛ"},{t:"Angle of Friction",f:"tanλ=μ; λ=angle of friction; angle of repose=angle of friction"},{t:"Incline Motion",f:"Down smooth: a=gsinθ; rough: a=g(sinθ−μcosθ); up rough: a=g(sinθ+μcosθ)"},{t:"Banking (no friction)",f:"tanθ=v²/rg; safe speed v=√(rg tanθ)"},{t:"Banking with friction",f:"v_max=√(rg(tanθ+μ)/(1−μtanθ)); v_min=√(rg(tanθ−μ)/(1+μtanθ))"},{t:"Conical Pendulum",f:"tanθ=ω²l sinθ/g; T=2π√(l cosθ/g); h=l cosθ"},{t:"Atwood Machine",f:"a=(m₁−m₂)g/(m₁+m₂); T=2m₁m₂g/(m₁+m₂)"},{t:"Pseudo Force",f:"Non-inertial frame: F_pseudo=−ma₀ (opposing frame's acceleration)"},{t:"Min Force",f:"F_min=μmg/√(1+μ²); optimal angle=tan⁻¹μ below horiz"},{t:"Spring Cut",f:"Spring length L→piece l: k_new=kL/l; shorter=stiffer"},{t:"Banked Road Limits",f:"v_min=√(rg(tanθ−μ)/(1+μtanθ)); v_max=√(rg(tanθ+μ)/(1−μtanθ))"}],
 keyPoints:["FBD: isolate body, draw ALL forces, F_net=ma per direction","Normal force ≠ mg; on incline N=mgcosθ; in lift N=m(g±a)","μₛ>μₖ: need more force to START sliding than to KEEP sliding"],
 mindmap:{root:"Laws of Motion\n& Friction",branches:[{n:"Newton's Laws",col:"#ea580c",nodes:["1st: Inertia","2nd: F=ma","3rd: Action-Reaction","Impulse J=Δp"]},{n:"Friction",col:"#f97316",nodes:["Static fₛ≤μₛN","Kinetic fₖ=μₖN","Angle of Friction","Angle of Repose"]},{n:"Applications",col:"#dc2626",nodes:["Inclined Plane","Banking Roads","Conical Pendulum","Atwood Machine"]},{n:"Non-Inertial",col:"#b45309",nodes:["Pseudo Force −ma","Rotating Frame","Lift Problems","Constraint Eqns"]}]}},

{id:"p3",sub:"physics",name:"Work, Energy, Power & Collisions",weight:"High",est:4, syllabus:[
  {topic:"Work & Energy",subtopics:[
    {name:"Work",concepts:["W=F·d·cosθ=F⃗·d⃗","Work by variable force: W=∫F·dr","Work by spring: W=−½kx²","Work done by gravity: W=mgh","Positive/negative/zero work","Work-energy theorem: W_net=ΔKE"]},
    {name:"Energy & Conservation",concepts:["KE=½mv²=p²/2m","Gravitational PE=mgh","Spring PE=½kx²","Conservation of mechanical energy","With friction: KE₁+PE₁=KE₂+PE₂+W_friction","Power P=Fv cosφ; P=dW/dt"]}
  ]},
  {topic:"Collisions",subtopics:[
    {name:"Types of Collisions",concepts:["Elastic: KE conserved; e=1","Inelastic: KE not conserved; 0<e<1","Perfectly inelastic: bodies stick; e=0","Coefficient of restitution e=(v₂−v₁)/(u₁−u₂)"]},
    {name:"1D Collision Formulas",concepts:["Elastic v₁'=((m₁−m₂)u₁+2m₂u₂)/(m₁+m₂)","Equal mass elastic: velocities exchange","Perfectly inelastic: (m₁+m₂)v=m₁u₁+m₂u₂","KE loss: ½m₁m₂(u₁−u₂)²/(m₁+m₂)","Oblique collision: normal e applies; tangent unchanged","Rocket equation: v=v₀+v_rel·ln(m₀/m)","Force from PE: F=−dU/dx (1D); F⃗=−∇U","General CoR velocities: v₁=(m₁−em₂)u₁+(1+e)m₂u₂)/(m₁+m₂)"]}
  ]}
 ],
 topics:["Work: W=F·d cosθ; W=∫F·dr for variable force","Work-energy theorem: W_net=ΔKE","KE and PE; PE=½kx², spring F=−kx","Conservative vs non-conservative forces","Conservation of mechanical energy; energy with friction","Power: average P=W/t; instantaneous P=F·v","Elastic collision 1D; perfectly inelastic; CoR e","Collision in CM frame; oblique collision","Variable mass: rocket equation"],
 formulas:[{t:"Work Definition",f:"W=F·d·cosθ=F⃗·d⃗; W by variable force=∫F·dr"},{t:"Work-Energy Theorem",f:"W_net=ΔKE=½mv²−½mu²"},{t:"KE",f:"KE=½mv²=p²/2m; p=√(2mKE)"},{t:"Spring PE",f:"U=½kx²; F=−kx (restoring); work by spring=−ΔU=−½kx²"},{t:"Gravitational PE",f:"U=mgh (near earth); U=−GMm/r (general)"},{t:"Conservation of ME",f:"KE+PE=const when only conservative forces act"},{t:"Work by Friction",f:"W_friction=−f_k·d=−μmg·d; always negative (energy lost)"},{t:"Power Average",f:"P_avg=W/t=F·v_avg"},{t:"Power Instantaneous",f:"P=F⃗·v⃗=F·v·cosφ; at constant power: F=P/v (F decreases as v increases)"},{t:"Elastic Collision v₁'",f:"v₁'=((m₁−m₂)u₁+2m₂u₂)/(m₁+m₂)"},{t:"Elastic Collision v₂'",f:"v₂'=((m₂−m₁)u₂+2m₁u₁)/(m₁+m₂)"},{t:"Special Elastic",f:"Equal masses: exchange velocities; m₂ at rest: v₁'=0,v₂'=u₁"},{t:"Perfectly Inelastic",f:"(m₁+m₂)v=m₁u₁+m₂u₂; max KE loss"},{t:"KE Loss Inelastic",f:"ΔKE=½m₁m₂(u₁−u₂)²/(m₁+m₂)"},{t:"Coefficient of Restitution",f:"e=(v₂−v₁)/(u₁−u₂); e=1 elastic; e=0 perfectly inelastic; 0<e<1 partial"},{t:"Velocity after e",f:"v₁'=((m₁−em₂)u₁+(1+e)m₂u₂)/(m₁+m₂)"},{t:"Rocket Equation",f:"v=v₀+v_rel·ln(m₀/m); Thrust=v_rel·(dm/dt)"}],
 keyPoints:["Elastic collision CM frame: speeds unchanged, directions reverse","PE graph for spring: parabola; gravity near earth: linear","Engine: F decreases as v increases at constant power"],
 mindmap:{root:"Work, Energy &\nCollisions",branches:[{n:"Work & Energy",col:"#ea580c",nodes:["W=Fd cosθ","W-E Theorem","KE=½mv²","PE=½kx²"]},{n:"Conservation",col:"#f97316",nodes:["ME=KE+PE=const","With Friction","Conservative Forces","Non-conservative"]},{n:"Power",col:"#dc2626",nodes:["P=Fv cosφ","Engine Power","Efficiency","P=W/t"]},{n:"Collisions",col:"#b45309",nodes:["Elastic e=1","Inelastic e=0","CoR e","Rocket Mass"]}]}},

{id:"p4",sub:"physics",name:"Rotational Motion",weight:"High",est:5, syllabus:[
  {topic:"Moment of Inertia",subtopics:[
    {name:"Standard MI Values",concepts:["Ring (axis ⊥): MR²","Disk (axis ⊥): ½MR²","Solid sphere: 2MR²/5","Hollow sphere: 2MR²/3","Thin rod (center): ML²/12","Thin rod (end): ML²/3","Solid cylinder: ½MR²","Hollow cylinder: MR²"]},
    {name:"Theorems",concepts:["Parallel axis: I=I_cm+Md²","Perpendicular axis (lamina): Iz=Ix+Iy","Radius of gyration: I=Mk²"]}
  ]},
  {topic:"Rotational Dynamics",subtopics:[
    {name:"Torque & Angular Momentum",concepts:["Torque τ=r×F=Iα=dL/dt","Angular momentum L=Iω=r×p","Conservation of L when τ_net=0","Angular impulse=∫τ dt=ΔL","Relation between L and angular velocity"]},
    {name:"Rolling Motion",concepts:["Rolling without slipping: v_cm=Rω; a_cm=Rα","Total KE: ½mv²(1+k²/R²)","Acceleration on incline: gsinθ/(1+k²/R²)","Speed at bottom: √(2gh/(1+k²/R²))","Sphere fastest, ring slowest on incline","Static friction drives rolling — no energy loss"]}
  ]},
  {topic:"Equilibrium",subtopics:[
    {name:"Static Equilibrium",concepts:["ΣF⃗=0 (no translation)","Στ=0 about any point (no rotation)","Couple: equal opposite forces, non-collinear","Toppling: CG beyond pivot edge","Stable, unstable, neutral equilibrium","Toppling condition: τ_weight < τ_applied about pivot ⟹ topples","COM semicircular arc: 2R/π from centre; disc: 4R/3π","COM solid cone: h/4 from base; hollow cone: h/3 from base"]}
  ]}
 ],
 topics:["Moment of inertia I=Σmr²=∫r²dm","MI for ring, disk, solid/hollow sphere, rod","Parallel axis: I=I_cm+Md²; perpendicular axis: Iz=Ix+Iy","Radius of gyration k: I=Mk²","Torque τ=r×F=Iα; angular momentum L=Iω","Conservation of L when τ_net=0","Rotational KE=½Iω²; pure rolling v_cm=Rω","Rolling on incline; sphere>disk>ring","Equilibrium: ΣF=0 AND Στ=0; toppling"],
 formulas:[{t:"MI Ring",f:"I_cm=MR² (about axis through center perpendicular to plane)"},{t:"MI Disk",f:"I_cm=½MR² (perpendicular axis); I_diameter=¼MR²"},{t:"MI Hollow Sphere",f:"I_cm=2MR²/3"},{t:"MI Solid Sphere",f:"I_cm=2MR²/5"},{t:"MI Thin Rod (center)",f:"I_cm=ML²/12"},{t:"MI Thin Rod (end)",f:"I=ML²/3"},{t:"MI Hollow Cylinder",f:"I=MR² (like ring)"},{t:"MI Solid Cylinder",f:"I=½MR² (like disk)"},{t:"Parallel Axis Theorem",f:"I=I_cm+Md²; d=distance between axes"},{t:"Perpendicular Axis",f:"Iz=Ix+Iy (for laminar/planar bodies only)"},{t:"Radius of Gyration",f:"I=Mk²; k=√(I/M)"},{t:"Torque",f:"τ=r×F=|r||F|sinθ; τ=Iα; τ=dL/dt"},{t:"Angular Momentum",f:"L=Iω=r×p; L=mvr (for circular); Conservation: if τ=0, L=const"},{t:"Angular Impulse",f:"Angular impulse=∫τ dt=ΔL"},{t:"Rolling Without Slipping",f:"v_cm=Rω; a_cm=Rα; no energy dissipated at contact"},{t:"Rolling KE",f:"KE=½mv²_cm+½Iω²=½mv²(1+k²/R²)"},{t:"Rolling on Incline",f:"a=gsinθ/(1+I/mR²)=gsinθ/(1+k²/R²)"},{t:"Speed at Bottom",f:"v=√(2gh/(1+k²/R²)); Sphere>Disk>Ring (fastest to slowest)"},{t:"Static Equilibrium",f:"ΣF⃗=0 AND Στ=0 (about any point)"},{t:"Toppling Condition",f:"CG must move beyond pivot; torque of weight about pivot edge"},{t:"Toppling Force",f:"Block height H, base b: topples when F·H>W·b/2; F_crit=Wb/2H"},{t:"COM Arc/Disc",f:"Semicircular arc: 2R/π; Semicircular disc: 4R/(3π); Quarter circle: 4R/(3π) similarly"}],
 keyPoints:["Rolling without slipping: friction is STATIC; no energy loss","Sphere reaches bottom before disk, disk before ring","Conservation L: skater pulls arms → I↓ → ω↑","Toppling: CG must move beyond pivot edge"],
 mindmap:{root:"Rotational\nMotion",branches:[{n:"Moment of Inertia",col:"#ea580c",nodes:["Ring MR²","Disk ½MR²","Sphere 2MR²/5","Parallel & Perp Axis"]},{n:"Dynamics",col:"#f97316",nodes:["Torque τ=Iα","L=Iω=r×p","Conservation L","Angular Impulse"]},{n:"Rolling",col:"#dc2626",nodes:["v_cm=Rω","KE=½mv²(1+I/mR²)","On Incline a","Sphere>Disk>Ring"]},{n:"Equilibrium",col:"#b45309",nodes:["ΣF=0","Στ=0","Couple","Toppling CG"]}]}},

{id:"p5",sub:"physics",name:"Gravitation",weight:"High",est:3, syllabus:[
  {topic:"Gravitation",subtopics:[
    {name:"Newton's Law & Fields",concepts:["F=Gm₁m₂/r²; G=6.67×10⁻¹¹","Gravitational field g=GM/r² (outside sphere)","Inside hollow shell: g=0","Inside solid sphere: g=GMr/R³ (linear)","Gravitational potential V=−GM/r","Potential energy U=−GMm/r"]},
    {name:"Variation of g",concepts:["At height h: g_h≈g(1−2h/R) (h<<R)","At depth d: g_d=g(1−d/R)","Effect of Earth's rotation on g","g_poles > g_equator"]},
    {name:"Kepler's Laws",concepts:["1st: Elliptical orbit, sun at focus","2nd: Equal areas in equal time (L conserved)","3rd: T²∝a³; T₁²/T₂²=(a₁/a₂)³"]}
  ]},
  {topic:"Satellites & Orbital Mechanics",subtopics:[
    {name:"Orbital Motion",concepts:["Orbital speed v₀=√(GM/r)","Time period T=2π√(r³/GM)","KE=GMm/2r; PE=−GMm/r; E=−GMm/2r","Binding energy=GMm/2r","Escape velocity vₑ=√(2gR)≈11.2 km/s","vₑ=v₀√2"]},
    {name:"Geostationary & Special",concepts:["Geostationary: T=24h; h≈36000 km","Geostationary: orbit over equator westward","Weightlessness in orbit: centripetal=gravity","Not zero gravity — apparent weightlessness","Geo-synchronous vs geostationary"]}
  ]}
 ],
 topics:["Newton's law: F=Gm₁m₂/r²","Gravitational field g=GM/r²; inside shell g=0","Gravitational potential V=−GM/r","Variation of g with altitude and depth","Kepler's laws: ellipse, equal areas (L conservation), T²∝r³","Orbital velocity v₀=√(GM/r); escape velocity vₑ=√(2gR)","Satellite energy: KE=GMm/2r; E=−GMm/2r","Geostationary; binding energy; weightlessness"],
 formulas:[{t:"Newton's Grav",f:"F=Gm₁m₂/r²; G=6.67×10⁻¹¹ N·m²/kg²"},{t:"Gravitational Field",f:"g=GM/r² (outside); g=GMr/R³ (inside solid sphere, linear)"},{t:"Inside Shell",f:"g=0 inside hollow shell; V=const=−GM/R inside"},{t:"Gravitational Potential",f:"V=−GM/r (outside sphere); V=−GM(3R²−r²)/(2R³) (inside solid sphere)"},{t:"Potential Energy",f:"U=−GMm/r; U=−GMm(3R²−r²)/(2R³) inside"},{t:"g at Height h",f:"g_h=GM/(R+h)²=g(1−2h/R) approx (h<<R)"},{t:"g at Depth d",f:"g_d=g(1−d/R); zero at center"},{t:"Effect of Rotation",f:"g_eff=g−ω²R cos²λ; max decrease at equator; g poles>g equator"},{t:"Kepler's 1st",f:"Planets orbit sun in ellipses with sun at one focus"},{t:"Kepler's 2nd",f:"Equal areas swept in equal times; L=mvr=const (angular momentum)"},{t:"Kepler's 3rd",f:"T²/a³=4π²/(GM_sun); T₁²/T₂²=(a₁/a₂)³"},{t:"Orbital Velocity",f:"v₀=√(GM/r); at surface v₀≈7.9 km/s; T=2πr/v₀"},{t:"Escape Velocity",f:"vₑ=√(2GM/R)=√(2gR)≈11.2 km/s; vₑ=v₀√2"},{t:"Satellite Energy",f:"KE=GMm/(2r)=½mv²; PE=−GMm/r; Total E=−GMm/(2r)"},{t:"Binding Energy",f:"BE=−E_total=GMm/(2r); energy to take satellite to infinity"},{t:"Geostationary",f:"T=24h; height≈36000 km; v≈3.07 km/s; orbit over equator"},{t:"Period of Satellite",f:"T=2π√(r³/GM); T∝r^(3/2)"}],
 keyPoints:["Inside hollow sphere: g=0 everywhere","Inner orbit → higher speed, shorter period","Kepler's 2nd ↔ conservation of angular momentum","Apparent weightlessness in orbit: NOT zero gravity"],
 mindmap:{root:"Gravitation",branches:[{n:"Field & Potential",col:"#ea580c",nodes:["F=Gm₁m₂/r²","g=GM/r²","g inside linear","V=−GM/r"]},{n:"Kepler's Laws",col:"#f97316",nodes:["1st: Ellipse","2nd: Equal Areas","3rd: T²∝r³","Applications"]},{n:"Satellites",col:"#dc2626",nodes:["v₀=√(GM/r)","vₑ=√(2gR)","Geostationary 24h","Binding Energy"]},{n:"Energy",col:"#b45309",nodes:["E=−GMm/2r","KE=GMm/2r","Weightlessness","g Variation"]}]}},

{id:"p6",sub:"physics",name:"Simple Harmonic Motion",weight:"High",est:3, syllabus:[
  {topic:"Simple Harmonic Motion",subtopics:[
    {name:"Fundamentals",concepts:["Restoring force F=−kx","Differential equation: d²x/dt²=−ω²x","General solution x=Asin(ωt+φ)","ω=√(k/m); T=2π/ω; f=ω/2π","Period independent of amplitude","Phase φ: initial condition"]},
    {name:"Velocity, Acceleration & Energy",concepts:["v=ω√(A²−x²); v_max=Aω at x=0","a=−ω²x; |a|_max=Aω² at x=±A","KE=½mω²(A²−x²)","PE=½mω²x²=½kx²","Total E=½kA²=constant","<KE>=<PE>=E/2 (time averages)"]},
    {name:"Systems",concepts:["Spring-mass: T=2π√(m/k)","Vertical spring: same T=2π√(m/k)","Springs in series: 1/k_eff=Σ(1/kᵢ)","Springs in parallel: k_eff=Σkᵢ","Simple pendulum: T=2π√(l/g)","Physical pendulum: T=2π√(I/Mgl)","Torsional pendulum: T=2π√(I/C)"]}
  ]},
  {topic:"Damped & Forced Oscillations",subtopics:[
    {name:"Resonance",concepts:["Natural frequency ω₀=√(k/m)","Resonance: ω_drive=ω₀","Max amplitude at resonance","Damping reduces amplitude over time","Quality factor Q=ω₀m/b=bandwidth ratio","Underdamped b<2√mk: x=Ae^(−bt/2m)cos(ω't+φ); ω'=√(ω₀²−b²/4m²)","Critical damped b=2√mk: fastest return; x=(A+Bt)e^(−ω₀t)","Overdamped b>2√mk: slow return; two real decaying exponentials","Forced: A=F₀/m/√((ω₀²−ωd²)²+(bωd/m)²); max at ωd=√(ω₀²−b²/2m²)"]}
  ]}
 ],
 topics:["Definition: F=−kx; x=Asin(ωt+φ)","Velocity v=ω√(A²−x²); acceleration a=−ω²x","Energy: KE=½mω²(A²−x²); PE=½kx²; total E=½kA²","Phase; springs series 1/k_eff=Σ1/kᵢ; parallel k_eff=Σkᵢ","Simple pendulum T=2π√(l/g)","Physical pendulum T=2π√(I/Mgl)","Resonance; damped oscillations; superposition"],
 formulas:[{t:"SHM Condition",f:"F=−kx; a=−ω²x; restoring force proportional to displacement"},{t:"General Solution",f:"x=Asin(ωt+φ); A=amplitude; ω=angular frequency; φ=initial phase"},{t:"Velocity",f:"v=Aω cos(ωt+φ)=ω√(A²−x²); v_max=Aω at x=0"},{t:"Acceleration",f:"a=−Aω²sin(ωt+φ)=−ω²x; |a|_max=Aω² at x=±A"},{t:"Time Period",f:"T=2π/ω=2π√(m/k); independent of amplitude"},{t:"KE in SHM",f:"KE=½mω²(A²−x²)=½m(v_max²−v²)"},{t:"PE in SHM",f:"PE=½kx²=½mω²x²"},{t:"Total Energy",f:"E=½kA²=½mω²A²=constant; KE+PE=E always"},{t:"Avg KE & PE",f:"<KE>=<PE>=E/2=¼kA² (time averages equal)"},{t:"Spring-Mass",f:"T=2π√(m/k); k_eff series: 1/k_eff=Σ(1/kᵢ); parallel: k_eff=Σkᵢ"},{t:"Vertical Spring",f:"Equilibrium at x₀=mg/k; SHM about new equilibrium; T=2π√(m/k) same"},{t:"Simple Pendulum",f:"T=2π√(l/g); valid for small θ (θ<15°); independent of mass"},{t:"Pendulum at Height",f:"T=2π√(l/g_eff); increases with altitude (g decreases)"},{t:"Physical Pendulum",f:"T=2π√(I/Mgl_cm); l_cm=dist of CM from pivot"},{t:"Superposition",f:"A_resultant=√(A₁²+A₂²+2A₁A₂cosΔφ); same ω, same direction"},{t:"Resonance",f:"ω_driving=ω₀ (natural freq); max amplitude; energy transfer max"}],
 keyPoints:["At mean x=0: v max, a=0, KE max, PE=0","At extreme x=±A: v=0, |a| max, KE=0, PE max","Vertical spring: equilibrium at mg/k; same T=2π√(m/k)"],
 mindmap:{root:"Simple\nHarmonic Motion",branches:[{n:"SHM Basics",col:"#ea580c",nodes:["a=−ω²x","x=Asin(ωt+φ)","v=ω√(A²−x²)","a_max=Aω²"]},{n:"Energy",col:"#f97316",nodes:["KE=½mω²(A²−x²)","PE=½kx²","E=½kA² const","KE+PE=E"]},{n:"Systems",col:"#dc2626",nodes:["T=2π√(m/k)","Springs Series/Para","Simple Pendulum","Physical Pendulum"]},{n:"Conditions",col:"#b45309",nodes:["Restoring Force","Period Indep Amp","Small Amplitude","Resonance"]}]}},

{id:"p7",sub:"physics",name:"Fluid Mechanics & Surface Tension",weight:"High",est:4, syllabus:[
  {topic:"Elasticity of Solids",subtopics:[{name:"Moduli & Elastic PE",concepts:["Young's Y=longitudinal stress/strain=FL₀/(AΔL); SI: Pa","Shear G=shear stress/shear strain=F/(A·tanθ); tanθ≈θ for small deformation","Bulk B=−ΔP/(ΔV/V); Compressibility=1/B","Poisson ratio σ=−(lateral strain)/(longitudinal strain); 0<σ<0.5","Elastic PE per unit volume: u=½×stress×strain=Y(strain)²/2","For wire: U=½FΔL=½(YA/L)(ΔL)²; equivalent spring const k=YA/L","Relation: Y=2G(1+σ)=3B(1−2σ)"]}]},
  {topic:"Fluid Statics",subtopics:[
    {name:"Pressure & Pascal's Law",concepts:["P=F/A; P=P₀+ρgh","Absolute = gauge + atmospheric","Pascal's law: pressure transmitted equally","Hydraulic press, brakes applications","Manometer: pressure measurement"]},
    {name:"Buoyancy & Floatation",concepts:["Archimedes: F_B=ρ_fluid·V_sub·g","Floating: ρ_obj·V_total=ρ_fluid·V_sub","Fraction submerged=ρ_obj/ρ_fluid","Metacenter & stability of floating bodies"]}
  ]},
  {topic:"Fluid Dynamics",subtopics:[
    {name:"Continuity & Bernoulli",concepts:["Continuity: A₁v₁=A₂v₂ (incompressible)","Bernoulli: P+½ρv²+ρgh=constant","Higher velocity → lower pressure","Torricelli: v=√(2gh) (efflux)","Venturi meter principle","Lift on aircraft wing (Bernoulli)"]},
    {name:"Viscosity",concepts:["Newton's law: F=ηA(dv/dy)","Stokes' law: F=6πηrv","Terminal velocity: v_t=2r²(ρ−ρ_f)g/9η","Poiseuille: Q=πr⁴ΔP/8ηL; Q∝r⁴","Reynolds number: laminar vs turbulent"]}
  ]},
  {topic:"Surface Tension",subtopics:[
    {name:"Basics & Applications",concepts:["T=F/L (force per unit length)","Liquid drop: ΔP=2T/r","Soap bubble: ΔP=4T/r (two surfaces)","Capillary rise: h=2Tcosθ/ρgr","Water: θ<90° rises; mercury: θ>90° falls","Work in blowing bubble: W=8πr²T"]}
  ]}
 ],
 topics:["Pressure: P=P₀+ρgh; Pascal's law; manometer","Archimedes' principle: F_B=ρ_fluid·V_submerged·g","Floating condition; density relation","Equation of continuity A₁v₁=A₂v₂","Bernoulli's equation; Torricelli v=√(2gh)","Viscosity: Newton's law; Stokes F=6πηrv","Terminal velocity; Poiseuille Q=πr⁴ΔP/(8ηL)","Surface tension T=F/L; excess pressure in bubble/drop","Capillary rise h=2Tcosθ/(ρgr)"],
 formulas:[{t:"Pressure",f:"P=F/A; P=P₀+ρgh; absolute pressure=gauge+atm"},{t:"Pascal's Law",f:"Pressure applied to enclosed fluid transmitted equally in all directions"},{t:"Archimedes",f:"F_B=ρ_fluid·V_submerged·g; always=weight of fluid displaced"},{t:"Floating",f:"ρ_obj·V_total=ρ_fluid·V_submerged; for floating: fraction submerged=ρ_obj/ρ_fluid"},{t:"Continuity",f:"A₁v₁=A₂v₂ (incompressible); ρA₁v₁=ρA₂v₂ (compressible)"},{t:"Bernoulli's Equation",f:"P+½ρv²+ρgh=constant along streamline"},{t:"Torricelli",f:"v=√(2gh); efflux speed from hole at depth h below surface"},{t:"Venturi Meter",f:"v₁A₁=v₂A₂; P₁−P₂=½ρ(v₂²−v₁²); flow rate=A₁A₂√(2ΔP/ρ(A₁²−A₂²))"},{t:"Viscosity Force",f:"F=ηA(dv/dy); η=coefficient of viscosity; Pa·s"},{t:"Stokes' Law",f:"F=6πηrv; for small sphere moving through fluid"},{t:"Terminal Velocity",f:"v_t=2r²(ρ_sphere−ρ_fluid)g/(9η)"},{t:"Poiseuille's Law",f:"Q=πr⁴ΔP/(8ηL); flow rate∝r⁴ (very sensitive to radius)"},{t:"Surface Tension",f:"T=F/L; excess pressure inside drop: ΔP=2T/r; inside bubble: ΔP=4T/r (2 surfaces)"},{t:"Capillary Rise",f:"h=2T cosθ/(ρgr); mercury in glass θ>90°: depression; water: rise"},{t:"Young's Modulus",f:"Y=FL₀/(AΔL)=σ_long/ε_long; steel~200 GPa; rubber~0.01 GPa"},{t:"Bulk Modulus",f:"B=−ΔP/(ΔV/V); compressibility K=1/B; water B≈2.2 GPa"},{t:"Shear Modulus",f:"G=shear stress/shear strain; G=Y/2(1+σ)"},{t:"Poisson's Ratio",f:"σ=−lateral strain/longitudinal strain; 0<σ<0.5; cork σ≈0; rubber σ≈0.5"},{t:"Wire as Spring",f:"k_wire=YA/L; U=½kx²=½(YA/L)(ΔL)²"},{t:"Excess Pressure",f:"Soap bubble: ΔP=4T/r; liquid drop: ΔP=2T/r; cavity in liquid: ΔP=2T/r"},{t:"Work Done in Blowing",f:"W=T×ΔA; for soap bubble: W=T×8πr²=8πr²T"}],
 keyPoints:["Bernoulli: higher velocity → lower pressure","Buoyant force=ρ_fluid×V_submerged×g (NOT ρ_object)","Soap has TWO surfaces → 4T/r; liquid drop one → 2T/r","Mercury in glass: depression (θ>90°); water: rise (θ<90°)"],
 mindmap:{root:"Fluid Mechanics\n& Surface Tension",branches:[{n:"Hydrostatics",col:"#ea580c",nodes:["P=P₀+ρgh","Pascal's Law","Buoyancy F_B","Archimedes"]},{n:"Fluid Flow",col:"#f97316",nodes:["Continuity A₁v₁=A₂v₂","Bernoulli Eq","Torricelli √(2gh)","Venturi Meter"]},{n:"Viscosity",col:"#dc2626",nodes:["F=ηA(dv/dy)","Stokes 6πηrv","Terminal Velocity","Poiseuille r⁴"]},{n:"Surface Tension",col:"#b45309",nodes:["T=F/L","Bubble 4T/r","Capillary h=2Tcosθ","Contact Angle"]}]}},

{id:"p8",sub:"physics",name:"Thermal Physics & Thermodynamics",weight:"High",est:5, syllabus:[
  {topic:"Thermal Expansion & Calorimetry",subtopics:[
    {name:"Expansion",concepts:["Linear: ΔL=LαΔT","Area: ΔA=AβΔT; β=2α","Volume: ΔV=VγΔT; γ=3α","Anomalous water: max density at 4°C","Bimetallic strip applications"]},
    {name:"Calorimetry",concepts:["Q=mcΔT; c=specific heat","Q=mL (phase change); latent heat","Principle of calorimetry: heat lost=gained","Specific heat of water=4200 J/kg·K","L_fusion(ice)=336 kJ/kg; L_vap(water)=2260 kJ/kg"]}
  ]},
  {topic:"Heat Transfer",subtopics:[
    {name:"Conduction, Convection, Radiation",concepts:["Fourier conduction: Q/t=kA(ΔT/Δx)","Thermal resistance R=L/kA","Series/parallel thermal resistance","Stefan-Boltzmann: P=σAeT⁴","Wien's law: λ_max·T=2.898×10⁻³ m·K","Newton's law of cooling: T→T₀ exponentially","Kirchhoff's law: good absorber=good emitter"]}
  ]},
  {topic:"Kinetic Theory & Thermodynamics",subtopics:[
    {name:"Kinetic Theory of Gases",concepts:["PV=nRT; R=8.314 J/mol·K","v_rms=√(3RT/M); v_avg=√(8RT/πM); v_mp=√(2RT/M)","KE per molecule=3kT/2","Degrees of freedom f; E=f/2·RT per mole","Cv=f/2·R; Cp=Cv+R; γ=Cp/Cv=1+2/f"]},
    {name:"Laws of Thermodynamics",concepts:["1st Law: ΔU=Q−W; W=PΔV","ΔU=nCvΔT for any process (ideal gas)","Isothermal: ΔU=0; W=nRT ln(V₂/V₁)","Adiabatic: Q=0; PVᵞ=const; TVᵞ⁻¹=const","Isochoric: W=0; Q=ΔU","Isobaric: Q=nCpΔT","Carnot efficiency: η=1−T_cold/T_hot","2nd Law: entropy of universe increases","COP refrigerator=T_cold/(T_hot−T_cold)","Entropy change ideal gas: ΔS=nCv ln(Tf/Ti)+nR ln(Vf/Vi)","Phase transition: ΔS=mL/T (latent heat at const T)","Clausius: ∮dQ/T≤0; =0 for reversible cycle","Mean free path: λ=kT/(√2·π·d²·P)","Maxwell-Boltzmann: v_p:v_avg:v_rms=1:1.128:1.225"]}
  ]}
 ],
 topics:["Thermal expansion: linear α, areal β=2α, volumetric γ=3α","Specific heat Q=mcΔT; latent heat Q=mL; calorimetry","Conduction: Fourier's law; thermal resistance","Radiation: Stefan-Boltzmann P=σAeT⁴; Wien's λ_max·T=b","Newton's law of cooling","Ideal gas PV=nRT; kinetic theory; v_rms=√(3RT/M)","Degrees of freedom; equipartition; γ=1+2/f","Processes: isothermal, adiabatic, isochoric, isobaric","Carnot engine η=1−T_cold/T_hot; refrigerator COP","Entropy (conceptual)"],
 formulas:[{t:"Linear Expansion",f:"ΔL=LαΔT; L'=L(1+αΔT)"},{t:"Area & Volume Expansion",f:"ΔA=AβΔT; β=2α; ΔV=VγΔT; γ=3α"},{t:"Specific Heat",f:"Q=mcΔT; c=specific heat (J/kg·K)"},{t:"Latent Heat",f:"Q=mL; L_fusion(ice)=336 kJ/kg; L_vaporisation(water)=2260 kJ/kg"},{t:"Fourier Conduction",f:"Q/t=−kA(dT/dx); k=thermal conductivity; dT/dx=temp gradient"},{t:"Thermal Resistance",f:"R=L/(kA); series: R_eff=ΣR; parallel: 1/R_eff=Σ(1/R)"},{t:"Stefan-Boltzmann",f:"P=σAeT⁴; σ=5.67×10⁻⁸ W/m²K⁴; e=emissivity (0 to 1)"},{t:"Wien's Displacement",f:"λ_max·T=2.898×10⁻³ m·K; hotter body→shorter λ_max"},{t:"Newton's Cooling",f:"dT/dt=−k(T−T₀); approx: T̄ is mean temp; T_final approached exponentially"},{t:"Kinetic Theory",f:"PV=nRT; R=8.314; P=⅓ρ<v²>=⅓(Nm/V)<v²>"},{t:"v_rms",f:"v_rms=√(3RT/M)=√(3P/ρ); v_avg=√(8RT/πM); v_mp=√(2RT/M)"},{t:"Speed Ratios",f:"v_rms:v_avg:v_mp=√3:√(8/π):√2≈1.73:1.60:1.41"},{t:"KE per molecule",f:"KE_avg=½m<v²>=3kT/2=3RT/(2Nₐ); k=1.38×10⁻²³ J/K"},{t:"Equipartition",f:"Each DOF contributes ½kT to energy; CV=f/2·R; γ=Cp/CV=1+2/f"},{t:"First Law",f:"ΔU=Q−W; W=∫PdV; Q=nCΔT"},{t:"Processes",f:"Isothermal: ΔU=0; Adiabatic: Q=0,PVᵞ=const; Isochoric: W=0; Isobaric: Q=nCpΔT"},{t:"Adiabatic Relations",f:"TVᵞ⁻¹=const; T²Pˢ⁻¹=const (s=γ); W=nCv(T₁−T₂)=P₁V₁−P₂V₂/(γ−1)"},{t:"Carnot Efficiency",f:"η=1−T_cold/T_hot (max possible); η_carnot>η_any irreversible"},{t:"Refrigerator COP",f:"COP=Q_cold/W=T_cold/(T_hot−T_cold)=1/η−1"},{t:"Entropy Ideal Gas",f:"ΔS=nCv·ln(Tf/Ti)+nR·ln(Vf/Vi); path-independent state function"},{t:"Entropy Phase Change",f:"ΔS=mL/T; melting ice: ΔS=m×336000/273 J/K"},{t:"Mean Free Path",f:"λ=kT/(√2·πd²P)=1/(√2·πd²n); n=number density N/V"},{t:"Polytropic",f:"PVⁿ=const; molar heat C=Cv+R/(1−n); n=0 isobaric; n=γ adiabatic; n=1 isothermal; n=∞ isochoric"}],
 keyPoints:["ΔU=nCvΔT for ANY process for ideal gas","Adiabatic curve steeper than isothermal on P-V diagram","v_rms>v_avg>v_mp; all ∝√(T/M)","Anomalous expansion of water: maximum density at 4°C"],
 mindmap:{root:"Thermal Physics\n& Thermodynamics",branches:[{n:"Heat Transfer",col:"#ea580c",nodes:["Conduction Fourier","Stefan-Boltzmann T⁴","Wien λ_max·T=b","Newton's Cooling"]},{n:"Kinetic Theory",col:"#f97316",nodes:["v_rms=√(3RT/M)","v_avg, v_mp","KE=3kT/2","Degrees of Freedom"]},{n:"Processes",col:"#dc2626",nodes:["Isothermal","Adiabatic PVᵞ=const","Isochoric W=0","ΔU=nCvΔT always"]},{n:"Engines",col:"#b45309",nodes:["Carnot η=1−Tc/Th","Refrigerator COP","2nd Law","Entropy ΔS≥0"]}]}},

{id:"p9",sub:"physics",name:"Waves & Sound",weight:"High",est:4, syllabus:[
  {topic:"Wave Motion",subtopics:[
    {name:"Basic Wave Properties",concepts:["y=Asin(kx−ωt+φ); k=2π/λ; ω=2πf","Wave speed v=fλ=ω/k","Transverse vs longitudinal waves","v_string=√(T/μ); v_sound=√(γRT/M)","Sound ≈344 m/s at 20°C","Intensity I=½ρω²A²v; I∝A²; I∝1/r²"]},
    {name:"Superposition & Interference",concepts:["Superposition principle","Constructive: Δ=nλ","Destructive: Δ=(2n+1)λ/2","Standing waves: y=2Asin(kx)cos(ωt)","Node separation=λ/2; node to antinode=λ/4","Phase change π on reflection from denser"]}
  ]},
  {topic:"Sound Waves",subtopics:[
    {name:"Resonance in Pipes & Strings",concepts:["String (fixed-fixed): fₙ=nv/2L (all harmonics)","Open pipe: fₙ=nv/2L (all harmonics)","Closed pipe: fₙ=(2n−1)v/4L (odd only)","Beats: f_beat=|f₁−f₂|","End correction in pipes"]},
    {name:"Doppler Effect",concepts:["Observer moves toward source: f'=f(v+v₀)/v","Observer moves away: f'=f(v−v₀)/v","Source moves toward: f'=fv/(v−vₛ)","Source moves away: f'=fv/(v+vₛ)","Sound level: β=10log(I/I₀) dB; I₀=10⁻¹²"]}
  ]}
 ],
 topics:["Wave equation y=Asin(kx−ωt+φ); speed v=fλ=ω/k","Wave speed: v_string=√(T/μ); v_sound=√(γRT/M)","Superposition; interference; standing waves","String fixed-fixed: fₙ=nv/2L (all harmonics)","Open pipe: fₙ=nv/2L; closed pipe: fₙ=(2n−1)v/4L (odd only)","Beats: f_beat=|f₁−f₂|","Doppler effect: all four cases","Sound intensity I∝A²; level β=10log(I/I₀)"],
 formulas:[{t:"Wave Equation",f:"y=Asin(kx−ωt+φ); k=2π/λ (wave number); ω=2πf"},{t:"Wave Speed",f:"v=fλ=ω/k; v_string=√(T/μ); v_sound=√(γP/ρ)=√(γRT/M)"},{t:"Sound Speed",f:"v≈331+0.6T m/s (T in°C); v≈344 m/s at 20°C"},{t:"Intensity",f:"I=P/A=½ρω²A²v; I∝A²; I∝1/r² (point source)"},{t:"Sound Level",f:"β=10log₁₀(I/I₀) dB; I₀=10⁻¹² W/m²; 10dB up: I×10"},{t:"Superposition",f:"y=y₁+y₂; interference: Δ=nλ constructive; Δ=(2n+1)λ/2 destructive"},{t:"Standing Waves",f:"y=2Asin(kx)cos(ωt); nodes at kx=nπ; antinodes at kx=(2n+1)π/2"},{t:"String Fixed-Fixed",f:"fₙ=nv/(2L); n=1,2,3,…; fundamental f₁=v/2L; all harmonics"},{t:"Open Pipe",f:"fₙ=nv/(2L); all harmonics; same formula as fixed-fixed string"},{t:"Closed Pipe",f:"fₙ=(2n−1)v/(4L); n=1,2,3,…; only odd harmonics"},{t:"Beats",f:"f_beat=|f₁−f₂|; beat period=1/f_beat; amplitude oscillates between 0 and 2A"},{t:"Doppler (observer moves)",f:"f'=f(v±v₀)/v; + when approaching; − when receding"},{t:"Doppler (source moves)",f:"f'=fv/(v∓vₛ); − when source approaches; + when receding"},{t:"Doppler General",f:"f'=f(v±v₀)/(v∓vₛ); sign: + numerator approach; − numerator recede"},{t:"Node/Antinode",f:"Node separation=λ/2; Node to nearest antinode=λ/4"},{t:"Phase Change",f:"Reflection at fixed/denser medium: phase change π; at free/rarer: no change"}],
 keyPoints:["Node separation=λ/2; node to nearest antinode=λ/4","Open: all harmonics; closed: odd harmonics only","Phase change of π on reflection from fixed/denser medium"],
 mindmap:{root:"Waves & Sound",branches:[{n:"Wave Basics",col:"#ea580c",nodes:["y=Asin(kx−ωt)","v=fλ=ω/k","v_string=√(T/μ)","v_sound"]},{n:"Standing Waves",col:"#f97316",nodes:["Nodes/Antinodes","String fₙ=nv/2L","Open Pipe All","Closed Pipe Odd"]},{n:"Sound",col:"#dc2626",nodes:["Beats |f₁−f₂|","Doppler Effect","Intensity dB","End Correction"]},{n:"Superposition",col:"#b45309",nodes:["Constructive Δ=nλ","Destructive","Coherence","Standing Formation"]}]}},

{id:"p10",sub:"physics",name:"Ray Optics",weight:"High",est:4, syllabus:[
  {topic:"Reflection & Refraction",subtopics:[
    {name:"Mirrors",concepts:["Laws of reflection","Mirror formula: 1/v+1/u=1/f=2/R","Magnification m=−v/u","Real image: m<0; virtual: m>0","Focal length = R/2","Sign convention: all from pole"]},
    {name:"Refraction",concepts:["Snell's law: n₁sinθ₁=n₂sinθ₂","Refractive index n=c/v","Critical angle: sinθ_c=n₂/n₁","Total internal reflection (TIR): θ>θ_c denser→rarer","Apparent depth: d'=d·n₂/n₁","Refraction at spherical surface: n₂/v−n₁/u=(n₂−n₁)/R"]}
  ]},
  {topic:"Lenses & Optical Instruments",subtopics:[
    {name:"Thin Lenses",concepts:["Lens formula: 1/v−1/u=1/f","Magnification: m=v/u","Power: P=1/f (Dioptre)","Lensmaker: 1/f=(n−1)(1/R₁−1/R₂)","Combined lenses: 1/f_eff=1/f₁+1/f₂","Converging lens f>0; diverging f<0"]},
    {name:"Prism & Instruments",concepts:["Deviation by prism: δ=A(n−1) for small A","Min deviation: n=sin((A+δₘ)/2)/sin(A/2)","Chromatic aberration: violet deviates more","Compound microscope: m=L/f_o×D/f_e","Telescope: m=f_o/f_e","Eye defects: myopia, hypermetropia, astigmatism"]}
  ]}
 ],
 topics:["Laws of reflection; plane mirror images","Spherical mirrors: 1/v+1/u=1/f=2/R; m=−v/u","Refraction: Snell's law n₁sinθ₁=n₂sinθ₂","TIR: critical angle sinθ_c=n₂/n₁; optical fibers","Lens formula 1/v−1/u=1/f; m=v/u; P=1/f (Diopters)","Lensmaker's equation; combination of lenses","Prism: minimum deviation; dispersion","Eye defects: myopia, hypermetropia","Compound microscope; astronomical telescope"],
 formulas:[{t:"Mirror Formula",f:"1/v+1/u=1/f=2/R; sign convention: distances from pole"},{t:"Mirror Magnification",f:"m=−v/u=h'/h; m>0 virtual erect; m<0 real inverted"},{t:"Snell's Law",f:"n₁sinθ₁=n₂sinθ₂; n=c/v=speed of light in vacuum/medium"},{t:"Critical Angle",f:"sinθ_c=n₂/n₁; TIR when θ>θ_c AND light goes denser→rarer"},{t:"Apparent Depth",f:"d'=d·(n₂/n₁); apparent shift=d(1−1/n)"},{t:"Refraction at Surface",f:"n₂/v−n₁/u=(n₂−n₁)/R (single spherical surface)"},{t:"Lens Formula",f:"1/v−1/u=1/f"},{t:"Lens Magnification",f:"m=v/u=h'/h; m>0 same side as object"},{t:"Power",f:"P=1/f (in metres); unit Dioptre (D); P=+ve converging; −ve diverging"},{t:"Lensmaker's Equation",f:"1/f=(n−1)(1/R₁−1/R₂); n=refractive index of lens"},{t:"Lens in Medium",f:"1/f=(n_L/n_m−1)(1/R₁−1/R₂); f changes with medium"},{t:"Combined Lenses",f:"1/f_eff=1/f₁+1/f₂ (in contact); P_eff=P₁+P₂"},{t:"Lenses Separated",f:"1/f_eff=1/f₁+1/f₂−d/(f₁f₂); d=separation"},{t:"Prism Deviation",f:"δ=A(n−1) for small angle A; min deviation: r₁=r₂=A/2"},{t:"Prism Min Deviation",f:"n=sin((A+δ_m)/2)/sin(A/2); refraction symmetric at min deviation"},{t:"Dispersion",f:"ω=(n_V−n_R)/(n_mean−1); dispersive power"},{t:"Compound Microscope",f:"m=m_o×m_e=(L/f_o)×(1+D/f_e); L=tube length≈distance between lenses"},{t:"Telescope",f:"m=f_o/f_e (normal adjustment); tube length=f_o+f_e"}],
 keyPoints:["Mirror: u always negative for real object","Lens: real image has positive v","TIR: denser→rarer AND θ>θ_c","Chromatic aberration: violet deviates more (higher n)"],
 mindmap:{root:"Ray Optics",branches:[{n:"Mirrors",col:"#ea580c",nodes:["1/v+1/u=1/f","m=−v/u","Real vs Virtual","Sign Convention"]},{n:"Refraction",col:"#f97316",nodes:["Snell's Law","TIR Critical Angle","Spherical Surface","Optical Fibers"]},{n:"Lenses",col:"#dc2626",nodes:["1/v−1/u=1/f","m=v/u","P=1/f Diopter","Lensmaker's"]},{n:"Instruments",col:"#b45309",nodes:["Prism Min Dev","Compound Microscope","Telescope f_o/f_e","Eye Defects"]}]}},

{id:"p11",sub:"physics",name:"Wave Optics",weight:"High",est:3, syllabus:[
  {topic:"Wave Optics",subtopics:[
    {name:"Interference — YDSE",concepts:["Huygens' principle: secondary wavelets","Coherent sources needed for sustained interference","Fringe width: β=λD/d","Path difference: Δ=dy/D","Bright fringes: Δ=nλ; dark: Δ=(2n+1)λ/2","Intensity: I=4I₀cos²(πdy/λD)","Slab insertion: shift=(μ−1)t; β unchanged","Thin film interference"]},
    {name:"Diffraction & Polarization",concepts:["Single slit: minima at asinθ=mλ","Central max width = 2λD/a","Diffraction grating: dsinθ=nλ","Rayleigh criterion: θ_min=1.22λ/D","Malus's law: I=I₀cos²θ","Brewster's law: tanθ_B=n","Reflected ray fully polarized at Brewster angle","Unpolarized → polarizer: I=I₀/2"]}
  ]}
 ],
 topics:["Huygens' principle: secondary wavelets, wavefront","YDSE: fringe width β=λD/d; path difference Δ=dy/D","Effect of glass slab: fringes shift toward slab","Single slit diffraction: central max width 2λD/a","Diffraction grating: d sinθ=nλ; Rayleigh criterion 1.22λ/D","Polarization: Malus's law I=I₀cos²θ; Brewster tanθ_B=n"],
 formulas:[{t:"YDSE Fringe Width",f:"β=λD/d; D=screen dist; d=slit separation; β∝λ,D; β∝1/d"},{t:"Path Difference",f:"Δ=dy/D (for small θ); Δ=dsinθ (exact)"},{t:"Constructive Interference",f:"Δ=nλ; n=0,±1,±2,…; bright fringe at y=nλD/d"},{t:"Destructive Interference",f:"Δ=(2n+1)λ/2; dark fringe at y=(2n+1)λD/2d"},{t:"Intensity YDSE",f:"I=I₀cos²(δ/2); δ=2πΔ/λ; I=4I₀cos²(πdy/λD) for equal intensity sources"},{t:"Slab Shift",f:"Δ=(μ−1)t shifts path; fringe shift=(μ−1)t/β fringes (toward slab); β unchanged"},{t:"Intensity with Slab",f:"Central maximum shifts; intensity distribution same shape"},{t:"Single Slit Minima",f:"asinθ=mλ; m=±1,±2,…; central max width=2λD/a"},{t:"Single Slit Secondary",f:"Maxima approximately at asinθ=(2m+1)λ/2; secondary max intensity∝1/m²π²"},{t:"Diffraction Grating",f:"dsinθ=nλ; d=grating spacing; max order n_max=d/λ"},{t:"Rayleigh Criterion",f:"θ_min=1.22λ/D; D=aperture diameter; resolving power"},{t:"Malus's Law",f:"I=I₀cos²θ; θ=angle between polarisation and analyser axis"},{t:"Brewster's Law",f:"tanθ_B=n; θ_B+θ_r=90°; reflected ray fully polarised"},{t:"Unpolarised through Polariser",f:"I=I₀/2 after first polariser; then Malus's law"},{t:"Coherence",f:"Coherent sources: constant phase difference; essential for sustained interference"},{t:"Thin Film Interference",f:"Path diff=2μt cosθ; +λ/2 for each reflection from denser medium"}],
 keyPoints:["Slab: ALL fringes shift; fringe width unchanged","Central max width=twice other maxima in single slit","Unpolarized→polarizer: I=I₀/2; then→analyzer: I₀/2·cos²θ","Violet innermost in white light YDSE (smallest λ)"],
 mindmap:{root:"Wave Optics",branches:[{n:"Interference",col:"#ea580c",nodes:["YDSE β=λD/d","Δ=dy/D","4I₀cos²","Slab Shift"]},{n:"Diffraction",col:"#f97316",nodes:["Single Slit asinθ=nλ","Central 2λD/a","Grating d sinθ=nλ","Rayleigh 1.22λ/D"]},{n:"Polarization",col:"#dc2626",nodes:["Malus I=I₀cos²θ","Brewster tanθ=n","Polarizer I₀/2","Applications"]},{n:"Concepts",col:"#b45309",nodes:["Huygens Principle","Coherence","Interference vs Diff","Holography"]}]}},

{id:"p12",sub:"physics",name:"Electrostatics & Capacitors",weight:"High",est:5, syllabus:[
  {topic:"Electrostatics",subtopics:[
    {name:"Coulomb's Law & Electric Field",concepts:["F=kq₁q₂/r²; k=9×10⁹","Superposition principle","E=kq/r² for point charge","Field of dipole: E_axial=2kp/r³","Field of infinite sheet: E=σ/2ε₀","Field inside conductor=0"]},
    {name:"Gauss's Law",concepts:["∮E⃗·dA⃗=q_enc/ε₀","Apply by symmetry: sphere, cylinder, plane","E outside sphere: kQ/r²; inside conductor: 0","Inside insulating sphere: kQr/R³"]},
    {name:"Electric Potential",concepts:["V=kq/r; E=−dV/dr","Potential of dipole: V=kpcosθ/r²","Equipotential surfaces ⊥ field lines","Potential energy U=kq₁q₂/r","Work W=q(V_A−V_B)"]}
  ]},
  {topic:"Capacitors",subtopics:[
    {name:"Capacitance",concepts:["C=Q/V; C_pp=ε₀A/d","With dielectric: C=Kε₀A/d","Series: 1/C_eff=Σ(1/Cᵢ)","Parallel: C_eff=ΣCᵢ","Energy: U=½CV²=Q²/2C","Energy density: u=½ε₀E²","Polarization P⃗=ε₀χeE⃗; κ=1+χe; bound charge σ_b=P cosθ","Field inside dielectric: E=E_free/κ; D=κε₀E (displacement vector)","Const Q + dielectric: V↓κ times, E↓κ, U↓κ","Const V + dielectric: Q↑κ, C↑κ, U↑κ"]},
    {name:"RC Circuits",concepts:["Charging: q=CV(1−e^(−t/RC))","Discharging: q=Q₀e^(−t/RC)","Time constant τ=RC","Current: i=I₀e^(−t/RC)","Energy stored in capacitor"]}
  ]}
 ],
 topics:["Coulomb's law; superposition principle","Electric field: point charge, dipole, ring, disk, infinite sheet, sphere","Gauss's law ∮E·dA=q_enc/ε₀ and applications","Electric potential: point charge, sphere, dipole","Equipotential surfaces; potential energy","Capacitance: C=Q/V; parallel plate C=ε₀A/d","Dielectrics: dielectric constant K","Combinations: series and parallel; energy U=½CV²","RC circuit: charging q=CV(1−e^-t/τ); energy density u=½ε₀E²"],
 formulas:[{t:"Coulomb's Law",f:"F=kq₁q₂/r²; k=1/(4πε₀)=9×10⁹ N·m²/C²; ε₀=8.85×10⁻¹² C²/(N·m²)"},{t:"Electric Field",f:"E=kq/r²; E=F/q₀; superposition: E_net=ΣEᵢ"},{t:"Field of Dipole",f:"E_axial=2kp/r³; E_equatorial=kp/r³; p=q·d (dipole moment)"},{t:"Gauss's Law",f:"∮E⃗·dA⃗=q_enc/ε₀; choose Gaussian surface by symmetry"},{t:"Field of Infinite Sheet",f:"E=σ/(2ε₀); for conductor: E=σ/ε₀ just outside"},{t:"Field of Sphere",f:"Outside: E=kQ/r²; inside conductor: E=0; inside insulator: E=kQr/R³"},{t:"Electric Potential",f:"V=kq/r; W=q₀(V_A−V_B)=−ΔPE; E=−dV/dr (1D)"},{t:"Potential of Dipole",f:"V=kp cosθ/r²"},{t:"Equipotential",f:"No work done moving charge on equipotential; E⊥equipotential surface"},{t:"Potential Energy",f:"U=kq₁q₂/r; for system: U=½Σqᵢvᵢ"},{t:"Capacitance",f:"C=Q/V; C_pp=ε₀A/d; C_sphere=4πε₀R"},{t:"Capacitor with Dielectric",f:"C=KC₀=Kε₀A/d; K=dielectric constant≥1"},{t:"Series Capacitors",f:"1/C_eff=1/C₁+1/C₂+…; same Q; voltages add"},{t:"Parallel Capacitors",f:"C_eff=C₁+C₂+…; same V; charges add"},{t:"Energy Stored",f:"U=½CV²=Q²/(2C)=½QV"},{t:"Energy Density",f:"u=½ε₀E²=½ε₀K²(V/d)²; J/m³"},{t:"RC Charging",f:"q=C·V(1−e^(−t/RC)); i=V/R·e^(−t/RC); τ=RC"},{t:"RC Discharging",f:"q=Q₀e^(−t/RC); i=I₀e^(−t/RC); τ=RC"},{t:"Dielectric Polarization",f:"P=ε₀χeE; bound surface charge σ_b=P cosθ; κ=1+χe=εr"},{t:"Dielectric Insertion",f:"Const Q: E,V,U all ↓by κ; Const V (battery): Q,C,U all ↑by κ"}],
 keyPoints:["Inside conductor: E=0; surface equipotential","Constant Q + dielectric: V↓, C↑, U↓","Constant V (battery) + dielectric: Q↑, C↑, U↑"],
 mindmap:{root:"Electrostatics\n& Capacitors",branches:[{n:"Field & Law",col:"#ea580c",nodes:["F=kq₁q₂/r²","E=kq/r²","Gauss's Law","Field Configs"]},{n:"Potential",col:"#f97316",nodes:["V=kq/r","E=−dV/dr","Equipotentials","U=kq₁q₂/r"]},{n:"Capacitors",col:"#dc2626",nodes:["C=ε₀A/d","Series/Parallel","Dielectric K","U=½CV²"]},{n:"RC Circuits",col:"#b45309",nodes:["τ=RC","Charging 1−e^-t/τ","Discharging e^-t/τ","Energy density"]}]}},

{id:"p13",sub:"physics",name:"Current Electricity",weight:"High",est:4, syllabus:[
  {topic:"Current Electricity",subtopics:[
    {name:"Basic Concepts",concepts:["I=nAev_d (drift velocity)","Ohm's law V=IR; R=ρL/A","Resistivity ρ; conductivity σ=1/ρ","ρ=ρ₀(1+αΔT); metals α>0; semiconductors α<0","Series R: R_eff=ΣRᵢ","Parallel R: 1/R_eff=Σ(1/Rᵢ)"]},
    {name:"EMF & Circuits",concepts:["EMF ε; internal resistance r","Terminal voltage V=ε−Ir (discharging)","V=ε+Ir (charging)","KVL: ΣV=0 around closed loop","KCL: ΣI=0 at junction","Wheatstone bridge: P/Q=R/S when balanced"]},
    {name:"Power & Instruments",concepts:["Power P=VI=I²R=V²/R","Joule's heating: H=I²Rt","Max power transfer: R_load=r_internal","Ammeter: low R in series","Voltmeter: high R in parallel","Potentiometer: comparison of EMFs","Meter bridge: R/S=l/(100−l)"]}
  ]}
 ],
 topics:["Current I=nAev_d; Ohm's law V=IR; resistivity ρ=RA/L","Temperature: ρ=ρ₀(1+αΔT)","EMF, terminal voltage V=ε−Ir; series/parallel resistors","Kirchhoff's voltage law (KVL) and current law (KCL)","Wheatstone bridge P/Q=R/S; meter bridge; potentiometer","Joule's law P=I²R=V²/R; maximum power transfer"],
 formulas:[{t:"Current",f:"I=dq/dt=nAev_d; n=carrier density; A=area; v_d=drift velocity"},{t:"Ohm's Law",f:"V=IR; R=ρL/A; ρ=resistivity; σ=1/ρ=conductivity"},{t:"Temperature Dependence",f:"ρ=ρ₀(1+αΔT); metals: α>0; semiconductors: α<0"},{t:"Resistors in Series",f:"R_eff=R₁+R₂+…; same I; voltages add"},{t:"Resistors in Parallel",f:"1/R_eff=1/R₁+1/R₂+…; same V; currents add"},{t:"EMF & Internal Resistance",f:"ε=V_terminal+Ir; V=ε−Ir (discharging); V=ε+Ir (charging)"},{t:"KVL",f:"ΣV=0 around any closed loop (sum of EMFs=sum of voltage drops)"},{t:"KCL",f:"ΣI=0 at any junction (current in=current out)"},{t:"Wheatstone Bridge",f:"P/Q=R/S when balanced; no current through galvanometer"},{t:"Meter Bridge",f:"R/S=l/(100−l); l=balance length from left"},{t:"Potentiometer",f:"Comparison: ε₁/ε₂=l₁/l₂; internal resistance: r=R(l₁/l₂−1)"},{t:"Power",f:"P=VI=I²R=V²/R; P_battery=εI; P_internal=I²r"},{t:"Joule's Law",f:"H=I²Rt (heat generated); efficiency=P_useful/P_total"},{t:"Max Power Transfer",f:"P_max when R_load=r (internal resistance); P_max=ε²/(4r)"},{t:"Cell Combinations",f:"n series: EMF=nε; r_eff=nr; m parallel: EMF=ε; r_eff=r/m; mn mixed: r_eff=nr/m"},{t:"Drift Velocity",f:"v_d=eEτ/m; μ=v_d/E=eτ/m (mobility)"}],
 keyPoints:["Metals: α positive; semiconductors: α negative","Ammeter: low R, series; voltmeter: high R, parallel","KVL: crossing EMF − to +: positive; crossing R in I direction: negative"],
 mindmap:{root:"Current\nElectricity",branches:[{n:"Basics",col:"#ea580c",nodes:["I=nAev_d","V=IR Ohm","ρ=ρ₀(1+αΔT)","EMF Terminal V"]},{n:"Circuits",col:"#f97316",nodes:["KVL ΣV=0","KCL ΣI=0","Series/Parallel R","Wheatstone Bridge"]},{n:"Power",col:"#dc2626",nodes:["P=I²R=V²/R","Joule's Law","Ammeter/Voltmeter","Potentiometer"]},{n:"Advanced",col:"#b45309",nodes:["Max Power Transfer","Star-Delta","Network Theorems","Meter Bridge"]}]}},

{id:"p14",sub:"physics",name:"Magnetism & EMI",weight:"High",est:5, syllabus:[
  {topic:"Magnetic Effects of Current",subtopics:[
    {name:"Magnetic Force",concepts:["Lorentz: F=q(v×B); F=qvBsinθ","Circular orbit: r=mv/qB; T=2πm/qB","T independent of speed (cyclotron)","Diamagnetic: χ<0, μr<1; feebly repelled (Bi, Cu, water, N₂)","Paramagnetic: χ>0 small, μr>1; feebly attracted (Al, O₂, Pt); Curie law χ∝1/T","Ferromagnetic: χ>>1; hysteresis; saturation; Curie temp T_c (Fe:1043K)","Magnetization M; B=μ₀(H+M)=μ₀μrH; χ=M/H","Force on wire: F=BIl sinθ","Force between parallel wires: F/L=μ₀I₁I₂/2πd"]},
    {name:"Biot-Savart & Ampere",concepts:["Biot-Savart: dB=μ₀Idl×r̂/4πr²","Long straight wire: B=μ₀I/2πr","Circular loop at center: B=μ₀I/2R","Solenoid: B=μ₀nI (inside; uniform)","Toroid: B=μ₀NI/2πr","Ampere's law: ∮B⃗·dl⃗=μ₀I_enc"]}
  ]},
  {topic:"Electromagnetic Induction",subtopics:[
    {name:"Faraday & Lenz",concepts:["Faraday: ε=−dΦ/dt; Φ=BAcosθ","Lenz's law: induced current opposes change in flux","Motional EMF: ε=Blv","Rotating rod: ε=½BωL²","Self inductance: ε=−LdI/dt","Mutual inductance: ε₂=−MdI₁/dt"]},
    {name:"AC Circuits",concepts:["X_L=ωL; X_C=1/ωC","Impedance: Z=√(R²+(X_L−X_C)²)","Resonance: ω₀=1/√(LC); Z=R","Power: P=V_rms·I_rms·cosφ","Power factor cosφ=R/Z","Transformer: V₁/V₂=N₁/N₂=I₂/I₁","LR time constant: τ=L/R; energy U=½LI²"]}
  ]}
 ],
 topics:["Lorentz force F=q(v×B); circular orbit r=mv/qB (T indep of v)","Biot-Savart law; Ampere's law; long wire, loop, solenoid","Force between parallel current wires","Faraday's law ε=−dΦ/dt; Lenz's law","Motional EMF ε=Blv; rotating rod ε=½BωL²","Self inductance L; LR circuit τ=L/R; energy U=½LI²","AC: RMS values; X_L=ωL; X_C=1/(ωC)","LCR series: Z; resonance ω₀=1/√(LC); power factor cosφ","Transformer V₁/V₂=N₁/N₂"],
 formulas:[{t:"Lorentz Force",f:"F⃗=q(E⃗+v⃗×B⃗); magnetic: F=qvBsinθ; direction by right-hand rule"},{t:"Circular Orbit in B",f:"r=mv/(qB); T=2πm/(qB); ω=qB/m; T independent of v (cyclotron principle)"},{t:"Biot-Savart Law",f:"dB=μ₀I dl×r̂/(4πr²); μ₀=4π×10⁻⁷ T·m/A"},{t:"Long Straight Wire",f:"B=μ₀I/(2πr)"},{t:"Circular Loop at Center",f:"B=μ₀I/(2R)"},{t:"Solenoid",f:"B=μ₀nI; n=turns/length; uniform inside; zero outside"},{t:"Toroid",f:"B=μ₀NI/(2πr); N=total turns; r=mean radius"},{t:"Ampere's Law",f:"∮B⃗·dl⃗=μ₀I_enc; choose Amperian loop by symmetry"},{t:"Force Between Wires",f:"F/L=μ₀I₁I₂/(2πd); attract if same direction; repel if opposite"},{t:"Magnetic Dipole",f:"m⃗=NIA n̂; τ=m⃗×B⃗; U=−m⃗·B⃗; B_axial=μ₀m/(2πr³)"},{t:"Faraday's Law",f:"ε=−dΦ/dt; Φ=∫B⃗·dA⃗=BAcosθ"},{t:"Lenz's Law",f:"Induced current opposes CHANGE in flux (not flux itself)"},{t:"Motional EMF",f:"ε=Blv; rotating rod: ε=½BωL²; flux=½BL²ωt"},{t:"Self Inductance",f:"L=NΦ/I; ε=−L·dI/dt; LR: τ=L/R; I=I₀(1−e^(−t/τ))"},{t:"Mutual Inductance",f:"M=N₂Φ₂₁/I₁; ε₂=−M·dI₁/dt; M=μ₀N₁N₂A/l (solenoids)"},{t:"Energy in Inductor",f:"U=½LI²; energy density u=B²/(2μ₀)"},{t:"AC Reactances",f:"X_L=ωL; X_C=1/(ωC); impedance Z=√(R²+(X_L−X_C)²)"},{t:"LCR Resonance",f:"ω₀=1/√(LC); at resonance: Z=R; V_L=V_C; I_max=V/R"},{t:"AC Power",f:"P=V_rms·I_rms·cosφ; cosφ=R/Z (power factor); φ=tan⁻¹((X_L−X_C)/R)"},{t:"Transformer",f:"V₁/V₂=N₁/N₂=I₂/I₁ (ideal); step up: N₂>N₁"},{t:"Magnetic Materials",f:"Dia: χ<0,μr<1; Para: χ>0 small; Ferro: χ>>1; Curie law: χ=C/T (para)"},{t:"Magnetization",f:"M=χH; B=μ₀(H+M)=μ₀μrH; χ=μr−1; ferro: hysteresis, retentivity, coercivity"}],
 keyPoints:["Cyclotron: T independent of speed","Lenz's law: opposes CHANGE IN FLUX (not flux itself)","At LCR resonance: V_L=V_C (may be>>V_source)","Magnetic force never does work"],
 mindmap:{root:"Magnetism\n& EMI",branches:[{n:"Magnetic Force",col:"#ea580c",nodes:["F=q(v×B)","r=mv/qB","F=IL×B","Force Btw Wires"]},{n:"Biot-Savart",col:"#f97316",nodes:["Long Wire μ₀I/2πr","Loop μ₀I/2R","Solenoid μ₀nI","Ampere's Law"]},{n:"EMI",col:"#dc2626",nodes:["Faraday ε=−dΦ/dt","Lenz's Law","Motional ε=Blv","Inductance L,M"]},{n:"AC Circuits",col:"#b45309",nodes:["X_L=ωL, X_C=1/ωC","Z formula","Resonance ω₀","Power cosφ"]}]}},

{id:"p15",sub:"physics",name:"Modern Physics & Semiconductor",weight:"High",est:4, syllabus:[
  {topic:"Modern Physics",subtopics:[
    {name:"Photoelectric Effect & Waves",concepts:["KE_max=hf−φ=eV₀ (stopping potential)","Threshold frequency f₀=φ/h","Intensity→number of electrons; frequency→KE","de Broglie: λ=h/mv=h/p","For electron accelerated: λ=h/√(2meV)","Heisenberg: ΔxΔp≥ħ/2"]},
    {name:"Bohr's Model",concepts:["Quantization: mvr=nħ","Energy: Eₙ=−13.6Z²/n² eV","Radius: rₙ=0.529n²/Z Å","Spectral: 1/λ=RZ²(1/n₁²−1/n₂²)","Lyman(UV):n₁=1; Balmer(visible):n₁=2; Paschen(IR):n₁=3","Ionization energy=13.6Z² eV","X-ray continuous spectrum: λ_min=hc/eV (Duane-Hunt law)","X-ray characteristic: Kα,Kβ transitions between electron shells","Moseley's law: √ν=a(Z−b); used to determine atomic number","Nuclear shell model: magic numbers 2,8,20,28,50,82,126","Liquid drop model: explains fission and semi-empirical mass formula"]}
  ]},
  {topic:"Nuclear Physics & Semiconductors",subtopics:[
    {name:"Nuclear Physics",concepts:["Radioactive decay: N=N₀e^(−λt)","Half-life: t½=0.693/λ","Mean life: τ=1/λ=1.44t½","Binding energy: BE=Δm·c²; 1 amu=931.5 MeV","BE/nucleon peaks at Fe-56","Q-value = (mass_reactants−mass_products)c²","Fission: heavy nucleus splits; Fusion: light nuclei merge"]},
    {name:"Semiconductors & Devices",concepts:["n-type: extra electrons (Group 15 dopant)","p-type: holes (Group 13 dopant)","p-n junction: depletion layer","Forward bias: current flows","Reverse bias: only leakage","Diode rectification: half-wave, full-wave","Transistor: β=I_C/I_B; α=I_C/I_E","NAND & NOR: universal gates"]}
  ]}
 ],
 topics:["Photoelectric effect: threshold f₀; KE_max=hf−φ=eV₀","de Broglie: λ=h/p; Heisenberg Δx·Δp≥h/4π","Bohr model: Eₙ=−13.6Z²/n² eV; rₙ=0.529n²/Z Å","Hydrogen spectral series: Lyman, Balmer, Paschen, Brackett","Radioactivity: decay law N=N₀e^(−λt); t½=0.693/λ","Nuclear binding energy; mass defect; Q-value","Semiconductors: p-n junction; diode rectification; transistor β=I_C/I_B","Logic gates: AND, OR, NOT, NAND, NOR (NAND/NOR universal)"],
 formulas:[{t:"Photoelectric Effect",f:"KE_max=hf−φ=eV₀; φ=work function; threshold f₀=φ/h"},{t:"Photon Properties",f:"E=hf=hc/λ; p=h/λ=E/c; h=6.626×10⁻³⁴ J·s"},{t:"de Broglie",f:"λ=h/mv=h/p; for electron accelerated: λ=h/√(2meV)"},{t:"Heisenberg",f:"ΔxΔp≥h/(4π)=ħ/2; ΔEΔt≥ħ/2"},{t:"Bohr Postulates",f:"mvr=nħ=nh/2π; Eₙ=−13.6Z²/n² eV; rₙ=0.529n²/Z Å"},{t:"Bohr Energy Levels",f:"Eₙ=−13.6/n² eV (hydrogen); ionisation energy=13.6 eV"},{t:"Spectral Series",f:"1/λ=RZ²(1/n₁²−1/n₂²); R=1.097×10⁷ m⁻¹; Rydberg constant"},{t:"Series Names",f:"Lyman(UV):n₁=1; Balmer(visible):n₁=2; Paschen(IR):n₁=3; Brackett:n₁=4"},{t:"Radioactive Decay",f:"N=N₀e^(−λt); A=A₀e^(−λt); A=λN"},{t:"Half-life",f:"t½=ln2/λ=0.693/λ; N=N₀(½)^(t/t½)"},{t:"Mean Life",f:"τ=1/λ=t½/ln2=1.44t½"},{t:"Binding Energy",f:"BE=Δm·c²; Δm=Zm_p+Nm_n−m_nucleus; 1 amu=931.5 MeV"},{t:"BE per Nucleon",f:"Peaks at Fe-56 (~8.8 MeV/nucleon); fusion for light; fission for heavy"},{t:"Q-value",f:"Q=(m_reactants−m_products)c²; Q>0 exothermic; Q<0 endothermic"},{t:"p-n Junction",f:"Forward bias: current flows, V_threshold≈0.7V(Si); reverse bias: leakage only"},{t:"Transistor",f:"β=I_C/I_B (current gain); α=I_C/I_E≈1; I_E=I_B+I_C"},{t:"Logic Gates",f:"NAND: ¬(A∧B); NOR: ¬(A∨B); universal gates: NAND or NOR alone sufficient"},{t:"X-ray Minimum Wavelength",f:"λ_min=hc/eV (Duane-Hunt); determines max photon energy from electron KE"},{t:"Moseley's Law",f:"√ν=a(Z−b); Kα line: a=4.96×10⁷, b=1; established atomic number ordering"},{t:"Radioactive Series",f:"Uranium series (Z=92→82); Thorium series (Z=90→82); Actinium series (Z=92→82)"},{t:"Semiconductor Built-in V",f:"V₀=(kT/e)ln(n_n·p_p/nᵢ²); depletion width W=√(2εV₀/e·(1/NA+1/ND))"}],
 keyPoints:["Photoelectric: intensity→number of e⁻; frequency→KE_max","No effect below f₀ regardless of intensity","Bohr valid only for H-like (single electron)","NAND and NOR are universal gates"],
 mindmap:{root:"Modern Physics\n& Semiconductor",branches:[{n:"Quantum",col:"#ea580c",nodes:["Photoelectric KE=hf−φ","de Broglie λ=h/p","Heisenberg Δx·Δp","Wave-Particle Duality"]},{n:"Bohr's Atom",col:"#f97316",nodes:["Eₙ=−13.6Z²/n² eV","rₙ=0.529n²/Z Å","L=nħ","Spectral Series"]},{n:"Nuclear",col:"#dc2626",nodes:["Decay N=N₀e^-λt","t½=0.693/λ","Binding Energy","Q-value Fission"]},{n:"Semiconductor",col:"#b45309",nodes:["p-n Junction","Diode Rectification","Transistor β=I_C/I_B","Logic Gates NAND"]}]}},

{id:"p16",sub:"physics",name:"Units, Dimensions & Error Analysis",weight:"Medium",est:2,
 topics:["SI units: 7 base units (m, kg, s, A, K, mol, cd)","Derived units; dimensional formula of common quantities","Homogeneity check: dimensions must match on both sides","Dimensional analysis to derive formulas; limitations","Types of errors: systematic, random, gross","Absolute error Δa; relative error Δa/a; percentage error","Error in sum/difference: add absolute errors","Error in product/quotient: add relative errors","Error in power xⁿ: multiply relative error by n","Significant figures; least count; parallax; zero error"],
 formulas:[{t:"SI Base Units",f:"m(length),kg(mass),s(time),A(current),K(temp),mol(amount),cd(luminosity)"},{t:"Derived Units",f:"N=kg·m/s²; J=N·m=kg·m²/s²; W=J/s; Pa=N/m²; C=A·s; V=J/C"},{t:"Dimensional Formulas",f:"[Force]=MLT⁻²; [Energy]=ML²T⁻²; [Power]=ML²T⁻³; [Pressure]=ML⁻¹T⁻²"},{t:"Important Dimensions",f:"[Planck h]=ML²T⁻¹; [Angular momentum]=ML²T⁻¹; [Viscosity]=ML⁻¹T⁻¹"},{t:"More Dimensions",f:"[Charge]=AT; [Resistance]=ML²T⁻³A⁻²; [Capacitance]=M⁻¹L⁻²T⁴A²"},{t:"Homogeneity Check",f:"Both sides of equation must have same dimensions; used to check validity"},{t:"Deriving Formulas",f:"Use dimensional analysis to find unknown indices; cannot find pure numbers"},{t:"Error in Sum/Diff",f:"z=a±b: Δz=Δa+Δb (add absolute errors)"},{t:"Error in Product",f:"z=a·b: Δz/z=Δa/a+Δb/b (add relative errors)"},{t:"Error in Quotient",f:"z=a/b: Δz/z=Δa/a+Δb/b (same as product)"},{t:"Error in Power",f:"z=aⁿ: Δz/z=|n|·Δa/a"},{t:"Percentage Error",f:"=Δz/z×100%; compound: add individual percentage errors"},{t:"Vernier Caliper",f:"LC=1 MSD−1 VSD=S/n; reading=MS reading+VS reading×LC"},{t:"Screw Gauge",f:"LC=Pitch/No. of divisions; reading=MS reading+CS reading×LC"},{t:"Significant Figures",f:"Rules: all non-zero digits sig; zeros between sig; trailing zeros after decimal sig"}],
 keyPoints:["[Pressure]=[Stress]=[Energy density]=[ML⁻¹T⁻²]","[Planck's constant h]=[ML²T⁻¹]=[Angular momentum]","Addition/subtraction: add absolute errors","Dimensional analysis CANNOT find dimensionless constants"],
 mindmap:{root:"Units, Dimensions\n& Error Analysis",branches:[{n:"SI System",col:"#ea580c",nodes:["7 Base Units","Derived Units","Dimensional Formula","Prefixes"]},{n:"Dim Analysis",col:"#f97316",nodes:["Homogeneity Check","Formula Derivation","Unit Conversion","Limitations"]},{n:"Errors",col:"#dc2626",nodes:["Systematic/Random","Absolute Error Δa","Relative Error","Propagation Rules"]},{n:"Instruments",col:"#b45309",nodes:["Vernier LC","Screw Gauge","Significant Figures","Rounding Rules"]}]}},

{id:"p17",sub:"physics",name:"Center of Mass & Momentum",weight:"High",est:3,
 topics:["Center of mass r_cm=Σmᵢrᵢ/M; continuous bodies","COM of: rod (center), triangle (centroid), semicircle arc (2R/π), hemisphere (3R/8)","F_ext=Ma_cm; internal forces don't affect COM motion","Linear momentum P=Mv_cm; conservation when F_ext=0","Impulse-momentum theorem; variable mass systems","Rocket propulsion thrust=v_rel(dm/dt)","Explosion: COM continues same velocity","Reduced mass μ=m₁m₂/(m₁+m₂)"],
 formulas:[{t:"Center of Mass",f:"x_cm=Σmᵢxᵢ/M; y_cm=Σmᵢyᵢ/M; z_cm=Σmᵢzᵢ/M"},{t:"COM Continuous",f:"x_cm=∫x dm/M; for uniform rod: L/2; uniform disk: from center"},{t:"COM Special Shapes",f:"Uniform rod: L/2 from end; triangle: centroid (h/3 from base); semicircle arc: 2R/π"},{t:"COM Hemisphere",f:"3R/8 from flat face (solid); R/2 from flat face (hollow)"},{t:"COM Cone",f:"h/4 from base (solid); h/3 from base (hollow)"},{t:"Newton's Law for System",f:"F⃗_ext=M·a⃗_cm; internal forces cancel; COM moves as if all mass concentrated"},{t:"Momentum Conservation",f:"P⃗_total=Mv⃗_cm; conserved when F⃗_ext=0"},{t:"Impulse-Momentum",f:"J⃗=F⃗_avg·Δt=ΔP⃗; area under F-t graph=impulse"},{t:"Explosion",f:"COM velocity unchanged (no external force); KE increases (from stored energy)"},{t:"Rocket Propulsion",f:"v=v₀+v_rel·ln(m₀/m); Thrust=v_rel·|dm/dt|"},{t:"Chain Problem",f:"Variable mass; F_net=Ma+dm/dt·v_rel"},{t:"Reduced Mass",f:"μ=m₁m₂/(m₁+m₂); used in two-body problems; relative motion"},{t:"COM Frame",f:"Total momentum=0 in COM frame; elastic collision: each reverses velocity"},{t:"Removed Mass",f:"If piece of mass m removed from position r: shift in COM=−m·(r−r_cm)/(M−m)"}],
 keyPoints:["COM of uniform lamina=geometric center","Explosion: COM velocity unchanged (no external force)","System momentum constant if F_ext=0","Elastic collision in COM frame: each body reverses velocity"],
 mindmap:{root:"Center of Mass\n& Momentum",branches:[{n:"COM",col:"#ea580c",nodes:["r_cm=Σmᵢrᵢ/M","Arc 2R/π","Hemisphere 3R/8","Cone h/4"]},{n:"Momentum",col:"#f97316",nodes:["P=Mv_cm","Conservation","Impulse J=Δp","F_ext=dP/dt"]},{n:"Variable Mass",col:"#dc2626",nodes:["Rocket Propulsion","Thrust=v_rel·ṁ","Chain Problem","Conveyor Belt"]},{n:"Two Bodies",col:"#b45309",nodes:["COM Frame","Reduced Mass μ","Explosion","Energy Analysis"]}]}},

{id:"p18",sub:"physics",name:"Electromagnetic Waves & Communication",weight:"Medium",est:2,
 topics:["Maxwell: displacement current I_D=ε₀·dΦ_E/dt","EM wave: E and B perpendicular, in phase; c=1/√(μ₀ε₀)","Energy density u=ε₀E²; Poynting vector S=E×B/μ₀","EM spectrum: radio, microwave, IR, visible, UV, X-ray, gamma","AM and FM modulation; bandwidth; antenna size ≈ λ/4","Sky wave, space wave propagation; critical frequency","Satellite communication; optical fiber"],
 formulas:[{t:"Displacement Current",f:"I_D=ε₀·dΦ_E/dt; Maxwell added to Ampere's law to complete it"},{t:"Maxwell's Equations",f:"∮E·dA=q/ε₀; ∮B·dA=0; ∮E·dl=−dΦ_B/dt; ∮B·dl=μ₀(I+I_D)"},{t:"EM Wave Speed",f:"c=1/√(μ₀ε₀)=3×10⁸ m/s; E₀/B₀=c; in medium: v=c/n"},{t:"EM Wave Properties",f:"Transverse; E⊥B⊥direction of propagation; E and B in phase"},{t:"Energy Density",f:"u=ε₀E²=B²/μ₀; u_E=u_B (equal electric and magnetic)"},{t:"Intensity",f:"I=u·c=ε₀E₀²c/2=E₀B₀/2μ₀=P/Area"},{t:"Poynting Vector",f:"S⃗=E⃗×B⃗/μ₀; direction of energy flow; |S|=intensity"},{t:"EM Spectrum",f:"Radio(>0.1m)<Micro<IR<Visible(400-700nm)<UV<X-ray<Gamma(<10⁻¹²m)"},{t:"AM Modulation",f:"Carrier+signal; BW=2f_m; modulation index μ_a=A_m/A_c≤1"},{t:"FM Modulation",f:"Frequency varies; BW=2(Δf+f_m); better quality, more BW needed"},{t:"Antenna Length",f:"Optimum length=λ/4 for quarter-wave antenna"},{t:"Sky Wave",f:"Reflection by ionosphere (F layer,300km); long distance; critical freq f_c=9√N_max"},{t:"Space Wave",f:"Line of sight; UHF,VHF,microwave; range d=√(2Rh); R=6400km,h=antenna height"}],
 keyPoints:["E and B: in phase, perpendicular to each other and to direction","EM waves don't need a medium","FM: better quality; immune to amplitude noise","Ozone absorbs UV; ionosphere reflects radio waves"],
 mindmap:{root:"EM Waves &\nCommunication",branches:[{n:"EM Waves",col:"#ea580c",nodes:["Displacement Current","c=1/√μ₀ε₀","E⊥B⊥direction","Poynting Vector"]},{n:"EM Spectrum",col:"#f97316",nodes:["Radio/Microwave","IR/Visible","UV/X-ray","Gamma Rays"]},{n:"Modulation",col:"#dc2626",nodes:["AM vs FM","Modulation Index","Bandwidth 2f_m","Antenna λ/4"]},{n:"Propagation",col:"#b45309",nodes:["Ground Wave","Sky Wave","Space Wave","Satellite/Fiber"]}]}},

,

{id:"p19",sub:"physics",name:"Dual Nature of Radiation & Matter",weight:"High",est:3, syllabus:[
  {topic:"Photoelectric Effect",subtopics:[
    {name:"Experimental Observations",concepts:["Hertz observation: UV on zinc plate causes sparks","Hallwachs & Lenard: systematic study of photoemission","Threshold frequency ν₀: no emission below ν₀ regardless of intensity","KE_max depends only on frequency, NOT on intensity","Intensity increases number of emitted electrons (photocurrent), not KE_max","Emission is instantaneous — no time lag","Stopping potential V₀: KE_max=eV₀"]},
    {name:"Einstein's Equation",concepts:["Photon energy E=hν=hc/λ; h=6.626×10⁻³⁴ J·s","Work function φ=hν₀; minimum energy to remove an electron","KE_max=hν−φ=eV₀; Einstein's photoelectric equation","V₀=(h/e)ν−φ/e; V₀ vs ν graph: slope=h/e, intercept=−φ/e","KE_max vs ν: slope=h, x-intercept=ν₀","Photon momentum: p=h/λ=E/c"]}
  ]},
  {topic:"de Broglie & Wave-Particle Duality",subtopics:[
    {name:"Matter Waves",concepts:["de Broglie hypothesis: matter has wave nature; λ=h/p=h/(mv)","For electron accelerated through V: λ=h/√(2meV)=12.27/√V Å","de Broglie wavelength of particles: λ=h/√(2mKE)","Macroscopic objects: λ negligible; only submicroscopic particles show wave nature","Davisson-Germer experiment (1927): electron diffraction confirms wave nature","Bragg's law: nλ=2d sinθ; d=interplanar spacing"]},
    {name:"Heisenberg & Wave Packets",concepts:["Heisenberg uncertainty principle: ΔxΔp≥ħ/2=h/(4π)","Energy-time: ΔEΔt≥ħ/2","Cannot simultaneously know exact position AND momentum","Uncertainty NOT due to imperfect instruments; fundamental property","Wave packet: localized wave; group velocity=particle velocity","Phase velocity v_phase=ω/k; group velocity v_g=dω/dk"]}
  ]}
 ],
 topics:["Photoelectric effect: threshold frequency, KE_max=hf−φ, stopping potential","Einstein's photoelectric equation; photon energy E=hf","I-f and I-V characteristics; effect of intensity vs frequency","de Broglie wavelength λ=h/p=h/mv; for accelerated electron λ=12.27/√V Å","Davisson-Germer experiment; electron diffraction","Heisenberg uncertainty Δx·Δp≥h/4π; ΔE·Δt≥h/4π"],
 formulas:[{t:"Photoelectric Eq",f:"KE_max=hν−φ=eV₀; φ=work function (eV); ν₀=φ/h (threshold)"},{t:"Photon Energy",f:"E=hf=hc/λ; h=6.626×10⁻³⁴ J·s; hc=1240 eV·nm"},{t:"Photon Momentum",f:"p=h/λ=E/c; photon has momentum even though massless"},{t:"Stopping Potential",f:"V₀=(h/e)f−φ/e; V₀ vs f: slope=h/e=4.14×10⁻¹⁵ V·s"},{t:"Work Function",f:"φ=hν₀; Cs≈2eV; Na≈2.3eV; K≈2.2eV; Al≈4.1eV; Pt≈5.7eV"},{t:"de Broglie",f:"λ=h/p=h/(mv); valid for all matter (electrons, protons, atoms)"},{t:"Electron Wavelength",f:"λ=h/√(2meV)=12.27/√V Å (V in volts); at V=100V: λ=1.23Å"},{t:"Thermal de Broglie",f:"λ=h/√(3mkT) (for thermal energy); λ=h/√(2mkT) (for avg KE)"},{t:"Heisenberg Position",f:"ΔxΔp_x≥ħ/2=h/(4π); ħ=h/2π=1.055×10⁻³⁴ J·s"},{t:"Heisenberg Energy",f:"ΔEΔt≥ħ/2; natural linewidth of spectral lines"},{t:"Davisson-Germer",f:"Electrons of 54eV accelerated; diffraction peak at θ=50°; confirmed λ=h/p"},{t:"Photocurrent",f:"I=nAev_d; proportional to intensity (number of photons); saturates at V_stop"}],
 keyPoints:["Intensity→number of photons→number of electrons; frequency→KE per electron","No emission below ν₀ regardless of how intense the light","de Broglie: every moving particle has λ=h/p; verified by Davisson-Germer","Heisenberg: ΔxΔp≥h/4π is a fundamental limit, not a measurement error"],
 mindmap:{root:"Dual Nature\nof Radiation & Matter",branches:[{n:"Photoelectric",col:"#ea580c",nodes:["KE=hf−φ","Stopping Potential V₀","Threshold f₀=φ/h","Instantaneous Emission"]},{n:"Photon",col:"#f97316",nodes:["E=hf=hc/λ","p=h/λ","hc=1240 eV·nm","Wave-Particle"]},{n:"Matter Waves",col:"#dc2626",nodes:["λ=h/mv","λ=12.27/√V Å","Davisson-Germer","Wave Packets"]},{n:"Heisenberg",col:"#b45309",nodes:["ΔxΔp≥h/4π","ΔEΔt≥h/4π","Fundamental Limit","Uncertainty Principle"]}]}},

{id:"p20",sub:"physics",name:"Atoms & X-rays",weight:"High",est:3, syllabus:[
  {topic:"Atomic Models & Bohr's Theory",subtopics:[
    {name:"Historical Models",concepts:["Thomson's plum-pudding model (1904): positive sphere with embedded electrons","Rutherford's nuclear model (1911): from alpha-particle scattering","Geiger-Marsden experiment: most particles pass; some deflect; few backscatter","Distance of closest approach: d=kZe²/(½mv²); gives nuclear size","Rutherford problem: electron should spiral in (classical EM) — solved by Bohr"]},
    {name:"Bohr's Postulates",concepts:["Postulate 1: Electrons move in fixed circular orbits (stationary states) — no radiation","Postulate 2: Angular momentum quantized: mvr=nħ=nh/2π; n=1,2,3...","Postulate 3: Energy emitted/absorbed when electron transitions: hν=E₂−E₁","Derivation: Coulomb=centripetal: kZe²/r²=mv²/r; combined with mvr=nħ","Radius: rₙ=n²a₀/Z; a₀=0.529 Å (Bohr radius for H, n=1)","Velocity: vₙ=Zv₀/n; v₀=2.18×10⁶ m/s (hydrogen n=1)","Energy: Eₙ=−13.6Z²/n² eV; ground state H: −13.6 eV","Ionization energy of hydrogen: 13.6 eV; of He⁺: 54.4 eV"]},
    {name:"Spectral Series",concepts:["Rydberg formula: 1/λ=RZ²(1/n₁²−1/n₂²); R=1.097×10⁷ m⁻¹","Lyman series: n₁=1, n₂=2,3,4...; UV region; series limit: 1/λ=RZ²","Balmer series: n₁=2, n₂=3,4,5...; visible; H_α=656nm, H_β=486nm, H_γ=434nm","Paschen series: n₁=3; near-IR","Brackett series: n₁=4; far-IR","Pfund series: n₁=5; far-IR","Total lines for n₁ to n₂: N(N−1)/2 where N=number of levels","Ionization energy from ground state=13.6Z² eV; excitation energy to nth level=E₁−Eₙ"]}
  ]},
  {topic:"X-rays",subtopics:[
    {name:"Production & Types",concepts:["Coolidge tube: filament (thermionic emission) + high voltage + metal target","Continuous X-ray (Bremsstrahlung): deceleration of electrons; photon emission","λ_min=hc/eV (Duane-Hunt law); minimum wavelength determined by applied voltage","Higher voltage → smaller λ_min → more penetrating X-rays","Characteristic X-rays: specific energies; inner shell electron knocked out","Outer electron fills vacancy; emits X-ray photon = energy difference","K-series: transitions to K-shell; Kα (L→K), Kβ (M→K), Kγ (N→K)","L-series: transitions to L-shell; lower energy than K-series"]},
    {name:"Moseley's Law & Properties",concepts:["Moseley's law: √ν=a(Z−b); Kα: a=4.96×10⁷, b=1","Used to determine atomic number of elements; established periodic table","X-rays cause ionization; photoelectric effect in matter; diffraction by crystals","Bragg's law: 2d sinθ=nλ; X-ray crystallography","Properties: travel in straight lines; not deflected by E or B fields","Penetrating power ∝ frequency ∝ 1/λ; soft X-rays (low ν), hard X-rays (high ν)","Applications: medical imaging, crystallography, security scanners, cancer treatment"]}
  ]}
 ],
 topics:["Rutherford model: nuclear atom; distance of closest approach d=kZe²/½mv²","Bohr postulates: quantized angular momentum mvr=nħ","Energy levels: Eₙ=−13.6Z²/n² eV; radius rₙ=0.529n²/Z Å","Spectral series: Lyman(UV), Balmer(visible), Paschen(IR); Rydberg formula","Limitations of Bohr model: multi-electron atoms, fine structure, intensity","X-ray production: continuous (Bremsstrahlung) λ_min=hc/eV; characteristic (shell transitions)","Moseley's law: √ν=a(Z−b); Bragg's law: 2d sinθ=nλ"],
 formulas:[{t:"Bohr Radius",f:"rₙ=n²a₀/Z; a₀=0.529 Å; r₁(H)=0.529 Å; r₂(H)=2.12 Å"},{t:"Bohr Energy",f:"Eₙ=−13.6Z²/n² eV; E₁(H)=−13.6eV; E₂=−3.4eV; E₃=−1.51eV"},{t:"Bohr Velocity",f:"vₙ=Ze²/(2ε₀hn)=Zv₀/n; v₀=2.18×10⁶ m/s; v₁(H)=2.18×10⁶ m/s"},{t:"Angular Momentum",f:"L=mvr=nħ=nh/2π; quantized in multiples of ħ"},{t:"Transition Energy",f:"ΔE=13.6Z²(1/n₁²−1/n₂²) eV; photon freq ν=ΔE/h"},{t:"Rydberg Formula",f:"1/λ=RZ²(1/n₁²−1/n₂²); R=1.097×10⁷ m⁻¹; Rydberg constant"},{t:"Ionization Energy",f:"IE=13.6Z² eV from ground state; H: 13.6eV; He⁺: 54.4eV; Li²⁺: 122.4eV"},{t:"Number of Lines",f:"Transitions between levels n=N down to n=1: N(N−1)/2 spectral lines total"},{t:"Closest Approach",f:"d=kZe²/(½mv²)=2kZe²/(mv²); size estimate of nucleus"},{t:"Balmer Series",f:"1/λ=R(1/4−1/n²); n=3,4,5...; H_α:656nm; H_β:486nm; series limit:365nm"},{t:"X-ray λ_min",f:"λ_min=hc/eV=1240/V nm (V in volts); independent of target material"},{t:"Characteristic X-ray",f:"Kα: hν=E_L−E_K; Kβ: hν=E_M−E_K; energy=ΔE between shells"},{t:"Moseley's Law",f:"√ν=a(Z−b); Kα: a=4.96×10⁷ Hz^½, b=1; determines atomic number"},{t:"Bragg's Law",f:"2d sinθ=nλ; d=interplanar spacing; θ=glancing angle; X-ray crystallography"}],
 keyPoints:["Bohr valid ONLY for H-like (single electron) atoms — H, He⁺, Li²⁺, Be³⁺","Higher n: larger orbit, lower |E|, higher energy (less bound)","Balmer series: only visible lines of hydrogen spectrum (n₁=2)","X-ray λ_min depends on voltage; characteristic X-ray depends on target material"],
 mindmap:{root:"Atoms & X-rays",branches:[{n:"Rutherford",col:"#ea580c",nodes:["Nuclear Model","Alpha Scattering","Closest Approach","Problem: Spiral In"]},{n:"Bohr Model",col:"#f97316",nodes:["mvr=nħ","Eₙ=−13.6Z²/n²","rₙ=0.529n²/Z Å","Limitations"]},{n:"Spectral Series",col:"#dc2626",nodes:["Lyman UV n₁=1","Balmer Visible n₁=2","Paschen IR n₁=3","Rydberg 1/λ=R..."]},{n:"X-rays",col:"#b45309",nodes:["λ_min=hc/eV","Characteristic Kα Kβ","Moseley √ν=a(Z−b)","Bragg 2d sinθ=nλ"]}]}},

{id:"p21",sub:"physics",name:"Nuclei & Radioactivity",weight:"High",est:4, syllabus:[
  {topic:"Nuclear Structure & Binding Energy",subtopics:[
    {name:"Nuclear Composition",concepts:["Nucleus: Z protons + N neutrons; mass number A=Z+N","Nuclear radius: R=R₀A^(1/3); R₀=1.2 fm; R scales as A^(1/3)","Nuclear density: ρ≈2.3×10¹⁷ kg/m³; nearly constant for all nuclei (liquid drop)","Isotopes: same Z, different N (e.g. ¹H, ²H, ³H)","Isotones: same N, different Z","Isobars: same A, different Z (e.g. ¹⁴C and ¹⁴N)","Isomers: same A and Z, different energy states","1 amu=931.5 MeV/c²=1.66054×10⁻²⁷ kg"]},
    {name:"Binding Energy",concepts:["Mass defect: Δm=Zm_p+(A−Z)m_n−M_nucleus","Binding energy: BE=Δm·c²=Δm×931.5 MeV (if Δm in amu)","BE per nucleon (B/A): peaks at Fe-56 (~8.8 MeV/nucleon); very stable","Light nuclei (A<20): B/A increases rapidly — fusion releases energy","Heavy nuclei (A>100): B/A decreases slowly — fission releases energy","Magic numbers: 2,8,20,28,50,82,126 — extra stable nuclei","Packing fraction=(M−A)/A; negative = stable"]}
  ]},
  {topic:"Radioactivity",subtopics:[
    {name:"Types of Decay",concepts:["α-decay: ²³⁸U→²³⁴Th+⁴He; A−4, Z−2; α particles=He nuclei","β⁻-decay: n→p+e⁻+ν̄_e; A unchanged, Z+1; emitted: electron+antineutrino","β⁺-decay: p→n+e⁺+ν_e; A unchanged, Z−1; emitted: positron+neutrino","Electron capture: p+e⁻→n+ν_e; competing with β⁺ decay","γ-decay: excited nucleus→ground state + γ photon; A,Z unchanged","α particles: stopped by paper; β by few mm Al; γ by several cm Pb","Radioactive series: Uranium (A=4n+2), Thorium (A=4n), Actinium (A=4n+3)"]},
    {name:"Radioactive Decay Law",concepts:["N(t)=N₀e^(−λt); λ=decay constant (probability per unit time)","Activity A=dN/dt=λN=λN₀e^(−λt)=A₀e^(−λt)","Half-life T½=ln2/λ=0.693/λ; time for N→N/2","Mean life τ=1/λ=T½/ln2=1.44T½; average time before decay","N=N₀(½)^(t/T½); N₀/2ⁿ after n half-lives","SI unit of activity: Becquerel (Bq)=1 decay/s; 1 Curie=3.7×10¹⁰ Bq","Successive decays (secular equilibrium): λ₁N₁=λ₂N₂ (activities equal)"]}
  ]},
  {topic:"Nuclear Reactions & Energy",subtopics:[
    {name:"Nuclear Reactions",concepts:["Q-value: Q=(m_reactants−m_products)c²; Q>0 exothermic; Q<0 endothermic","Threshold energy for endothermic: E_th=|Q|(1+m_projectile/m_target)","Nuclear fission: heavy nucleus splits; ²³⁵U+n→Kr+Ba+3n+200MeV","Chain reaction: each fission produces ~3 neutrons; k-factor","Critical mass: minimum mass for self-sustaining chain reaction","Controlled fission: nuclear reactor (moderator slows neutrons; control rods absorb)","Nuclear fusion: light nuclei combine; ²H+³H→⁴He+n+17.6MeV","Fusion requires T~10⁸ K; magnetic confinement (tokamak) or inertial confinement","Solar energy: p-p chain; pp→deuterium→³He→⁴He; 6H→He+2H+2ν+26.7MeV"]}
  ]}
 ],
 topics:["Nuclear composition: Z protons, N neutrons, A=Z+N; nuclear radius R=R₀A^(1/3)","Nuclear density ~2.3×10¹⁷ kg/m³; isotopes, isobars, isotones","Mass defect Δm; binding energy BE=Δmc²; BE/nucleon curve, Fe-56 peak","Radioactive decay: α (A−4,Z−2), β⁻ (Z+1), β⁺ (Z−1), γ (A,Z unchanged)","Decay law N=N₀e^(−λt); half-life T½=0.693/λ; mean life τ=1/λ","Activity A=λN; units Becquerel, Curie","Nuclear fission: U-235+n; chain reaction; critical mass","Nuclear fusion: H isotopes; energy from BE/nucleon curve","Q-value of reaction; threshold energy for endothermic reactions"],
 formulas:[{t:"Nuclear Radius",f:"R=R₀A^(1/3); R₀=1.2 fm=1.2×10⁻¹⁵ m; volume ∝A"},{t:"Nuclear Density",f:"ρ=3m_p/(4πR₀³)≈2.3×10¹⁷ kg/m³; constant for all nuclei"},{t:"Mass Defect",f:"Δm=Zm_p+(A−Z)m_n−M_nucleus; all in amu; m_p=1.00728u; m_n=1.00866u"},{t:"Binding Energy",f:"BE=Δm·c²=Δm×931.5 MeV; if Δm in amu; more BE/A = more stable"},{t:"Decay Law",f:"N(t)=N₀e^(−λt); A(t)=A₀e^(−λt); λ=decay constant"},{t:"Half Life",f:"T½=ln2/λ=0.693/λ; N after n half-lives: N=N₀/2ⁿ=N₀(0.5)^(t/T½)"},{t:"Mean Life",f:"τ=1/λ=T½/ln2=1.44T½; at t=τ: N=N₀/e"},{t:"Activity",f:"A=λN; A₀=λN₀; SI unit: Becquerel(Bq); 1 Ci=3.7×10¹⁰ Bq"},{t:"α-decay",f:"ᴬZX→ᴬ⁻⁴(Z−2)Y+⁴₂He; mass number −4, atomic number −2"},{t:"β⁻-decay",f:"n→p+e⁻+ν̄; ᴬZX→ᴬ(Z+1)Y+e⁻+ν̄; Z increases by 1"},{t:"Q-value",f:"Q=(m_initial−m_final)c²=(sum of BE_final−BE_initial); Q>0: exothermic"},{t:"Fission Energy",f:"U-235 fission: ~200 MeV/fission; 1 kg U-235≈8.2×10¹³ J"},{t:"Fusion Energy",f:"D+T→He-4+n+17.6 MeV; pp chain in sun: net 26.7 MeV per 4 protons→He-4"},{t:"Threshold",f:"Endothermic threshold: E_th=|Q|(1+m_a/m_A); m_a=projectile; m_A=target"}],
 keyPoints:["BE/nucleon peaks at Fe-56: lighter nuclei release energy by fusion; heavier by fission","T½ and τ: unique to each radioisotope; independent of physical/chemical state","α stopped by paper; β by few mm Al; γ requires thick Pb/concrete","Chain reaction: k<1 subcritical; k=1 critical; k>1 supercritical"],
 mindmap:{root:"Nuclei &\nRadioactivity",branches:[{n:"Nuclear Structure",col:"#ea580c",nodes:["R=R₀A^(1/3)","Δm, BE=Δmc²","BE/A peaks Fe-56","Magic Numbers"]},{n:"Decay Types",col:"#f97316",nodes:["α: A−4, Z−2","β⁻: Z+1","β⁺: Z−1","γ: A,Z unchanged"]},{n:"Decay Law",col:"#dc2626",nodes:["N=N₀e^−λt","T½=0.693/λ","τ=1/λ=1.44T½","Activity A=λN"]},{n:"Nuclear Energy",col:"#b45309",nodes:["Fission 200MeV","Chain Reaction","Fusion 17.6MeV","Q-value"]}]}},

{id:"p22",sub:"physics",name:"Semiconductor Electronics & Devices",weight:"High",est:4, syllabus:[
  {topic:"Energy Bands & Semiconductor Types",subtopics:[
    {name:"Band Theory",concepts:["Conductor: valence band overlaps conduction band; free electrons always available","Semiconductor: small forbidden gap Eg≈1eV (Si:1.1eV; Ge:0.67eV)","Insulator: large forbidden gap Eg>3eV; essentially no free carriers at room temp","Intrinsic semiconductor: pure; n=p=nᵢ; nᵢ∝e^(−Eg/2kT)","Electron-hole pairs: thermal excitation; hole=absence of electron in valence band","Hole movement: opposite direction to electron; effective positive charge carrier","Conductivity increases with temperature for semiconductors (more pairs excited)"]},
    {name:"Extrinsic Semiconductors",concepts:["n-type: Group 15 dopant (P, As, Sb) in Si/Ge; extra valence electron — donor","Donor level just below conduction band; easily ionized at room temp","n-type: majority carriers=electrons; minority=holes; n_e>>n_h","p-type: Group 13 dopant (B, Al, In, Ga); one less valence electron — acceptor","Acceptor level just above valence band; easily captures an electron","p-type: majority carriers=holes; minority=electrons; n_h>>n_e","Mass action law: n_e·n_h=nᵢ² (at thermal equilibrium, for both intrinsic and extrinsic)"]}
  ]},
  {topic:"p-n Junction Diode",subtopics:[
    {name:"Junction Formation & Biasing",concepts:["Diffusion: electrons from n→p; holes from p→n; depletion region forms","Built-in potential V₀ (contact potential): ~0.3V Ge; ~0.7V Si; opposes further diffusion","Forward bias (p→+, n→−): reduces barrier; exponential current I=I₀(e^(eV/kT)−1)","Threshold (cut-in) voltage: ~0.3V (Ge); ~0.7V (Si); below this: negligible current","Reverse bias: increases barrier; only small reverse saturation current I₀","Breakdown: Zener (thin junction, high doping, E field) or avalanche (large reverse V)","Zener diode: designed for breakdown; used as voltage regulator; V_Z stabilizes","Dynamic resistance: r_d=dV/dI=kT/(eI)≈26mV/I at room temperature"]},
    {name:"Rectifiers",concepts:["Half-wave rectifier: 1 diode; conducts only half cycle; output DC with large ripple","Full-wave rectifier (centre-tap): 2 diodes + centre-tap transformer; both halves used","Bridge rectifier: 4 diodes; no centre-tap needed; most common","Average output: half-wave V_avg=V_m/π; full-wave V_avg=2V_m/π","RMS output: half-wave V_rms=V_m/2; full-wave V_rms=V_m/√2","Ripple factor: half-wave r=1.21; full-wave r=0.48","Filter capacitor: smooths ripple; larger C → smaller ripple"]}
  ]},
  {topic:"Transistors",subtopics:[
    {name:"BJT Operation",concepts:["NPN: n-emitter, p-base, n-collector; PNP: p-emitter, n-base, p-collector","Emitter: heavily doped; injects majority carriers into base","Base: very thin (~few μm) and lightly doped; controls carrier flow","Collector: moderately doped; collects carriers from base","Active region (amplifier): E-B forward biased; C-B reverse biased","I_E=I_B+I_C (KCL); α=I_C/I_E≈0.95−0.99; β=I_C/I_B; β=α/(1−α)","Common emitter: input I_B, output I_C; current gain β; voltage inversion","Cut-off: E-B reverse; both junctions reverse; transistor OFF","Saturation: both junctions forward; transistor fully ON; V_CE≈0.2V"]},
    {name:"Amplifier & Switch",concepts:["CE amplifier: V_in at base; V_out at collector; A_v=−βR_C/r_be (inverted, amplified)","Voltage gain A_v=ΔV_out/ΔV_in; current gain β=ΔI_C/ΔI_B","Power gain=A_v×A_i; large power gain possible with small input","Transistor switch: OFF when I_B=0 (cut-off); ON when I_B>I_B(sat)","I_B(sat)=V_CC/(βR_C); ensure I_B > this for saturation","Applications: inverter, NAND/NOR gates, flip-flops, oscillators"]}
  ]},
  {topic:"Logic Gates & Digital Electronics",subtopics:[
    {name:"Basic & Universal Gates",concepts:["AND gate: Y=A·B; output HIGH only if BOTH inputs HIGH","OR gate: Y=A+B; output HIGH if ANY input HIGH","NOT gate: Y=Ā; inverts input; single input","NAND gate: Y=̄(A·B)=Ā+B̄; AND followed by NOT; universal gate","NOR gate: Y=̄(A+B)=Ā·B̄; OR followed by NOT; universal gate","XOR gate: Y=A⊕B=AB̄+ĀB; HIGH when inputs differ","XNOR gate: Y=A⊙B; HIGH when inputs same","Universal: NAND or NOR alone can implement ALL other gates","De Morgan's: ̄(A·B)=Ā+B̄; ̄(A+B)=Ā·B̄"]},
    {name:"Boolean Algebra & Circuits",concepts:["Boolean identities: A·0=0; A·1=A; A+0=A; A+1=1; A·A=A; A+A=A; A·Ā=0; A+Ā=1","Implementing NOT from NAND: Y=̄(A·A)=Ā","Implementing AND from NAND: use NAND then NOT","Implementing OR from NAND: ̄(Ā·B̄)=A+B (De Morgan)","Half adder: sum=A⊕B; carry=A·B; 2 gates: XOR + AND","Full adder: adds A,B,C_in; 2 half adders + OR gate","Flip-flops: SR, D, JK, T (bistable multivibrators; memory elements)","Truth table: all input combinations and corresponding outputs"]}
  ]}
 ],
 topics:["Energy bands: conductor, semiconductor (Eg≈1eV), insulator (Eg>3eV)","Intrinsic: n=p=nᵢ; extrinsic: n-type (donors) and p-type (acceptors)","Mass action law: n_e·n_h=nᵢ²","p-n junction: depletion region, forward bias, reverse bias, I-V characteristic","Rectifiers: half-wave (V_avg=V_m/π), full-wave (2V_m/π), bridge; ripple factor","Zener diode: voltage regulation; breakdown voltage","Transistor BJT: I_E=I_B+I_C; α=I_C/I_E; β=I_C/I_B=α/(1−α)","CE amplifier: A_v=−βR_C/r_be; transistor as switch","Logic gates: AND, OR, NOT, NAND (universal), NOR (universal), XOR, XNOR","De Morgan's theorems; Boolean algebra; half adder, full adder"],
 formulas:[{t:"Intrinsic Carrier",f:"nᵢ=√(NC·NV)·e^(−Eg/2kT); doubles for every ~10°C rise in Si"},{t:"Mass Action Law",f:"n_e·n_h=nᵢ²; holds for both intrinsic and doped at equilibrium"},{t:"Diode I-V",f:"I=I₀(e^(eV/ηkT)−1); I₀=reverse saturation current; η=1(Ge),2(Si) ideality factor"},{t:"Dynamic Resistance",f:"r_d=ηkT/(eI)≈26mV/I at 300K; small at large forward current"},{t:"Half-wave Rectifier",f:"V_avg=V_m/π=0.318V_m; V_rms=V_m/2; ripple factor r=1.21"},{t:"Full-wave Rectifier",f:"V_avg=2V_m/π=0.636V_m; V_rms=V_m/√2; ripple factor r=0.48"},{t:"Transistor Current",f:"I_E=I_B+I_C; α=I_C/I_E; β=I_C/I_B; relation: β=α/(1−α); α=β/(1+β)"},{t:"Typical Values",f:"β=20−500 (Si); α=0.95−0.99; V_BE(on)≈0.7V(Si); V_CE(sat)≈0.2V"},{t:"CE Voltage Gain",f:"A_v=−β·R_C/r_be; r_be=β/g_m; g_m=I_C/(kT/e)=I_C/26mV (at 300K)"},{t:"Switch Condition",f:"OFF: I_B=0; ON (sat): I_B>I_B(sat)=V_CC/(β·R_C)"},{t:"NAND Universal",f:"NOT: Y=̄(A·A); AND: NAND then NOT; OR: NAND(Ā,B̄)"},{t:"De Morgan 1",f:"̄(A·B)=Ā+B̄; NAND equivalent to bubbled OR"},{t:"De Morgan 2",f:"̄(A+B)=Ā·B̄; NOR equivalent to bubbled AND"},{t:"Half Adder",f:"Sum=A⊕B; Carry=A·B; full adder adds carry-in as third input"}],
 keyPoints:["n-type majority=electrons; p-type majority=holes; mass action n·p=nᵢ² always","Forward bias: current exponential; reverse bias: tiny leakage (I₀)","β=I_C/I_B: small base current controls large collector current","NAND and NOR are universal — any logic circuit can be built from either alone"],
 mindmap:{root:"Semiconductor\nElectronics",branches:[{n:"Materials",col:"#ea580c",nodes:["Band Theory Eg","n-type Donors","p-type Acceptors","nᵢ² Law"]},{n:"Diode",col:"#f97316",nodes:["p-n Junction","Forward/Reverse","Rectifiers",  "Zener Regulator"]},{n:"Transistor",col:"#dc2626",nodes:["α=Ic/Ie; β=Ic/Ib","Active/Cut/Sat","CE Amplifier Av","Switch Application"]},{n:"Logic Gates",col:"#b45309",nodes:["AND OR NOT","NAND NOR Universal","De Morgan Laws","Half/Full Adder"]}]}},

// ╔═══════════════════════ CHEMISTRY ════════════════════════╗
{id:"c1",sub:"chem",name:"Mole Concept & Stoichiometry",weight:"High",est:3, syllabus:[
  {topic:"Basic Definitions & Avogadro's Number",subtopics:[
    {name:"Mole & Molar Mass",concepts:["Mole — amount of substance containing 6.022×10²³ entities (Avogadro's number Nₐ)","Molar mass — mass of one mole of a substance (g/mol); numerically equal to molecular mass in amu","Atomic mass unit (amu) — 1 amu = 1/12 mass of carbon-12 atom = 1.6605×10⁻²⁷ kg"]},
    {name:"Percentage Composition & Empirical Formula",concepts:["Percentage composition — mass percent of each element in a compound","Empirical formula — simplest whole-number ratio of atoms; found by converting mass % to moles and dividing by smallest","Molecular formula — actual number of atoms; = empirical formula × n where n = molar mass / empirical formula mass"]},
    {name:"Stoichiometry",concepts:["Balanced chemical equation — coefficients represent mole ratios","Limiting reagent — reactant completely consumed; determines theoretical yield","Percent yield = (actual yield / theoretical yield) × 100%","Consecutive reactions — overall stoichiometry by combining equations","Parallel reactions — yield distribution across products"]}
  ]},
  {topic:"Concentration Terms & Equivalent Concept",subtopics:[
    {name:"Concentration Units",concepts:["Molarity (M) = moles of solute / volume of solution (L); temperature dependent","Molality (m) = moles of solute / mass of solvent (kg); temperature independent","Normality (N) = equivalents of solute / volume (L); equivalent weight = molar mass / n-factor","Mole fraction (χ) = moles of component / total moles","Parts per million (ppm) = (mass of solute / mass of solution) × 10⁶","Interconversions: M = 1000dw / [M_solute × w + M_solvent(1-w)]; m = 1000M / (1000d - M×M_solute)"]},
    {name:"Equivalent Weight & n-Factor",concepts:["n-factor for acids — number of replaceable H⁺ ions (H₂SO₄=2; H₃PO₄=3; H₃PO₂=1)","n-factor for bases — number of replaceable OH⁻ ions","n-factor for redox — electrons gained/lost per mole; KMnO₄ acidic=5; neutral=3; basic=1; K₂Cr₂O₇=6","Law of equivalence — equivalents of oxidising agent = equivalents of reducing agent","Back titration — excess reagent titrated when direct reaction is slow","Double titration — for mixtures (NaOH + Na₂CO₃) using two indicators (phenolphthalein and methyl orange)"]}
  ]}
 ],
 topics:["Mole: Avogadro's number Nₐ=6.022×10²³; molar mass","Empirical vs molecular formula; percentage composition","Limiting reagent: identification; percentage yield","Molarity M=n/V(L); dilution M₁V₁=M₂V₂","Molality m=n/W_solvent(kg): temperature independent","Mole fraction; normality N=M×n-factor","Equivalent weight; n-factor for acids, bases, redox","Stoichiometric calculations: mole ratio method","Volumetric analysis N₁V₁=N₂V₂; back titration"],
 formulas:[{t:"Mole Relations",f:"n=m/M=V(STP)/22.4=N/Nₐ; Nₐ=6.022×10²³"},{t:"Molarity",f:"M=n_solute/V(L); dilution: M₁V₁=M₂V₂"},{t:"Molality",f:"m=n_solute/W_solvent(kg); independent of temperature"},{t:"Mole Fraction",f:"χ_A=n_A/(n_A+n_B+…); Σχᵢ=1"},{t:"Normality",f:"N=M×n-factor; N₁V₁=N₂V₂ at equivalence"},{t:"n-factor",f:"Acid: replaceable H⁺; Base: replaceable OH⁻; Redox: change in oxidation state per molecule"},{t:"Equivalent Weight",f:"Eq.wt=M/n-factor"},{t:"Limiting Reagent",f:"aA+bB→products: compare n_A/a vs n_B/b; smaller ratio→limiting"},{t:"% Yield",f:"% yield=(actual yield/theoretical yield)×100"},{t:"% Composition",f:"% of element=(atoms×at.mass/molar mass)×100"},{t:"Empirical & Molecular",f:"n=Molecular formula mass/Empirical formula mass; n must be integer"},{t:"Mass-Mole Conversions",f:"mass(g)=moles×molar mass; no. of molecules=moles×Nₐ"},{t:"Titration",f:"N₁V₁=N₂V₂; back titration: N₁V₁=N₂V₂+N₃V₃"},{t:"Oxidation State Rules",f:"O=−2 (usually); H=+1; F=−1 always; sum=0 for neutral; sum=charge for ion"},{t:"Balancing Redox",f:"Half-reaction method: balance atoms, charge; multiply; add half-reactions"}],
 keyPoints:["At STP: 1 mol ideal gas=22.4 L","Molarity changes with temperature; molality does not","H₂SO₄ as acid: n-factor=2; as oxidant varies"],
 mindmap:{root:"Mole Concept\n& Stoichiometry",branches:[{n:"Mole Concept",col:"#059669",nodes:["n=m/M","Nₐ=6.022×10²³","22.4 L at STP","% Composition"]},{n:"Concentration",col:"#10b981",nodes:["Molarity M=n/V","Molality m=n/kg","Mole Fraction χ","Normality N"]},{n:"Stoichiometry",col:"#047857",nodes:["Limiting Reagent","% Yield","Balancing","Combustion"]},{n:"Titrations",col:"#065f46",nodes:["N₁V₁=N₂V₂","Back Titration","Redox Titration","Equivalence Point"]}]}},

{id:"c2",sub:"chem",name:"Atomic Structure",weight:"High",est:4, syllabus:[
  {topic:"Subatomic Particles & Early Models",subtopics:[
    {name:"Discovery of Fundamental Particles",concepts:["Electron — J.J. Thomson's cathode ray experiment; e/m ratio; Millikan's oil drop gave e=1.6×10⁻¹⁹ C","Proton — Goldstein's canal rays; charge=+e; mass≈1836× electron mass","Neutron — Chadwick's experiment: α + Be → C + n"]},
    {name:"Atomic Models",concepts:["Thomson model — plum pudding; positive sphere with embedded electrons; failed to explain α-scattering","Rutherford model — α-scattering: nucleus (small, dense, positive) with electrons revolving around; drawbacks: instability, no line spectra"]},
    {name:"Bohr's Model",concepts:["Postulates — electrons revolve in stationary orbits; angular momentum quantised: mvr=nh/2π; radiation only during transition","Radius — rₙ=n²a₀/Z; a₀=0.529 Å","Energy — Eₙ=−13.6Z²/n² eV","Spectral series — Lyman (n₁=1), Balmer (n₁=2), Paschen (n₁=3), Brackett (n₁=4), Pfund (n₁=5)","Rydberg formula — 1/λ=RZ²(1/n₁²−1/n₂²); R=1.097×10⁷ m⁻¹","Limitations — fails for multi-electron atoms; no Zeeman effect or fine structure explanation"]}
  ]},
  {topic:"Wave Mechanics & Quantum Numbers",subtopics:[
    {name:"Dual Nature & Uncertainty",concepts:["de Broglie wavelength — λ=h/p=h/mv; for electron in V volts: λ=12.27/√V Å","Davisson-Germer experiment — electron diffraction confirms wave nature","Heisenberg Uncertainty — Δx·Δp≥h/4π; also ΔE·Δt≥h/4π; no precise trajectories possible"]},
    {name:"Quantum Numbers & Orbitals",concepts:["Principal quantum number n — energy, size; n=1,2,3...","Azimuthal quantum number l — subshell (s,p,d,f); l=0 to n−1; orbital angular momentum=√[l(l+1)]ℏ","Magnetic quantum number m_l — orientation; −l to +l; degeneracy=2l+1","Spin quantum number m_s — ±1/2; spin angular momentum=√[s(s+1)]ℏ with s=1/2","Nodes — total nodes=n−1; radial nodes=n−l−1; angular nodes=l","Shapes — s (spherical), p (dumbbell, 3 orientations), d (cloverleaf, 5 orientations)"]},
    {name:"Electronic Configuration",concepts:["Aufbau principle — fill in order of increasing n+l; for equal n+l, lower n first","Pauli exclusion principle — no two electrons in same atom have all four quantum numbers identical","Hund's rule — degenerate orbitals filled singly first with parallel spins","Exceptions — Cr (4s¹3d⁵), Cu (4s¹3d¹⁰), Mo (5s¹4d⁵) due to half-filled/filled subshell stability","Ionisation — for transition metals, ns electrons removed before (n-1)d"]}
  ]}
 ],
 topics:["Rutherford's nuclear model; α-particle scattering","Bohr model for hydrogen; energy levels and transitions","de Broglie wave-particle duality λ=h/mv","Heisenberg uncertainty Δx·Δp≥h/4π","Quantum numbers: n (shell), l (shape), m_l, m_s (spin)","Orbital shapes: s (sphere), p (dumbbell), d (cloverleaf)","Aufbau principle, Pauli exclusion principle, Hund's rule","Electronic configuration; exceptions Cr and Cu","Spectral series: Lyman(UV), Balmer(visible), Paschen(IR)"],
 formulas:[{t:"Bohr Energy",f:"Eₙ=−13.6Z²/n² eV; E₁(H)=−13.6 eV; ionisation energy=13.6Z² eV"},{t:"Orbital Radius",f:"rₙ=0.529n²/Z Å; r∝n²/Z"},{t:"Velocity in Orbit",f:"vₙ=2.18×10⁶·Z/n m/s; v∝Z/n"},{t:"Spectral Formula",f:"1/λ=R·Z²(1/n₁²−1/n₂²); R=1.097×10⁷ m⁻¹"},{t:"de Broglie",f:"λ=h/mv; for electron in nth orbit: 2πrₙ=nλ"},{t:"Heisenberg",f:"ΔxΔp≥h/4π; ΔEΔt≥h/4π"},{t:"Quantum Numbers",f:"n=1,2,3…(shell); l=0 to n−1(subshell); m_l=−l to +l; m_s=±½"},{t:"No. of Orbitals",f:"Subshell l: (2l+1) orbitals; Shell n: n² orbitals; Max e⁻: 2n²"},{t:"Aufbau Order",f:"1s<2s<2p<3s<3p<4s<3d<4p<5s<4d<5p<6s<4f<5d<6p<7s<5f<6d<7p"},{t:"Pauli Exclusion",f:"No two electrons in same atom have all 4 quantum numbers identical"},{t:"Hund's Rule",f:"Fill each orbital of same energy with one electron before pairing; all same spin"},{t:"Exceptions",f:"Cr: [Ar]3d⁵4s¹ (half-filled d); Cu: [Ar]3d¹⁰4s¹ (fully filled d)"},{t:"Energies of orbitals",f:"s<p<d<f for same n; but 4s<3d in periodic table context"},{t:"Radial/Angular Nodes",f:"Radial nodes=n−l−1; Angular nodes=l; Total nodes=n−1"}],
 keyPoints:["Pauli: no two electrons have same set of all four QNs","Hund's: half-fill before pairing; all same spin","Cr: [Ar]3d⁵4s¹; Cu: [Ar]3d¹⁰4s¹ (half/full d stability)"],
 mindmap:{root:"Atomic\nStructure",branches:[{n:"Models",col:"#059669",nodes:["Rutherford","Bohr Orbits","Wave Mechanical","Orbital Model"]},{n:"Quantum Numbers",col:"#10b981",nodes:["n: Shell","l: Shape 0,1,2,3","m_l: Orientation","m_s: ±½"]},{n:"Filling Rules",col:"#047857",nodes:["Aufbau Order","Pauli Exclusion","Hund's Half-Fill","Exceptions Cr,Cu"]},{n:"Wave Nature",col:"#065f46",nodes:["de Broglie λ=h/mv","Heisenberg Δx·Δp","Probability ψ²","Spectral Series"]}]}},

{id:"c3",sub:"chem",name:"Chemical Bonding",weight:"High",est:4, syllabus:[
  {topic:"Ionic & Covalent Bonding",subtopics:[
    {name:"Ionic Bonding",concepts:["Electrovalency — transfer of electrons; lattice energy","Born-Haber cycle — calculation of lattice energy: atomisation, ionisation, electron affinity, formation, lattice steps","Factors affecting lattice energy — smaller ion/higher charge → higher lattice energy","Fajan's rules — covalent character increases with smaller cation, larger anion, higher charge"]},
    {name:"Covalent Bonding — VSEPR",concepts:["VSEPR — electron pairs repel; geometry by bond pairs + lone pairs","Steric number = BP + LP; geometries: 2→linear; 3→trigonal planar; 4→tetrahedral; 5→TBP; 6→octahedral","Lone pair effects — bent (water 104.5°), pyramidal (ammonia 107°), T-shaped (ClF₃), square pyramidal (BrF₅)"]},
    {name:"Valence Bond Theory",concepts:["Hybridisation — sp, sp², sp³, sp³d, sp³d², sp³d³","Sigma (σ) bonds — end-on overlap; free rotation","Pi (π) bonds — lateral overlap; restricted rotation","Bent's rule — more electronegative substituents prefer orbitals with less s-character"]}
  ]},
  {topic:"Molecular Orbital Theory & Intermolecular Forces",subtopics:[
    {name:"MOT",concepts:["LCAO — bonding (BMO) and antibonding (ABMO) MOs formed","Bond order = ½(Nb − Na); higher BO → shorter bond, higher stability","MO diagrams — Li₂ to N₂: σ2p < π2p; O₂ to Ne₂: π2p < σ2p; O₂ paramagnetic (2 unpaired)","He₂: BO=0 (doesn't exist); N₂: BO=3 (strongest); O₂⁺: BO=2.5"]},
    {name:"Intermolecular Forces",concepts:["Dipole moment μ=q×d (Debye); vector sum; zero for symmetric molecules","Zero dipole: CO₂ (linear), BF₃/BCl₃ (trigonal planar), CCl₄/CH₄ (tetrahedral), SF₆ (octahedral)","Hydrogen bonding — N−H, O−H, F−H; F−H···F > O−H···O > N−H···N; increases bp and solubility","London dispersion — weakest; increases with molecular size and surface area","Resonance — delocalization of π electrons; average bond order between resonance structures"]}
  ]}
 ],
 topics:["Ionic bonding: formation, Born-Haber cycle, lattice energy","Covalent bonding: Lewis structures, formal charge","VSEPR theory: geometry based on electron pairs","sp, sp², sp³, sp³d, sp³d² hybridization and geometry","MOT: bonding/antibonding MOs; bond order","O₂ paramagnetic (2 unpaired e⁻); N₂ BO=3","Resonance; dipole moment (vector sum)","Hydrogen bonding: N−H, O−H, F−H","Intermolecular forces: London, dipole-dipole","Zero dipole: CO₂, BCl₃, CCl₄, BF₃, SF₆"],
 formulas:[{t:"Formal Charge",f:"FC=Valence e⁻−Non-bonding e⁻−½(Bonding e⁻)"},{t:"Bond Order",f:"BO=(bonding e⁻−antibonding e⁻)/2; BO>0 stable; BO=0 unstable"},{t:"MOT O₂",f:"O₂: BO=2; 2 unpaired e⁻; paramagnetic; σ1s²σ*1s²σ2s²σ*2s²σ2p²π2p⁴π*2p²"},{t:"MOT N₂",f:"N₂: BO=3; all paired; diamagnetic; strongest N−N bond"},{t:"MOT Special",f:"He₂: BO=0 (doesn't exist); Li₂: BO=1; O₂⁺: BO=2.5"},{t:"Hybridization",f:"No. of hybrid orbitals=σ bonds+lone pairs on central atom"},{t:"VSEPR Geometries",f:"2bp: linear; 3bp: trigonal planar; 4bp: tetrahedral; 3bp+1lp: pyramidal; 2bp+2lp: bent"},{t:"Bond Angles",f:"sp: 180°; sp²: 120°; sp³: 109.5°; lone pairs reduce angle"},{t:"Dipole Moment",f:"μ=q×d (Debye); net=vector sum; zero for symmetric molecules"},{t:"Zero Dipole",f:"CO₂(linear); BF₃,BCl₃,AlCl₃(trigonal planar); CH₄,CCl₄(tetrahedral); SF₆(octahedral)"},{t:"Ionic Bond",f:"Lattice energy∝(q⁺q⁻/r); Born-Haber cycle gives lattice energy"},{t:"H-Bond Strength",f:"F−H…F > O−H…O > N−H…N; increases bp,bp,solubility"},{t:"London Forces",f:"Induced dipole; increases with molecular size and surface area; weakest"},{t:"Resonance Effect",f:"Delocalization of π electrons; average bond order; actual structure between resonance structures"},{t:"Back Bonding",f:"BF₃: F lone pair → empty p of B; increases bond order; BF₃ less Lewis acid than BCl₃"}],
 keyPoints:["VSEPR: CH₄ 109.5°>NH₃ 107°>H₂O 104.5°","sp:180°; sp²:120°; sp³:109.5°; sp³d:TBP; sp³d²:octahedral","O₂: paramagnetic; N₂: BO=3 strongest N-N bond","Zero dipole: symmetric molecules cancel out"],
 mindmap:{root:"Chemical\nBonding",branches:[{n:"Bond Types",col:"#059669",nodes:["Ionic Transfer","Covalent Sharing","Coordinate Dative","H-Bonding N-H,O-H"]},{n:"Geometry VSEPR",col:"#10b981",nodes:["VSEPR Theory","Hybridization sp/sp²/sp³","Lone Pair Effect","Bond Angles"]},{n:"MOT",col:"#047857",nodes:["Bonding/Antibonding","Bond Order","O₂ Paramagnetic","N₂ BO=3"]},{n:"Intermolecular",col:"#065f46",nodes:["Dipole Moment μ","London Dispersion","Dipole-Dipole","Resonance"]}]}},

{id:"c4",sub:"chem",name:"States of Matter & Solutions",weight:"High",est:3, syllabus:[
  {topic:"Gaseous State",subtopics:[
    {name:"Gas Laws & Ideal Gas",concepts:["Boyle's law — P₁V₁=P₂V₂ at constant T,n","Charles's law — V₁/T₁=V₂/T₂ at constant P,n","Combined/Ideal gas — PV=nRT; R=8.314 J/mol·K=0.0821 L·atm/mol·K","Dalton's law — P_total=ΣPᵢ; Pᵢ=χᵢP_total","Graham's law — r∝1/√M; r₁/r₂=√(M₂/M₁)"]},
    {name:"Real Gases & Kinetic Theory",concepts:["van der Waals equation — (P+an²/V²)(V−nb)=nRT; a=attraction; b=excluded volume","Compressibility factor Z=PV/nRT; Z=1 ideal; Z<1 moderate P (attractions); Z>1 high P (repulsions)","Kinetic theory — v_rms=√(3RT/M); v_avg=√(8RT/πM); v_mp=√(2RT/M); KE per molecule=3kT/2","Critical constants — Tc=8a/27Rb; Vc=3nb; Pc=a/27b²"]}
  ]},
  {topic:"Solutions & Colligative Properties",subtopics:[
    {name:"Solution Laws",concepts:["Henry's law — P=K_H·χ_gas (gas solubility ∝ pressure)","Raoult's law — P_A=P°_A·χ_A; ideal solution; P_total=P°_AχA+P°_BχB","Non-ideal solutions — positive deviation (A-B < A-A, B-B; azeotrope min boiling); negative deviation (A-B > interactions; azeotrope max boiling)"]},
    {name:"Colligative Properties",concepts:["Relative lowering of VP — (P°−P)/P°=χ_B=n_B/(n_A+n_B)","Elevation of boiling point — ΔTb=iKbm; Kb(H₂O)=0.52 K·kg/mol","Depression of freezing point — ΔTf=iKfm; Kf(H₂O)=1.86 K·kg/mol","Osmotic pressure — π=iMRT; M=molarity; used for molar mass determination","Van't Hoff factor i — i>1 dissociation (electrolytes); i<1 association; i=1 non-electrolyte"]}
  ]}
 ],
 topics:["Ideal gas PV=nRT; kinetic theory; Van der Waals equation","Gas laws: Boyle, Charles, Gay-Lussac, Avogadro","Dalton's law; Graham's law of diffusion ∝1/√M","Real gas: Z=PV/nRT; compressibility factor; critical constants","Henry's law; Raoult's law: P_A=P°_A·χ_A","Colligative properties: ΔTb=iKbm, ΔTf=iKfm, π=iMRT","Van't Hoff factor i; abnormal molecular mass","Non-ideal solutions: positive/negative deviation; azeotropes"],
 formulas:[{t:"Ideal Gas Law",f:"PV=nRT; R=8.314 J/(mol·K)=0.0821 L·atm/(mol·K)"},{t:"Boyle's Law",f:"PV=const (T,n fixed); P₁V₁=P₂V₂"},{t:"Charles's Law",f:"V/T=const (P,n fixed); V₁/T₁=V₂/T₂; T in Kelvin"},{t:"Combined Gas Law",f:"P₁V₁/T₁=P₂V₂/T₂"},{t:"Dalton's Law",f:"P_total=ΣPᵢ; Pᵢ=χᵢ·P_total; for gas collected over water: P_gas=P_total−P_water"},{t:"Graham's Law",f:"r₁/r₂=√(M₂/M₁); rate of diffusion∝1/√M at same T,P"},{t:"Van der Waals",f:"(P+an²/V²)(V−nb)=nRT; a=intermolecular attraction; b=volume excluded"},{t:"Compressibility Factor",f:"Z=PV/nRT; Z=1 ideal; Z<1 at moderate P (attractive forces); Z>1 at very high P"},{t:"Critical Constants",f:"Tc=8a/(27Rb); Vc=3nb; Pc=a/(27b²)"},{t:"Henry's Law",f:"P_gas=K_H×χ_gas; solubility of gas∝pressure"},{t:"Raoult's Law",f:"P_A=P°_A·χ_A; P_total=P°_A·χ_A+P°_B·χ_B"},{t:"Relative Lowering VP",f:"(P°_A−P_A)/P°_A=χ_B=n_B/(n_A+n_B)"},{t:"Elevation Boiling Pt",f:"ΔTb=iKb·m; Kb(H₂O)=0.52 K·kg/mol"},{t:"Depression Freezing Pt",f:"ΔTf=iKf·m; Kf(H₂O)=1.86 K·kg/mol (cryoscopic constant)"},{t:"Osmotic Pressure",f:"π=iMRT; M=molarity; R=0.0821 L·atm; T in K"},{t:"Van't Hoff Factor",f:"i=1+(n−1)α for n ions; i<1 for association; i>1 for dissociation"},{t:"Colligative Properties",f:"Depend only on number of solute particles; not on nature"}],
 keyPoints:["Colligative: depend ONLY on number of particles","i>1 electrolytes; i<1 for association","Azeotrope: positive deviation→min boiling; negative→max boiling","Z<1 at moderate P; Z>1 at high P"],
 mindmap:{root:"States of Matter\n& Solutions",branches:[{n:"Gas Laws",col:"#059669",nodes:["PV=nRT Ideal","Van der Waals a,b","Dalton's Partial P","Graham's 1/√M"]},{n:"Solutions",col:"#10b981",nodes:["Raoult's P=P°χ","Henry's Law Gas","Non-ideal Deviation","Azeotropes"]},{n:"Colligative",col:"#047857",nodes:["ΔTb=iKbm","ΔTf=iKfm","π=iMRT","Van't Hoff i"]},{n:"Real Gas",col:"#065f46",nodes:["Z=PV/nRT","Z<1 attractions","Z>1 repulsions","Critical Temp"]}]}},

{id:"c5",sub:"chem",name:"Thermodynamics & Equilibrium",weight:"High",est:5, syllabus:[
  {topic:"Thermodynamics",subtopics:[
    {name:"First Law & Enthalpy",concepts:["First law — ΔU=Q−W; W=PΔV (expansion work); Q>0 absorbed; W>0 done by system","Enthalpy — H=U+PV; ΔH=ΔU+ΔngRT (Δng=moles gas products−reactants)","Hess's law — ΔH_rxn=ΣΔHf(products)−ΣΔHf(reactants); path independent","Bond enthalpy — ΔH=ΣBE(bonds broken)−ΣBE(bonds formed)","Kirchhoff's law — ΔHT₂=ΔHT₁+ΔCp(T₂−T₁)"]},
    {name:"Second Law & Gibbs Energy",concepts:["Entropy — ΔS=Q_rev/T; S solid<liquid<gas; ΔS_universe≥0 for spontaneous process","Gibbs free energy — ΔG=ΔH−TΔS; spontaneous if ΔG<0; equilibrium if ΔG=0","Spontaneity cases — ΔH<0,ΔS>0: always spontaneous; ΔH>0,ΔS<0: never spontaneous; same sign: T-dependent","Relation to K — ΔG°=−RT lnK; ΔG=ΔG°+RT lnQ; at equilibrium ΔG=0"]}
  ]},
  {topic:"Chemical & Ionic Equilibrium",subtopics:[
    {name:"Equilibrium Constants",concepts:["Kc=[products]/[reactants]; Kp=Kc(RT)^Δn; Δn=moles gas products−reactants","Q vs K — Q<K: forward; Q>K: backward; Q=K: equilibrium","Le Chatelier's principle — system shifts to oppose applied stress; catalyst doesn't change K","Degree of dissociation — α: for A⇌B+C: Kc=α²C/(1−α)"]},
    {name:"Ionic Equilibrium",concepts:["Kw=[H⁺][OH⁻]=10⁻¹⁴ at 25°C; pH+pOH=14","Weak acid — Ka=[H⁺][A⁻]/[HA]; [H⁺]=√(KaC); pH=½(pKa−logC)","Weak base — Kb; pOH=½(pKb−logC)","Buffer — Henderson-Hasselbalch: pH=pKa+log([A⁻]/[HA]); max capacity at pH=pKa","Salt hydrolysis — weak acid+strong base: pH>7; strong acid+weak base: pH<7","Ksp — AB: Ksp=s²; AB₂: Ksp=4s³; AB₃: Ksp=27s⁴; common ion effect reduces solubility"]}
  ]}
 ],
 topics:["First law: ΔU=Q−W; enthalpy H=U+PV","Standard enthalpies; Hess's law; bond enthalpies","ΔG=ΔH−TΔS; spontaneity ΔG<0","ΔG°=−RT lnK; 4 cases ΔH and ΔS combinations","Kc and Kp; Kp=Kc(RT)^Δn; Le Chatelier's principle","Degree of dissociation calculations","Kw, pH, pOH; pH+pOH=14; weak acid pH=½(pKa−logC)","Buffer: Henderson-Hasselbalch pH=pKa+log([A⁻]/[HA])","Ksp; common ion effect; salt hydrolysis"],
 formulas:[{t:"First Law",f:"ΔU=Q−W; W=PΔV (expansion work); Q>0 heat absorbed; W>0 work done by system"},{t:"Enthalpy",f:"H=U+PV; ΔH=ΔU+ΔngRT (gases); Δng=moles gas products−reactants"},{t:"Hess's Law",f:"ΔH_rxn=ΣΔH_f(products)−ΣΔH_f(reactants); path independent"},{t:"Bond Enthalpy",f:"ΔH_rxn=ΣBE(bonds broken)−ΣBE(bonds formed)"},{t:"Kirchhoff's Law",f:"ΔH_T₂=ΔH_T₁+ΔCp(T₂−T₁)"},{t:"Entropy",f:"ΔS=Q_rev/T (reversible); ΔS_universe≥0 (2nd law); ΔS solid<liquid<gas"},{t:"Gibbs Free Energy",f:"ΔG=ΔH−TΔS; spontaneous if ΔG<0; equilibrium if ΔG=0"},{t:"Spontaneity Cases",f:"ΔH<0,ΔS>0: always spontaneous; ΔH>0,ΔS<0: never; other cases: T-dependent"},{t:"ΔG and K",f:"ΔG°=−RT lnK=−2.303RT logK"},{t:"ΔG=ΔG°+RT lnQ",f:"At equilibrium: ΔG=0; ΔG°=−RT lnK; Q<K: ΔG<0 forward; Q>K: ΔG>0 backward"},{t:"Kc and Kp",f:"Kp=Kc(RT)^Δn; Δn=moles gas products−reactants"},{t:"Le Chatelier",f:"System shifts to oppose stress: add reactant→forward; increase P→fewer moles gas side"},{t:"Degree of Dissociation",f:"α: for A⇌B+C; Kc=α²C/(1−α); for simple A⇌2B: Kc=4α²C/(1−α)²"},{t:"pH Scale",f:"pH=−log[H⁺]; pOH=−log[OH⁻]; pH+pOH=14 at 25°C"},{t:"Weak Acid",f:"Ka=[H⁺][A⁻]/[HA]; [H⁺]=√(KaC); pH=½(pKa−logC)"},{t:"Weak Base",f:"Kb=[OH⁻][B⁺]/[B]; pOH=½(pKb−logC)"},{t:"Buffer",f:"pH=pKa+log([A⁻]/[HA]) Henderson-Hasselbalch; max buffer capacity at pH=pKa"},{t:"Salt Hydrolysis",f:"Salt of weak acid+strong base: pH>7; strong acid+weak base: pH<7"},{t:"Ksp",f:"AB: Ksp=s²; AB₂ or A₂B: Ksp=4s³; AB₃ or A₃B: Ksp=27s⁴"}],
 keyPoints:["ΔH<0,ΔS>0: spontaneous at ALL temperatures","ΔH>0,ΔS<0: NEVER spontaneous","Catalyst: does NOT change K; only increases rate","Buffer max capacity when pH=pKa"],
 mindmap:{root:"Thermodynamics\n& Equilibrium",branches:[{n:"Thermochemistry",col:"#059669",nodes:["ΔU=Q−W","ΔH=ΔU+ΔnₘRT","Hess's Law","Bond Enthalpies"]},{n:"Spontaneity",col:"#10b981",nodes:["ΔG=ΔH−TΔS","ΔG<0 Spontaneous","ΔG°=−RT lnK","4 Cases"]},{n:"Equilibrium",col:"#047857",nodes:["Kc, Kp","Kp=Kc(RT)^Δn","Le Chatelier","Degree Diss α"]},{n:"Ionic Equil",col:"#065f46",nodes:["Kw=10⁻¹⁴","Henderson Buffer","Ksp Common Ion","Salt Hydrolysis"]}]}},

{id:"c6",sub:"chem",name:"Electrochemistry & Chemical Kinetics",weight:"High",est:4, syllabus:[
  {topic:"Electrochemistry",subtopics:[
    {name:"Electrochemical Cells",concepts:["Galvanic cell — anode (−) oxidation; cathode (+) reduction","E°_cell=E°_cathode−E°_anode (both as reduction potentials); higher E°_red=stronger oxidising agent","Nernst equation — E=E°−(0.0591/n)logQ at 25°C","ΔG°=−nFE°; F=96500 C/mol; E°=(0.0591/n)logK","Standard hydrogen electrode (SHE) — reference; E°=0.00 V"]},
    {name:"Electrolysis & Conductance",concepts:["Faraday's 1st law — m=ZIt=MIt/nF; Z=electrochemical equivalent","Faraday's 2nd law — m₁/m₂=E₁/E₂ (E=equivalent weight) for same charge","Kohlrausch's law — Λ°m=Σνᵢ·λ°ᵢ (limiting molar conductivities)","Molar conductance — Λm=κ×1000/C; strong electrolyte: Λm=Λ°m−K√C","Conductance increases with temperature for electrolytes"]}
  ]},
  {topic:"Chemical Kinetics",subtopics:[
    {name:"Rate Laws & Integrated Rate Equations",concepts:["Rate=k[A]^m[B]^n; order=m+n; k depends on order for units","Zero order — [A]=[A]₀−kt; t½=[A]₀/2k; units of k: mol/L·s","First order — [A]=[A]₀e^(−kt); t½=0.693/k; units: s⁻¹; radioactive decay","Second order — 1/[A]=1/[A]₀+kt; t½=1/k[A]₀; units: L/mol·s","After n half-lives — [A]=[A]₀/2ⁿ"]},
    {name:"Arrhenius & Catalysis",concepts:["Arrhenius equation — k=Ae^(−Ea/RT); A=pre-exponential factor","Temperature dependence — ln(k₂/k₁)=(Ea/R)(1/T₁−1/T₂); Ea from slope of lnk vs 1/T plot","Catalyst — lowers Ea; increases k and rate; does NOT change ΔG, K, or equilibrium position","Enzyme catalysis — lock-and-key model; active site; highly specific; factors: T, pH, substrate conc","Homogeneous vs heterogeneous catalysis"]}
  ]}
 ],
 topics:["Galvanic cell: anode (oxidation), cathode (reduction)","Standard electrode potentials E°_red; SHE=0.00 V","EMF E°_cell=E°_cathode−E°_anode; Nernst equation","ΔG°=−nFE°; relation to K","Faraday's laws of electrolysis; products of electrolysis","Molar conductance; Kohlrausch's law","Rate law rate=k[A]^m[B]^n; order vs molecularity","Integrated rate: 0th, 1st, 2nd order; half-lives","Arrhenius: k=Ae^(−Ea/RT); catalyst lowers Ea"],
 formulas:[{t:"Cell EMF",f:"E°_cell=E°_cathode−E°_anode (both reduction potentials)"},{t:"Nernst Equation",f:"E=E°−(RT/nF)lnQ=E°−(0.0591/n)logQ at 25°C"},{t:"ΔG and EMF",f:"ΔG°=−nFE°; F=96500 C/mol; ΔG°=−RT lnK"},{t:"E° and K",f:"E°=(0.0591/n)logK at 25°C; logK=nE°/0.0591"},{t:"Faraday's 1st Law",f:"m=ZIt=Mit/nF; Z=M/(nF)=electrochemical equivalent"},{t:"Faraday's 2nd Law",f:"m₁/m₂=E₁/E₂ (E=equivalent weight) for same Q"},{t:"Kohlrausch's Law",f:"Λ°_m=Σν_i·λ°_i; λ°=limiting molar conductivity of ions"},{t:"Conductance",f:"κ=1/ρ (specific conductance); Λ_m=κ×1000/C (C in mol/L)"},{t:"Conductance Variation",f:"Strong electrolyte: Λ_m=Λ°_m−K√C (Debye-Hückel-Onsager)"},{t:"Rate Law",f:"rate=k[A]^m[B]^n; order=m+n; k=rate constant; units of k depend on order"},{t:"Zero Order",f:"[A]=[A]₀−kt; t½=[A]₀/2k; units of k: mol/(L·s)"},{t:"First Order",f:"[A]=[A]₀e^(−kt); lnk[A]₀/[A]=kt; t½=0.693/k; units: s⁻¹"},{t:"Second Order",f:"1/[A]=1/[A]₀+kt; t½=1/(k[A]₀); units: L/(mol·s)"},{t:"Arrhenius",f:"k=Ae^(−Ea/RT); ln(k₂/k₁)=(Ea/R)(1/T₁−1/T₂); Ea=activation energy"},{t:"Catalyst Effect",f:"Lowers Ea; increases k; does NOT change ΔG, K, or equilibrium position"},{t:"Half-life after n",f:"After n half-lives: [A]=[A]₀/2ⁿ; amount remaining=1/2ⁿ fraction"}],
 keyPoints:["Higher E°_red → stronger oxidizing agent","Molecularity ≤3; order can be fractional/negative","Catalyst lowers Ea; does NOT change ΔG or K","After n half-lives: [A]=[A]₀×(½)ⁿ"],
 mindmap:{root:"Electrochemistry\n& Kinetics",branches:[{n:"Electrochemistry",col:"#059669",nodes:["E°_cell=E°_cat−E°_an","Nernst Equation","ΔG=−nFE°","Faraday's Laws"]},{n:"Electrolysis",col:"#10b981",nodes:["Products at Electrodes","m=ZIt","Kohlrausch's Law","Conductometry"]},{n:"Rate Laws",col:"#047857",nodes:["rate=k[A]^m[B]^n","Order from Expt","Units of k","Half-life"]},{n:"Arrhenius",col:"#065f46",nodes:["k=Ae^(−Ea/RT)","ln(k₂/k₁)","Activation Energy","Catalyst lowers Ea"]}]}},

{id:"c7",sub:"chem",name:"Organic Chemistry — Structure & Reactions",weight:"High",est:7, syllabus:[
  {topic:"Organic Basics — Structure & Nomenclature",subtopics:[
    {name:"IUPAC & Isomerism",concepts:["DoU=(2C+2+N−H−X)/2; each ring=1; each π bond=1; benzene ring=4","IUPAC priority — COOH>SO₃H>COOR>COCl>CONH₂>CHO>C=O>OH>NH₂>C≡C>C=C","Structural isomers — chain, position, functional group, tautomers","Geometric isomers — E/Z (cis-trans); Cahn-Ingold-Prelog priority rules","Optical isomers — chirality, chiral centre, enantiomers, diastereomers, meso compounds"]},
    {name:"Electronic Effects",concepts:["Inductive effect — +I: alkyl groups push electrons; −I: halogens, NO₂, COOH pull; decreases with distance","Mesomeric/Resonance — +M: OH, NH₂, OR donate lone pair to π; −M: NO₂, COOH, CHO withdraw via π","Hyperconjugation — C−H σ electrons delocalize into adjacent π system; stabilises carbocations","Carbocation stability — 3°>2°>1°>CH₃⁺; allylic=benzylic>3°; resonance and hyperconjugation","Carbanion stability — opposite to carbocation; −I/−M groups stabilise","Free radical stability — 3°>2°>1°>CH₃·; stabilised by hyperconjugation and resonance"]}
  ]},
  {topic:"Reaction Mechanisms",subtopics:[
    {name:"Substitution Reactions",concepts:["SN1 — 3° substrate; protic solvent; carbocation; racemisation; rate=k[RX]; rearrangement possible","SN2 — 1° substrate; polar aprotic; concerted; Walden inversion; rate=k[RX][Nu]; no rearrangement","Nucleophilic aromatic substitution (NAS) — needs strong EWG at ortho/para; Meisenheimer complex intermediate","Leaving group order — I⁻>Br⁻>Cl⁻>F⁻; OTs>OMs"]},
    {name:"Elimination & Addition",concepts:["E2 — anti-periplanar geometry; Zaitsev (more substituted alkene) or Hofmann (bulky base, less substituted)","E1 — 3° substrate; protic solvent; carbocation intermediate; Zaitsev product","Competition — bulky base + 2° substrate → E2 over SN2; high T favors E","Markovnikov addition — H⁺ to C with more H; positive charge on more substituted C","Anti-Markovnikov — HBr+peroxide: radical mechanism; H to less substituted C","EAS mechanism — electrophile → Wheland (arenium) σ-complex → deprotonation; o/p directors (OH,NH₂,CH₃,X) vs m directors (NO₂,CN,COOH)"]}
  ]}
 ],
 topics:["IUPAC nomenclature: all functional groups","Degree of unsaturation DoU=(2C+2+N−H−X)/2","Structural, chain, position, functional, tautomerism isomers","Stereo: geometrical (cis-trans), optical (R,S); chirality","Inductive (+I,−I), mesomeric (+M,−M), hyperconjugation effects","Stability of carbocations: 3°>2°>1°>CH₃⁺","SN1: 3° substrate, protic solvent, racemization","SN2: 1° substrate, aprotic solvent, Walden inversion","E1, E2 elimination: Zaitsev and Hofmann rules","EAS: ortho/para/meta directors; mechanism","Addition to alkenes: Markovnikov, anti-Markovnikov","Named reactions: Aldol, Cannizzaro, Grignard, Diels-Alder, Wittig"],
 formulas:[{t:"DoU (IHD)",f:"DoU=(2C+2+N−H−X)/2; O,S not counted; DoU≥4 suggests ring+double bond or aromatic"},{t:"IUPAC Priority",f:"Functional group priority: COOH>SO₃H>COOR>COCl>CONH₂>CHO>C=O>OH>NH₂>C≡C>C=C"},{t:"Inductive Effect",f:"+I: alkyl groups push electrons; −I: halogens,NO₂,COOH pull; decreases with distance"},{t:"Mesomeric Effect",f:"+M: OH,NH₂,OR donate lone pair to π; −M: NO₂,COOH,CHO withdraw via π"},{t:"Hyperconjugation",f:"C−H σ electrons delocalize into adjacent π system; stabilizes carbocations/alkenes"},{t:"Carbocation Stability",f:"3°>2°>1°>CH₃⁺; allylic=benzylic>3°; propargylic<1°; resonance stabilization"},{t:"Carbanion Stability",f:"CH₃⁻>1°>2°>3° (opposite to carbocation); −I/−M groups stabilize"},{t:"Free Radical",f:"3°>2°>1°>CH₃·; stabilised by hyperconjugation and resonance"},{t:"SN1 Rate Law",f:"rate=k[RX]; 3°>2°>1°; protic polar solvent; racemisation; rearrangement possible"},{t:"SN2 Rate Law",f:"rate=k[RX][Nu]; 1°>2°>3°; polar aprotic solvent; inversion (Walden); no rearrangement"},{t:"E1",f:"rate=k[RX]; 3° preferred; protic solvent; Zaitsev product (more substituted alkene)"},{t:"E2",f:"rate=k[RX][Base]; anti-periplanar geometry; Zaitsev; bulky base→Hofmann"},{t:"Markovnikov",f:"H adds to C with MORE H; positive charge on more substituted C (more stable)"},{t:"Anti-Markovnikov",f:"HBr+peroxide: radical mechanism; H adds to less substituted C"},{t:"EAS Mechanism",f:"Electrophile attacks π system → arenium (Wheland) intermediate → deprotonation"},{t:"o/p Directors",f:"OH,NH₂,CH₃,X (halogens): activate (except X); increase e-density at o/p"},{t:"m Directors",f:"NO₂,SO₃H,CHO,COOH,CN: deactivate; withdraw e-density from o/p; m product major"}],
 keyPoints:["SN1: 3° substrate, protic, weak Nu, carbocation, racemization","SN2: 1° substrate, aprotic, strong Nu, concerted, inversion","Aldol: needs α-H; Cannizzaro: no α-H","Grignard RMgX: attacks C=O → alcohol after hydrolysis"],
 mindmap:{root:"Organic\nReactions",branches:[{n:"Structure & Effects",col:"#059669",nodes:["Inductive +I,−I","Mesomeric +M,−M","Hyperconjugation","Carbocation Stability"]},{n:"Substitution",col:"#10b981",nodes:["SN1 (3°,protic)","SN2 (1°,aprotic)","EAS (o/p/m dirs)","NAS Conditions"]},{n:"Elimination",col:"#047857",nodes:["E1 vs E2","Zaitsev (major)","Hofmann (bulky)","Anti-Periplanar E2"]},{n:"Named Reactions",col:"#065f46",nodes:["Aldol/Cannizzaro","Grignard RMgX","Diels-Alder [4+2]","Markovnikov/Anti"]}]}},

{id:"c8",sub:"chem",name:"Coordination & Inorganic Chemistry",weight:"High",est:4, syllabus:[
  {topic:"Crystal Field Theory & Coordination Compounds",subtopics:[
    {name:"Crystal Field Theory",concepts:["d-orbital splitting in octahedral field — t₂g (−0.4Δ₀) and eᵍ (+0.6Δ₀)","CFSE — sum of stabilisation energies for each electron; calculated from electron configuration","High spin vs low spin — weak field (small Δ, high spin, more unpaired) vs strong field (large Δ, low spin, fewer unpaired)","Spectrochemical series — I⁻<Br⁻<SCN⁻<Cl⁻<F⁻<OH⁻<H₂O<NH₃<en<CN⁻<CO","Tetrahedral CFT — Δt=(4/9)Δ₀; usually high spin","Color — d-d transition; complementary color of absorbed light is observed"]},
    {name:"Coordination Compounds",concepts:["Werner theory — primary valence=OS (ionisable); secondary valence=CN (non-ionisable, directed in space)","IUPAC nomenclature — anionic ligands (alphabetically) then neutral ligands then metal with OS; counterion last","Isomers — linkage (ambidentate: NO₂⁻/ONO⁻); ionisation ([Co(Cl)(NO₂)(en)₂]Cl vs [Co(Cl)₂(en)₂]NO₂)","Geometric isomerism — cis/trans in square planar MA₂B₂ and octahedral MA₄B₂","Optical isomerism — [Co(en)₃]³⁺ non-superimposable mirror images; Δ and Λ forms","Magnetic moment — μ=√[n(n+2)] BM; paramagnetic if n>0 unpaired electrons"]}
  ]},
  {topic:"d-Block, f-Block & Industrial Processes",subtopics:[
    {name:"Transition Metals & f-Block",concepts:["Variable oxidation states — due to small energy gap between (n-1)d and ns; multiple OS stable","Color and catalytic activity — d-d transitions; partially filled d orbitals","Lanthanide contraction — poor 4f shielding; atomic radii of 4d and 5d elements nearly equal (Zr≈Hf)","Diagonal relationship — Li−Mg; Be−Al; B−Si (similar properties across periods 2 and 3)"]},
    {name:"Industrial Processes",concepts:["Haber process — N₂+3H₂⇌2NH₃; Fe catalyst (promoter Al₂O₃,K₂O); 450°C; 200 atm; ~15% yield","Contact process — 2SO₂+O₂⇌2SO₃; V₂O₅ catalyst; 450°C; 1-2 atm; then SO₃+H₂SO₄→oleum","Solvay process — Na₂CO₃ from NaCl+NH₃+CO₂; NaHCO₃ precipitates first","Hall-Héroult — electrolytic extraction of Al from Al₂O₃ in molten cryolite (Na₃AlF₆)","Cyanide process — Ag and Au extraction: 4Ag+8NaCN+O₂+2H₂O→4Na[Ag(CN)₂]+4NaOH"]}
  ]}
 ],
 topics:["CFT: d-orbital splitting in octahedral field Δ₀","CFSE: t₂g (−0.4Δ₀), eᵍ (+0.6Δ₀); high spin vs low spin","Spectrochemical series: I⁻<Cl⁻<F⁻<OH⁻<H₂O<NH₃<en<CO<CN⁻","Color: d-d transitions; magnetic moment μ=√[n(n+2)] BM","IUPAC nomenclature of coordination compounds","Isomerism: linkage, ionization, geometric, optical","s-block anomalies: Li≈Mg, Be≈Al (diagonal)","d-block: variable OS, color, catalysis; lanthanide contraction","Industrial: Haber, Contact, Solvay, Hall-Heroult processes"],
 formulas:[{t:"CFSE Octahedral",f:"t₂g: −0.4Δ₀ each e⁻; eᵍ: +0.6Δ₀ each; CFSE=−(0.4×t₂g−0.6×eᵍ)Δ₀"},{t:"CFSE Tetrahedral",f:"Δt=(4/9)Δ₀; e: −0.6Δt; t₂: +0.4Δt; usually high spin"},{t:"Spectrochemical Series",f:"I⁻<Br⁻<SCN⁻<Cl⁻<F⁻<OH⁻<C₂O₄²⁻<H₂O<NCS⁻<NH₃<en<CN⁻<CO"},{t:"Magnetic Moment",f:"μ=√[n(n+2)] BM; n=number of unpaired electrons; para if n>0"},{t:"Naming Order",f:"[anion ligands alphabetically, neutral alphabetically, metal (OS)] counterion"},{t:"Werner Theory",f:"Primary valence=OS; secondary valence=CN (coordination number)"},{t:"IUPAC Coordination",f:"Prefix: di,tri,tetra for simple; bis,tris,tetrakis for complex ligands"},{t:"EAN Rule",f:"Effective Atomic Number=Z−charge+2×CN; stable at noble gas configuration"},{t:"Linkage Isomerism",f:"Ambidentate ligands: NO₂⁻ vs ONO⁻; SCN⁻ vs NCS⁻"},{t:"Geometric Isomerism",f:"Square planar MA₂B₂: cis/trans; octahedral MA₄B₂: cis/trans"},{t:"Optical Isomerism",f:"Non-superimposable mirror images; [Co(en)₃]³⁺ is chiral"},{t:"Haber Process",f:"N₂+3H₂⇌2NH₃; Fe catalyst; 450°C; 200 atm; yield~15%"},{t:"Contact Process",f:"2SO₂+O₂⇌2SO₃; V₂O₅ catalyst; 450°C; 1-2 atm"},{t:"Lanthanide Contraction",f:"4f electrons poor shielding; Zr≈Hf; 2nd and 3rd row TMs similar size"},{t:"Diagonal Relationship",f:"Li−Mg; Be−Al; B−Si: similar properties across period 2 and 3"}],
 keyPoints:["Strong field: large Δ, low spin, fewer unpaired e⁻","Color: complementary of light absorbed; d-d transition","Li anomalous: resembles Mg diagonally; Be resembles Al","Lanthanide contraction: 3rd row TMs similar size to 2nd row"],
 mindmap:{root:"Coordination\n& Inorganic",branches:[{n:"Crystal Field",col:"#059669",nodes:["Octahedral Δ₀","t₂g vs eᵍ","CFSE","Spectrochemical Series"]},{n:"Isomerism",col:"#10b981",nodes:["Werner Theory","Linkage/Ionization","Geometric/Optical","Hybridization VBT"]},{n:"Magnetic & Color",col:"#047857",nodes:["μ=√[n(n+2)] BM","d-d Transitions","High vs Low Spin","Paramagnetic"]},{n:"Inorganic",col:"#065f46",nodes:["s-block Anomalies","p-block Compounds","d-block Properties","Haber/Contact"]}]}},

{id:"c9",sub:"chem",name:"Solid State",weight:"Medium",est:3, syllabus:[
  {topic:"Crystal Structure & Packing",subtopics:[
    {name:"Unit Cells & Cubic Systems",concepts:["SC — Z=1; r=a/2; APF=52.4%; CN=6","BCC — Z=2; r=√3a/4; APF=68%; CN=8","FCC/CCP — Z=4; r=a/(2√2); APF=74%; CN=12","HCP — Z=6; APF=74% (same as FCC); CN=12","Density formula — ρ=ZM/(Nₐa³); a=edge length","Tetrahedral voids=2Z; Octahedral voids=Z per FCC unit cell"]},
    {name:"Ionic Crystal Structures",concepts:["Radius ratio rules — CN=8 (r+/r−>0.732); CN=6 (0.414–0.732); CN=4 (0.225–0.414)","NaCl structure — FCC Cl⁻; Na⁺ in all octahedral voids; CN=6:6; Z=4","CsCl structure — SC; Cs⁺ at body centre; CN=8:8; Z=1 (NOT BCC!)","ZnS zinc blende — FCC S²⁻; Zn²⁺ in alternate tetrahedral voids; CN=4:4","ZnS wurtzite — HCP S²⁻; Zn²⁺ in tetrahedral voids; CN=4"]}
  ]},
  {topic:"Crystal Defects & Semiconductors",subtopics:[
    {name:"Point Defects",concepts:["Schottky defect — equal cation and anion vacancies; density decreases; found in NaCl, KCl","Frenkel defect — smaller ion displaced to interstitial site; density unchanged; AgCl, AgBr","F-centres — anion vacancies filled by electrons; crystal appears coloured; metal excess defect","Impurity defects — aliovalent impurity creates vacancies; e.g., SrCl₂ in NaCl"]},
    {name:"Semiconductors",concepts:["Intrinsic semiconductor — pure Si/Ge; conductivity increases with T","n-type doping — Group 15 impurity (P, As) in Si; extra electron; donor level below conduction band","p-type doping — Group 13 impurity (B, Al) in Si; hole created; acceptor level above valence band"]}
  ]}
 ],
 topics:["Crystalline vs amorphous; unit cell; 7 crystal systems; 14 Bravais lattices","SC: 1 atom/cell; r=a/2; packing 52%","BCC: 2 atoms/cell; r=√3a/4; packing 68%","FCC/CCP: 4 atoms/cell; r=a/(2√2); packing 74%","Tetrahedral voids (2 per atom); octahedral voids (1 per atom)","Radius ratio rules; ionic crystal structures","NaCl (CN=6:6 FCC); CsCl (CN=8:8); ZnS zinc blende","Defects: Schottky (missing pairs, density↓), Frenkel (displaced, density same)","n-type and p-type doping"],
 formulas:[{t:"Density (cubic)",f:"ρ=Z×M/(Nₐ×a³); Z=atoms/unit cell; a=edge length"},{t:"SC Unit Cell",f:"Z=1; r=a/2; APF=52.4%; CN=6"},{t:"BCC Unit Cell",f:"Z=2; r=√3a/4; APF=68%; CN=8"},{t:"FCC Unit Cell",f:"Z=4; r=a/(2√2); APF=74%; CN=12"},{t:"HCP Unit Cell",f:"Z=6; r=a/2; APF=74%; CN=12; same APF as FCC"},{t:"Voids in FCC",f:"Tetrahedral voids=2Z=8; Octahedral voids=Z=4 per FCC unit cell"},{t:"Radius Ratio (CN)",f:"CN=8: r+/r->0.732; CN=6: 0.414-0.732; CN=4: 0.225-0.414; CN=3: 0.155-0.225"},{t:"NaCl Structure",f:"FCC; Na⁺ in octahedral voids; CN(Na⁺)=CN(Cl⁻)=6; Z=4"},{t:"CsCl Structure",f:"SC; Cs⁺ at body center; CN=8; not BCC (different species); Z=1"},{t:"ZnS Zinc Blende",f:"FCC S²⁻; Zn²⁺ in alternate tetrahedral voids; CN=4; Z=4"},{t:"ZnS Wurtzite",f:"HCP S²⁻; Zn²⁺ in tetrahedral voids; CN=4"},{t:"Schottky Defect",f:"Equal cations and anions missing; density decreases; found in ionic solids"},{t:"Frenkel Defect",f:"Ion displaced to interstitial site; density unchanged; AgCl, AgBr"},{t:"F-Centers",f:"Anion vacancies occupied by electrons; crystal appears colored; metal excess defect"},{t:"Electrical Conductivity",f:"n-type: extra electron from donor (group 15 in Si); p-type: hole from acceptor (group 13)"}],
 keyPoints:["FCC=HCP=74% most efficient packing","NaCl: FCC with octahedral voids; CsCl: body-center","Schottky: density↓; Frenkel: density unchanged","Impurity defects → electrical conductivity in ionic crystals"],
 mindmap:{root:"Solid State",branches:[{n:"Crystal Systems",col:"#059669",nodes:["7 Crystal Systems","14 Bravais Lattices","Unit Cell","Lattice Parameters"]},{n:"Cubic Lattices",col:"#10b981",nodes:["SC r=a/2 Z=1","BCC r=√3a/4 Z=2","FCC r=a/2√2 Z=4","Packing Efficiency"]},{n:"Ionic Crystals",col:"#047857",nodes:["NaCl (6:6) FCC","CsCl (8:8)","ZnS (4:4)","Radius Ratio"]},{n:"Defects",col:"#065f46",nodes:["Schottky Missing","Frenkel Displaced","Metal Excess","Doping n/p"]}]}},

{id:"c10",sub:"chem",name:"Surface Chemistry",weight:"Medium",est:2, syllabus:[
  {topic:"Adsorption",subtopics:[
    {name:"Types & Isotherms",concepts:["Adsorption — adsorbate on adsorbent surface; surface phenomenon; exothermic (ΔH<0)","Physisorption — van der Waals forces; low ΔH (20–40 kJ/mol); reversible; multilayer possible; decreases with T","Chemisorption — chemical bond; high ΔH (>40 kJ/mol); irreversible; monolayer only; increases then decreases with T","Freundlich isotherm — x/m=kp^(1/n); log(x/m)=logk+(1/n)logp; straight line on log-log plot","Langmuir isotherm — x/m=ap/(1+bp); assumes monolayer; saturation at high P; based on dynamic equilibrium"]},
    {name:"Factors Affecting Adsorption",concepts:["Surface area — greater surface area (porous/powdered) → more adsorption","Nature of adsorbate — gas easily liquefied (high critical T) → greater physisorption","Temperature — physi decreases with T; chemi increases initially then decreases","Pressure — adsorption increases with pressure (Freundlich)"]}
  ]},
  {topic:"Colloids & Catalysis",subtopics:[
    {name:"Colloidal Systems",concepts:["Colloid size — 1 to 1000 nm; true solution <1 nm; suspension >1000 nm","Tyndall effect — scattering of light by colloidal particles; confirms colloid; not seen in true solutions","Brownian motion — zigzag random motion due to unequal collision of solvent molecules","Electrophoresis — migration of charged colloidal particles in electric field","Coagulation — Hardy-Schulze rule: higher charge of coagulating ion → greater coagulation power; Al³⁺>Ca²⁺>Na⁺","Lyophilic colloid — stable; hydrated; self-stabilising (e.g., starch, gelatin)","Lyophobic colloid — unstable; need stabiliser; coagulate easily (e.g., gold sol, arsenic sulphide sol)","Protective colloid — lyophilic added to lyophobic; gold number = mg of protective colloid preventing coagulation of 10 mL gold sol by 1 mL 10% NaCl"]},
    {name:"Catalysis",concepts:["Homogeneous catalysis — catalyst and reactants in same phase","Heterogeneous catalysis — different phases; solid catalyst most common; surface adsorption involved","Enzyme catalysis — biological catalysts; protein in nature; lock-and-key specificity; active site","Promoters — increase catalyst efficiency; Poisons — decrease it; Inhibitors"]}
  ]}
 ],
 topics:["Adsorption: adsorbate on adsorbent; physisorption vs chemisorption","Freundlich isotherm: x/m=kp^(1/n); Langmuir (monolayer)","Factors: surface area, temperature, pressure, nature","Colloids: 1nm–1000nm particle size; types: sol, gel, emulsion","Tyndall effect; Brownian motion; electrophoresis","Coagulation: Hardy-Schulze rule","Lyophilic (stable) vs lyophobic (unstable)","Emulsions: oil-in-water and water-in-oil; emulsifier","Catalysis: homogeneous, heterogeneous; enzyme (lock-and-key)"],
 formulas:[{t:"Adsorption Equilibrium",f:"At equilibrium: rate adsorption=rate desorption"},{t:"Freundlich Isotherm",f:"x/m=kp^(1/n); log(x/m)=logk+(1/n)logp; straight line log-log plot"},{t:"Langmuir Isotherm",f:"x/m=ap/(1+bp); monolayer; at high P: x/m→a/b (saturation)"},{t:"Physisorption vs Chem",f:"Physi: low ΔH(20-40 kJ), reversible, multilayers, vdW; Chem: high ΔH(>40 kJ), irreversible, monolayer, chem bond"},{t:"Effect of Temperature",f:"Physi: decreases with T; Chem: increases with T (activation needed), then decreases"},{t:"Colloid Size",f:"1 nm to 1000 nm (10⁻⁹ to 10⁻⁶ m); true solution <1nm; suspension >1000nm"},{t:"Tyndall Effect",f:"Scattering of light by colloidal particles; not seen in true solutions; confirms colloid"},{t:"Electrophoresis",f:"Migration of colloidal particles in electric field toward oppositely charged electrode"},{t:"Hardy-Schulze Rule",f:"Coagulating power: higher charge of ion→greater coagulation; Al³⁺>Ca²⁺>Na⁺ for –ve sol"},{t:"Zeta Potential",f:"Potential at slip plane; higher |ζ|→more stable colloid"},{t:"Lyophilic vs Lyophobic",f:"Lyophilic: stable, hydrated; Lyophobic: unstable, need stabilizer; gold sol=lyophobic"},{t:"Peptization",f:"Breaking down precipitate into colloidal sol by adding electrolyte (common ion)"},{t:"Protective Colloid",f:"Lyophilic colloid prevents coagulation of lyophobic; gold number (smaller=better)"},{t:"Emulsions",f:"O/W: oil in water (milk); W/O: water in oil (butter); emulsifier at interface"}],
 keyPoints:["Physisorption: low ΔH, reversible, multilayer, van der Waals","Chemisorption: high ΔH, irreversible, monolayer, chemical bonds","Tyndall effect: scattering by colloid (not true solution)","Al³⁺>Ca²⁺>Na⁺ for coagulation of negative sol"],
 mindmap:{root:"Surface\nChemistry",branches:[{n:"Adsorption",col:"#059669",nodes:["Physisorption","Chemisorption","Freundlich","Langmuir Monolayer"]},{n:"Colloids",col:"#10b981",nodes:["1nm-1000nm","Tyndall Effect","Brownian Motion","Electrophoresis"]},{n:"Stability",col:"#047857",nodes:["Lyophilic (Stable)","Lyophobic","Hardy-Schulze","Coagulation"]},{n:"Catalysis",col:"#065f46",nodes:["Homogeneous","Heterogeneous","Enzyme Lock-Key","Promoters & Poisons"]}]}},

{id:"c11",sub:"chem",name:"p-Block Elements",weight:"High",est:4, syllabus:[
  {topic:"Groups 15 & 16",subtopics:[
    {name:"Group 15 — Nitrogen Family",concepts:["Oxidation states — N: −3 to +5; P, As, Sb, Bi: +3, +5 common","N₂ — triple bond (946 kJ/mol bond energy); very inert; N≡N","Oxides of N — N₂O(+1), NO(+2), N₂O₃(+3), NO₂(+4), N₂O₄(+4), N₂O₅(+5)","HNO₃ via Ostwald process — NH₃→NO→NO₂→HNO₃; 4NO₂+O₂+2H₂O→4HNO₃","Phosphorus allotropes — white (P₄ units, reactive, poisonous), red (polymeric, less reactive), black (graphite-like, layered)","PCl₃ — sp³; trigonal pyramidal; PCl₅ — sp³d; trigonal bipyramidal; both hydrolyse with water","Oxoacids of P — H₃PO₄ (n-factor=3); H₃PO₃ (n-factor=2, diprotic); H₃PO₂ (n-factor=1, monobasic)"]},
    {name:"Group 16 — Oxygen Family",concepts:["Ozone O₃ — bent structure; sp² hybridisation; strong oxidiser; allotrope of oxygen","H₂SO₄ via Contact process — 2SO₂+O₂⇌2SO₃ (V₂O₅, 450°C); SO₃+H₂SO₄→oleum","H₂SO₄ — dehydrating agent (absorbs H₂O), oxidising agent (hot conc reacts with most metals)","Oxoacids of S — H₂SO₃(+4 S), H₂SO₄(+6 S), H₂S₂O₇ oleum (+6 S), H₂S₂O₈ persulphuric(+7 S)"]}
  ]},
  {topic:"Groups 17 & 18",subtopics:[
    {name:"Group 17 — Halogens",concepts:["Physical states — F₂ yellow gas; Cl₂ yellow-green gas; Br₂ red-brown liquid; I₂ violet solid","HX acid strength — HI>HBr>HCl>>HF (bond energy: HF highest, hardest to dissociate)","HX boiling point — HF>>HI>HBr>HCl (HF highest due to H-bonding)","Oxoacids of Cl — HOCl(+1)<HClO₂(+3)<HClO₃(+5)<HClO₄(+7); acid strength increases with OS","Interhalogen compounds — ClF₃ (T-shaped, sp³d), BrF₅ (square pyramidal), IF₇ (pentagonal bipyramidal)","F₂ — no positive oxidation state; cannot be central atom (highest electronegativity)"]},
    {name:"Group 18 — Noble Gases",concepts:["Properties — zero valency; stable electron configuration; inert under normal conditions","Xe compounds — XeF₂ (linear, sp³d, 3 lone pairs); XeF₄ (square planar, sp³d²); XeF₆ (distorted octahedral)","XeO₃ — pyramidal; XeOF₄ — square pyramidal","Only Xe reacts with F₂ (He, Ne, Ar do not form compounds); Kr forms KrF₂"]}
  ]}
 ],
 topics:["Group 15 (N,P,As,Sb,Bi): oxidation states; oxoacids","Nitrogen: oxides N₂O, NO, NO₂, N₂O₃, N₂O₅; N₂ triple bond inertness","Phosphorus: allotropes (white,red,black); PCl₃ and PCl₅","Group 16 (O,S): O₃ ozone; H₂SO₄ Contact process","Group 17 (Halogens): trends; interhalogen compounds","HF vs HCl vs HBr vs HI: acidity HI>HBr>HCl>HF","Oxoacids of chlorine: HOCl, HClO₂, HClO₃, HClO₄ (acid strength↑)","Group 18: XeF₂ (linear), XeF₄ (square planar), XeF₆","Anomalous behavior of first member; diagonal relationships"],
 formulas:[{t:"Group 15 OS",f:"N: −3 to +5; most stable: +3,+5,−3; P,As,Sb,Bi: +3,+5 common"},{t:"Oxides of N",f:"N₂O(+1); NO(+2); N₂O₃(+3); NO₂(+4); N₂O₄(+4); N₂O₅(+5)"},{t:"HNO₃ Preparation",f:"4NO₂+O₂+2H₂O→4HNO₃ (Ostwald's); NH₃→NO→NO₂→HNO₃"},{t:"HNO₃ Reactions",f:"Dilute: 3Fe+8HNO₃(dil)→3Fe(NO₃)₂+2NO↑+4H₂O; conc: Cu+4HNO₃→Cu(NO₃)₂+2NO₂+2H₂O"},{t:"P Allotropes",f:"White P: P₄ units,reactive,poisonous; Red P: polymeric,less reactive; Black P: graphite-like"},{t:"PCl₃ vs PCl₅",f:"PCl₃: sp³; trigonal pyramidal; PCl₅: sp³d; trigonal bipyramidal; hydrolyses"},{t:"Oxoacids of S",f:"H₂SO₃(+4); H₂S₂O₃(thiosulphate); H₂SO₄(+6); H₂S₂O₇(+6 pyrosulphuric)"},{t:"H₂SO₄ Properties",f:"Dehydrating agent; oxidising agent (hot conc); oleum=SO₃ dissolved in H₂SO₄"},{t:"Halogens Properties",f:"F₂: yellow; Cl₂: yellow-green; Br₂: red-brown; I₂: violet; F most reactive"},{t:"HX Acid Strength",f:"HI>HBr>HCl>HF; bond energy: HF highest (weak acid); bond length increases HF→HI"},{t:"HX Boiling Point",f:"HF>>HI>HBr>HCl; HF anomalous due to H-bonding"},{t:"Interhalogen Compounds",f:"AB,AB₃,AB₅,AB₇ where B=more electronegative; ClF₃: T-shaped; IF₇: pentagonal bipyramidal"},{t:"Oxoacids of Cl",f:"HOCl(+1)<HClO₂(+3)<HClO₃(+5)<HClO₄(+7); acid strength increases with OS of Cl"},{t:"Noble Gas Compounds",f:"XeF₂: linear sp³d, 3 lps; XeF₄: square planar sp³d²; XeF₆: distorted octahedral; XeO₃: pyramidal"},{t:"Anomalous 2nd Period",f:"N: no d-orbitals, max CN=4; O: small size high electronegativity; F: most electroneg, no+OS"}],
 keyPoints:["N₂ inert: triple bond energy 946 kJ/mol","PCl₅: sp³d, trigonal bipyramidal; hydrolyzes to H₃PO₄","F₂ cannot show positive OS (highest electronegativity)","Only Xe reacts with F₂ (not He, Ne, Ar)"],
 mindmap:{root:"p-Block\nElements",branches:[{n:"Group 15",col:"#059669",nodes:["N oxides N₂O→N₂O₅","HNO₃ Preparation","PCl₃ & PCl₅","P Allotropes"]},{n:"Group 16",col:"#10b981",nodes:["O₃ Ozone","H₂SO₄ Contact","SO₂ Bleaching","S Allotropes"]},{n:"Group 17",col:"#047857",nodes:["Halogens Trends","Interhalogen ClF₃","Oxoacids of Cl","HX Acid Strength"]},{n:"Group 18",col:"#065f46",nodes:["Noble Gas Props","XeF₂ Linear","XeF₄ Square Planar","XeF₆ Distorted"]}]}},

{id:"c12",sub:"chem",name:"s-Block Elements & Hydrogen",weight:"Medium",est:3, syllabus:[
  {topic:"Hydrogen & its Compounds",subtopics:[
    {name:"Hydrogen",concepts:["Isotopes — ¹H protium (99.98%); ²H deuterium D (0.016%); ³H tritium T (radioactive)","Hydrides — ionic (NaH, LiH: saline); covalent (CH₄, NH₃, H₂O); metallic/interstitial (TiH₂, PdH₂)","H₂O₂ structure — non-planar; O−O bond; dihedral angle ~111.5°; weak acid","H₂O₂ as oxidant — bleaches; MnO₄⁻→Mn²⁺; converts PbS→PbSO₄","H₂O₂ as reductant — in acidic KMnO₄, H₂O₂ acts as reductant","Volume strength — 10 Vol: 1 L H₂O₂ releases 10 L O₂ at STP"]},
    {name:"Group 1 — Alkali Metals",concepts:["Trend — IE decreases; size increases; reactivity increases down group; all form +1 ions","Li anomalous properties — high charge density; resembles Mg (diagonal); forms Li₃N; Li₂CO₃ decomposes; LiCl covalent","NaOH preparation — Castner-Kellner electrolysis: 2NaCl+2H₂O→2NaOH+Cl₂+H₂","Na₂CO₃ — Solvay process: NaCl+NH₃+CO₂+H₂O→NaHCO₃; heat→Na₂CO₃","Flame tests — Li=crimson; Na=golden yellow; K=violet/lilac"]}
  ]},
  {topic:"Group 2 — Alkaline Earth Metals",subtopics:[
    {name:"Properties & Anomaly",concepts:["Trend — harder than Group 1; higher IE; smaller size; less reactive than Group 1","Be anomalous — amphoteric oxide; forms complexes; diagonal relation with Al; no stable +4 OS","Be and Mg — form covalent compounds due to high charge density"]},
    {name:"Important Compounds",concepts:["CaO — quicklime; basic; reacts exothermically with water","Ca(OH)₂ — slaked lime; used in mortar; Ca(OH)₂+CO₂→CaCO₃+H₂O","CaSO₄·½H₂O — Plaster of Paris; sets hard by absorbing water → gypsum CaSO₄·2H₂O","Hard water — temporary (Ca(HCO₃)₂; remove by boiling or Clark's method with Ca(OH)₂); permanent (CaSO₄,CaCl₂; ion exchange/washing soda)","Flame tests — Ca=brick red; Sr=scarlet; Ba=apple green"]}
  ]}
 ],
 topics:["Hydrogen: isotopes (protium, deuterium, tritium); types of hydrides","H₂O₂: structure; preparation BaO₂+H₂SO₄; oxidant/reductant","Group 1 (Alkali metals): reactivity trends; Li anomaly (resembles Mg)","Compounds: NaOH (Castner-Kellner), Na₂CO₃ (Solvay), NaHCO₃","Group 2 (Alkaline earth): harder than Group 1; Be anomaly (resembles Al)","CaO (quick lime), Ca(OH)₂ (slaked lime), CaSO₄ (plaster of Paris)","Hard water: temporary (carbonate) and permanent (sulfate/chloride)","Flame test: Na=yellow; K=violet; Li=crimson; Ca=brick red; Ba=apple green"],
 formulas:[{t:"Isotopes of H",f:"¹H protium (99.98%); ²H deuterium D (0.016%); ³H tritium T (radioactive)"},{t:"Hydrides Types",f:"Ionic (NaH); Covalent (CH₄,NH₃); Metallic/interstitial (TiH₂); HF most ionic covalent"},{t:"H₂O₂ Structure",f:"Non-planar; O−O bond; two OH groups; dihedral angle 111.5°"},{t:"H₂O₂ Reactions",f:"Oxidant: PbS+4H₂O₂→PbSO₄+4H₂O; Reductant: 2KMnO₄+5H₂O₂+3H₂SO₄→products"},{t:"H₂O₂ Concentration",f:"10 Vol means 10 L O₂ from 1 L H₂O₂; 30 Vol≈3% solution"},{t:"Alkali Metals Trend",f:"IE decreases; size increases; reactivity increases down group"},{t:"Li Anomalous Properties",f:"High charge density; forms Li₃N; LiCl covalent; Li₂CO₃ decomposes; resembles Mg"},{t:"NaOH Preparation",f:"Castner-Kellner: 2NaCl+2H₂O→2NaOH+Cl₂+H₂↑ (electrolysis)"},{t:"Na₂CO₃ Solvay Process",f:"NaCl+NH₃+CO₂+H₂O→NaHCO₃; heat→Na₂CO₃+H₂O+CO₂"},{t:"Alkaline Earth Trends",f:"IE decreases; size increases; reactivity increases; harder than alkali metals"},{t:"Be Anomalous",f:"Amphoteric oxide; forms covalent compounds; resembles Al diagonally"},{t:"Plaster of Paris",f:"CaSO₄·½H₂O; +water→gypsum CaSO₄·2H₂O (sets hard)"},{t:"Hard Water",f:"Temporary: Ca(HCO₃)₂,Mg(HCO₃)₂ (remove by boiling or Clark's method); Permanent: CaSO₄,CaCl₂"},{t:"Flame Tests",f:"Li=crimson; Na=golden yellow; K=violet/lilac; Ca=brick red; Sr=scarlet; Ba=apple green"}],
 keyPoints:["Li anomalous: high charge density; resembles Mg diagonally","Be anomalous: amphoteric oxide like Al; forms complexes","Na burns yellow; K burns violet in flame test","H₂O₂ bleaches by oxidation; can be both oxidant and reductant"],
 mindmap:{root:"s-Block &\nHydrogen",branches:[{n:"Hydrogen",col:"#059669",nodes:["3 Isotopes","Hydride Types","H₂O₂ Structure","Oxidant & Reductant"]},{n:"Group 1",col:"#10b981",nodes:["Alkali Metals Trends","Li Anomaly (Mg)","NaOH Production","Na₂CO₃ Solvay"]},{n:"Group 2",col:"#047857",nodes:["Alkaline Earth Trends","Be Anomaly (Al)","CaO Ca(OH)₂","Hard Water"]},{n:"Applications",col:"#065f46",nodes:["Flame Test Colors","Biological Roles","Cement & Concrete","Water Softening"]}]}},

{id:"c13",sub:"chem",name:"Biomolecules",weight:"Medium",est:2, syllabus:[
  {topic:"Carbohydrates",subtopics:[
    {name:"Classification & Structure",concepts:["Formula (CH₂O)ₙ — monosaccharides, disaccharides, polysaccharides","Glucose — aldohexose (C-1 CHO); open chain D-glucose; Haworth pyranose ring; α and β anomers","Reactions of glucose — osazone (phenylhydrazine); oxidation to gluconic acid (Br₂ water); to saccharic acid (HNO₃); reduction to sorbitol","Disaccharides — sucrose (glucose+fructose, non-reducing; α-1,2 glycosidic); maltose (glucose+glucose, reducing; α-1,4); lactose (glucose+galactose, reducing; β-1,4)","Polysaccharides — starch: amylose (unbranched α-1,4) + amylopectin (branched α-1,6); cellulose: β-1,4 (non-digestible)","Reducing sugars — those with free aldehyde/ketone group; react with Tollens' and Fehling's"]}
  ]},
  {topic:"Proteins & Nucleic Acids",subtopics:[
    {name:"Amino Acids & Proteins",concepts:["α-Amino acids — general structure H₂N−CHR−COOH; zwitterion at isoelectric point","Essential amino acids — cannot be synthesised by body","Peptide bond — amide linkage (−CO−NH−) formed by condensation between −COOH and −NH₂","Protein structure — primary (amino acid sequence); secondary (α-helix H-bonds or β-sheet); tertiary (3D folding); quaternary (multiple subunits)","Denaturation — disruption of 2°,3°,4° structure by heat, pH, heavy metals; primary structure intact","Fibrous proteins — insoluble (keratin, collagen); Globular proteins — soluble (enzymes, haemoglobin)"]},
    {name:"Nucleic Acids & Vitamins",concepts:["Nucleotides — phosphate + sugar + nitrogenous base; nucleoside = sugar + base","DNA — deoxyribose; double helix; A=T (2 H-bonds); G≡C (3 H-bonds); central dogma: DNA→RNA→protein","RNA — ribose; usually single strand; A-U pairing; types: mRNA, tRNA, rRNA","Fat-soluble vitamins — A (night blindness); D (rickets); E (tocopherol, antioxidant); K (blood clotting)","Water-soluble vitamins — B complex; C (ascorbic acid, scurvy); need daily intake; not stored in body","Enzymes — biological catalysts; protein; lock-and-key or induced-fit; highly specific; affected by T, pH, substrate conc"]}
  ]}
 ],
 topics:["Carbohydrates: monosaccharides, disaccharides, polysaccharides","Glucose: open chain CHO polyhydroxy aldehyde; Haworth structure; reducing sugar","Sucrose (non-reducing); maltose, lactose (reducing)","Starch (α-glycosidic, digestible) vs cellulose (β-glycosidic, non-digestible)","Amino acids: structure; zwitterion; essential vs non-essential","Proteins: 1°, 2°(α-helix, β-sheet), 3°, 4° structure","Denaturation; fibrous vs globular proteins","Nucleic acids: DNA double helix (Watson-Crick); RNA single strand","Base pairing: A-T (2 H-bonds), G-C (3 H-bonds); A-U in RNA","Vitamins: fat-soluble (A,D,E,K) and water-soluble (B,C)"],
 formulas:[{t:"Carbohydrate Formula",f:"(CH₂O)ₙ; glucose C₆H₁₂O₆; sucrose C₁₂H₂₂O₁₁; starch/cellulose (C₆H₁₀O₅)ₙ"},{t:"Glucose Properties",f:"Aldohexose; open chain D-glucose; Haworth (pyranose ring); reducing sugar"},{t:"Glycosidic Bond",f:"α-1,4 in starch/maltose (digestible); β-1,4 in cellulose (non-digestible by humans)"},{t:"Reducing Sugars",f:"Free aldehyde/ketone group; react with Tollens, Fehling; glucose,fructose,maltose,lactose"},{t:"Non-reducing Sugars",f:"Sucrose: C1(glucose)−C2(fructose) bond locks both anomeric carbons; no free −OH"},{t:"Amino Acid Structure",f:"H₂N−CHR−COOH; zwitterion at pH~6 (isoelectric point); 20 essential amino acids for humans"},{t:"Peptide Bond Formation",f:"−COOH+H₂N−→−CO−NH−+H₂O; amide bond; N→C direction (C-terminus)"},{t:"Protein Structures",f:"1°: sequence; 2°: α-helix(H-bonds NH…CO) or β-sheet; 3°: 3D fold; 4°: quaternary (multiple chains)"},{t:"Denaturation",f:"Disruption of 2°,3°,4° structure by heat, pH, heavy metals; 1° intact"},{t:"Nucleotide Components",f:"Phosphate+Sugar+Nitrogenous base; nucleoside=sugar+base"},{t:"DNA Base Pairing",f:"A−T: 2 H-bonds; G−C: 3 H-bonds; A−U in RNA"},{t:"DNA vs RNA",f:"DNA: deoxyribose, T; RNA: ribose, U; DNA double stranded; RNA usually single"},{t:"Vitamins Fat-Soluble",f:"A(retinol,night blindness); D(calciferol,rickets); E(tocopherol); K(clotting)"},{t:"Vitamins Water-Soluble",f:"B complex; C(ascorbic acid,scurvy); daily intake needed; not stored"},{t:"Enzymes",f:"Biological catalysts; lock-and-key or induced fit; specific; protein in nature"}],
 keyPoints:["Reducing sugars: free aldehyde/ketone; react with Tollens/Fehling","Sucrose non-reducing: C1 glucose–C2 fructose glycosidic bond","Enzyme: lock-and-key specificity; active site","DNA: deoxyribose; RNA: ribose; DNA double helix, RNA single strand"],
 mindmap:{root:"Biomolecules",branches:[{n:"Carbohydrates",col:"#059669",nodes:["Mono/Di/Poly","Glucose Structures","Reducing Sugars","Starch vs Cellulose"]},{n:"Proteins",col:"#10b981",nodes:["Amino Acids","1°/2°/3°/4°","α-helix β-sheet","Denaturation"]},{n:"Nucleic Acids",col:"#047857",nodes:["DNA Double Helix","RNA Single Strand","A-T G-C Pairing","Nucleotide"]},{n:"Vitamins & Lipids",col:"#065f46",nodes:["Fat-Soluble A,D,E,K","Water-Soluble B,C","Deficiency Diseases","Triglycerides"]}]}},

{id:"c14",sub:"chem",name:"Polymers",weight:"Medium",est:2, syllabus:[
  {topic:"Classification & Types of Polymerization",subtopics:[
    {name:"Addition Polymers",concepts:["Free radical polymerisation — mechanism: initiation, propagation, termination","Addition polymers — polyethylene (ethylene), PVC (vinyl chloride), polystyrene, Teflon (PTFE from CF₂=CF₂)","No byproduct released; double bond monomers; chain growth mechanism","Thermoplastic nature — most addition polymers soften on heating; can be remoulded"]},
    {name:"Condensation & Special Polymers",concepts:["Condensation polymerisation — small molecule (H₂O or HCl) lost; bifunctional monomers; step growth","Polyamides — Nylon-6,6 (hexamethylenediamine + adipic acid); Nylon-6 (ring-opening of caprolactam)","Polyesters — Dacron/Terylene (ethylene glycol + terephthalic acid = PET)","Phenol-formaldehyde — Bakelite (cross-linked, thermosetting, 3D network); used in electrical fittings","Natural rubber — cis-polyisoprene; elastic but low strength; vulcanisation with sulphur adds S cross-links → improves elasticity, strength, abrasion resistance","Synthetic rubber — Buna-S (SBR: styrene+butadiene); Buna-N (NBR: acrylonitrile+butadiene, oil-resistant); Neoprene (chloroprene, chemical-resistant)","Biodegradable polymers — PHBV (poly-β-hydroxybutyrate-co-β-hydroxyvalerate); polylactic acid"]}
  ]}
 ],
 topics:["Addition polymerization: no byproduct; alkene monomers","Condensation polymerization: loses H₂O or HCl","Nylon-6,6: hexamethylene diamine + adipic acid","Nylon-6: ring-opening of caprolactam","Polyester (Dacron/Terylene): ethylene glycol + terephthalic acid","Bakelite: phenol + formaldehyde (thermosetting, cross-linked)","Natural rubber (polyisoprene, cis); vulcanization with S","Synthetic rubber: Buna-S, Buna-N, Neoprene","Thermoplastic vs thermosetting; biodegradable polymers: PHBV"],
 formulas:[{t:"Addition Polymerization",f:"No byproduct; alkenes; radical/cationic/anionic initiation; chain growth"},{t:"Condensation Polymerization",f:"Small molecule (H₂O,HCl) lost; bifunctional monomers; step growth"},{t:"Nylon-6,6",f:"Hexamethylenediamine+Adipic acid (1,6-hexanedioic acid); alternating units"},{t:"Nylon-6",f:"Ring-opening polymerisation of caprolactam; ε-aminocaproic acid repeat unit"},{t:"Polyester (Dacron/Terylene)",f:"Ethylene glycol+Terephthalic acid; polyethylene terephthalate (PET)"},{t:"Bakelite",f:"Phenol+Formaldehyde (acid cat); thermosetting; cross-linked; 3D network"},{t:"Glyptal",f:"Phthalic acid+Ethylene glycol; thermosetting; used in paints"},{t:"Natural Rubber",f:"cis-polyisoprene; (CH₂=C(CH₃)−CH=CH₂)ₙ; elastic; low strength"},{t:"Vulcanization",f:"Cross-linking with S bridges; improves strength, elasticity, resistance to abrasion"},{t:"Buna-S (SBR)",f:"Styrene-butadiene copolymer; addition; used in tyres"},{t:"Buna-N (NBR)",f:"Acrylonitrile-butadiene; oil resistant"},{t:"Neoprene",f:"Chloroprene polymer; oil and chemical resistant"},{t:"PHBV",f:"Poly-β-hydroxybutyrate-co-β-hydroxyvalerate; biodegradable; used in packaging"},{t:"Degree of Polymerization",f:"n=M_polymer/M_monomer; molar mass dispersity=Mw/Mn"},{t:"Thermoplastic vs Thermoset",f:"Thermoplastic: linear/branched,softens on heating; Thermoset: cross-linked,does not re-melt"}],
 keyPoints:["Addition: no byproduct, double bond monomers","Condensation: H₂O or small molecule released","Thermoplastic: softens on heating; thermosetting: cannot re-melt","Vulcanization: S cross-links improve strength and elasticity"],
 mindmap:{root:"Polymers",branches:[{n:"Polymerization",col:"#059669",nodes:["Addition (no byproduct)","Condensation (+H₂O)","Chain Growth","Step Growth"]},{n:"Important Polymers",col:"#10b981",nodes:["Nylon-6,6 & Nylon-6","Polyester Dacron","Bakelite Thermosetting","PVC Polystyrene"]},{n:"Rubber",col:"#047857",nodes:["Natural Polyisoprene","Vulcanization (S)","Buna-S (SBR)","Neoprene"]},{n:"Classification",col:"#065f46",nodes:["Thermoplastic vs Thermoset","Homo vs Copolymer","Linear/Branch/Cross","Biodegradable PHBV"]}]}},

{id:"c15",sub:"chem",name:"Environmental & Everyday Chemistry",weight:"Low",est:1, syllabus:[
  {topic:"Environmental Chemistry",subtopics:[
    {name:"Air Pollution",concepts:["SO₂ — acid rain precursor; SO₂+H₂O→H₂SO₃; pH<5.6 is acid rain","CO — toxic; binds to haemoglobin; product of incomplete combustion","NOₓ — photochemical smog formation; NO₂+UV→NO+O; O+O₂→O₃","CFCs — Cl· radicals catalytically destroy ozone: Cl·+O₃→ClO+O₂; ClO+O→Cl·+O₂ (chain reaction)","Greenhouse gases — CO₂, CH₄, N₂O, CFCs, H₂O vapour; absorb IR radiation; cause global warming","Photochemical smog — NOₓ+HCs+sunlight → O₃, PAN, aldehydes; visible as brown haze"]},
    {name:"Water Pollution",concepts:["BOD — Biochemical Oxygen Demand; O₂ needed to decompose organics; clean water BOD<5 ppm; polluted >10 ppm","Eutrophication — excess N and P nutrients → algal bloom → O₂ depletion → aquatic life death","Heavy metal pollution — Pb, Hg, Cd, As; Minamata disease (Hg); Itai-itai (Cd); bioaccumulation"]}
  ]},
  {topic:"Chemistry in Everyday Life",subtopics:[
    {name:"Drugs & Medicines",concepts:["Analgesics — relieve pain; non-narcotics (aspirin, paracetamol) vs narcotics (morphine, codeine)","Antipyretics — reduce fever; aspirin is both analgesic and antipyretic","Antibiotics — penicillin (β-lactam ring, inhibits cell wall synthesis); bactericidal vs bacteriostatic","Antiseptics — safe on living tissue (Dettol, Savlon, dilute phenol); Disinfectants — on non-living (chlorine in water, formalin)","Antacids — neutralise excess HCl: NaHCO₃, Mg(OH)₂, Al(OH)₃, CaCO₃"],
    concepts:["Azo dyes — formed from diazonium coupling; largest class of synthetic dyes","Soaps — RCOO⁻Na⁺; saponification of fats; do NOT work in hard water (form insoluble scum)","Detergents — alkylbenzene sulphonates; work in hard water; anionic (commonest) or cationic (germicidal)","Artificial sweeteners — saccharin (300× sugar, not for PKU); aspartame (180× sugar); sucralose; zero calories"]}
  ]}
 ],
 topics:["Air pollutants: SO₂, CO, NOₓ, PM; acid rain pH<5.6","Greenhouse gases: CO₂, CH₄, N₂O, CFCs","Ozone depletion: CFC→Cl· radicals (chain reaction)","Photochemical smog: NO₂+UV→O₃ (secondary)","BOD: indicator of water quality; eutrophication","Medicines: analgesics, antipyretics, antacids, antiseptics","Drug-receptor interaction: agonists and antagonists","Food chemicals: preservatives, antioxidants (BHA, BHT)","Detergents vs soaps: hard water behavior; biodegradability","Artificial sweeteners: aspartame, saccharin"],
 formulas:[{t:"Acid Rain",f:"pH<5.6; SO₂+H₂O→H₂SO₃; NO₂+H₂O→HNO₃; damages marble,metals,ecosystems"},{t:"Greenhouse Effect",f:"CO₂,CH₄,N₂O,CFCs,H₂O(vapour); absorb IR; global warming; CO₂ most abundant GHG"},{t:"Ozone Depletion",f:"CFC→UV→Cl·; Cl·+O₃→ClO+O₂; ClO+O→Cl·+O₂ (chain,one Cl destroys 1000s O₃)"},{t:"Smog",f:"Classical: SO₂,smoke; Photochemical: NO₂+UV→NO+O; O+O₂→O₃; HCs+NO→PAN"},{t:"BOD",f:"Biochemical Oxygen Demand; O₂ needed to decompose organics; BOD<5 ppm clean; >10 polluted"},{t:"Eutrophication",f:"Excess nutrients (N,P) → algal bloom → O₂ depletion → aquatic life death"},{t:"Heavy Metal Pollution",f:"Pb,Hg,Cd,As; bioaccumulation; Minamata disease (Hg); Itai-itai (Cd)"},{t:"Analgesics",f:"Relieve pain; narcotics (morphine): addictive; non-narcotics (aspirin,paracetamol): OTC"},{t:"Antipyretics",f:"Reduce fever; aspirin (both analgesic+antipyretic); paracetamol"},{t:"Antacids",f:"Neutralise excess HCl; NaHCO₃,Mg(OH)₂,Al(OH)₃,CaCO₃"},{t:"Antiseptics vs Disinfectants",f:"Antiseptics: safe on living tissue (Dettol,Savlon); Disinfectants: on non-living (Cl₂ in water)"},{t:"Soaps",f:"RCOO⁻Na⁺; formed by saponification; do NOT work in hard water (form scum)"},{t:"Detergents",f:"Alkyl benzene sulfonates; work in hard water; biodegradable detergents now preferred"},{t:"Artificial Sweeteners",f:"Saccharin(300× sweet); Aspartame(not for PKU); Sucralose; no calories"}],
 keyPoints:["CFCs: Cl· depletes ozone in chain reaction","Analgesics relieve pain; antipyretics reduce fever; aspirin both","Soaps RCOO⁻Na⁺ do NOT work in hard water","Detergents (sulfonates): work in hard water"],
 mindmap:{root:"Environmental &\nEveryday Chem",branches:[{n:"Air Pollution",col:"#059669",nodes:["SO₂ NOₓ CO PM","Acid Rain pH<5.6","Greenhouse Gases","Ozone CFCs"]},{n:"Water Pollution",col:"#10b981",nodes:["BOD Heavy Metals","Eutrophication","Hard Water","Treatment"]},{n:"Medicines",col:"#047857",nodes:["Analgesics/Antipyretics","Antacids/Antiseptics","Antimicrobials","Drug-Receptor"]},{n:"Food & Daily",col:"#065f46",nodes:["Preservatives","Antioxidants BHA","Soaps vs Detergents","Artificial Sweeteners"]}]}},

{id:"c16",sub:"chem",name:"Hydrocarbons",weight:"High",est:4, syllabus:[
  {topic:"Alkanes, Alkenes & Alkynes",subtopics:[
    {name:"Alkanes",concepts:["Homologous series CₙH₂ₙ₊₂; IUPAC naming; physical properties","Newman projection — staggered (anti conformation, most stable) vs eclipsed; gauche conformation","Free radical halogenation — initiation (X₂→2X·); propagation; termination","Selectivity — Cl₂>Br₂ in rate; Br₂>Cl₂ in selectivity; 3°>2°>1° H abstraction"]},
    {name:"Alkenes & Alkynes",concepts:["E/Z isomerism — Cahn-Ingold-Prelog priority rules for naming","Electrophilic addition of HX to alkenes — Markovnikov (H to C with more H); carbocation intermediate","Anti-Markovnikov — HBr+ROOR peroxide: radical mechanism; H to less substituted C","Ozonolysis — O₃ then Zn/H₂O (reductive): aldehydes and ketones; H₂O₂ (oxidative): carboxylic acids","KMnO₄ oxidation — cold dilute: syn dihydroxylation (diol); hot acidic: C=C cleaved (aldehydes→acids)","Terminal alkynes — acidic H (pKa≈25); forms acetylide with NaNH₂; C-chain extension","Reduction of alkynes — Lindlar catalyst (H₂, syn addition): cis-alkene; Na/liquid NH₃ (anti): trans-alkene","Hydration of alkynes — HgSO₄/H₂SO₄/H₂O: Markovnikov; CH≡CH→CH₃CHO (exceptional)"]}
  ]},
  {topic:"Dienes & Aromatic Hydrocarbons",subtopics:[
    {name:"Dienes & Diels-Alder",concepts:["Conjugated diene (1,3-positions) vs isolated vs cumulated (allenes)","1,2 vs 1,4 addition — low T: 1,2 kinetic product; high T: 1,4 thermodynamic (more stable) product","Diels-Alder reaction — [4+2] cycloaddition; diene must be in s-cis conformation; dienophile (electron-poor)","Syn addition in D-A; endo rule (kinetic product); retro-Diels-Alder at high temperature"]},
    {name:"Arenes & EAS",concepts:["Hückel rule — aromatic: 4n+2 π e⁻ (n=0,1,2…); benzene(6); naphthalene(10); anti-aromatic: 4n π e⁻","EAS mechanism — electrophile attacks π system → Wheland (arenium) σ-complex → deprotonation","Ortho/para directors (activating: −OH,−NH₂,−OCH₃,−CH₃) — increase e-density at o/p positions","Meta directors (deactivating: −NO₂,−CN,−COOH,−CHO) — withdraw e-density; m product major","Halogens — deactivating BUT o/p directors (lone pair donation for orientation)","Friedel-Crafts alkylation — ArH+RX+AlCl₃→Ar−R; limitations: rearrangement, polyalkylation","Friedel-Crafts acylation — ArH+RCOCl+AlCl₃→Ar−COR; no rearrangement; deactivates ring","Birch reduction — Na/liquid NH₃/ROH; EDG substituents: reduces unsubstituted ring positions; EWG: reduces substituted positions"]}
  ]}
 ],
 topics:["Alkanes: IUPAC naming; homologous series CₙH₂ₙ₊₂","Conformation of ethane: eclipsed vs staggered (Newman projection)","Free radical halogenation mechanism: Cl₂>Br₂ in rate; Br₂>Cl₂ in selectivity","Alkenes: IUPAC; E/Z (cis-trans) isomerism; Bredt's rule","Addition reactions: electrophilic addition (Markovnikov and anti-Markovnikov)","Ozonolysis: O₃ then Zn/H₂O (reductive) or H₂O₂ (oxidative)","Oxidation with KMnO₄ (acidic vs basic conditions)","Alkynes: IUPAC; terminal alkynes — acidic H (pKa≈25); formation of acetylides","Reduction of alkynes: Lindlar (cis-alkene) vs Na/liquid NH₃ (trans-alkene)","Hydration of alkynes: Markovnikov (ketone except acetylene→acetaldehyde)","Dienes: conjugated (s-cis for D-A), isolated, cumulated (allenes)","1,2 vs 1,4 addition to conjugated dienes: kinetic vs thermodynamic control","Diels-Alder: [4+2] cycloaddition; diene must be s-cis; syn addition; endo rule","Aromaticity: Hückel 4n+2 π e⁻ rule; anti-aromatic 4n; benzene delocalization","Electrophilic aromatic substitution (EAS): halogenation, nitration, sulfonation, Friedel-Crafts","Friedel-Crafts acylation vs alkylation; limitations","Ortho/para directors (activating: −OH,−NH₂,−CH₃) vs meta directors (deactivating: −NO₂,−CN,−COOH)","Birch reduction: Na/liquid NH₃ reduces aromatic ring (substituent rules)"],
 formulas:[{t:"DoU Formula",f:"DoU=(2C+2+N−H−X)/2; each ring=1; each π bond=1; benzene ring=4"},{t:"Alkane Halogenation",f:"Cl₂>Br₂ in rate; Br₂>Cl₂ in selectivity; 3°>2°>1° H abstraction"},{t:"Alkene Addition",f:"HX: Markovnikov; H₂O/H₃O⁺: Markovnikov; HBr+peroxide: Anti-Markovnikov"},{t:"Ozonolysis Products",f:"Reductive (Zn/H₂O): gives aldehydes and ketones; Oxidative (H₂O₂): gives acids"},{t:"KMnO₄ Oxidation",f:"Cold dilute: syn dihydroxylation (diol); Hot acidic: C=C cleaved (aldehydes→acids, ketones stable)"},{t:"Alkene Hydration",f:"H₃PO₄ or H₂SO₄/H₂O: Markovnikov; also via oxymercuration-reduction"},{t:"Alkynes Acidity",f:"Terminal alkyne pKa≈25; forms acetylide M−C≡C−R with NaNH₂ or Na/liquid NH₃"},{t:"Alkyne Reduction",f:"Lindlar (Pd/CaCO₃,quinoline): H₂→cis-alkene; Na/liquid NH₃: trans-alkene (Birch)"},{t:"Alkyne Hydration",f:"H₂O/HgSO₄/H₂SO₄: Markovnikov; CH≡CH→CH₃CHO; R−C≡CH→RCOCH₃"},{t:"Diels-Alder",f:"[4+2]: diene (s-cis conformation) + dienophile; syn addition; endo rule; retro-Diels-Alder"},{t:"1,2 vs 1,4 Addition",f:"Low T: 1,2 kinetic product; High T: 1,4 thermodynamic (more stable) product"},{t:"Hückel Rule",f:"Aromatic: 4n+2 π e⁻ (n=0,1,2…); benzene(6),naphthalene(10),pyridine(6); 4n: antiaromatic"},{t:"EAS Mechanism",f:"Step 1: electrophile + π electrons → σ complex (arenium); Step 2: deprotonation"},{t:"Friedel-Crafts Alkylation",f:"ArH+RX+AlCl₃→Ar−R; limitations: rearrangement, polyalkylation"},{t:"Friedel-Crafts Acylation",f:"ArH+RCOCl+AlCl₃→Ar−COR; no rearrangement; deactivates ring (stops at monosubstitution)"},{t:"Birch Reduction",f:"Na/NH₃(l)/ROH: reduces aromatic ring; EDG-subst: reduces unsubstituted positions; EWG: reduces substituted positions"}],
 keyPoints:["Cl₂ faster but less selective than Br₂ in free radical substitution","Lindlar catalyst → syn addition (cis-alkene); Na/NH₃ → anti addition (trans-alkene)","Conjugated diene: low T → 1,2 kinetic product; high T → 1,4 thermodynamic product","EAS: activating groups are o/p directors; deactivating (except halogens) are m directors","Halogens: deactivating BUT ortho/para directors (lone pair donation for orientation)","Anti-aromatic: cyclobutadiene (4 π e⁻, n=0); destabilized"],
 mindmap:{root:"Hydrocarbons",branches:[{n:"Alkanes",col:"#059669",nodes:["Newman Projection","Free Radical Cl₂/Br₂","Selectivity Order","Combustion"]},{n:"Alkenes & Alkynes",col:"#10b981",nodes:["E/Z Isomerism","Markovnikov/Anti","Ozonolysis","Lindlar vs Na/NH₃"]},{n:"Dienes",col:"#047857",nodes:["Conjugated Dienes","1,2 vs 1,4 Addition","Diels-Alder [4+2]","s-cis Conformation"]},{n:"Arenes",col:"#065f46",nodes:["Hückel 4n+2","EAS Mechanism","Directing Effects","Birch Reduction"]}]}},

{id:"c17",sub:"chem",name:"Haloalkanes & Haloarenes",weight:"High",est:3, syllabus:[
  {topic:"Haloalkanes — Preparation & Reactions",subtopics:[
    {name:"Preparation & Physical Properties",concepts:["From alcohols — SOCl₂ (best, gives pure RCl with retention); PCl₃; PCl₅; HX (order: HI>HBr>HCl)","From alkenes — electrophilic addition of HX (Markovnikov); anti-Markovnikov with peroxides (HBr only)","Free radical allylic/benzylic halogenation — NBS (N-bromosuccinimide) for selective bromination","Physical properties — polarity increases solubility in polar solvents; bp increases with size and branching","Reactivity order — RI>RBr>RCl>RF (leaving group ability); allylic/benzylic > 3° > 2° > 1° for SN1"]},
    {name:"Nucleophilic Substitution & Elimination",concepts:["SN2 — 1° substrate; polar aprotic solvent (DMF, DMSO, acetone); Walden inversion (180° back-attack); rate=k[RX][Nu]","SN1 — 3° substrate; polar protic solvent; carbocation intermediate; racemisation; rearrangement possible","Leaving group order — I⁻>Br⁻>Cl⁻>F⁻; OTs>OMs (tosylate good leaving group)","Nucleophile in protic vs aprotic — protic: F⁻>Cl⁻>Br⁻>I⁻ (charge density); aprotic: I⁻>Br⁻>Cl⁻>F⁻ (polarizability)","E2 elimination — anti-periplanar H and LG; Zaitsev (more substituted alkene); bulky base (t-BuO⁻) → Hofmann (less substituted)","Competition — 3° + strong Nu + protic → SN1; 1° + strong Nu + aprotic → SN2; bulky base → E over SN"]},
    {name:"Grignard Reagents",concepts:["Preparation — RX + Mg (dry ether) → RMgX; anhydrous conditions essential; destroyed by protic solvents","Reactions — HCHO→1° alcohol; RCHO→2° alcohol; R'COR''→3° alcohol; CO₂→RCOOH; each step extends chain by one C","Uses — powerful nucleophile; C−C bond forming reagent; fundamental to organic synthesis"]}
  ]},
  {topic:"Haloarenes & Polyhalogen Compounds",subtopics:[
    {name:"Haloarenes",concepts:["C−X bond — partial double bond character (C sp²); shorter and stronger than haloalkane C−X; less reactive to SN","Nucleophilic aromatic substitution (SNAr) — requires strong EWG (NO₂, CN) at ortho or para; Meisenheimer complex (anionic σ-complex) intermediate","Fittig reaction — ArX + Na → Ar−Ar (symmetric biaryl); Wurtz-Fittig: RX + ArX + Na → Ar−R (unsymmetrical)","EAS on haloarenes — halogens deactivate ring but direct ortho/para (lone pair donation for orientation)"]},
    {name:"Polyhalogen Compounds",concepts:["CHCl₃ (chloroform) — sweet smell; once used as anaesthetic; reacts with O₂ to give phosgene (toxic)","CCl₄ — non-polar solvent; fire extinguisher; toxic to liver","DDT (dichlorodiphenyltrichloroethane) — organochlorine pesticide; persistent bioaccumulation; banned in many countries","Freons (CFCs) — CCl₂F₂ (Freon-12); chemically inert; used as refrigerants; deplete stratospheric ozone via Cl· chain reaction"]}
  ]}
 ],
 topics:["Nomenclature and classification: primary, secondary, tertiary haloalkanes","Preparation: from alcohols (SOCl₂, PCl₃, PCl₅, HX), alkenes (electrophilic addition), free radical halogenation","Physical properties: polarity; boiling point trends; CHCl₃ and CCl₄","Nucleophilic substitution: SN1 (3°, protic, racemization) vs SN2 (1°, aprotic, inversion)","Factors affecting SN1 vs SN2: substrate, nucleophile strength, solvent, leaving group","E1 and E2 elimination: Zaitsev (Saytzeff) rule — more substituted alkene (major); Hofmann with bulky base","Competition between SN and E: temperature (high T favors E); bulky base favors E","Grignard reagent RMgX: preparation (dry ether); reactions with CO₂, H₂O, aldehydes, ketones, esters","Grignard synthesis of alcohols: HCHO→1°; R'CHO→2°; ketone→3°; CO₂→carboxylic acid","Haloarenes: C−X bond partial double bond character; less reactive than haloalkanes in nucleophilic substitution","Nucleophilic aromatic substitution (NAS): requires strong EWG at ortho/para; Meisenheimer complex","Polyhalogen compounds: CHCl₃ (chloroform), CCl₄ (CTC), DDT (organochlorine), Freons (CFCs — ozone depletion)"],
 formulas:[{t:"Reactivity of Haloalkanes",f:"Alkyl halide reactivity: RI>RBr>RCl>RF; 3°>2°>1° for SN1; 1°>2°>3° for SN2"},{t:"SN1 Mechanism",f:"Step 1: slow ionisation → carbocation; Step 2: fast nucleophile attack; racemisation"},{t:"SN2 Mechanism",f:"One step: back attack; Walden inversion; 180°; rate=k[RX][Nu⁻]"},{t:"E1 vs E2",f:"E1: two steps, carbocation; E2: one step, anti-periplanar H and LG; high T favors E over SN"},{t:"Zaitsev vs Hofmann",f:"Zaitsev: small base → more substituted alkene; Hofmann: bulky base (t-BuO⁻) → less substituted"},{t:"Leaving Group Order",f:"I⁻>Br⁻>Cl⁻>F⁻; F⁻ worst; −OTs>−OMs>−OH₂⁺ (tosylate better than mesylate)"},{t:"Nucleophile Strength",f:"In protic: F⁻>Cl⁻>Br⁻>I⁻ (charge density); in aprotic: I⁻>Br⁻>Cl⁻>F⁻ (polarizability)"},{t:"Grignard Preparation",f:"R−X+Mg (dry ether) → R−MgX; must be anhydrous; reacts with protic H sources"},{t:"Grignard+HCHO",f:"HCHO→primary alcohol (1° with one more C)"},{t:"Grignard+RCHO",f:"R'CHO→secondary alcohol; R'COR''→tertiary alcohol; CO₂→carboxylic acid"},{t:"Haloarenes vs Haloalkanes",f:"Haloarene: C−X has partial double bond (C sp²); less reactive to nucleophilic substitution"},{t:"NAS Conditions",f:"Need strong EWG (NO₂,CN) at o/p; Meisenheimer complex (anionic σ-complex); SNAr"},{t:"CHCl₃",f:"Chloroform; anesthetic; CCl₄=carbon tetrachloride; non-polar solvent"},{t:"DDT",f:"Dichlorodiphenyltrichloroethane; organochlorine pesticide; persistent; bioaccumulation"},{t:"Freons (CFCs)",f:"CCl₂F₂ (Freon-12); stable; deplete ozone; replaced by HFCs"}],
 keyPoints:["SN2: back-attack → Walden inversion (configuration inverts)","SN1: planar carbocation → racemization (both configurations)","Strong, bulky base + secondary substrate → E2 (elimination over substitution)","Grignard must be kept anhydrous — water destroys it (RMgX + H₂O → RH + Mg(OH)X)","Haloarenes: ipso attack; electron density reduced by C−X partial double bond character","Freons decompose in stratosphere → Cl· radicals → catalytic ozone destruction"],
 mindmap:{root:"Haloalkanes &\nHaloarenes",branches:[{n:"Preparation",col:"#059669",nodes:["From Alcohols SOCl₂","HX Addition to Alkene","Free Radical (allylic)","Haloarene from Diazonium"]},{n:"SN Reactions",col:"#10b981",nodes:["SN1 (3°, protic)","SN2 (1°, aprotic)","Leaving Group Order","Nucleophile Strength"]},{n:"Elimination",col:"#047857",nodes:["E1 vs E2","Zaitsev Rule","Hofmann Bulky Base","SN vs E Competition"]},{n:"Grignard & Special",col:"#065f46",nodes:["RMgX Formation","Grignard Additions","Polyhalogen Compounds","Haloarene NAS"]}]}},

{id:"c18",sub:"chem",name:"Alcohols, Phenols & Ethers",weight:"High",est:4, syllabus:[
  {topic:"Alcohols",subtopics:[
    {name:"Properties & Tests",concepts:["Classification — 1° (RCH₂OH), 2° (R₂CHOH), 3° (R₃COH); IUPAC nomenclature","H-bonding — intermolecular O−H···O; high bp compared to alkanes and ethers of similar mass","Lucas test — anhydrous ZnCl₂/conc HCl; 3°: immediate cloudiness (SN1); 2°: turbid after 5 min; 1°: no reaction at room temp","Victor Meyer test — 1°: red; 2°: blue; 3°: colourless (after HNO₂ reaction then β-naphthol)"]},
    {name:"Reactions of Alcohols",concepts:["Oxidation — 1° + PCC → aldehyde (selective, stops here); 1° + KMnO₄/K₂Cr₂O₇ → carboxylic acid; 2° → ketone; 3° → resistant","Dehydration — conc H₂SO₄, 170°C: alkene (Zaitsev); 130°C: ether; Al₂O₃, 300–400°C","Esterification — Fischer: RCOOH+R'OH ⇌ RCOOR'+H₂O; H⁺ catalyst; equilibrium; driven by removing product","Reaction with HX — ROH+HX→RX+H₂O; reactivity 3°>2°>1°; HI>HBr>HCl","Pinacol rearrangement — 1,2-diol+H⁺ → pinacolone; 1,2-hydride or methyl shift after carbocation formation"]}
  ]},
  {topic:"Phenols & Ethers",subtopics:[
    {name:"Phenols",concepts:["Preparation — cumene process (isopropylbenzene+O₂→phenol+acetone); diazonium salt hydrolysis (H₂O, warm)","Acidity — phenol pKa≈10; more acidic than alcohols; less than carboxylic acids; phenoxide stabilised by resonance","Effect of substituents — EWG (NO₂) at ortho/para increases acidity (stabilises phenoxide); EDG (CH₃) decreases","Kolbe-Schmitt reaction — PhONa + CO₂ (pressure) + heat → sodium salicylate → HCl → salicylic acid","Reimer-Tiemann reaction — PhOH + CHCl₃ + NaOH → salicylaldehyde (CHO at ortho); intermediate dichlorocarbene","Azo coupling — ArN₂⁺ + PhOH (alkaline medium) → azo dye (para position); EAS on phenol","EAS on phenol — activating; strong ortho/para director; reacts with Br₂ water (no Lewis acid needed) to give 2,4,6-tribromophenol"]},
    {name:"Ethers",concepts:["Williamson synthesis — RONa + R'X → ROR'; SN2; must use 1° R'X to avoid elimination","Cleavage with HI — R−O−R'+HI → ROH + R'I; excess HI→2RI; HI>HBr>HCl; 3° cleaved by SN1","Epoxide opening (acid) — attack at more substituted C (SN1-like, Markovnikov); regioselective","Epoxide opening (base/Nu⁻) — attack at less substituted C (SN2); anti addition","Peroxide formation — ethers form explosive hydroperoxides on standing in air; safety hazard"]}
  ]}
 ],
 topics:["Alcohols: IUPAC; classification 1°, 2°, 3°; hydrogen bonding → high boiling points","Preparation of alcohols: hydration of alkenes, reduction of aldehydes/ketones/esters, Grignard, fermentation","Lucas test: anhydrous ZnCl₂/conc HCl; 3° immediate, 2° slow, 1° no turbidity","Victor Meyer test: red (1°), blue (2°), colourless (3°)","Chemical reactions of alcohols: oxidation (Jones, PCC, KMnO₄), dehydration (acid/Al₂O₃), esterification","Esterification Fischer: acid + alcohol ⇌ ester + H₂O; H⁺ catalyst; equilibrium","Reaction with HX: 3° fastest; rearrangement possible","Pinacol rearrangement; ring-opening of epoxides","Phenols: preparation (cumene process, diazonium salt hydrolysis, Dow process)","Acidity of phenols: more acidic than alcohols; less acidic than carboxylic acids; resonance stabilized phenoxide","Effect of substituents on acidity: EWG increases; EDG decreases","Kolbe-Schmitt reaction (phenol + CO₂/NaOH → salicylic acid)","Reimer-Tiemann reaction (phenol + CHCl₃/NaOH → salicylaldehyde)","Azo coupling: phenol + diazonium salt → azo dye (para position)","Ethers: Williamson synthesis (NaOR + R'X); unsymmetrical ethers","Reactions of ethers: cleavage with HI>HBr>HCl; epoxide ring-opening (acid: Markovnikov, base: SN2)"],
 formulas:[{t:"Lucas Test",f:"ZnCl₂/conc HCl; 3°: immediate cloudiness; 2°: turbid after 5 min; 1°: no reaction at room T"},{t:"Victor Meyer Test",f:"3°: colourless; 2°: blue; 1°: red (after reaction with HNO₂ then β-naphthol)"},{t:"Alcohol Oxidation",f:"1° + PCC → aldehyde (stops); 1° + KMnO₄/K₂Cr₂O₇ → carboxylic acid; 2° → ketone; 3° → no oxidation"},{t:"Dehydration of Alcohols",f:"Conc H₂SO₄,170°C: elimination (alkene); 130°C: ether; Al₂O₃,300°C: dehydration"},{t:"Fischer Esterification",f:"RCOOH+R'OH⇌RCOOR'+H₂O; H⁺ catalyst; equilibrium; Le Chatelier to push right"},{t:"Reaction with HX",f:"ROH+HX→RX+H₂O; 3°fastest (SN1); 1° via SN2; order: HI>HBr>HCl"},{t:"Pinacol Rearrangement",f:"1,2-diol + H⁺ → pinacolone; 1,2-hydride or methyl shift; carbocation rearrangement"},{t:"Epoxide Opening (Acid)",f:"H₃O⁺: attack at more substituted C (SN1-like,Markovnikov); ring opens syn"},{t:"Epoxide Opening (Base)",f:"Nu⁻: attack at less substituted C (SN2); anti addition; OH and Nu on same or opp faces"},{t:"Phenol Acidity",f:"pKa≈10; more acidic than water and alcohols; phenoxide resonance stabilized"},{t:"EWG Effect on Phenol",f:"NO₂ at o/p increases acidity (stabilizes phenoxide); EDG (CH₃) decreases acidity"},{t:"Kolbe-Schmitt",f:"PhONa+CO₂(pressure)+heat→sodium salicylate→HCl→salicylic acid (aspirin precursor)"},{t:"Reimer-Tiemann",f:"PhOH+CHCl₃+NaOH→2-hydroxybenzaldehyde (salicylaldehyde); CHO at ortho"},{t:"Azo Coupling",f:"ArN₂⁺+PhOH(alkaline)→Ar−N=N−Ph−OH; para position; electrophilic aromatic substitution"},{t:"Williamson Synthesis",f:"RONa+R'X→ROR'; SN2; primary R'X preferred; cannot use 3° alkyl halide"},{t:"Ether Cleavage",f:"R−O−R'+HI→ROH+R'I (excess HI→2RI); HI>HBr>HCl; 3° cleaved by SN1"}],
 keyPoints:["Phenol more acidic than alcohol: phenoxide ion stabilized by resonance (negative charge delocalized)","EWG (NO₂, CN) at o/p of phenol → increased acidity; EDG (CH₃, OCH₃) → decreased acidity","Lucas test: 3° reacts by SN1 (stable carbocation); 1° does not react readily","PCC (pyridinium chlorochromate): oxidizes 1° alcohol to aldehyde WITHOUT going to acid","Epoxide + acid: more substituted C attacked (Markovnikov-like, SN1 character)","Epoxide + base/Nu⁻: less substituted C attacked (SN2)"],
 mindmap:{root:"Alcohols, Phenols\n& Ethers",branches:[{n:"Alcohols",col:"#059669",nodes:["Lucas Test 1°/2°/3°","Oxidation Levels","Dehydration E1","Esterification"]},{n:"Phenols",col:"#10b981",nodes:["Acidity vs Alcohol","Kolbe-Schmitt","Reimer-Tiemann","Azo Coupling"]},{n:"Ethers",col:"#047857",nodes:["Williamson Synthesis","Cleavage HI>HBr","Epoxide Acid/Base","Peroxide Formation"]},{n:"Reactions",col:"#065f46",nodes:["Victor Meyer Test","Pinacol Rearrang","Cumene Process","Ring-Opening"]}]}},

{id:"c19",sub:"chem",name:"Aldehydes, Ketones & Carboxylic Acids",weight:"High",est:5, syllabus:[
  {topic:"Aldehydes & Ketones",subtopics:[
    {name:"Preparation & Nucleophilic Addition",concepts:["Aldehydes — PCC oxidation of 1° alcohol (selective, stops at aldehyde); Rosenmund reduction (RCOCl+H₂/Pd-BaSO₄); ozonolysis of alkenes","Ketones — oxidation of 2° alcohol; Friedel-Crafts acylation (ArH+RCOCl/AlCl₃); ozonolysis","Reactivity — aldehydes more reactive than ketones (less steric hindrance + carbonyl C more electrophilic)","Addition of HCN — RCHO+HCN→RCH(OH)CN (cyanohydrin); important C-chain extension; KCN+HCl","Addition of NaHSO₃ — only with aldehydes and methyl ketones (CH₃COR); products crystalline; used for purification","Addition of Grignard — HCHO→1° alcohol; RCHO→2° alcohol; ketone→3° alcohol; CO₂→carboxylic acid (each extends chain by one C)","Reduction by NaBH₄ — mild, selective; reduces only C=O (aldehyde/ketone→alcohol); does NOT reduce C=C, COOH, ester","Reduction by LiAlH₄ — strong; reduces C=O, COOH, ester, amide, C≡N; in dry ether; reacts violently with water"]},
    {name:"Named Reactions & Tests",concepts:["Aldol condensation — needs α-H; NaOH (or H⁺) catalyst; gives β-hydroxy carbonyl; heating→α,β-unsaturated (dehydration)","Cannizzaro reaction — no α-H (HCHO, PhCHO); 50% NaOH; disproportionation (one oxidised, one reduced)","Cross-Cannizzaro — HCHO is always oxidised in the presence of another non-enolisable aldehyde","Clemmensen reduction — C=O→CH₂ using Zn-Hg/conc HCl; acidic conditions; for base-sensitive substrates","Wolff-Kishner reduction — C=O→CH₂ using N₂H₄ then KOH/ethylene glycol at high T; basic conditions","Tollens' test — RCHO + [Ag(NH₃)₂]⁺ + OH⁻ → RCOO⁻ + 2Ag↓ (silver mirror); ONLY with aldehydes","Fehling's/Benedict's — RCHO + Cu²⁺ complex → Cu₂O↓ (brick-red); aliphatic aldehydes only (NOT benzaldehyde)","Iodoform test — CH₃CO− (methyl ketones) or CH₃CHOH− (ethanol/acetaldehyde) → CHI₃ (yellow ppt); I₂/NaOH"]}
  ]},
  {topic:"Carboxylic Acids & Derivatives",subtopics:[
    {name:"Carboxylic Acids",concepts:["Preparation — oxidation of 1° alcohols/aldehydes; Grignard + CO₂; hydrolysis of nitriles or esters","Acidity — pKa ≈ 4–5; more acidic than phenols and alcohols; carboxylate ion stabilised by resonance","Effect of substituents — EWG (Cl, NO₂, CF₃) near COOH increase acidity; EDG (CH₃, OCH₃) decrease","Reactions — esterification (H⁺, alcohol); acid chloride (SOCl₂); anhydride (P₂O₅); amide; reduction to alcohol (LiAlH₄)","Hell-Volhard-Zelinsky (HVZ) — α-halogenation using Br₂/P (red P); selective α-bromination of carboxylic acids"]},
    {name:"Carboxylic Acid Derivatives",concepts:["Reactivity order — acyl chloride > anhydride > ester > amide (based on leaving group ability)","Hydrolysis — nucleophilic acyl substitution; all give carboxylic acid on complete hydrolysis","Acid chloride — most reactive; reacts with H₂O, alcohol, amine, aromatic ring (Friedel-Crafts)","Esters — Fischer esterification (reversible); saponification (irreversible, NaOH); Claisen condensation (with base)","Amides — least reactive; formed from acid chloride + amine; Hoffmann bromamide degradation→primary amine"]}
  ]}
 ],
 topics:["Preparation of aldehydes: oxidation of 1° alcohols (PCC), ozonolysis, Rosenmund reduction (RCOCl+H₂/Pd-BaSO₄)","Preparation of ketones: oxidation of 2° alcohols, Friedel-Crafts acylation, ozonolysis","Nucleophilic addition to C=O: mechanism; carbonyl C electrophilic (partial +)","Addition of HCN: forms cyanohydrin; important as C-chain extension","Addition of NaHSO₃: only to aldehydes + methyl ketones; test for these","Addition of Grignard RMgX: HCHO→1° alc; RCHO→2° alc; ketone→3° alc","Reduction: NaBH₄ (selective, aldehydes and ketones only) vs LiAlH₄ (reduces almost everything)","Clemmensen reduction (Zn-Hg/HCl): C=O→CH₂ (acidic conditions)","Wolff-Kishner reduction (N₂H₄/KOH): C=O→CH₂ (basic conditions)","Oxidation: aldehydes oxidize easily; ketones resist (only by strong KMnO₄)","Tollens' test (AgNO₃/NH₃): silver mirror with aldehydes only","Fehling's/Benedict's test: Cu²⁺→Cu₂O (brick-red) with aliphatic aldehydes","Aldol condensation: α-H needed; NaOH cat; β-hydroxy aldehyde/ketone; on heating→α,β-unsaturated","Cannizzaro reaction: no α-H (HCHO, PhCHO); 50% NaOH; disproportionation","Cross-Cannizzaro: with HCHO (always oxidized) — HCHO reduces other aldehyde","Iodoform test: CH₃CO− or CH₃CHOH− → CHI₃ (yellow precipitate); identifies methyl ketones and ethanol","Carboxylic acids: preparation (oxidation, Grignard+CO₂, nitrile hydrolysis)","Acidity of carboxylic acids; effect of substituents (EWG increases, EDG decreases acidity)","Reactions of −COOH: esterification, acid chloride (SOCl₂), anhydride, amide, reduction to alcohol","Hell-Volhard-Zelinsky (HVZ): α-halogenation of acid using Br₂/P; selective at α-C","Carboxylic acid derivatives: relative reactivity in hydrolysis (acyl chloride > anhydride > ester > amide)"],
 formulas:[{t:"Nucleophilic Addition",f:"Carbonyl C (δ+) attacked by Nu⁻; aldehydes more reactive than ketones (less steric + more electrophilic)"},{t:"HCN Addition",f:"RCHO+HCN→RCH(OH)CN (cyanohydrin); reversible; KCN+HCl"},{t:"NaHSO₃ Addition",f:"RCHO and CH₃COR react; products crystalline (purification); NO reaction with sterically hindered ketones"},{t:"Grignard Addition",f:"HCHO→1°alcohol; RCHO→2°; RCOR'→3°; CO₂→RCOOH; each extends chain"},{t:"NaBH₄ Reduction",f:"Mild reducer; reduces only C=O (aldehyde/ketone→alcohol); does NOT reduce C=C, COOH, ester"},{t:"LiAlH₄ Reduction",f:"Strong reducer; reduces C=O, COOH, ester, amide, C≡N; in dry ether; reacts violently with water"},{t:"Clemmensen Reduction",f:"C=O→CH₂ using Zn-Hg/conc HCl; acidic conditions; for acid-sensitive substrates avoid"},{t:"Wolff-Kishner",f:"C=O→CH₂ using N₂H₄ then KOH/EG at high T; basic conditions"},{t:"Tollens' Test",f:"RCHO+2[Ag(NH₃)₂]⁺+OH⁻→RCOO⁻+2Ag↓+3NH₃; silver mirror only with aldehydes"},{t:"Fehling's Test",f:"RCHO+2Cu²⁺(complex)→RCOO⁻+Cu₂O↓ brick-red; aliphatic aldehydes (not benzaldehyde)"},{t:"Aldol Condensation",f:"2CH₃CHO (NaOH)→CH₃CH(OH)CH₂CHO; heat→CH₃CH=CHCHO (crotonaldehyde)"},{t:"Conditions for Aldol",f:"Needs α-H; OH⁻ or H⁺ catalyst; cross-aldol with non-enolizable aldehyde selective"},{t:"Cannizzaro Reaction",f:"No α-H; 50% NaOH; disproportionation; HCHO always oxidised in cross-Cannizzaro"},{t:"Iodoform Test",f:"RCOCH₃+3I₂+3NaOH→RCOONa+CHI₃↓(yellow); acetaldehyde, ethanol also positive"},{t:"HVZ Reaction",f:"RCOOH+Br₂/P→RCHBR·COOH; α-bromination; then substitute at α-carbon"},{t:"Reactivity of Acid Derivs",f:"Hydrolysis rate: acyl chloride > anhydride > ester > amide; related to leaving group ability"},{t:"Acid-Base Properties",f:"EWG (Cl,NO₂,CF₃) near COOH increase acidity; EDG (CH₃,OH) decrease acidity"}],
 keyPoints:["Nucleophilic addition: aldehydes more reactive than ketones (less steric + more electrophilic C)","Tollens' and Fehling's: ONLY aldehydes react (not ketones) — standard JEE distinction","Aldol: needs α-H; product can dehydrate on heating to give conjugated product","Cannizzaro: requires no α-H; 50% NaOH; HCHO always acts as reducing agent in cross-Cannizzaro","Iodoform test positive: methyl ketones (CH₃COR), acetaldehyde (CH₃CHO), and ethanol","NaBH₄: mild reducer → aldehyde/ketone to alcohol only; LiAlH₄: reduces everything (acids, esters too)","HVZ: selective α-halogenation via enol intermediate through acid and P catalyst"],
 mindmap:{root:"Aldehydes, Ketones\n& Carboxylic Acids",branches:[{n:"Preparation",col:"#059669",nodes:["PCC Oxidation","Rosenmund RCHO","Friedel-Crafts Ketone","Ozonolysis"]},{n:"Nucleophilic Addition",col:"#10b981",nodes:["HCN Cyanohydrin","NaHSO₃ (ald+MeKet)","Grignard Addition","NaBH₄ vs LiAlH₄"]},{n:"Aldol & Cannizzaro",col:"#047857",nodes:["Aldol (needs α-H)","Aldol Dehydration","Cannizzaro (no α-H)","Cross-Cannizzaro"]},{n:"Tests & Acid",col:"#065f46",nodes:["Tollens' Silver Mirror","Fehling's Cu₂O","Iodoform CHI₃ Test","HVZ α-Halogenation"]}]}},

{id:"c20",sub:"chem",name:"Amines & Diazonium Salts",weight:"High",est:3, syllabus:[
  {topic:"Amines — Structure, Basicity & Reactions",subtopics:[
    {name:"Classification & Basicity",concepts:["Classification — 1° RNH₂; 2° R₂NH; 3° R₃N; 4° R₄N⁺ (quaternary ammonium); aromatic vs aliphatic","Basicity in water — aliphatic: 2°>1°>3°>NH₃ (hydration effect on conjugate acid); 3° bulky cation poorly solvated","Basicity in gas phase — 3°>2°>1°>NH₃ (inductive effect only; no solvation)","Aromatic amines — aniline much less basic than aliphatic (lone pair in resonance with ring; pKb aniline=9.4 vs NH₃=4.74)","EWG on aniline ring (NO₂ at para) — decreases basicity further; EDG (CH₃) — slightly increases"]},
    {name:"Preparation",concepts:["Reduction of nitro compounds — ArNO₂ + Fe/HCl (or Sn/HCl or H₂/Ni) → ArNH₂; used for aniline","Reduction of nitriles — R−C≡N + LiAlH₄ → RCH₂NH₂ (primary amine, chain extended by 1 C)","Gabriel phthalimide synthesis — gives ONLY 1° amines; phthalimide + KOH → K-phthalimide + RX → N-alkylphthalimide + N₂H₄ → RNH₂","Hoffmann bromamide degradation — RCONH₂ + Br₂ + 4NaOH → RNH₂ + Na₂CO₃ + 2NaBr + 2H₂O; C decreases by 1"]},
    {name:"Chemical Tests & Reactions",concepts:["Carbylamine reaction — RNH₂ + CHCl₃ + 3KOH → isocyanide (RNC; foul smell); ONLY 1° amines (aliphatic or aromatic)","Hinsberg test — 1°: gives N-substituted sulfonamide (soluble in NaOH); 2°: N,N-disubstituted (insoluble); 3°: no reaction","Reaction with NaNO₂/HCl — 1° aromatic: stable diazonium ArN₂⁺ (at 0–5°C); 1° aliphatic: unstable, N₂↑; 2°: N-nitrosamine; 3°: N-nitroso","Acylation — with acid chloride → amide (Hinsberg reagent is benzenesulphonyl chloride)","Hofmann elimination — quaternary ammonium hydroxide → less substituted alkene (Hofmann product; opposite of Zaitsev)"]}
  ]},
  {topic:"Diazonium Salts — Reactions & Synthetic Utility",subtopics:[
    {name:"Preparation & Stability",concepts:["Preparation — ArNH₂ + NaNO₂ + HCl at 0–5°C → ArN₂⁺Cl⁻ (diazotisation)","Stability — aryl diazonium stable at 0–5°C due to +M resonance with ring; alkyl decomposes immediately","Storage — only tetrafluoroborate salt [ArN₂]BF₄ can be isolated as stable solid (used in Balz-Schiemann)"]},
    {name:"Substitution Reactions",concepts:["Sandmeyer reaction — ArN₂⁺ + CuCl → ArCl; + CuBr → ArBr; + CuCN → ArCN (uses Cu SALTS)","Gattermann reaction — ArN₂⁺ + HCl/Cu metal → ArCl; uses Cu METAL (not salt); alternative to Sandmeyer","Balz-Schiemann reaction — ArN₂⁺ + HBF₄ → [ArN₂]BF₄ → heat → ArF + N₂ + BF₃; ONLY route to ArF","Replacement by H — H₃PO₂ (hypophosphorous acid) → ArH; used for deamination","Replacement by OH — warm water → ArOH; replacement by CN — CuCN → ArCN (also Sandmeyer)"]},
    {name:"Coupling Reaction & Azo Dyes",concepts:["Azo coupling — ArN₂⁺ + activated aromatic (phenol or amine) → Ar−N=N−Ar' (azo dye); electrophilic aromatic substitution","Conditions — alkaline medium for phenol (phenoxide more reactive); acidic medium for aniline (prevents protonation of diazonium)","Position — coupling occurs at para position (more accessible); ortho if para blocked","Azo dyes — largest class of synthetic dyes; orange-red-yellow colours; −N=N− chromophore; examples: methyl orange, Congo red"]}
  ]}
 ],
 topics:["Classification: 1° RNH₂, 2° R₂NH, 3° R₃N; aromatic vs aliphatic amines","Preparation: reduction of nitro compounds (Fe/HCl or H₂/Ni), nitriles (LiAlH₄), amides (Hoffmann bromamide degradation)","Gabriel phthalimide synthesis: only primary amines (avoids 2° and 3°)","Hoffmann bromamide degradation: RCONH₂ + Br₂ + NaOH → RNH₂ (C decreases by 1)","Basicity of amines: aliphatic > NH₃ > aromatic amines (lone pair in sp³ vs resonance delocalization)","Basicity order of aliphatic amines in water: 2° > 1° > 3° > NH₃ (hydration effects for 3°)","EWG on ring decreases basicity; EDG on ring increases basicity of aniline","Chemical tests: carbylamine reaction (1° amines only → isocyanide, offensive odor)","Hinsberg test: primary reacts to give soluble sulfonamide in NaOH; secondary gives insoluble; tertiary no reaction","Reaction with nitrous acid (NaNO₂/HCl): 1° aliphatic → unstable diazonium (N₂↑); 1° aromatic → stable diazonium at 0–5°C","Diazonium salt stability: aryl diazonium stable (0–5°C) due to resonance; alkyl decomposes immediately","Sandmeyer reaction: ArN₂⁺ + CuCl → ArCl; CuBr → ArBr; CuCN → ArCN","Gattermann reaction: ArN₂⁺ + Cu/HCl → ArCl (or Cu/HBr → ArBr); uses Cu metal not salt","Balz-Schiemann: ArN₂⁺ + HBF₄ → ArF + N₂ + BF₃ (only way to get ArF)","Coupling reaction: ArN₂⁺ + phenol/aniline → azo dye (orange-red); para position; alkaline medium for phenol, acidic for amines","Coupling reaction forms basis of azo dyes — largest class of synthetic dyes"],
 formulas:[{t:"Amine Classification",f:"1° RNH₂; 2° R₂NH; 3° R₃N; 4° R₄N⁺ (quaternary ammonium); aromatic vs aliphatic"},{t:"Basicity Aliphatic",f:"In water: 2°>1°>3°>NH₃; gas phase: 3°>2°>1°>NH₃; hydration key in aqueous"},{t:"Basicity Aromatic",f:"Aniline pKb=9.4; NH₃ pKb=4.74; aniline<<NH₃; lone pair in resonance with ring"},{t:"EWG/EDG on Aniline",f:"EWG (NO₂ at p): decreases basicity; EDG (CH₃ at p): increases; resonance withdrawal"},{t:"Hoffmann Bromamide",f:"RCONH₂+Br₂+4NaOH→RNH₂+Na₂CO₃+2NaBr+2H₂O; C decreases by 1"},{t:"Gabriel Phthalimide",f:"Phthalimide+KOH→K-phthalimide+RX→N-alkyl+N₂H₄→RNH₂; ONLY primary amines"},{t:"Carbylamine Test",f:"RNH₂+CHCl₃+3KOH→isocyanide (foul smell); ONLY 1° amines (aliphatic or aromatic)"},{t:"Hinsberg Test",f:"1°: RSO₂NHR (soluble in NaOH); 2°: RSO₂NR₂ (insoluble); 3°: no reaction"},{t:"NaNO₂/HCl (0°C)",f:"1° aromatic→stable diazonium ArN₂⁺; 1° aliphatic→unstable N₂↑; 2°→nitrosamine; 3°→N-nitroso"},{t:"Sandmeyer Reaction",f:"ArN₂⁺+CuCl→ArCl; +CuBr→ArBr; +CuCN→ArCN; uses Cu salts"},{t:"Gattermann Reaction",f:"ArN₂⁺+HCl/Cu→ArCl; uses Cu metal (not salt); alternative to Sandmeyer"},{t:"Balz-Schiemann",f:"ArN₂⁺+HBF₄→[ArN₂]BF₄→Δ→ArF+N₂+BF₃; ONLY way to get ArF directly"},{t:"Azo Coupling",f:"ArN₂⁺+PhOH(alk)→Ar−N=N−Ar' (para); weak electrophile: needs activated ring"},{t:"Diazonium Stability",f:"Aryl diazonium: stable 0-5°C (resonance); alkyl: decomposes immediately"},{t:"Hofmann Elimination",f:"Quaternary ammonium→Hofmann product (less substituted alkene); opposite Zaitsev"},{t:"Reducing Amines",f:"ArNO₂→ArNH₂: Fe/HCl; Sn/HCl; H₂/Ni; Na₂S₂O₄; used for aniline synthesis"}],
 keyPoints:["Aniline LESS basic than aliphatic amines: lone pair in resonance with ring","Aliphatic basicity in water: 2° > 1° > 3° due to 3° having poor hydration of bulky cation","Carbylamine test: ONLY primary amines (1° aliphatic + aromatic); horrible smell of isocyanide","Diazonium salts: aryl stable at 0–5°C; must be used immediately (not isolated except BF₄⁻ salt)","Sandmeyer needs Cu salt (CuCl, CuBr, CuCN); Gattermann uses Cu metal; Balz-Schiemann gives F","Azo coupling is electrophilic substitution — diazonium is weak electrophile, needs activated ring"],
 mindmap:{root:"Amines &\nDiazonium Salts",branches:[{n:"Preparation",col:"#059669",nodes:["Reduction of NO₂","Gabriel Synthesis (1°)","Hoffmann (C−1)","LiAlH₄/Nitrile"]},{n:"Basicity",col:"#10b981",nodes:["Aliphatic 2°>1°>3°","Aniline < NH₃","EWG/EDG on Ring","Gas vs Aqueous"]},{n:"Tests",col:"#047857",nodes:["Carbylamine (1° only)","Hinsberg Test","NaNO₂/HCl (0°C)","Coupling Reaction"]},{n:"Diazonium",col:"#065f46",nodes:["Sandmeyer CuX","Gattermann Cu metal","Balz-Schiemann ArF","Azo Dye Coupling"]}]}},

{id:"c21",sub:"chem",name:"Classification of Elements & Periodicity",weight:"High",est:3, syllabus:[
  {topic:"Modern Periodic Law & Table",subtopics:[
    {name:"Periodic Law",concepts:["Mendeleev's periodic law — properties periodic function of atomic mass","Modern periodic law — properties periodic function of atomic number (Moseley)","Periods: 7 periods; short (1-3), long (4-5), very long (6-7)","Groups: 1-18; s-block (1,2), p-block (13-18), d-block (3-12), f-block (lanthanoids/actinoids)","Diagonal relationship — Li/Mg, Be/Al, B/Si: similar charge-to-size ratio"]},
    {name:"Periodic Trends — Atomic & Ionic Radius",concepts:["Atomic radius: covalent (half of bond length between identical atoms), van der Waals (non-bonded)","Trend across period: decreases (increasing Zeff; same shell)","Trend down group: increases (new principal quantum shell added)","Ionic radius: cation < parent atom (fewer electrons, same nucleus); anion > parent atom","Isoelectronic species: same electrons — larger Z → smaller radius (e.g. O²⁻>F⁻>Na⁺>Mg²⁺)","d-contraction: 3d elements have similar radii to 4d counterparts due to poor 3d shielding"]},
    {name:"Ionisation Energy",concepts:["First IE: energy to remove outermost electron from gaseous atom in ground state","Trend across period: increases (higher Zeff); decreases down group (electron farther from nucleus)","Exception: IE of B < Be (B removes 2p electron; 2s² half-shields 2p)","Exception: IE of O < N (N has stable half-filled 2p³; O has paired 2p⁴ — repulsion)","Successive IE: large jump when inner shell electron removed → identifies group","Use: identify metals vs non-metals; predict oxidation states"]},
    {name:"Electron Affinity & Electronegativity",concepts:["Electron affinity (EA): energy released on adding electron to gaseous atom","Trend across period: generally increases; F lower than Cl due to small size (electron-electron repulsion)","Cl has highest EA of all elements","Electronegativity (EN): ability to attract shared electrons toward itself","Pauling scale: F = 4.0 (highest); Cs = 0.7 (lowest)","Trend across period: increases; down group: decreases","EN difference → bond polarity; > 1.7 ionic; < 0.5 non-polar covalent"]},
    {name:"Periodic Properties — Deep",concepts:["Metallic character: decreases across period; increases down group","Non-metallic character: opposite of metallic","Melting/boiling points: generally increase then decrease across period (group 14 highest)","Oxidising power: increases across period (highest for F)","Reducing power: increases down group for metals","Hydration energy: decreases with increasing ionic size","Oxide nature: basic (s-block) → amphoteric (Al, Zn) → acidic (non-metals p-block)","Anomalous properties of 2nd period elements: small size, no d-orbitals, high EN"]}
  ]},
  {topic:"Comparative Study of Groups",subtopics:[
    {name:"s-Block Trends (Group 1 & 2)",concepts:["Group 1: Li to Cs; monovalent; strong reducing agents; highly reactive with water","Group 2: Be to Ba; divalent; reactivity increases down group; Be anomalous (amphoteric)","Flame test colors: Li-red, Na-yellow, K-violet, Rb-red, Cs-blue, Ca-brick red, Sr-crimson, Ba-apple green","Solubility of sulfates (group 2): decreases down group (BaSO₄ least soluble)","Solubility of hydroxides (group 2): increases down group (Ba(OH)₂ most soluble)"]},
    {name:"p-Block Trends",concepts:["Valence electrons 3–8; diverse chemistry","Inert pair effect: heavier p-block elements prefer lower oxidation state (Tl⁺ over Tl³⁺; Pb²⁺ over Pb⁴⁺)","Trend in acidic/basic character of oxides: left p-block basic → right acidic","Hydrides: stability decreases down group; NH₃>PH₃; HF>HCl>HBr>HI (thermally)","Halides: stability decreases down group"]}
  ]}
 ],
 topics:["Modern periodic law — properties periodic function of atomic number","Periods 1-7; Groups 1-18; blocks s,p,d,f","Periodic trends: atomic radius (decrease across, increase down)","Ionic radius: cation < atom < anion; isoelectronic series","Ionisation energy: increase across; exceptions B<Be, O<N","Electron affinity: Cl highest; F anomaly","Electronegativity: Pauling scale; F=4.0","Metallic character: decrease across, increase down","Oxide nature: basic→amphoteric→acidic across period","Diagonal relationship: Li-Mg, Be-Al, B-Si","Flame test colors for alkali/alkaline earth metals","Inert pair effect in heavier p-block elements"],
 formulas:[{t:"Atomic Radius Trend",f:"Across period: Zeff↑ → radius↓; Down group: new shell → radius↑"},{t:"Ionic Radius",f:"Cation < Parent atom < Anion; Isoelectronic: higher Z → smaller r"},{t:"IE Trend",f:"Generally: IE₁(period): Li<Be>B<C<N>O<F<Ne; exceptions at Be>B and N>O"},{t:"Electronegativity",f:"Pauling scale: F=4.0, O=3.5, N=3.0, Cl=3.0; ΔEN>1.7 ionic"},{t:"EA Anomaly",f:"Cl>F (EA) despite F more EN — F small size, electron repulsion in 2p"},{t:"Oxide Nature",f:"Na₂O (basic) → Al₂O₃ (amphoteric) → SiO₂ → P₂O₅ → SO₃ → Cl₂O₇ (acidic)"},{t:"Inert Pair Effect",f:"Heavier p-block: ns² pair reluctant to ionise; Tl(+1), Pb(+2), Bi(+3) more stable"},{t:"Successive IE",f:"Sudden jump in IE when core electron removed → identifies group number"},{t:"Sulfate Solubility",f:"Group 2 sulfates: BeSO₄>MgSO₄>CaSO₄>SrSO₄>BaSO₄ (solubility decreases down)"},{t:"Hydroxide Solubility",f:"Group 2 hydroxides: Be(OH)₂<Mg(OH)₂<Ca(OH)₂<Sr(OH)₂<Ba(OH)₂ (increases down)"}],
 keyPoints:["IE anomaly: Be>B (B removes 2p, shielded by 2s²); N>O (N half-filled 2p³ extra stable)","EA: Cl > F (not F!) — F small size causes e⁻ repulsion in compact 2p orbital","Isoelectronic: O²⁻>F⁻>Ne>Na⁺>Mg²⁺>Al³⁺ (same e⁻, increasing Z → decreasing radius)","Diagonal relationship: similar charge/size ratio → similar chemistry"],
 mindmap:{root:"Periodicity",branches:[{n:"Atomic Radius",col:"#059669",nodes:["Decreases Period→","Increases Group↓","Cation < Atom","Anion > Atom"]},{n:"IE Trends",col:"#10b981",nodes:["Increases Period→","Be>B exception","N>O exception","Successive jump"]},{n:"EN & EA",col:"#047857",nodes:["Pauling scale","F=4.0 highest","Cl highest EA","Bond polarity"]},{n:"Other Trends",col:"#065f46",nodes:["Metallic char.","Oxide nature","Inert pair","Diagonal rel."]}]}},

{id:"c22",sub:"chem",name:"d- & f-Block Elements",weight:"High",est:4, syllabus:[
  {topic:"Transition Elements (d-Block) — Deep",subtopics:[
    {name:"Electronic Configuration",concepts:["General: (n-1)d¹⁻¹⁰ ns¹⁻²; 3d series: Sc to Zn","Exceptions: Cr — [Ar]3d⁵4s¹ (half-filled d); Cu — [Ar]3d¹⁰4s¹ (fully filled d)","Reason: half-filled and fully filled subshells have extra stability (exchange energy)","Ionisation: ns electrons removed before (n-1)d electrons (ns higher energy in multielectron)","Fe: [Ar]3d⁶4s² → Fe²⁺: [Ar]3d⁶; Fe³⁺: [Ar]3d⁵ (more stable due to half-filled)"]},
    {name:"Physical Properties",concepts:["Atomic radii: smaller than s-block; fairly constant across 3d series (d-contraction)","3d and 4d series: similar radii due to lanthanoid contraction","High melting/boiling points: strong metallic bonding (unpaired d electrons)","Exception: Zn, Cd, Hg — low MP (d¹⁰ — no unpaired d electrons for metallic bonding)","High density; hard metals","Good conductors of heat and electricity"]},
    {name:"Chemical Properties — Variable Oxidation States",concepts:["Multiple oxidation states due to small energy gap between (n-1)d and ns","Mn shows widest range: +2 to +7 (MnO — +2; MnO₂ — +4; KMnO₄ — +7)","Highest OS in highest fluorides/oxides (e.g., CrF₆, MnO₄⁻)","Lower OS in sulfides and iodides","Fe: +2 (FeO, FeSO₄), +3 (Fe₂O₃); +6 (ferrate, rare)","Cu: +1 (Cu₂O), +2 (CuO, CuSO₄)"]},
    {name:"Colour of Transition Metal Ions",concepts:["Colour from d-d transitions: partially filled d orbitals absorb visible light","Crystal field splitting (Δ) determines wavelength absorbed → complementary colour observed","Ti³⁺ (d¹) — violet; V³⁺ (d²) — green; Cr³⁺ (d³) — violet; Mn²⁺ (d⁵ half-filled) — pale pink","Fe³⁺ (d⁵) — yellow-brown; Fe²⁺ (d⁶) — pale green; Cu²⁺ (d⁹) — blue","Zn²⁺ (d¹⁰), Sc³⁺ (d⁰) — colourless (no d-d transition possible)","Colour also depends on ligand (spectrochemical series) and oxidation state"]},
    {name:"Magnetic Properties",concepts:["Paramagnetism: due to unpaired electrons; μ = √n(n+2) BM","Diamagnetic: all electrons paired (e.g., Zn²⁺, Cu⁺, Sc³⁺)","Number of unpaired electrons determines magnetic moment","Mn²⁺/Fe³⁺ (d⁵ high spin): 5 unpaired → μ = √35 ≈ 5.92 BM","Ferromagnetism (Fe, Co, Ni): magnetic domains aligned; lost above Curie temperature"]},
    {name:"Important Compounds",concepts:["K₂Cr₂O₇ (potassium dichromate): orange crystals; dichromate-chromate equilibrium: Cr₂O₇²⁻ + H₂O ⇌ 2CrO₄²⁻ + 2H⁺","K₂Cr₂O₇ as oxidiser in acid: Cr₂O₇²⁻ + 14H⁺ + 6e⁻ → 2Cr³⁺ + 7H₂O (n-factor = 6)","KMnO₄ preparation: MnO₂ → K₂MnO₄ (fusion with KOH/O₂) → KMnO₄ (electrolytic oxidation)","KMnO₄ in acid (MnO₄⁻ + 8H⁺ + 5e⁻ → Mn²⁺ + 4H₂O; n-factor = 5) — purple→colourless","KMnO₄ in neutral (MnO₄⁻ + 2H₂O + 3e⁻ → MnO₂ + 4OH⁻; n-factor = 3) — brown ppt","KMnO₄ in basic: same n-factor = 3 (brown MnO₂)","Interstitial compounds: C, N, H in metallic lattice → hard, high MP","Alloys: brass (Cu+Zn), bronze (Cu+Sn), steel (Fe+C)","Catalytic activity: variable OS, large surface area (Fe in Haber, Pt in H₂SO₄, Ni in hydrogenation, V₂O₅ in contact)"]},
    {name:"Catalytic Properties",concepts:["Variable oxidation states allow electron transfer (redox catalysis)","Large surface area for heterogeneous catalysis","Fe catalyst in Haber process (N₂ + 3H₂ ⇌ 2NH₃); Al₂O₃ promoter","Pt/Pd catalyst in catalytic converters (oxidise CO to CO₂)","V₂O₅ catalyst in contact process (SO₂ to SO₃)","Ni catalyst for hydrogenation of oils (Sabatier reaction)","MnO₂ catalyst for KClO₃ decomposition"]}
  ]},
  {topic:"Lanthanoids and Actinoids (f-Block)",subtopics:[
    {name:"Lanthanoids (4f Elements)",concepts:["Ce to Lu (Z = 58 to 71); electronic config: [Xe]4f¹⁻¹⁴5d⁰⁻¹6s²","Common OS: +3 (most stable); Ce shows +4; Eu and Yb show +2","Lanthanoid contraction: steady decrease in atomic/ionic radii from La to Lu","Cause: poor shielding by 4f electrons → Zeff increases steadily","Consequences: 3d series (e.g., Mo) similar size to 4d (e.g., W) → hard to separate","Similarity in properties makes separation of lanthanoids difficult (ion exchange, solvent extraction)","All are shiny metals; similar chemistry; used in magnets (NdFeB), lasers, phosphors"]},
    {name:"Actinoids (5f Elements)",concepts:["Th to Lr (Z = 90 to 103); electronic config: [Rn]5f¹⁻¹⁴6d⁰⁻¹7s²","All radioactive; Pa, U, Np, Pu occur naturally; rest are synthetic (transuranium)","Wide range of OS (+2 to +7) due to comparable energy of 5f, 6d, 7s","More complex chemistry than lanthanoids due to relativistic effects","Actinoid contraction: similar to lanthanoid contraction","U shows +3,+4,+5,+6 OS; most stable +6 (UO₂²⁺ — uranyl)","Applications: nuclear fuel (U-235, Pu-239); nuclear weapons; research"]}
  ]}
 ],
 topics:["Electronic config of 3d series; exceptions Cr and Cu (half-filled/fully filled d)","Atomic and ionic radii trends in 3d series","Variable oxidation states in d-block; widest range in Mn (+2 to +7)","Colour due to d-d transitions; Zn²⁺/Sc³⁺ colourless","Magnetic properties: μ=√n(n+2) BM; paramagnetism vs diamagnetism","K₂Cr₂O₇: oxidising agent in acid; n-factor=6","KMnO₄: in acid (n=5), neutral/basic (n=3)","Catalytic activity due to variable OS and surface area","Interstitial compounds; alloys","Lanthanoid contraction: cause and consequences","Lanthanoids: +3 common OS; Ce(+4), Eu/Yb(+2)","Actinoids: all radioactive; wide range of OS; 5f comparable to 6d"],
 formulas:[{t:"Cr Exception",f:"Cr: [Ar]3d⁵4s¹ (not 3d⁴4s²); half-filled d extra stable"},{t:"Cu Exception",f:"Cu: [Ar]3d¹⁰4s¹ (not 3d⁹4s²); fully filled d extra stable"},{t:"Magnetic Moment",f:"μ = √n(n+2) BM; n = no. of unpaired electrons"},{t:"Mn²⁺/Fe³⁺",f:"d⁵ high spin: 5 unpaired → μ = √35 ≈ 5.92 BM (max for 1st row)"},{t:"KMnO₄ Acidic",f:"MnO₄⁻+8H⁺+5e⁻→Mn²⁺+4H₂O; E°=+1.51V; n-factor=5; purple→colourless"},{t:"KMnO₄ Neutral",f:"MnO₄⁻+2H₂O+3e⁻→MnO₂↓+4OH⁻; n-factor=3; brown ppt"},{t:"K₂Cr₂O₇ Acidic",f:"Cr₂O₇²⁻+14H⁺+6e⁻→2Cr³⁺+7H₂O; n-factor=6; orange→green"},{t:"Dichromate Equil.",f:"Cr₂O₇²⁻+H₂O⇌2CrO₄²⁻+2H⁺; acidic→orange; alkaline→yellow"},{t:"Lanthanoid Config",f:"[Xe]4f¹⁻¹⁴5d⁰⁻¹6s²; Os = +3 common; Ce: +4; Eu/Yb: +2"},{t:"Actinoid Config",f:"[Rn]5f¹⁻¹⁴6d⁰⁻¹7s²; all radioactive; wider OS (+2 to +7)"},{t:"Contraction",f:"Lanthanoid: 4f poor shielding → Zeff↑ → r↓; consequence: 4d≈5d period radii"}],
 keyPoints:["Zn²⁺(d¹⁰), Sc³⁺(d⁰) are colourless — no d-d transition possible","KMnO₄ colour changes: acid→colourless (Mn²⁺); neutral/basic→brown (MnO₂)","Lanthanoid contraction → 4d and 5d elements have similar radii → hard to separate Zr/Hf","Fe²⁺→Fe³⁺ more stable because d⁵ half-filled; hence Fe²⁺ is reducing agent"],
 mindmap:{root:"d- & f-Block",branches:[{n:"Configuration",col:"#059669",nodes:["(n-1)d¹⁻¹⁰ns¹⁻²","Cr: 3d⁵4s¹","Cu: 3d¹⁰4s¹","ns removed 1st"]},{n:"Properties",col:"#10b981",nodes:["Variable OS","d-d Colour","μ=√n(n+2)","Catalytic Activity"]},{n:"Compounds",col:"#047857",nodes:["KMnO₄ n=5/3","K₂Cr₂O₇ n=6","Interstitial Cpds","Alloys"]},{n:"f-Block",col:"#065f46",nodes:["4f Lanthanoids","5f Actinoids","Contraction","Radioactive Act."]}]}},

{id:"c23",sub:"chem",name:"Metallurgy",weight:"High",est:3, syllabus:[
  {topic:"Concentration of Ores",subtopics:[
    {name:"Physical Methods",concepts:["Hydraulic washing (gravity separation): based on density differences between ore and gangue; dense ore sinks","Magnetic separation: ore or gangue is magnetic; e.g., wolframite (magnetic) separated from cassiterite (non-magnetic)","Froth flotation: for sulphide ores; ore particles wettable by oil (pine oil), gangue by water; collectors (xanthates) and frothers (cresol) added; air blown → ore collects in froth","Levigation (elutriation): lighter particles washed away by water current"]},
    {name:"Chemical Methods",concepts:["Leaching: ore dissolved in suitable chemical reagent; selective dissolution","Cyanide process for gold: 4Au + 8CN⁻ + O₂ + 2H₂O → 4[Au(CN)₂]⁻ + 4OH⁻; gold recovered by Zn: 2[Au(CN)₂]⁻ + Zn → [Zn(CN)₄]²⁻ + 2Au","Bayer's process for aluminium: Al₂O₃·H₂O + NaOH → NaAlO₂ + 2H₂O (leaching); then CO₂ to reprecipitate Al(OH)₃ → Al₂O₃ by calcination","Hall's process: NaCl + H₂O electrolysis — not for Al; Bayer's + Hall-Héroult for Al"]}
  ]},
  {topic:"Thermodynamic Principles — Ellingham Diagram",subtopics:[
    {name:"Ellingham Diagram",concepts:["Plot of ΔG° of formation of oxides vs temperature","ΔG° = ΔH° − TΔS°; for most metal oxidations, ΔS° negative (consuming gas) → positive slope","C+O₂→CO₂: nearly zero slope; C+½O₂→CO: negative slope (2 mol gas produced from 1)","CO line crosses metal oxide lines at high T → C can reduce those oxides above crossing temperature","Al line always lower than most transition metals (except Ca, Mg) → Al can reduce Fe₂O₃ (thermite)","Mg line lowest at lower temperatures → Mg used for reduction of TiO₂, SiO₂","Limitations: Ellingham diagram shows thermodynamic feasibility, not kinetics"]}
  ]},
  {topic:"Extraction Processes",subtopics:[
    {name:"Calcination & Roasting",concepts:["Calcination: heating in limited/no air; for carbonates and hydroxides: CaCO₃→CaO+CO₂; Fe₂O₃·H₂O→Fe₂O₃+H₂O","Roasting: heating in excess air; for sulphide ores: 2ZnS+3O₂→2ZnO+2SO₂; 2PbS+3O₂→2PbO+2SO₂","Difference: calcination — remove CO₂/H₂O; roasting — convert sulphides to oxides + remove S as SO₂"]},
    {name:"Reduction Methods",concepts:["Carbon reduction (smelting): C/CO reduces metal oxide above Ellingham crossing T; Fe₂O₃ in blast furnace","Self-reduction: sulphide partially roasted then reduced by remaining sulphide: Cu₂S+2Cu₂O→6Cu+SO₂","Thermite/Aluminothermic: Al reduces metal oxide; 2Al+Cr₂O₃→Al₂O₃+2Cr; ΔG very negative","Electrolytic: highly reactive metals (Na, Mg, Al, Ca) — oxide too stable for C reduction","Na: Downs cell (NaCl melt electrolysis at 600°C); Cl₂ and Na produced","Mg: Electrolysis of MgCl₂ (from dolomite or sea water)","Al: Hall-Héroult cell (Al₂O₃ in cryolite Na₃AlF₆; C electrodes; 950°C; Al deposited at cathode)"]},
    {name:"Specific Metal Extractions",concepts:["Iron (blast furnace): Fe₂O₃+3CO→2Fe+3CO₂ (main); also direct reduction by C; pig iron 4% C","Steel making: removal of C, Si, Mn, S, P by oxygen blowing (LD converter)","Copper: Cu₂S ore → roasting Cu₂O → Cu₂S+2Cu₂O→6Cu+SO₂ (self-reduction) → Bessemerisation","Copper blister (98%) → electrolytic refining (anode dissolves, Cu deposits at cathode; Ag,Au,Pt collect as anode mud)","Zinc: ZnO+C→Zn+CO (at 1673K); vapour distillation refining","Silver: cyanide leaching; Ag⁺ + CN⁻ → [Ag(CN)₂]⁻; recovered by Zn dust","Aluminium: Bayer's (purification) + Hall-Héroult (electrolysis) in cryolite"]}
  ]},
  {topic:"Refining Methods",subtopics:[
    {name:"Refining Techniques",concepts:["Distillation: for low boiling metals (Zn 907°C, Hg 357°C); volatile metal separated from non-volatile impurities","Liquation: for low melting metals (Sn 232°C, Pb 327°C); slanted hearth — pure metal flows off, impurities remain","Electrolytic refining: Cu, Ag, Au, Ni, Zn; impure metal anode; pure metal cathode; same metal salt electrolyte","Zone refining (zone melting): for Si, Ge, Ga, In; impurities more soluble in melt than solid → move to one end; ultra-pure semiconductor material","Van Arkel–de Boer method: for Ti, Zr, V, Si; volatile iodide formed, then decomposed on hot filament: Ti+2I₂→TiI₄; TiI₄→Ti+2I₂ (ultra-pure Ti)","Chromatography: for very small quantities (paper, gas chromatography of metals)","Cupellation: Ag,Au separated from Pb by oxidising Pb to PbO (litharge) which is absorbed by bone ash hearth"]}
  ]}
 ],
 topics:["Froth flotation: sulphide ores; collectors, frothers","Leaching: cyanide (Au), Bayer's (Al), ammonia (Cu)","Calcination (carbonates) vs Roasting (sulphides)","Ellingham diagram: ΔG° vs T; C/CO reduction feasibility","Thermite reaction: Al reduces Cr₂O₃/Fe₂O₃","Blast furnace for iron; LD converter for steel","Self-reduction of copper (Cu₂S + Cu₂O)","Hall-Héroult for Al (cryolite, 950°C)","Downs cell for Na; Mg from MgCl₂ electrolysis","Electrolytic refining: Cu anode mud (Ag,Au,Pt)","Zone refining for Si, Ge","Van Arkel–de Boer method for Ti, Zr"],
 formulas:[{t:"Gold Cyanide",f:"4Au+8CN⁻+O₂+2H₂O→4[Au(CN)₂]⁻+4OH⁻; recovered: 2[Au(CN)₂]⁻+Zn→[Zn(CN)₄]²⁻+2Au"},{t:"Bayer's Process",f:"Al₂O₃·H₂O+2NaOH→2NaAlO₂+3H₂O; NaAlO₂+CO₂+2H₂O→Al(OH)₃+NaHCO₃"},{t:"Roasting ZnS",f:"2ZnS+3O₂→2ZnO+2SO₂ (roasting); ZnO+C→Zn+CO (reduction at 1673K)"},{t:"Blast Furnace",f:"Fe₂O₃+3CO→2Fe+3CO₂; also: Fe₂O₃+3C→2Fe+3CO; C+O₂→CO₂; CO₂+C→2CO"},{t:"Thermite",f:"2Al+Cr₂O₃→Al₂O₃+2Cr; 2Al+Fe₂O₃→Al₂O₃+2Fe; ΔH extremely negative"},{t:"Cu Self-Reduction",f:"Cu₂S+2Cu₂O→6Cu+SO₂ (Bessemer converter)"},{t:"Hall-Héroult",f:"Al₂O₃→2Al+3/2O₂; C anode burns off; cryolite Na₃AlF₆ lowers MP from 2072°C to ~950°C"},{t:"Downs Cell",f:"NaCl(l) electrolysis: cathode: Na⁺+e⁻→Na; anode: 2Cl⁻→Cl₂+2e⁻; T=600°C"},{t:"Van Arkel",f:"Ti+2I₂(250°C)→TiI₄(gas)→Ti(on hot W filament,1400°C)+2I₂; cycle repeats"},{t:"Zone Refining",f:"Impurities more soluble in melt; molten zone moves across rod → impurities concentrate at one end; ultra-pure Si/Ge"},{t:"Ellingham Slope",f:"2C+O₂→2CO has negative slope (ΔS>0); crosses metal lines → reduction at high T"}],
 keyPoints:["Froth flotation: oil wets ore (sulphide), water wets gangue; collectors stabilise froth","Ellingham: lower line = more stable oxide; C (CO) line crosses Fe below ~1000K → Fe reducible by coke","Anode mud in Cu refining: Ag, Au, Pt collect (do not dissolve in CuSO₄ electrolyte)","Zone refining: impurities preferentially stay in molten zone; move to end → ultra-pure product"],
 mindmap:{root:"Metallurgy",branches:[{n:"Concentration",col:"#059669",nodes:["Froth Flotation","Magnetic Sep.","Leaching Au","Bayer's Al"]},{n:"Roast/Calc.",col:"#10b981",nodes:["Calcination CO₂↑","Roasting SO₂↑","Ellingham ΔG°","Thermite Al"]},{n:"Reduction",col:"#047857",nodes:["Blast Furnace Fe","Hall-Héroult Al","Downs Cell Na","Cu Self-Reduction"]},{n:"Refining",col:"#065f46",nodes:["Electrolytic Cu","Zone Refining Si","Van Arkel Ti","Distillation Zn"]}]}},

{id:"c24",sub:"chem",name:"Analytical Chemistry",weight:"Medium",est:2, syllabus:[
  {topic:"Qualitative Analysis — Cation Groups",subtopics:[
    {name:"Group Reagents & Identification",concepts:["Group 0 (before HCl): NH₄⁺ (volatile base with NaOH → NH₃ pungent smell; turns moist red litmus blue)","Group I (dilute HCl): Ag⁺ (white ppt AgCl, soluble in NH₃), Pb²⁺ (white PbCl₂, soluble in hot water), Hg₂²⁺ (white Hg₂Cl₂, turns black with NH₃ — Hg + HgNH₂Cl)","Group II (H₂S in dilute HCl, ~0.3M acid): Cu²⁺ (black CuS), Pb²⁺ (black PbS), As³⁺ (yellow As₂S₃), Sb³⁺ (orange Sb₂S₃), Hg²⁺ (black HgS), Bi³⁺ (black Bi₂S₃), Cd²⁺ (yellow CdS)","Group III (NH₃/NH₄Cl buffer, H₂S): Fe³⁺ (red-brown Fe(OH)₃), Al³⁺ (white Al(OH)₃), Cr³⁺ (green Cr(OH)₃)","Group IV (H₂S in NH₃ medium): Ni²⁺ (black NiS), Co²⁺ (black CoS), Mn²⁺ (salmon pink MnS), Zn²⁺ (white ZnS)","Group V ((NH₄)₂CO₃ in NH₃): Ba²⁺ (white BaCO₃), Sr²⁺ (white SrCO₃), Ca²⁺ (white CaCO₃)","Group VI (no common reagent): Mg²⁺ (white Mg(OH)₂ with NaOH), Na⁺ (yellow flame test), K⁺ (violet flame test — through cobalt blue glass)"]},
    {name:"Confirmatory Tests for Common Cations",concepts:["Fe³⁺: deep blue/Prussian blue with K₄[Fe(CN)₆] (potassium ferrocyanide); blood red with KCNS/KSCN","Fe²⁺: dark blue/Turnbull's blue with K₃[Fe(CN)₆] (potassium ferricyanide)","Cu²⁺: deep blue [Cu(NH₃)₄]²⁺ with excess NH₃","Pb²⁺: yellow PbCrO₄ with K₂CrO₄; black PbS with H₂S","Ba²⁺: yellow-green flame; white BaSO₄ ppt (insoluble in HCl) with H₂SO₄","Ca²⁺: brick-red flame; white CaSO₄ (slightly soluble)","Zn²⁺: white ZnS; white ppt with NaOH soluble in excess (amphoteric)","Al³⁺: white gelatinous Al(OH)₃ with NaOH, soluble in excess; lake test with aluminon"]}
  ]},
  {topic:"Qualitative Analysis — Anion Groups",subtopics:[
    {name:"Acid Radical (Anion) Tests",concepts:["Carbonate CO₃²⁻: dil. HCl → CO₂ (turns lime water milky); AgNO₃ → white Ag₂CO₃ ppt","Sulphite SO₃²⁻: dil. H₂SO₄ → SO₂ (pungent, turns K₂Cr₂O₇ paper green)","Sulphide S²⁻: dil. HCl → H₂S (rotten egg smell; blackens lead acetate paper)","Nitrite NO₂⁻: dil. H₂SO₄ → brown fumes NO₂; starch-iodide paper turns blue","Chloride Cl⁻: AgNO₃ → white AgCl ppt, soluble in dil. NH₃, insoluble in HNO₃","Bromide Br⁻: AgNO₃ → pale yellow AgBr ppt, sparingly soluble in dil. NH₃","Iodide I⁻: AgNO₃ → yellow AgI ppt, insoluble in NH₃; starch turns blue with Cl₂ water","Sulphate SO₄²⁻: BaCl₂ → white BaSO₄ ppt, insoluble in dil. HCl (confirmatory)","Nitrate NO₃⁻: ring test — FeSO₄ + conc. H₂SO₄ → brown ring [Fe(H₂O)₅NO]²⁺","Phosphate PO₄³⁻: ammonium molybdate (NH₄)₂MoO₄ in HNO₃ → canary yellow ppt; also FeCl₃ → pale yellow/buff ppt"]}
  ]},
  {topic:"Quantitative Volumetric Analysis",subtopics:[
    {name:"Acid-Base Titrations",concepts:["Strong acid-strong base: equivalence point pH=7; indicators: methyl orange or phenolphthalein (both work)","Strong acid-weak base: EP pH<7; indicator: methyl orange (range 3.1–4.4)","Weak acid-strong base: EP pH>7; indicator: phenolphthalein (range 8.3–10.0)","Weak acid-weak base: no sharp EP; titration not feasible practically","Buffer region: pH = pKa ± 1; half-equivalence point pH = pKa (for weak acid)","Back titration: excess reagent used to react with analyte; remaining excess titrated","Double indicator titration: Na₂CO₃+NaOH mixture: V₁(phenolphthalein) titrates NaOH+½Na₂CO₃; V₁+V₂(methyl orange) titrates all"]},
    {name:"Redox Titrations",concepts:["KMnO₄ titration (acidic): self-indicator (purple→colourless); standardised by oxalic acid or ferrous ammonium sulphate","K₂Cr₂O₇ titration: not self-indicator; diphenylamine or N-phenylanthranilic acid used as indicator; doesn't oxidise Cl⁻ (unlike KMnO₄)","Iodometric: I₂ liberated from I⁻ + oxidising agent; titrated with Na₂S₂O₃ (sodium thiosulphate) using starch indicator","Iodimetric: free I₂ titrated with Na₂S₂O₃; starch → blue colour disappears at EP","Cerimetry: Ce⁴⁺ titrations (strong oxidiser)","Bromatometry: KBrO₃ + KBr in acid → Br₂; Br₂ reacts with analyte"]},
    {name:"Complexometric & Gravimetric",concepts:["EDTA (ethylenediaminetetraacetic acid) forms 1:1 complex with most metal ions","Eriochrome Black T (EBT) indicator: wine-red with M²⁺, blue free; used for Ca²⁺, Mg²⁺, Zn²⁺ titration","Calmagite indicator similar to EBT; murexide for Ca²⁺ specifically","Gravimetry: analyte precipitated as sparingly soluble compound of known formula; weighed after filtration/drying","BaSO₄ gravimetry for SO₄²⁻; AgCl gravimetry for Cl⁻"]}
  ]},
  {topic:"Organic Quantitative Analysis",subtopics:[
    {name:"Elemental Analysis",concepts:["C and H estimation (Liebig method): organic compound burned in O₂; CO₂ absorbed in KOH/NaOH; H₂O absorbed in anhydrous CaCl₂; weighed separately","N estimation — Dumas method: compound burned in CO₂; N₂ collected over KOH; volume measured at STP → % N","N estimation — Kjeldahl method: compound heated with conc. H₂SO₄ → (NH₄)₂SO₄; distilled with NaOH → NH₃; absorbed in known H₂SO₄; back-titrated; not applicable to pyridine, azo compounds, nitro compounds","Halogen estimation (Carius): compound fused with fuming HNO₃ in sealed tube + AgNO₃; halide precipitated as AgX; weighed → % X","S estimation (Carius): organic S → BaSO₄ via BaCl₂; weighed","P estimation: organic P → H₃PO₄; precipitated as (NH₄)₃PO₄·12MoO₃ (ammonium phosphomolybdate); weighed"]}
  ]}
 ],
 topics:["Cation group 0 (NH₄⁺), I (HCl), II (H₂S/acid), III (NH₃/NH₄Cl), IV (H₂S/NH₃), V (carbonate), VI (no reagent)","Confirmatory tests: Fe³⁺ (KSCN blood red; ferrocyanide blue), Fe²⁺ (ferricyanide blue), Cu²⁺ (deep blue NH₃)","Anion tests: CO₃²⁻ (lime water), SO₄²⁻ (BaSO₄ insol in HCl), NO₃⁻ (brown ring), Cl⁻ (AgCl white/NH₃)","Acid-base: indicators — methyl orange (strong acid-weak base), phenolphthalein (weak acid-strong base)","Double indicator titration: Na₂CO₃+NaOH mixture","KMnO₄ self-indicator; K₂Cr₂O₇ (diphenylamine indicator)","Iodometry: I₂ liberated; titrated with Na₂S₂O₃; starch indicator","EDTA complexometry: EBT indicator for Ca²⁺, Mg²⁺","Kjeldahl for N; Carius for halogens, S, P","Liebig for C and H estimation"],
 formulas:[{t:"Cation Group Separation",f:"Group I: HCl; Group II: H₂S+dil HCl (pH~0.5); Group III: H₂S+NH₄OH+NH₄Cl; Group IV: H₂S+NH₃; Group V: (NH₄)₂CO₃"},{t:"Fe³⁺ Tests",f:"Fe³⁺+SCN⁻→[Fe(SCN)]²⁺ blood red; Fe³⁺+[Fe(CN)₆]⁴⁻→Prussian blue (turnbull's if Fe²⁺)"},{t:"Brown Ring Test",f:"NO₃⁻: FeSO₄+NO₃⁻+H₂SO₄→[Fe(H₂O)₅NO]²⁺ brown ring at interface"},{t:"BaSO₄ Test",f:"Ba²⁺+SO₄²⁻→BaSO₄↓ white; insoluble in dil HCl — confirms SO₄²⁻"},{t:"Liebig Method",f:"%C = (mass CO₂/mass sample)×(12/44)×100; %H = (mass H₂O/mass sample)×(2/18)×100"},{t:"Kjeldahl Method",f:"%N = (1.4×M×V_acid×n_factor−V_NaOH×M_NaOH)/mass sample; applies to amino/amide N"},{t:"Carius Halogen",f:"%X = (mass AgX / mass sample) × (At.mass X / MW AgX) × 100; AgCl=143.5; AgBr=188; AgI=235"},{t:"Double Indicator",f:"V₁ (phenolphthalein): NaOH + ½ Na₂CO₃; V₂ (methyl orange): ½ Na₂CO₃; total Na₂CO₃ = 2V₂×N/100"},{t:"EDTA Complexometry",f:"EDTA(H₄Y): at pH 10, Y⁴⁻; M²⁺+Y⁴⁻→[MY]²⁻; mol EDTA = mol metal; EBT indicator"},{t:"Iodometry",f:"Oxidant+2I⁻→I₂; I₂+2S₂O₃²⁻→2I⁻+S₄O₆²⁻; n-factor Na₂S₂O₃=1 (in iodometry)"}],
 keyPoints:["Group II vs IV: both H₂S; difference is pH — acidic (Group II) vs basic (Group IV)","BaSO₄ insoluble in HCl — distinguishes SO₄²⁻ from SO₃²⁻ (which dissolves)","Kjeldahl NOT applicable to N in ring (pyridine), azo (-N=N-), or nitro (-NO₂) compounds","EBT indicator: wine-red → blue at EP; used at pH 10 (NH₃/NH₄Cl buffer)"],
 mindmap:{root:"Analytical Chem.",branches:[{n:"Cation Tests",col:"#059669",nodes:["Group I HCl","Group II H₂S/acid","Group III Fe/Al/Cr","Confirmatory Tests"]},{n:"Anion Tests",col:"#10b981",nodes:["CO₃²⁻ lime water","SO₄²⁻ BaSO₄","NO₃⁻ brown ring","Cl⁻ AgCl/NH₃"]},{n:"Volumetric",col:"#047857",nodes:["Acid-Base Indic.","KMnO₄ self-indic.","Iodometry S₂O₃²⁻","EDTA complexo."]},{n:"Organic Quant.",col:"#065f46",nodes:["Liebig C & H","Kjeldahl N","Carius X/S","Dumas N₂"]}]}},
];

// ── UTILS ──────────────────────────────────────────────────────────────
function getTopicId(chapId,idx){return`${chapId}_t${idx}`;}
function getProgress(chap,ts){
  if(chap.syllabus&&chap.syllabus.length){
    let mastered=0,learning=0,practiced=0,xp=0,total=0;
    chap.syllabus.forEach((t,ti)=>t.subtopics.forEach((s,si)=>s.concepts.forEach((_,ci)=>{
      total++;
      const key=`${chap.id}_t${ti}_s${si}_c${ci}`;
      const st=ts[key]||"untouched";
      xp+=(ST[st]?.xp||0);
      if(st==="mastered")mastered++;
      else if(st==="learning")learning++;
      else if(st==="practiced")practiced++;
    })));
    if(!total)return{pct:0,mastered:0,learning:0,practiced:0,total:0,xp:0};
    const score=mastered*25+practiced*12+learning*5;
    return{pct:Math.round(score/(total*25)*100),mastered,learning,practiced,total,xp};
  }
  const total=chap.topics?.length||0;
  if(!total)return{pct:0,mastered:0,learning:0,practiced:0,total:0,xp:0};
  let mastered=0,learning=0,practiced=0,xp=0;
  chap.topics.forEach((_,i)=>{
    const s=ts[getTopicId(chap.id,i)]||"untouched";
    xp+=(ST[s]?.xp||0);
    if(s==="mastered")mastered++;
    else if(s==="learning")learning++;
    else if(s==="practiced")practiced++;
  });
  const score=mastered*25+practiced*12+learning*5;
  return{pct:Math.round(score/(total*25)*100),mastered,learning,practiced,total,xp};
}
function computeXP(ts){return Object.values(ts).reduce((s,v)=>s+(ST[v]?.xp||0),0);}
function getLevel(xp){return XP_LEVELS.find(l=>xp>=l.min&&xp<l.max)||XP_LEVELS[XP_LEVELS.length-1];}
function getTodayStr(){return new Date().toISOString().split("T")[0];}
function calcStreak(dates){
  if(!dates||!dates.length)return 0;
  const unique=[...new Set(dates)].sort().reverse();
  const today=getTodayStr();
  const yesterday=new Date(Date.now()-86400000).toISOString().split("T")[0];
  if(unique[0]!==today&&unique[0]!==yesterday)return 0;
  let streak=0,expected=unique[0];
  for(const d of unique){
    if(d===expected){streak++;const dt=new Date(expected);dt.setDate(dt.getDate()-1);expected=dt.toISOString().split("T")[0];}
    else if(d<expected)break;
  }
  return streak;
}

// ── DONUT CHART ────────────────────────────────────────────────────────
function DonutChart({data,size=120,strokeWidth=14,centerText="",centerSub=""}){
  const total=data.reduce((s,d)=>s+d.value,0);
  if(!total)return(
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={(size-strokeWidth)/2} fill="none" stroke="#ede9fe" strokeWidth={strokeWidth}/>
    </svg>
  );
  const r=(size-strokeWidth)/2,cx=size/2,cy=size/2,circ=2*Math.PI*r;
  let cum=0;
  const segs=data.filter(d=>d.value>0).map(d=>{const pct=d.value/total,dash=pct*circ,offset=-(cum*circ);cum+=pct;return{...d,dash,offset};});
  return(
    <div style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ede9fe" strokeWidth={strokeWidth}/>
        {segs.map((s,i)=>(
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={strokeWidth}
            strokeDasharray={`${s.dash} ${circ-s.dash}`} strokeDashoffset={s.offset} strokeLinecap="round"/>
        ))}
      </svg>
      <div style={{position:"absolute",textAlign:"center",pointerEvents:"none"}}>
        <div style={{fontSize:size>100?20:14,fontWeight:900,color:C.text,lineHeight:1,letterSpacing:-0.5}}>{centerText}</div>
        {centerSub&&<div style={{fontSize:9,color:C.subtext,marginTop:3,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{centerSub}</div>}
      </div>
    </div>
  );
}

// ── MINDMAP HELPERS ────────────────────────────────────────────────────
const mmTrunc=(s,n)=>s&&s.length>n?s.slice(0,n-1)+"…":s;
const mmTerm=c=>{const p=c.split(/[—:]/);return p[0].trim();};
const mmBz=(x1,y1,x2,y2,h=true)=>{
  if(h){const mx=(x1+x2)/2;return`M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;}
  const my=(y1+y2)/2;return`M${x1} ${y1}C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
};
const mmSplitName=name=>{
  const w=name.split(" ");if(w.length<=3)return[name];
  const m=Math.ceil(w.length/2);
  return[w.slice(0,m).join(" "),w.slice(m).join(" ")];
};

// ── MINDMAP ERROR BOUNDARY ─────────────────────────────────────────────
class MindMapBoundary extends React.Component {
  constructor(props){super(props);this.state={hasError:false,err:""};}
  static getDerivedStateFromError(e){return{hasError:true,err:e?.message||"Unknown error"};}
  componentDidCatch(){}
  render(){
    if(this.state.hasError){
      return(
        <div style={{padding:"24px",textAlign:"center",color:"#a78bfa",fontFamily:"'Lora',serif"}}>
          <div style={{fontSize:28,marginBottom:8}}>⚠️</div>
          <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Mind Map could not render</div>
          <div style={{fontSize:11,opacity:0.6,fontFamily:"'JetBrains Mono',monospace"}}>{this.state.err}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── MINDMAP DISPATCHER ─────────────────────────────────────────────────
function MindMap({chap,col}){
  const s=chap?.syllabus||[];
  if(!s.length)return(
    <div style={{padding:"20px",textAlign:"center",color:"#9b98b0",fontSize:13}}>
      No mind map data available for this chapter.
    </div>
  );
  const num=parseInt((chap.id||"").replace(/\D/g,""))||0;
  const mode=num%3;
  const uid=(chap.id||"x").replace(/\W/g,"");
  return(
    <MindMapBoundary>
      {mode===1?<HTreeMM s={s} col={col} name={chap.name} uid={uid}/>:
       mode===2?<VTreeMM s={s} col={col} name={chap.name} uid={uid}/>:
       <RadialMM s={s} col={col} name={chap.name} uid={uid}/>}
    </MindMapBoundary>
  );
}

// ══════════════════════════════════════════════════════════════════════
// LAYOUT A — RADIAL BURST  (chapters 0,3,6,9,12,15 …)
// Dark orbital design. Root ➜ Topics ➜ Subtopics ➜ Concept tags
// ══════════════════════════════════════════════════════════════════════
function RadialMM({s,col,name,uid}){
  const nT=s.length;
  const W=760,H=530,CX=380,CY=265;
  const R1=138,R2=262,R3=348;
  const angOff=-Math.PI/2;
  const topAngles=s.map((_,i)=>angOff+(2*Math.PI/nT)*i);
  const arcPerTopic=2*Math.PI/nT;
  const subSpreadMax=Math.min(arcPerTopic*0.76,1.08);
  const showC=nT<=5;

  return(
    <div style={{overflowX:"auto",borderRadius:18,border:`1.5px solid ${col}40`,
      background:"linear-gradient(135deg,#0a0820 0%,#160c38 50%,#0d0a2e 100%)"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:620,display:"block",padding:"6px 0"}}>
        <defs>
          <radialGradient id={`rBg-${uid}`} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={col} stopOpacity="0.2"/>
            <stop offset="60%" stopColor={col} stopOpacity="0.05"/>
            <stop offset="100%" stopColor={col} stopOpacity="0"/>
          </radialGradient>
          <linearGradient id={`rRoot-${uid}`} x1="0%" y1="0%" x2="110%" y2="110%">
            <stop offset="0%" stopColor={col}/>
            <stop offset="100%" stopColor={col+"99"}/>
          </linearGradient>
          <linearGradient id={`rTopic-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={col}/>
            <stop offset="100%" stopColor={col+"bb"}/>
          </linearGradient>
          <filter id={`rGlow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id={`rShadow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={col} floodOpacity="0.3"/>
          </filter>
          <filter id={`rSub-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor={col} floodOpacity="0.2"/>
          </filter>
        </defs>

        {/* Background aura */}
        <circle cx={CX} cy={CY} r={R3+55} fill={`url(#rBg-${uid})`}/>

        {/* Orbital decorative rings */}
        <circle cx={CX} cy={CY} r={R1-8} fill="none" stroke={col} strokeWidth="0.7" strokeOpacity="0.14" strokeDasharray="4 10"/>
        <circle cx={CX} cy={CY} r={R2+10} fill="none" stroke={col} strokeWidth="0.5" strokeOpacity="0.09" strokeDasharray="2 16"/>
        {showC&&<circle cx={CX} cy={CY} r={R3+14} fill="none" stroke={col} strokeWidth="0.4" strokeOpacity="0.06" strokeDasharray="1 22"/>}

        {s.map((topic,i)=>{
          const ta=topAngles[i];
          const tx=CX+Math.cos(ta)*R1;
          const ty=CY+Math.sin(ta)*R1;
          const nS=topic.subtopics.length;
          const spr=nS>1?subSpreadMax:0;
          return(
            <g key={i}>
              {/* Root → Topic: straight spoke */}
              <line x1={CX} y1={CY} x2={tx} y2={ty} stroke={col} strokeWidth="2.5" strokeOpacity="0.45" strokeLinecap="round"/>

              {topic.subtopics.map((sub,j)=>{
                const sa=nS>1?ta+(j-(nS-1)/2)*(spr/Math.max(nS-1,1)):ta;
                const sx=CX+Math.cos(sa)*R2;
                const sy=CY+Math.sin(sa)*R2;
                const nC=Math.min(sub.concepts.length,3);
                const cSpr=Math.min(0.36,0.55/Math.max(nC,1));
                return(
                  <g key={j}>
                    {/* Topic → Subtopic: curved dashed */}
                    <path d={`M${tx} ${ty}Q${(tx+sx)/2+Math.cos(sa+Math.PI/2)*18} ${(ty+sy)/2+Math.sin(sa+Math.PI/2)*18} ${sx} ${sy}`}
                      stroke={col} strokeWidth="1.6" fill="none" strokeOpacity="0.28" strokeDasharray="5 4" strokeLinecap="round"/>

                    {/* Concept pills */}
                    {showC&&sub.concepts.slice(0,3).map((c,k)=>{
                      const ca=sa+(k-(nC-1)/2)*cSpr;
                      const cx_=CX+Math.cos(ca)*R3;
                      const cy_=CY+Math.sin(ca)*R3;
                      const label=mmTrunc(mmTerm(c),20);
                      return(
                        <g key={k}>
                          <line x1={sx} y1={sy} x2={cx_} y2={cy_} stroke={col} strokeWidth="1" strokeOpacity="0.17"/>
                          <rect x={cx_-46} y={cy_-10} width="92" height="20" rx="10"
                            fill={col+"18"} stroke={col+"38"} strokeWidth="0.9"/>
                          <text x={cx_} y={cy_+5} textAnchor="middle"
                            fill={col} fontSize="7.5" fontWeight="600" fontFamily="'Lora',serif" opacity="0.9">
                            {label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Subtopic node — pill */}
                    <rect x={sx-54} y={sy-14} width="108" height="28" rx="14"
                      fill="#130e2d" stroke={col} strokeWidth="1.6" filter={`url(#rSub-${uid})`}/>
                    <text x={sx} y={sy+5.5} textAnchor="middle"
                      fill={col} fontSize="9.5" fontWeight="700" fontFamily="'Lora',serif">
                      {mmTrunc(sub.name,17)}
                    </text>
                  </g>
                );
              })}

              {/* Topic node — glowing ellipse */}
              <ellipse cx={tx} cy={ty} rx="57" ry="22"
                fill={`url(#rTopic-${uid})`} stroke={col} strokeWidth="2"
                filter={`url(#rShadow-${uid})`}/>
              <ellipse cx={tx} cy={ty} rx="53" ry="18"
                fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1"/>
              <text x={tx} y={ty+5} textAnchor="middle"
                fill="#fff" fontSize="10" fontWeight="800"
                fontFamily="'Josefin Sans',sans-serif" letterSpacing="0.5">
                {mmTrunc(topic.topic,15)}
              </text>
            </g>
          );
        })}

        {/* Root node — layered glow ellipse */}
        <ellipse cx={CX} cy={CY} rx="88" ry="34" fill={col} opacity="0.15" filter={`url(#rGlow-${uid})`}/>
        <ellipse cx={CX} cy={CY} rx="84" ry="32" fill={`url(#rRoot-${uid})`}/>
        <ellipse cx={CX} cy={CY} rx="80" ry="28" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
        {mmSplitName(name).map((line,i,arr)=>(
          <text key={i} x={CX} y={CY+(i-(arr.length-1)/2)*15+5}
            textAnchor="middle" fill="#fff" fontSize="13" fontWeight="900"
            fontFamily="'Bebas Neue',sans-serif" letterSpacing="1.2">
            {mmTrunc(line,18)}
          </text>
        ))}

        {/* Legend row */}
        <g opacity="0.55">
          {[["Topic",56,col],["Subtopic",160,col+"cc"],["Concept",274,col+"99"]].map(([lbl,lx,lc])=>(
            <g key={lbl}>
              <rect x={lx} y={H-20} width={lbl==="Topic"?20:lbl==="Subtopic"?16:12}
                height={lbl==="Topic"?20:lbl==="Subtopic"?16:12}
                rx={lbl==="Topic"?10:lbl==="Subtopic"?8:6}
                fill={lc} y={H-(lbl==="Topic"?20:lbl==="Subtopic"?16:12)-2}/>
              <text x={lx+(lbl==="Topic"?26:lbl==="Subtopic"?22:18)} y={H-8}
                fill="rgba(255,255,255,0.5)" fontSize="8.5" fontWeight="600"
                fontFamily="'Josefin Sans',sans-serif" letterSpacing="0.5">{lbl}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// LAYOUT B — HORIZONTAL TREE  (chapters 1,4,7,10,13 …)
// Light academic style. Root ❱ Topics ❱ Subtopics ❱ Concept tags
// ══════════════════════════════════════════════════════════════════════
function HTreeMM({s,col,name,uid}){
  const MAX_C=4;
  const CH=24,PAD_TOP=32,GAP_TOPIC=20;

  // Build layout — compute Y positions
  let curY=PAD_TOP;
  const topics=s.map(topic=>{
    const subs=topic.subtopics.map(sub=>{
      const nC=Math.min(sub.concepts.length,MAX_C);
      const h=Math.max(nC,1)*CH;
      const concepts=sub.concepts.slice(0,MAX_C).map((c,ci)=>({
        text:mmTrunc(mmTerm(c),28),
        y:curY+ci*CH+CH/2
      }));
      const subY=curY+h/2;
      curY+=h;
      return{...sub,y:subY,concepts};
    });
    curY+=GAP_TOPIC;
    const topicY=subs.length?subs.reduce((a,b)=>a+b.y,0)/subs.length:curY-GAP_TOPIC/2;
    return{...topic,subtopics:subs,y:topicY};
  });

  const H=Math.max(curY+PAD_TOP,260);
  const W=920;
  const RX=72,TX=218,SX=408,COX=604;
  const rootY=topics.length?topics.reduce((a,b)=>a+b.y,0)/topics.length:H/2;

  return(
    <div style={{overflowX:"auto",borderRadius:18,border:`1.5px solid ${col}28`,
      background:"linear-gradient(150deg,#faf9ff 0%,#f4f0fe 60%,#ede9fe28 100%)"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:760,display:"block"}}>
        <defs>
          <linearGradient id={`hGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={col}/>
            <stop offset="100%" stopColor={col+"cc"}/>
          </linearGradient>
          <filter id={`hShadow-${uid}`} x="-25%" y="-30%" width="150%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={col} floodOpacity="0.2"/>
          </filter>
          <pattern id={`hDot-${uid}`} x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="11" cy="11" r="1.2" fill={col} opacity="0.09"/>
          </pattern>
        </defs>

        <rect width={W} height={H} fill={`url(#hDot-${uid})`}/>

        {/* Column separator lines */}
        {[TX-26,SX-30,COX-26].map((x,i)=>(
          <line key={i} x1={x} y1={0} x2={x} y2={H} stroke={col} strokeWidth="0.6" strokeOpacity="0.1"/>
        ))}

        {/* Column headers */}
        {[{l:"TOPICS",x:TX},{l:"SUBTOPICS",x:SX},{l:"CONCEPTS",x:COX+90}].map(({l,x})=>(
          <text key={l} x={x} y={14} textAnchor="middle"
            fill={col} fontSize="7.5" fontWeight="800" letterSpacing="1.8" opacity="0.4"
            fontFamily="'Josefin Sans',sans-serif">{l}</text>
        ))}

        {/* Topic spine */}
        {topics.length>1&&(
          <line x1={TX} y1={topics[0].y} x2={TX} y2={topics[topics.length-1].y}
            stroke={col} strokeWidth="2" strokeOpacity="0.14" strokeLinecap="round"/>
        )}

        {topics.map((topic,i)=>(
          <g key={i}>
            {/* Root → Topic */}
            <path d={mmBz(RX+40,rootY,TX-38,topic.y)}
              stroke={col} strokeWidth="2.2" fill="none" strokeOpacity="0.48" strokeLinecap="round"/>

            {/* Subtopic spine */}
            {topic.subtopics.length>1&&(
              <line x1={SX} y1={topic.subtopics[0].y} x2={SX} y2={topic.subtopics[topic.subtopics.length-1].y}
                stroke={col} strokeWidth="1.2" strokeOpacity="0.13" strokeLinecap="round"/>
            )}

            {topic.subtopics.map((sub,j)=>(
              <g key={j}>
                {/* Topic → Subtopic */}
                <path d={mmBz(TX+38,topic.y,SX-56,sub.y)}
                  stroke={col} strokeWidth="1.6" fill="none" strokeOpacity="0.3"
                  strokeDasharray="5 3" strokeLinecap="round"/>

                {/* Concept spine */}
                {sub.concepts.length>1&&(
                  <line x1={COX} y1={sub.concepts[0].y} x2={COX} y2={sub.concepts[sub.concepts.length-1].y}
                    stroke={col} strokeWidth="0.8" strokeOpacity="0.12" strokeLinecap="round"/>
                )}

                {sub.concepts.map((c,k)=>(
                  <g key={k}>
                    {/* Subtopic → Concept */}
                    <path d={mmBz(SX+56,sub.y,COX,c.y)}
                      stroke={col} strokeWidth="1" fill="none" strokeOpacity="0.22" strokeLinecap="round"/>
                    <rect x={COX} y={c.y-10} width="196" height="20" rx="10"
                      fill={col+"12"} stroke={col+"28"} strokeWidth="0.9"/>
                    <circle cx={COX+12} cy={c.y} r="2.5" fill={col} opacity="0.45"/>
                    <text x={COX+22} y={c.y+4.5}
                      fill="#1e1b4b" fontSize="8.5" fontWeight="500"
                      fontFamily="'Lora',serif">
                      {c.text}
                    </text>
                  </g>
                ))}

                {/* Subtopic node */}
                <rect x={SX-56} y={sub.y-15} width="112" height="30" rx="15"
                  fill="#fff" stroke={col} strokeWidth="1.7"
                  filter={`url(#hShadow-${uid})`}/>
                <text x={SX} y={sub.y+5.5} textAnchor="middle"
                  fill={col} fontSize="9.5" fontWeight="700"
                  fontFamily="'Lora',serif">
                  {mmTrunc(sub.name,17)}
                </text>
              </g>
            ))}

            {/* Topic node — pill with gradient */}
            <rect x={TX-38} y={topic.y-17} width="76" height="34" rx="17"
              fill={`url(#hGrad-${uid})`} filter={`url(#hShadow-${uid})`}/>
            <rect x={TX-35} y={topic.y-14} width="70" height="28" rx="14"
              fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2"/>
            <text x={TX} y={topic.y+5.5} textAnchor="middle"
              fill="#fff" fontSize="9.5" fontWeight="800"
              fontFamily="'Josefin Sans',sans-serif" letterSpacing="0.6">
              {mmTrunc(topic.topic,12)}
            </text>
          </g>
        ))}

        {/* Root node — capsule */}
        <rect x={RX-44} y={rootY-26} width="88" height="52" rx="26"
          fill={col} filter={`url(#hShadow-${uid})`}/>
        <rect x={RX-40} y={rootY-22} width="80" height="44" rx="22"
          fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5"/>
        {mmSplitName(name).map((line,i,arr)=>(
          <text key={i} x={RX} y={rootY+(i-(arr.length-1)/2)*15+5}
            textAnchor="middle" fill="#fff" fontSize="10.5" fontWeight="900"
            fontFamily="'Bebas Neue',sans-serif" letterSpacing="0.8">
            {mmTrunc(line,12)}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// LAYOUT C — VERTICAL CASCADE  (chapters 2,5,8,11,14 …)
// Dark layered design. Cascades top ↓ bottom through 4 levels
// ══════════════════════════════════════════════════════════════════════
function VTreeMM({s,col,name,uid}){
  const nT=s.length;
  const W=Math.max(nT*148+80,700);
  const H=500;
  const rootY=46,topY=118,subY=210,conY=310;
  const topXs=s.map((_,i)=>40+(i+0.5)*(W-80)/nT);

  return(
    <div style={{overflowX:"auto",borderRadius:18,border:`1.5px solid ${col}40`,
      background:"linear-gradient(180deg,#0a0820 0%,#120a30 55%,#0d0a2e 100%)"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:640,display:"block",padding:"6px 0"}}>
        <defs>
          <linearGradient id={`vGrad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={col}/>
            <stop offset="100%" stopColor={col+"99"}/>
          </linearGradient>
          <filter id={`vShadow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={col} floodOpacity="0.28"/>
          </filter>
          <filter id={`vSubShadow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor={col} floodOpacity="0.2"/>
          </filter>
        </defs>

        {/* Horizontal level bands */}
        {[topY,subY,conY].map((y,li)=>(
          <rect key={li} x={0} y={y-22} width={W} height={44}
            fill={col} opacity={0.025-(li*0.005)}/>
        ))}

        {/* Horizontal level marker lines */}
        {[topY,subY,conY].map((y,li)=>(
          <line key={li} x1={0} y1={y} x2={W} y2={y}
            stroke={col} strokeWidth="0.6" strokeOpacity="0.1"/>
        ))}

        {/* Level labels on the right */}
        {[["TOPICS",topY],["SUBTOPICS",subY],["CONCEPTS",conY]].map(([l,y])=>(
          <text key={l} x={W-8} y={y-8} textAnchor="end"
            fill={col} fontSize="7.5" fontWeight="700" letterSpacing="1.2"
            fontFamily="'Josefin Sans',sans-serif" opacity="0.4">{l}</text>
        ))}

        {/* Topics horizontal connector */}
        {nT>1&&(
          <line x1={topXs[0]} y1={topY} x2={topXs[nT-1]} y2={topY}
            stroke={col} strokeWidth="1.6" strokeOpacity="0.16" strokeLinecap="round"/>
        )}

        {s.map((topic,i)=>{
          const tx=topXs[i];
          const nS=topic.subtopics.length;
          const availW=W/nT-32;
          const subSpread=nS>1?Math.min(availW*0.88,(nS-1)*58):0;
          const subXs=topic.subtopics.map((_,j)=>nS>1?tx+(j-(nS-1)/2)*(subSpread/Math.max(nS-1,1)):tx);

          return(
            <g key={i}>
              {/* Root → Topic */}
              <path d={mmBz(W/2,rootY+20,tx,topY-18,false)}
                stroke={col} strokeWidth="2" fill="none" strokeOpacity="0.4" strokeLinecap="round"/>

              {/* Subtopic connector at subtopic level */}
              {nS>1&&(
                <line x1={subXs[0]} y1={subY} x2={subXs[nS-1]} y2={subY}
                  stroke={col} strokeWidth="1" strokeOpacity="0.13" strokeLinecap="round"/>
              )}

              {topic.subtopics.map((sub,j)=>{
                const sx=subXs[j];
                const nC=Math.min(sub.concepts.length,3);
                const cAvailW=availW*0.92/Math.max(nT,1);
                const cSpread=nC>1?Math.min(cAvailW*0.85,(nC-1)*52):0;
                const cXs=[...Array(nC)].map((_,k)=>nC>1?sx+(k-(nC-1)/2)*(cSpread/Math.max(nC-1,1)):sx);

                return(
                  <g key={j}>
                    {/* Topic → Subtopic */}
                    <path d={mmBz(tx,topY+18,sx,subY-15,false)}
                      stroke={col} strokeWidth="1.5" fill="none"
                      strokeOpacity="0.28" strokeDasharray="5 3" strokeLinecap="round"/>

                    {sub.concepts.slice(0,3).map((c,k)=>{
                      const cx_=cXs[k];
                      const label=mmTrunc(mmTerm(c),17);
                      return(
                        <g key={k}>
                          {/* Subtopic → Concept */}
                          <path d={mmBz(sx,subY+15,cx_,conY-10,false)}
                            stroke={col} strokeWidth="1" fill="none" strokeOpacity="0.18" strokeLinecap="round"/>
                          <rect x={cx_-42} y={conY-10} width="84" height="20" rx="10"
                            fill={col+"1a"} stroke={col+"38"} strokeWidth="0.9"/>
                          <text x={cx_} y={conY+5} textAnchor="middle"
                            fill={col} fontSize="7.5" fontWeight="600"
                            fontFamily="'Lora',serif" opacity="0.92">
                            {label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Subtopic node */}
                    <rect x={sx-47} y={subY-15} width="94" height="30" rx="15"
                      fill="#100d28" stroke={col} strokeWidth="1.6"
                      filter={`url(#vSubShadow-${uid})`}/>
                    <text x={sx} y={subY+5.5} textAnchor="middle"
                      fill={col} fontSize="8.5" fontWeight="700"
                      fontFamily="'Lora',serif">
                      {mmTrunc(sub.name,14)}
                    </text>
                  </g>
                );
              })}

              {/* Topic node — rounded rect gradient */}
              <rect x={tx-50} y={topY-18} width="100" height="36" rx="18"
                fill={`url(#vGrad-${uid})`} filter={`url(#vShadow-${uid})`}/>
              <rect x={tx-46} y={topY-14} width="92" height="28" rx="14"
                fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2"/>
              <text x={tx} y={topY+5.5} textAnchor="middle"
                fill="#fff" fontSize="10" fontWeight="800"
                fontFamily="'Josefin Sans',sans-serif" letterSpacing="0.5">
                {mmTrunc(topic.topic,14)}
              </text>
            </g>
          );
        })}

        {/* Root node — wide capsule */}
        <rect x={W/2-88} y={rootY-21} width="176" height="42" rx="21"
          fill={col} filter={`url(#vShadow-${uid})`}/>
        <rect x={W/2-84} y={rootY-17} width="168" height="34" rx="17"
          fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5"/>
        {mmSplitName(name).map((line,i,arr)=>(
          <text key={i} x={W/2} y={rootY+(i-(arr.length-1)/2)*15+5}
            textAnchor="middle" fill="#fff" fontSize="13.5" fontWeight="900"
            fontFamily="'Bebas Neue',sans-serif" letterSpacing="1.2">
            {mmTrunc(line,22)}
          </text>
        ))}

        {/* Bottom level label row */}
        <g opacity="0.4">
          {[["Chapter",W/2-160,col],["→ Topics",W/2-60,col],["→ Subtopics",W/2+44,col],["→ Concepts",W/2+148,col]].map(([l,lx,lc])=>(
            <text key={l} x={lx} y={H-10} fill={lc} fontSize="8" fontWeight="700"
              fontFamily="'Josefin Sans',sans-serif" letterSpacing="0.8">{l}</text>
          ))}
        </g>
      </svg>
    </div>
  );
}

// ── FORMULA FLIP CARD (Kanji-app style) ────────────────────────────────
function FormulaFlipCard({f,subKey,index}){
  const [flipped,setFlipped]=useState(false);
  const [copied,setCopied]=useState(false);
  const th=FORMULA_THEMES[subKey]||FORMULA_THEMES.math;
  const hint=getFormulaHint(f.f);

  function copy(e){
    e.stopPropagation();
    try{navigator.clipboard.writeText(`${f.t}: ${f.f}`);}catch(_){}
    setCopied(true);setTimeout(()=>setCopied(false),1600);
  }

  const faceBase={
    position:"absolute",inset:0,borderRadius:22,overflow:"hidden",
    backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",
    display:"flex",flexDirection:"column",
  };

  // Dynamic height: estimate based on formula length — much more generous
  const formulaLen = f.f.length;
  const ex = CHEM_EXAMPLES[f.t]; // look up example
  const cardMinH = ex
    ? (formulaLen > 140 ? 520 : formulaLen > 80 ? 480 : 440)
    : (formulaLen > 200 ? 380 : formulaLen > 140 ? 340 : formulaLen > 100 ? 300 : formulaLen > 60 ? 270 : 240);

  return (
    <div style={{width:"100%",cursor:"pointer",position:"relative",perspective:1200}}
      onClick={()=>setFlipped(v=>!v)}>
      {/* Spacer sets card height dynamically */}
      <div style={{height:cardMinH,pointerEvents:"none",visibility:"hidden"}}/>
      <div style={{
        width:"100%",height:"100%",position:"absolute",top:0,left:0,
        transformStyle:"preserve-3d",
        transform:flipped?"rotateY(180deg)":"rotateY(0deg)",
        transition:"transform 0.58s cubic-bezier(0.4,0.2,0.2,1)",
      }}>

        {/* ── FRONT ── */}
        <div style={{...faceBase,
          background:th.frontBg,
          border:`1.5px solid ${th.border}`,
          boxShadow:th.shadow,
          minHeight:cardMinH,
        }}>
          {/* Shimmer */}
          <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden",borderRadius:22}}>
            <div style={{position:"absolute",top:0,bottom:0,width:"38%",
              background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)",
              animation:"shimmer 3.5s infinite"}}/>
          </div>
          {/* Ghost BG icon */}
          <div style={{position:"absolute",right:-10,bottom:-10,fontSize:110,
            opacity:th.bgIconOpacity||0.06,pointerEvents:"none",lineHeight:1,userSelect:"none",
            filter:`blur(2px)`}}>{th.icon}</div>

          {/* Header */}
          <div style={{height:48,flexShrink:0,
            background:th.headerBg,borderBottom:`1px solid ${th.headerBorder}`,
            display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:26,height:26,borderRadius:8,background:th.iconGrad,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:13,fontWeight:900,color:"#fff",
                boxShadow:`0 2px 8px ${th.accent}60`}}>{th.icon}</div>
              <span style={{fontSize:10,fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,
                color:th.accent,letterSpacing:2,textTransform:"uppercase"}}>FORMULA #{String(index+1).padStart(2,"0")}</span>
            </div>
            <span style={{fontSize:10,color:th.hintCol,fontFamily:"'Lora',serif",fontWeight:600,letterSpacing:1}}>
              ◉ TAP TO REVEAL
            </span>
          </div>

          {/* Body — padded generously */}
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
            justifyContent:"center",padding:"22px 24px",gap:14,position:"relative"}}>
            {/* Formula name */}
            <div style={{fontSize:19,fontWeight:900,color:th.titleCol,textAlign:"center",
              lineHeight:1.4,letterSpacing:-0.3,fontFamily:"'Lora',serif",
              textShadow:`0 0 20px ${th.accent}60`}}>
              {f.t}
            </div>
            {/* Divider */}
            <div style={{width:56,height:2,background:`linear-gradient(90deg,transparent,${th.accent},transparent)`,borderRadius:99}}/>
            {/* Hint */}
            <div style={{fontSize:15,color:th.hintCol,textAlign:"center",
              background:`${th.accent}14`,borderRadius:12,padding:"10px 20px",
              border:`1px solid ${th.accent}22`,lineHeight:1.8,maxWidth:"100%"}}>
              <FormulaText text={hint} style={{color:th.hintCol, fontSize:15}}/>
            </div>
          </div>
        </div>

        {/* ── BACK ── */}
        <div style={{...faceBase,transform:"rotateY(180deg)",
          background:th.backBg,
          border:`1.5px solid ${th.backBorder||th.border}`,
          boxShadow:th.shadow,
          minHeight:cardMinH,
        }}>
          {/* Shimmer */}
          <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden",borderRadius:22}}>
            <div style={{position:"absolute",top:0,bottom:0,width:"38%",
              background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.05),transparent)",
              animation:"shimmer 4s infinite"}}/>
          </div>

          {/* Header */}
          <div style={{height:48,flexShrink:0,
            background:th.headerBg,borderBottom:`1px solid ${th.headerBorder}`,
            display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 18px"}}>
            <span style={{background:`${th.accent}22`,color:th.accent,borderRadius:8,
              padding:"4px 14px",fontSize:12,fontWeight:800,letterSpacing:1,
              border:`1px solid ${th.accent}40`}}>✦ FORMULA</span>
            <button onClick={copy}
              style={{background:copied?`${th.accent}28`:"transparent",
                border:`1px solid ${copied?th.accent:`${th.accent}38`}`,cursor:"pointer",
                fontSize:11,padding:"4px 14px",borderRadius:8,
                color:copied?th.accent:th.hintCol,transition:"all .15s",
                fontWeight:700,letterSpacing:0.5,fontFamily:"'Josefin Sans',sans-serif"}}>
              {copied?"✓ COPIED":"⎘ COPY"}
            </button>
          </div>

          {/* Body — with generous spacing for formula readability */}
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-start",
            padding:"20px 20px 24px",gap:14,overflowY:"auto"}}>
            {/* Formula category label */}
            <div style={{fontSize:11,fontWeight:700,color:th.hintCol,letterSpacing:1.5,
              textTransform:"uppercase",fontFamily:"'Josefin Sans',sans-serif",
              display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:16,height:2,background:`${th.accent}60`,borderRadius:99}}/>
              {f.t}
              <div style={{flex:1,height:2,background:`${th.accent}30`,borderRadius:99}}/>
            </div>
            {/* The actual formula — beautifully rendered */}
            <div style={{padding:"2px 0"}}>
              <SmartFormula text={f.f} subKey={subKey}/>
            </div>
            {/* ── EXAMPLE SECTION ── */}
            {ex&&(
              <div style={{borderRadius:16,overflow:"hidden",border:`1.5px solid ${th.accent}40`}}>
                {/* Example header */}
                <div style={{background:`${th.accent}22`,padding:"8px 16px",
                  display:"flex",alignItems:"center",gap:8,
                  borderBottom:`1px solid ${th.accent}30`}}>
                  <span style={{fontSize:14}}>💡</span>
                  <span style={{fontFamily:"'Josefin Sans',sans-serif",fontSize:10,
                    fontWeight:700,color:th.accent,letterSpacing:2,textTransform:"uppercase"}}>
                    Example
                  </span>
                </div>
                {/* Reaction line */}
                <div style={{background:`${th.accent}0c`,padding:"13px 16px 10px"}}>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",
                    fontSize:15,color:th.formulaCol,lineHeight:1.75,
                    fontWeight:500,letterSpacing:0.3}}>
                    {ex.r}
                  </div>
                  {/* Note line */}
                  <div style={{marginTop:8,paddingTop:8,
                    borderTop:`1px dashed ${th.accent}25`,
                    fontFamily:"'Lora',serif",fontSize:12.5,
                    color:th.hintCol,lineHeight:1.7,fontStyle:"italic"}}>
                    <span style={{color:th.accent,fontStyle:"normal",fontWeight:700,marginRight:4}}>→</span>
                    {ex.n}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FORMULAS TAB ───────────────────────────────────────────────────────
function FormulasTab({formulas,col,subKey}){
  const [search,setSearch]=useState("");
  const th=FORMULA_THEMES[subKey]||FORMULA_THEMES.math;
  const filtered=search?formulas.filter(f=>
    f.t.toLowerCase().includes(search.toLowerCase())||
    f.f.toLowerCase().includes(search.toLowerCase())
  ):formulas;

  return(
    <div style={{padding:"16px 16px 24px",
      background:"#0b0918"}}>

      {/* Search bar */}
      <div style={{position:"relative",marginBottom:14}}>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
          fontSize:14,color:th.hintCol,pointerEvents:"none"}}>⌕</span>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search formulas…"
          style={{width:"100%",paddingLeft:36,paddingRight:search?36:12,paddingTop:10,paddingBottom:10,
            borderRadius:12,border:`1.5px solid ${th.accent}30`,
            background:`${th.accent}0c`,
            fontSize:13,color:th.titleCol,outline:"none",boxSizing:"border-box",
            transition:"border-color .15s",fontFamily:"'Lora',serif"}}
          onFocus={e=>e.target.style.borderColor=th.accent}
          onBlur={e=>e.target.style.borderColor=`${th.accent}30`}/>
        {search&&(
          <button onClick={()=>setSearch("")}
            style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
              background:"none",border:"none",cursor:"pointer",fontSize:16,color:th.hintCol,lineHeight:1}}>×</button>
        )}
      </div>

      {/* Count badge */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <div style={{height:1,flex:1,background:`${th.accent}20`}}/>
        <span style={{fontSize:10,fontWeight:700,color:th.accent,background:`${th.accent}18`,
          padding:"3px 14px",borderRadius:20,letterSpacing:0.5,whiteSpace:"nowrap",
          border:`1px solid ${th.accent}30`,fontFamily:"'Josefin Sans',sans-serif"}}>
          {filtered.length} FORMULA{filtered.length!==1?"S":""}
          {search&&` · "${search}"`}
        </span>
        <div style={{height:1,flex:1,background:`${th.accent}20`}}/>
      </div>

      {/* Flip card grid */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {filtered.map((f,i)=>(
          <div key={i} style={{animation:`fadeSlideUp .2s ease ${i*0.035}s both`}}>
            <FormulaFlipCard f={f} subKey={subKey} index={i}/>
          </div>
        ))}
      </div>

      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:th.hintCol,fontSize:13}}>
          <div style={{fontSize:32,marginBottom:10}}>{th.icon}</div>
          <div style={{fontFamily:"'Lora',serif",fontWeight:600}}>No formulas match "{search}"</div>
        </div>
      )}
    </div>
  );
}

// ── SYLLABUS TAB ───────────────────────────────────────────────────────
function SyllabusTab({chap,ts,setTs,col}){
  const [openTopics,setOpenTopics]=useState({});
  const [openSubs,setOpenSubs]=useState({});
  const [confirmReset,setConfirmReset]=useState(false);
  const syllabus=chap.syllabus||[];

  function getConceptKey(ti,si,ci){return`${chap.id}_t${ti}_s${si}_c${ci}`;}
  function getAllKeys(){
    const keys=[];
    syllabus.forEach((t,ti)=>t.subtopics.forEach((s,si)=>s.concepts.forEach((_,ci)=>keys.push(getConceptKey(ti,si,ci)))));
    return keys;
  }
  function cycleStatus(key){
    const cur=ts[key]||"untouched";
    setTs(p=>({...p,[key]:SCYCLE[(SCYCLE.indexOf(cur)+1)%SCYCLE.length]}));
  }
  function markAllMastered(){
    const u={};getAllKeys().forEach(k=>{u[k]="mastered";});setTs(p=>({...p,...u}));
  }
  function resetAll(){
    if(!confirmReset){setConfirmReset(true);setTimeout(()=>setConfirmReset(false),3000);return;}
    const u={};getAllKeys().forEach(k=>{u[k]="untouched";});setTs(p=>({...p,...u}));setConfirmReset(false);
  }
  function subProgress(ti,si){
    const s=syllabus[ti]?.subtopics[si];
    if(!s)return{done:0,total:0};
    const total=s.concepts.length;
    const done=s.concepts.filter((_,ci)=>(ts[getConceptKey(ti,si,ci)]||"untouched")==="mastered").length;
    return{done,total};
  }
  function topicProgress(ti){
    const t=syllabus[ti];
    if(!t)return{done:0,total:0};
    let done=0,total=0;
    t.subtopics.forEach((s,si)=>s.concepts.forEach((_,ci)=>{
      total++;
      if((ts[getConceptKey(ti,si,ci)]||"untouched")==="mastered")done++;
    }));
    return{done,total};
  }

  return(
    <div>
      {/* Quick actions */}
      <div style={{padding:"10px 14px 8px",display:"flex",gap:8,borderBottom:`1px solid ${col}12`}}>
        <button onClick={markAllMastered}
          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${col}35`,cursor:"pointer",
            fontSize:11,fontWeight:700,background:`${col}0d`,color:col,transition:"all .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background=`${col}20`;}}
          onMouseLeave={e=>{e.currentTarget.style.background=`${col}0d`;}}>
          ✓ Mark All Mastered
        </button>
        <button onClick={resetAll}
          style={{padding:"5px 12px",borderRadius:8,
            border:`1px solid ${confirmReset?"#dc2626":"#e5e7eb"}`,cursor:"pointer",
            fontSize:11,fontWeight:700,
            background:confirmReset?"#fef2f2":"transparent",
            color:confirmReset?"#dc2626":C.dim,transition:"all .15s"}}>
          {confirmReset?"⚠ Confirm Reset":"↺ Reset"}
        </button>
      </div>

      {/* Topics */}
      {syllabus.map((topic,ti)=>{
        const tp=topicProgress(ti);
        const tOpen=openTopics[ti];
        const tPct=tp.total?Math.round(tp.done/tp.total*100):0;
        const allDone=tPct===100&&tp.total>0;
        return(
          <div key={ti} style={{borderBottom:`1px solid ${col}0d`,background:tOpen?`${col}03`:"transparent",transition:"background .15s"}}>
            <div onClick={()=>setOpenTopics(p=>({...p,[ti]:!p[ti]}))}
              style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer",
                borderLeft:tOpen?`3px solid ${allDone?"#059669":col}`:"3px solid transparent",
                transition:"all .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=`${col}08`}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:26,height:26,borderRadius:8,
                background:allDone?"#059669":tOpen?`${col}22`:`${col}12`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:11,fontWeight:800,color:allDone?"#fff":col,flexShrink:0,transition:"all .2s"}}>
                {allDone?"✓":ti+1}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:C.text,lineHeight:1.3}}>{topic.topic}</div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                  <div style={{width:70,height:4,background:"#ede9fe",borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${tPct}%`,background:allDone?"#059669":col,borderRadius:4,transition:"width .4s"}}/>
                  </div>
                  <span style={{fontSize:9,color:allDone?"#059669":col,fontWeight:700}}>{tp.done}/{tp.total}</span>
                  <span style={{fontSize:9,color:C.dim}}>{topic.subtopics.length} subtopic{topic.subtopics.length!==1?"s":""}</span>
                </div>
              </div>
              <span style={{fontSize:14,color:C.dim,transition:"transform .2s",transform:tOpen?"rotate(180deg)":"none"}}>⌄</span>
            </div>

            {tOpen&&(
              <div style={{padding:"4px 0 10px",display:"flex",flexDirection:"column",gap:4}}>
                {topic.subtopics.map((sub,si)=>{
                  const sp=subProgress(ti,si);
                  const sOpen=openSubs[`${ti}_${si}`];
                  const sDone=sp.done===sp.total&&sp.total>0;
                  return(
                    <div key={si} style={{borderTop:`1px solid ${col}08`,marginLeft:14,marginRight:14,marginBottom:4,borderRadius:10,overflow:"hidden",border:`1px solid ${col}0e`,background:"#fff"}}>
                      <div onClick={()=>setOpenSubs(p=>({...p,[`${ti}_${si}`]:!p[`${ti}_${si}`]}))}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",cursor:"pointer",
                          background:sOpen?`${col}07`:"transparent",transition:"background .12s",borderRadius:sOpen?"10px 10px 0 0":"10px"}}
                        onMouseEnter={e=>e.currentTarget.style.background=`${col}09`}
                        onMouseLeave={e=>e.currentTarget.style.background=sOpen?`${col}07`:"transparent"}>
                        <div style={{width:8,height:8,borderRadius:"50%",
                          background:sDone?"#059669":col,flexShrink:0,
                          boxShadow:sDone?"0 0 0 3px rgba(5,150,105,.15)":`0 0 0 3px ${col}20`}}/>
                        <span style={{flex:1,fontSize:12,fontWeight:700,
                          color:sDone?"#059669":C.text,letterSpacing:-0.1}}>{sub.name}</span>
                        <span style={{fontSize:9.5,color:sDone?"#059669":col,fontWeight:700,
                          background:sDone?"rgba(5,150,105,.1)":`${col}10`,
                          padding:"2px 8px",borderRadius:6,letterSpacing:0.2}}>
                          {sp.done}/{sp.total}
                        </span>
                        <span style={{fontSize:11,color:C.dim,transition:"transform .15s",transform:sOpen?"rotate(180deg)":"none"}}>⌄</span>
                      </div>

                      {sOpen&&(
                        <div style={{paddingLeft:14,paddingRight:14,paddingBottom:12,paddingTop:4,
                          background:`${col}03`}}>
                          <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
                          {sub.concepts.map((concept,ci)=>{
                            const key=getConceptKey(ti,si,ci);
                            const status=ts[key]||"untouched";
                            const s=ST[status];
                            const isMastered=status==="mastered";
                            const isLearning=status==="learning";
                            const isPracticed=status==="practiced";
                            const cardBg=isMastered?"rgba(5,150,105,.06)":isPracticed?`${col}06`:isLearning?"rgba(245,158,11,.05)":"#fff";
                            const cardBorder=isMastered?"rgba(5,150,105,.18)":isPracticed?`${col}18`:isLearning?"rgba(245,158,11,.18)":"rgba(0,0,0,.05)";
                            return(
                              <div key={ci} onClick={()=>cycleStatus(key)}
                                style={{display:"flex",alignItems:"flex-start",gap:10,
                                  padding:"8px 12px",borderRadius:10,cursor:"pointer",
                                  background:cardBg,border:`1px solid ${cardBorder}`,
                                  transition:"all .15s",boxShadow:isMastered?"0 1px 4px rgba(5,150,105,.08)":"none"}}
                                onMouseEnter={e=>{e.currentTarget.style.background=isMastered?"rgba(5,150,105,.1)":isPracticed?`${col}0e`:isLearning?"rgba(245,158,11,.09)":`${col}06`;e.currentTarget.style.transform="translateX(2px)";}}
                                onMouseLeave={e=>{e.currentTarget.style.background=cardBg;e.currentTarget.style.transform="none";}}>
                                {/* Status pill */}
                                <div style={{flexShrink:0,width:20,height:20,borderRadius:6,
                                  background:isMastered?"rgba(5,150,105,.15)":isPracticed?`${col}15`:isLearning?"rgba(245,158,11,.15)":"rgba(0,0,0,.04)",
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  marginTop:1,transition:"all .15s"}}>
                                  <span style={{fontSize:10,color:s.col}}>{s.icon}</span>
                                </div>
                                {/* Concept text */}
                                <span style={{flex:1,fontSize:12,color:isMastered?"#059669":status==="untouched"?C.subtext:C.text,
                                  lineHeight:1.6,fontWeight:isMastered?600:status==="untouched"?400:500,
                                  textDecoration:"none"}}>{concept}</span>
                                {/* Status label */}
                                <span style={{fontSize:8.5,fontWeight:700,color:s.col,flexShrink:0,
                                  background:isMastered?"rgba(5,150,105,.1)":isPracticed?`${col}10`:isLearning?"rgba(245,158,11,.1)":"rgba(0,0,0,.04)",
                                  padding:"2px 6px",borderRadius:5,letterSpacing:0.3,
                                  alignSelf:"center",textTransform:"uppercase"}}>{s.label}</span>
                              </div>
                            );
                          })}
                          </div>
                          <button onClick={e=>{
                            e.stopPropagation();
                            const u={};sub.concepts.forEach((_,ci)=>{u[getConceptKey(ti,si,ci)]="mastered";});
                            setTs(p=>({...p,...u}));
                          }} style={{marginLeft:0,padding:"4px 12px",borderRadius:8,
                            border:`1px solid ${col}25`,cursor:"pointer",fontSize:9.5,fontWeight:700,
                            background:`${col}0a`,color:col,transition:"all .15s"}}>
                            ✓ Mark all as mastered
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QuickActions(){return null;}

// ── CHAPTER CARD ───────────────────────────────────────────────────────
function ChapterCard({chap,ts,setTs}){
  const [open,setOpen]=useState(false);
  const [tab,setTab]=useState("topics");
  const sub=SUB[chap.sub];
  const prog=useMemo(()=>getProgress(chap,ts),[chap,ts]);
  const wtCol=chap.weight==="High"?C.red:chap.weight==="Medium"?C.gold:"#6b7280";
  const wtBg=chap.weight==="High"?C.redBg:chap.weight==="Medium"?C.goldBg:"rgba(107,114,128,.08)";
  const tabs=[{k:"topics",label:"Topics"},{k:"formulas",label:"Formulas"},{k:"keypoints",label:"Key Points"},{k:"mindmap",label:"Mind Map"}];
  const isComplete=prog.pct===100;

  return(
    <div style={{
      background:"#ffffff",
      borderRadius:18,
      border:`1px solid ${C.border}`,
      borderLeft:`4px solid ${isComplete?"#059669":sub.col}`,
      overflow:"hidden",
      boxShadow:open?`0 4px 24px ${sub.col}18, 0 1px 0 rgba(0,0,0,0.04)`:"0 2px 10px rgba(13,10,46,.06)",
      transition:"box-shadow .25s, transform .25s",
    }}
    onMouseEnter={e=>{if(!open){e.currentTarget.style.boxShadow=`0 6px 24px ${sub.col}20`;e.currentTarget.style.transform="translateY(-2px)";}}}
    onMouseLeave={e=>{if(!open){e.currentTarget.style.boxShadow="0 2px 10px rgba(13,10,46,.06)";e.currentTarget.style.transform="none";}}}>

      {/* Card Header */}
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
        {/* Subject Icon */}
        <div style={{width:42,height:42,borderRadius:13,background:sub.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,border:`1px solid ${sub.col}22`,boxShadow:`0 2px 8px ${sub.col}18`}}>
          {sub.icon}
        </div>

        {/* Title Area */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:5}}>
            <span style={{fontSize:13.5,fontWeight:700,fontFamily:"'Lora',serif",color:C.text,letterSpacing:-0.2}}>{chap.name}</span>
            <span style={{fontSize:8.5,fontWeight:700,fontFamily:"'Josefin Sans',sans-serif",color:wtCol,background:wtBg,padding:"2px 7px",borderRadius:5,letterSpacing:0.8}}>{chap.weight.toUpperCase()}</span>
            <span style={{fontSize:8.5,color:C.subtext,background:"#f4f2fb",padding:"2px 6px",borderRadius:5,fontFamily:"'Josefin Sans'"}}>~{chap.est}h</span>
            {isComplete&&<span style={{fontSize:8.5,fontWeight:700,fontFamily:"'Josefin Sans'",color:"#059669",background:"rgba(5,150,105,.1)",padding:"2px 8px",borderRadius:5,letterSpacing:0.5}}>✓ DONE</span>}
          </div>
          {/* Progress Bar */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,height:5,background:"#ede9fe",borderRadius:5,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${prog.pct}%`,
                background:isComplete?"linear-gradient(90deg,#059669,#34d399)":`linear-gradient(90deg,${sub.col},${sub.col}80)`,
                borderRadius:5,transition:"width .5s ease",
                boxShadow:prog.pct>0?`0 0 6px ${sub.col}50`:undefined}}/>
            </div>
            <span style={{fontSize:10,fontWeight:800,fontFamily:"'Josefin Sans',sans-serif",color:isComplete?"#059669":sub.col,flexShrink:0,minWidth:28}}>{prog.pct}%</span>
            <span style={{fontSize:9,color:C.subtext,flexShrink:0,fontFamily:"'Lora'"}}>{prog.mastered}/{prog.total}</span>
          </div>
        </div>

        <span style={{fontSize:16,color:C.dim,transition:"transform .22s",transform:open?"rotate(180deg)":"none",flexShrink:0}}>⌄</span>
      </div>

      {/* Expanded Content */}
      {open&&(
        <div style={{borderTop:`1px solid ${C.border}`,animation:"fadeSlideUp .18s ease"}}>
          <QuickActions/>
          {/* Tabs */}
          <div style={{display:"flex",gap:0,padding:"8px 14px 0",overflowX:"auto",borderBottom:`1px solid ${C.border}`,background:"#fafafe"}}>
            {tabs.map(t=>(
              <button key={t.k} onClick={()=>setTab(t.k)}
                style={{padding:"7px 14px",borderRadius:0,border:"none",cursor:"pointer",fontSize:11,
                  fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,whiteSpace:"nowrap",background:"transparent",
                  letterSpacing:0.5,
                  color:tab===t.k?sub.col:C.subtext,
                  borderBottom:tab===t.k?`2.5px solid ${sub.col}`:"2.5px solid transparent",
                  transition:"all .15s",marginBottom:-1}}>
                {t.label.toUpperCase()}
              </button>
            ))}
          </div>

          {tab==="topics"&&<SyllabusTab chap={chap} ts={ts} setTs={setTs} col={sub.col}/>}
          {tab==="formulas"&&<FormulasTab formulas={chap.formulas} col={sub.col} subKey={chap.sub}/>}
          {tab==="keypoints"&&(
            <div style={{padding:"12px 14px 16px"}}>
              {chap.keyPoints.map((kp,i)=>(
                <div key={i} style={{display:"flex",gap:10,padding:"10px 12px",borderRadius:11,marginBottom:5,background:`${sub.col}07`,border:`1px solid ${sub.col}14`}}>
                  <span style={{color:sub.col,fontSize:13,flexShrink:0,marginTop:1}}>✦</span>
                  <span style={{fontSize:12.5,fontFamily:"'Lora',serif",color:C.text,lineHeight:1.6}}>{kp}</span>
                </div>
              ))}
            </div>
          )}
          {tab==="mindmap"&&(
            <div style={{padding:"10px 14px 14px"}}>
              <MindMap chap={chap} col={sub.col}/>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PROGRESS VIEW — Sakura Theme ─────────────────────────────────────
const SK={
  bg:"linear-gradient(160deg,#FFF5FA 0%,#FFE8F4 50%,#FDD5EC 100%)",
  card:"linear-gradient(155deg,rgba(255,255,255,0.96),rgba(255,228,244,0.93))",
  border:"rgba(236,72,153,0.18)",
  borderMed:"rgba(236,72,153,0.32)",
  accent:"#EC4899",
  accentSoft:"rgba(236,72,153,0.1)",
  text:"#831843",
  subtext:"#9D174D",
  dim:"rgba(157,23,77,0.5)",
  shadow:"0 4px 20px rgba(236,72,153,0.12)",
  shadowMed:"0 8px 32px rgba(236,72,153,0.18)",
  masteredCol:"#BE185D",
  practicedCol:"#7C3AED",
  learningCol:"#EA580C",
  progressBar:"linear-gradient(90deg,#EC4899,#F472B6,#FBA4C7)",
};

function ProgressView({ts}){
  const started=useMemo(()=>CHAPS.filter(c=>getProgress(c,ts).pct>0)
    .sort((a,b)=>getProgress(b,ts).pct-getProgress(a,ts).pct),[ts]);
  const allChapProgs=useMemo(()=>CHAPS.map(c=>getProgress(c,ts)),[ts]);
  const allTopics=allChapProgs.reduce((a,p)=>a+p.total,0);
  const allMastered=allChapProgs.reduce((a,p)=>a+p.mastered,0);
  const allPracticed=allChapProgs.reduce((a,p)=>a+p.practiced,0);
  const allLearning=allChapProgs.reduce((a,p)=>a+p.learning,0);
  const allUntouched=allTopics-allMastered-allPracticed-allLearning;
  const donutData=[
    {label:"Mastered",  value:allMastered,  color:"#BE185D"},
    {label:"Practiced", value:allPracticed, color:"#7C3AED"},
    {label:"Learning",  value:allLearning,  color:"#EA580C"},
    {label:"Not Started",value:allUntouched,color:"rgba(236,72,153,0.15)"},
  ];
  const overallPct=allTopics?Math.round(allMastered/allTopics*100):0;

  // Sakura petal decoration
  const petals=["🌸","🌺","🌸","🌸","🌺","🌸"];

  return(
    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",
      background:SK.bg, position:"relative"}}>

      {/* Sakura header banner */}
      <div style={{
        background:"linear-gradient(135deg,#9D174D 0%,#BE185D 45%,#EC4899 100%)",
        padding:"20px 18px 24px",position:"relative",overflow:"hidden",flexShrink:0,
        boxShadow:"0 4px 24px rgba(157,23,77,0.3)",
      }}>
        {/* Decorative petals */}
        <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",
          background:"rgba(255,255,255,0.08)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-30,left:-15,width:90,height:90,borderRadius:"50%",
          background:"rgba(255,255,255,0.06)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",top:10,right:14,fontSize:28,opacity:0.35,
          animation:"float 4s ease infinite",pointerEvents:"none"}}>🌸</div>
        <div style={{position:"absolute",bottom:10,left:20,fontSize:20,opacity:0.28,
          animation:"float 5s ease 1s infinite",pointerEvents:"none"}}>🌺</div>

        <div style={{fontSize:10,fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,
          color:"rgba(255,255,255,0.6)",letterSpacing:3,marginBottom:6}}>📊 YOUR JOURNEY</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"#fff",
          letterSpacing:2,lineHeight:1,marginBottom:4,
          textShadow:"0 2px 12px rgba(157,23,77,0.4)"}}>
          PROGRESS REPORT
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
          <div style={{flex:1,height:7,background:"rgba(255,255,255,0.2)",borderRadius:99,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${overallPct}%`,
              background:"linear-gradient(90deg,rgba(255,255,255,0.7),#fff)",
              borderRadius:99,transition:"width .8s ease",
              boxShadow:"0 0 8px rgba(255,255,255,0.4)"}}/>
          </div>
          <span style={{fontFamily:"'Cinzel',sans-serif",fontSize:22,color:"#fff",letterSpacing:1}}>{overallPct}%</span>
        </div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:4,fontFamily:"'Lora'"}}>
          {allMastered} of {allTopics} topics mastered
        </div>
      </div>

      <div style={{padding:"14px 14px 24px",display:"flex",flexDirection:"column",gap:12}}>

        {/* Overall Donut */}
        <div style={{background:SK.card,borderRadius:20,padding:"18px 20px",
          boxShadow:SK.shadowMed,border:`1px solid ${SK.border}`,backdropFilter:"blur(12px)"}}>
          <div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,
            color:SK.text,marginBottom:14,letterSpacing:-0.2,
            display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:16}}>🌸</span> Overall Mastery
          </div>
          <div style={{display:"flex",alignItems:"center",gap:18}}>
            <DonutChart data={donutData} size={112} strokeWidth={14} centerText={`${overallPct}%`} centerSub="mastered"/>
            <div style={{flex:1}}>
              {donutData.map((d,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <div style={{width:10,height:10,borderRadius:3,background:d.color,flexShrink:0,
                    boxShadow:`0 0 4px ${d.color}60`}}/>
                  <span style={{flex:1,fontSize:11.5,fontFamily:"'Lora'",color:SK.subtext,fontWeight:500}}>{d.label}</span>
                  <span style={{fontFamily:"'Cinzel',sans-serif",fontSize:18,color:d.color}}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Subject Donuts */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {Object.entries(SUB).map(([k,sub])=>{
            const chaps=CHAPS.filter(c=>c.sub===k);
            const subProgs=chaps.map(c=>getProgress(c,ts));
            const total=subProgs.reduce((a,p)=>a+p.total,0);
            const mastered=subProgs.reduce((a,p)=>a+p.mastered,0);
            const practiced=subProgs.reduce((a,p)=>a+p.practiced,0);
            const learning=subProgs.reduce((a,p)=>a+p.learning,0);
            const pct=total?Math.round(mastered/total*100):0;
            const subData=[
              {value:mastered,color:"#BE185D"},
              {value:practiced,color:"#7C3AED"},
              {value:learning,color:"#EA580C"},
              {value:total-mastered-practiced-learning,color:"rgba(236,72,153,0.15)"},
            ];
            return(
              <div key={k} style={{background:SK.card,borderRadius:16,padding:"14px 10px",
                boxShadow:SK.shadow,border:`1px solid ${SK.border}`,textAlign:"center",
                backdropFilter:"blur(8px)"}}>
                <div style={{fontSize:20,marginBottom:8}}>{sub.icon}</div>
                <DonutChart data={subData} size={74} strokeWidth={11} centerText={`${pct}%`}/>
                <div style={{fontSize:10.5,fontWeight:800,color:SK.accent,marginTop:8,letterSpacing:0.3}}>{sub.short}</div>
                <div style={{fontSize:9.5,color:SK.dim,marginTop:2,fontWeight:600}}>{mastered}/{total}</div>
              </div>
            );
          })}
        </div>

        {/* Status Stats — sakura pill style */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[
            {label:"Mastered",  val:allMastered,  icon:"🌸",col:"#BE185D",bg:"rgba(190,24,93,0.1)"},
            {label:"Practiced", val:allPracticed, icon:"🌺",col:"#7C3AED",bg:"rgba(124,58,237,0.1)"},
            {label:"Learning",  val:allLearning,  icon:"🌼",col:"#EA580C",bg:"rgba(234,88,12,0.09)"},
            {label:"Not Started",val:allUntouched,icon:"○", col:"rgba(157,23,77,0.4)",bg:"rgba(236,72,153,0.06)"},
          ].map((s,i)=>(
            <div key={i} style={{background:SK.card,borderRadius:14,padding:"13px 14px",
              boxShadow:SK.shadow,border:`1px solid ${SK.border}`,
              display:"flex",alignItems:"center",gap:12,backdropFilter:"blur(8px)"}}>
              <div style={{width:36,height:36,borderRadius:10,background:s.bg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
                boxShadow:`0 2px 8px ${s.col}20`}}>
                {s.icon}
              </div>
              <div>
                <div style={{fontSize:22,fontWeight:900,color:s.col,letterSpacing:-0.5,
                  fontFamily:"'Bebas Neue',sans-serif"}}>{s.val}</div>
                <div style={{fontSize:10,color:SK.dim,fontWeight:600,marginTop:1}}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Chapter Breakdown */}
        <div style={{background:SK.card,borderRadius:20,padding:"16px 18px",
          boxShadow:SK.shadowMed,border:`1px solid ${SK.border}`,backdropFilter:"blur(12px)"}}>
          <div style={{fontSize:13,fontWeight:800,color:SK.text,marginBottom:14,letterSpacing:-0.2,
            display:"flex",alignItems:"center",gap:8}}>
            <span>🌺</span> Chapter Breakdown
          </div>
          {started.length===0
            ?<div style={{fontSize:12,color:SK.dim,textAlign:"center",padding:"16px 0"}}>
              Start studying to see progress here! 🌸
            </div>
            :started.map(c=>{
              const p=getProgress(c,ts);
              const s=SUB[c.sub];
              return(
                <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:11,color:SK.accent,width:18,textAlign:"center",flexShrink:0}}>{s.icon}</span>
                  <span style={{flex:1,fontSize:11.5,color:SK.subtext,minWidth:0,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500}}>{c.name}</span>
                  <div style={{width:80,height:5,background:"rgba(249,168,212,0.3)",borderRadius:3,overflow:"hidden",flexShrink:0}}>
                    <div style={{height:"100%",width:`${p.pct}%`,
                      background:SK.progressBar,borderRadius:3,transition:"width .5s"}}/>
                  </div>
                  <span style={{fontSize:10,color:SK.accent,fontWeight:800,width:28,textAlign:"right",flexShrink:0}}>{p.pct}%</span>
                </div>
              );
            })}
          {CHAPS.length-started.length>0&&(
            <div style={{fontSize:11,color:SK.dim,marginTop:8,paddingTop:10,
              borderTop:`1px solid ${SK.border}`,fontWeight:500}}>
              🌸 {CHAPS.length-started.length} chapters not yet started
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── JOURNAL / CALENDAR ────────────────────────────────────────────────
function JournalView(){
  const today=new Date();
  const [viewYear,setViewYear]=useState(today.getFullYear());
  const [viewMonth,setViewMonth]=useState(today.getMonth());
  const [entries,setEntries]=useState({});
  const [selectedDay,setSelectedDay]=useState(today.getDate());
  const [draft,setDraft]=useState("");
  const [saving,setSaving]=useState(false);
  const [loaded,setLoaded]=useState(false);

  const todayStr=today.toISOString().split("T")[0];

  // Calendar math — must come before selectedStr which depends on safeSelectedDay
  const monthNames=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dayNames=["Su","Mo","Tu","We","Th","Fr","Sa"];
  const firstDay=new Date(viewYear,viewMonth,1).getDay();
  const daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
  // Clamp selectedDay to valid range for current month (prevents blank calendar)
  const safeSelectedDay=Math.min(Math.max(selectedDay,1),daysInMonth);

  const selectedStr=`${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(safeSelectedDay).padStart(2,"0")}`;

  // Load all journal entries from storage
  useEffect(()=>{
    async function load(){
      try{
        const r=await window.storage.get("jee_journal_v1");
        if(r&&r.value)setEntries(JSON.parse(r.value));
      }catch(e){}
      setLoaded(true);
    }
    load();
  },[]);

  // When selected day changes, populate draft
  useEffect(()=>{
    if(loaded)setDraft(entries[selectedStr]||"");
  },[selectedStr,loaded,entries]);

  async function saveEntry(){
    setSaving(true);
    const updated={...entries};
    if(draft.trim()){updated[selectedStr]=draft.trim();}
    else{delete updated[selectedStr];}
    setEntries(updated);
    try{await window.storage.set("jee_journal_v1",JSON.stringify(updated));}catch(e){}
    setTimeout(()=>setSaving(false),600);
  }

  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);

  function prevMonth(){
    const newM = viewMonth === 0 ? 11 : viewMonth - 1;
    const newY = viewMonth === 0 ? viewYear - 1 : viewYear;
    const daysInNew = new Date(newY, newM + 1, 0).getDate();
    setViewMonth(newM);
    setViewYear(newY);
    setSelectedDay(sd => Math.min(sd, daysInNew));
  }
  function nextMonth(){
    const newM = viewMonth === 11 ? 0 : viewMonth + 1;
    const newY = viewMonth === 11 ? viewYear + 1 : viewYear;
    const daysInNew = new Date(newY, newM + 1, 0).getDate();
    setViewMonth(newM);
    setViewYear(newY);
    setSelectedDay(sd => Math.min(sd, daysInNew));
  }

  const isToday=(d)=>d===today.getDate()&&viewMonth===today.getMonth()&&viewYear===today.getFullYear();
  const isSelected=(d)=>d===safeSelectedDay;
  const hasEntry=(d)=>{
    const key=`${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return !!entries[key];
  };

  // Count streaks / stats
  const totalEntries=Object.keys(entries).length;
  const thisMonthEntries=Object.keys(entries).filter(k=>k.startsWith(`${viewYear}-${String(viewMonth+1).padStart(2,"0")}`)).length;
  const selectedEntry=entries[selectedStr];

  const subjectTags=[
    {label:"Maths",col:"#7c3aed",emoji:"∑"},
    {label:"Physics",col:"#ea580c",emoji:"⚡"},
    {label:"Chemistry",col:"#059669",emoji:"⚗"},
    {label:"Revision",col:"#0ea5e9",emoji:"↺"},
    {label:"Mock Test",col:"#dc2626",emoji:"📝"},
  ];

  function insertTag(tag){
    setDraft(d=>(d?d+"\n":"")+`[${tag}] `);
  }

  // Premium dark navy + gold calendar palette (inspired by Kanji midnight+oldmoney)
  const CAL={
    bg:"linear-gradient(160deg,#0a0e1f 0%,#0f1535 50%,#141a40 100%)",
    card:"linear-gradient(155deg,rgba(20,26,60,0.97),rgba(28,34,76,0.95))",
    cardLight:"linear-gradient(155deg,rgba(24,30,68,0.92),rgba(18,24,54,0.9))",
    border:"rgba(212,175,55,0.22)",
    borderMed:"rgba(212,175,55,0.42)",
    accent:"#D4AF37",
    accentLight:"#F0D060",
    accentSoft:"rgba(212,175,55,0.12)",
    text:"#F0E6C8",
    subtext:"rgba(212,175,55,0.8)",
    dim:"rgba(212,175,55,0.45)",
    shadow:"0 4px 24px rgba(0,0,0,0.5)",
    shadowGold:"0 4px 24px rgba(212,175,55,0.18)",
    selBg:"linear-gradient(135deg,#8B6914,#D4AF37)",
    todayBg:"rgba(212,175,55,0.18)",
    dotColor:"#D4AF37",
  };

  return(
    <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",
      background:CAL.bg, gap:0}}>

      {/* Premium header */}
      <div style={{
        background:"linear-gradient(135deg,#080C1E 0%,#111630 50%,#1A2050 100%)",
        padding:"20px 18px 22px",flexShrink:0,
        borderBottom:`1px solid ${CAL.border}`,
        boxShadow:"0 4px 24px rgba(0,0,0,0.6)",
        position:"relative",overflow:"hidden",
      }}>
        <div style={{position:"absolute",top:-40,right:-30,width:160,height:160,borderRadius:"50%",
          background:"radial-gradient(circle,rgba(212,175,55,0.12),transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-20,left:-10,width:100,height:100,borderRadius:"50%",
          background:"radial-gradient(circle,rgba(212,175,55,0.07),transparent 70%)",pointerEvents:"none"}}/>
        <div style={{fontSize:9,fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,
          color:CAL.dim,letterSpacing:3,marginBottom:4}}>✦ STUDY JOURNAL</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,letterSpacing:2,
          color:CAL.accentLight,lineHeight:1,
          textShadow:"0 0 20px rgba(212,175,55,0.4)"}}>
          {monthNames[viewMonth].toUpperCase()} {viewYear}
        </div>
      </div>

      <div style={{padding:"14px 14px 24px",display:"flex",flexDirection:"column",gap:12}}>

        {/* Header Stats — gold accented */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[
            {label:"Total Entries",val:totalEntries,icon:"📔",col:CAL.accent},
            {label:"This Month",val:thisMonthEntries,icon:"📅",col:CAL.accentLight},
            {label:"Today",val:entries[todayStr]?"✓":"—",icon:"✨",col:"#6ee7b7"},
          ].map((s,i)=>(
            <div key={i} style={{background:CAL.card,borderRadius:14,padding:"12px 10px",
              border:`1px solid ${CAL.border}`,boxShadow:CAL.shadowGold,textAlign:"center",
              backdropFilter:"blur(8px)"}}>
              <div style={{fontSize:18,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:20,fontWeight:900,color:s.col,letterSpacing:-0.5,
                fontFamily:"'Bebas Neue',sans-serif"}}>{s.val}</div>
              <div style={{fontSize:9,color:CAL.dim,fontWeight:700,marginTop:2,
                letterSpacing:0.5,fontFamily:"'Josefin Sans',sans-serif"}}>{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Calendar Card — premium dark */}
        <div style={{background:CAL.card,borderRadius:20,padding:"18px 16px",
          border:`1px solid ${CAL.border}`,boxShadow:CAL.shadowGold,backdropFilter:"blur(12px)"}}>

          {/* Month Nav */}
          <div style={{display:"flex",alignItems:"center",marginBottom:18}}>
            <button onClick={prevMonth}
              style={{width:36,height:36,borderRadius:10,border:`1px solid ${CAL.border}`,
                background:CAL.accentSoft,cursor:"pointer",fontSize:18,color:CAL.accent,
                display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>‹</button>
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontFamily:"'Cinzel',sans-serif",fontSize:18,color:CAL.accentLight,
                letterSpacing:2}}>{monthNames[viewMonth].toUpperCase()} {viewYear}</div>
            </div>
            <button onClick={nextMonth}
              style={{width:36,height:36,borderRadius:10,border:`1px solid ${CAL.border}`,
                background:CAL.accentSoft,cursor:"pointer",fontSize:18,color:CAL.accent,
                display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>›</button>
          </div>

          {/* Day names — gold */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:6}}>
            {dayNames.map(d=>(
              <div key={d} style={{textAlign:"center",fontSize:10,fontWeight:800,color:CAL.dim,
                padding:"2px 0",letterSpacing:0.8,fontFamily:"'Josefin Sans',sans-serif"}}>{d}</div>
            ))}
          </div>

          {/* Date cells */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
            {cells.map((d,i)=>{
              if(!d)return<div key={i}/>;
              const sel=isSelected(d);
              const tod=isToday(d);
              const has=hasEntry(d);
              return(
                <div key={i} onClick={()=>setSelectedDay(d)}
                  style={{
                    aspectRatio:"1",
                    borderRadius:10,
                    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                    cursor:"pointer",position:"relative",
                    background:sel?CAL.selBg:tod?CAL.todayBg:"transparent",
                    border:sel?`1px solid ${CAL.accent}`:tod?`1px solid rgba(212,175,55,0.4)`:`1px solid transparent`,
                    transition:"all .15s",
                    boxShadow:sel?"0 2px 12px rgba(212,175,55,0.35)":tod?"0 0 8px rgba(212,175,55,0.15)":"none",
                  }}
                  onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="rgba(212,175,55,0.1)";}}
                  onMouseLeave={e=>{if(!sel)e.currentTarget.style.background=tod?CAL.todayBg:"transparent";}}>
                  <span style={{fontSize:12,fontWeight:sel||tod?800:400,
                    color:sel?"#fff":tod?CAL.accentLight:CAL.text,lineHeight:1,
                    fontFamily:sel||tod?"'Josefin Sans',sans-serif":"inherit"}}>
                    {d}
                  </span>
                  {has&&(
                    <div style={{width:4,height:4,borderRadius:"50%",marginTop:2,
                      background:sel?"rgba(255,255,255,0.9)":CAL.accent,
                      boxShadow:sel?"none":`0 0 4px ${CAL.accent}`}}/>
                  )}
                </div>
              );
            })}
          </div>

          {/* Jump to today */}
          {(viewMonth!==today.getMonth()||viewYear!==today.getFullYear())&&(
            <button onClick={()=>{setViewMonth(today.getMonth());setViewYear(today.getFullYear());setSelectedDay(today.getDate());}}
              style={{marginTop:14,width:"100%",padding:"8px",borderRadius:10,
                border:`1px solid ${CAL.borderMed}`,background:CAL.accentSoft,
                color:CAL.accent,fontSize:11,fontWeight:800,cursor:"pointer",
                fontFamily:"'Josefin Sans',sans-serif",letterSpacing:1}}>
              ✦ JUMP TO TODAY
            </button>
          )}
        </div>

        {/* Journal Entry — premium dark */}
        <div style={{background:CAL.card,borderRadius:20,padding:"18px 16px",
          border:`1px solid ${CAL.border}`,boxShadow:CAL.shadow,backdropFilter:"blur(12px)"}}>

          {/* Entry header */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div>
              <div style={{fontSize:14,fontWeight:900,color:CAL.accentLight,letterSpacing:-0.3,
                fontFamily:"'Lora',serif"}}>
                {selectedStr===todayStr?"Today's Entry":
                  new Date(selectedStr+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})}
              </div>
              <div style={{fontSize:10,color:CAL.dim,marginTop:2,fontWeight:500,
                fontFamily:"'Josefin Sans',sans-serif",letterSpacing:0.5}}>{selectedStr}</div>
            </div>
            {selectedEntry&&(
              <div style={{fontSize:10,fontWeight:700,color:"#6ee7b7",
                background:"rgba(110,231,183,0.12)",padding:"3px 10px",borderRadius:20,
                border:"1px solid rgba(110,231,183,0.25)"}}>
                ✓ Saved
              </div>
            )}
          </div>

          {/* Quick Tags */}
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
            {subjectTags.map(t=>(
              <button key={t.label} onClick={()=>insertTag(t.label)}
                style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${CAL.border}`,
                  background:CAL.accentSoft,color:CAL.accent,fontSize:10.5,fontWeight:700,cursor:"pointer",
                  transition:"all .15s",fontFamily:"'Josefin Sans',sans-serif",letterSpacing:0.5}}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(212,175,55,0.2)";e.currentTarget.style.borderColor=CAL.accentLight;}}
                onMouseLeave={e=>{e.currentTarget.style.background=CAL.accentSoft;e.currentTarget.style.borderColor=CAL.border;}}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {/* Textarea — dark styled */}
          <textarea
            value={draft}
            onChange={e=>setDraft(e.target.value)}
            placeholder={`What did you study today?\n\nE.g.\n[Maths] Completed Limits chapter\n[Physics] Revised Electrostatics\n[Mock Test] Scored 180/300`}
            style={{
              width:"100%",minHeight:180,padding:"12px 14px",
              borderRadius:12,border:`1.5px solid ${CAL.border}`,
              background:"rgba(8,12,30,0.7)",fontSize:13,color:CAL.text,
              lineHeight:1.7,outline:"none",resize:"vertical",
              boxSizing:"border-box",fontFamily:"'Lora',serif",
              transition:"border-color .15s",
            }}
            onFocus={e=>e.target.style.borderColor=CAL.accent}
            onBlur={e=>e.target.style.borderColor=CAL.border}/>

          {/* Save Button */}
          <button onClick={saveEntry}
            style={{marginTop:10,width:"100%",padding:"12px",borderRadius:12,border:"none",
              background:saving?"linear-gradient(135deg,#065f46,#059669)":"linear-gradient(135deg,#8B6914,#D4AF37,#F0D060)",
              color:saving?"#fff":"#080C1E",fontSize:13,fontWeight:900,cursor:"pointer",
              letterSpacing:1,transition:"all .2s",fontFamily:"'Josefin Sans',sans-serif",
              boxShadow:saving?"0 2px 8px rgba(5,150,105,.3)":"0 3px 16px rgba(212,175,55,.4)"}}>
            {saving?"✓ SAVED!":"✦ SAVE ENTRY"}
          </button>
        </div>

        {/* Recent entries — dark gold */}
        {Object.keys(entries).length>0&&(
          <div style={{background:CAL.card,borderRadius:20,padding:"16px",
            border:`1px solid ${CAL.border}`,boxShadow:CAL.shadow,backdropFilter:"blur(12px)"}}>
            <div style={{fontSize:13,fontWeight:800,color:CAL.accentLight,marginBottom:12,letterSpacing:0.5,
              fontFamily:"'Josefin Sans',sans-serif",display:"flex",alignItems:"center",gap:8}}>
              <span style={{color:CAL.accent}}>✦</span> RECENT ENTRIES
            </div>
            {Object.entries(entries)
              .sort((a,b)=>b[0].localeCompare(a[0]))
              .slice(0,5)
              .map(([date,text])=>(
              <div key={date}
                onClick={()=>{
                  const d=new Date(date+"T12:00:00");
                  setViewYear(d.getFullYear());setViewMonth(d.getMonth());setSelectedDay(d.getDate());
                  window.scrollTo(0,0);
                }}
                style={{padding:"10px 12px",borderRadius:11,marginBottom:6,
                  border:`1px solid ${CAL.border}`,cursor:"pointer",transition:"all .15s",
                  background:"rgba(212,175,55,0.04)"}}
                onMouseEnter={e=>{e.currentTarget.style.background=CAL.accentSoft;e.currentTarget.style.borderColor=CAL.borderMed;}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(212,175,55,0.04)";e.currentTarget.style.borderColor=CAL.border;}}>
                <div style={{fontSize:11,fontWeight:800,color:CAL.accent,marginBottom:3,
                  fontFamily:"'Josefin Sans',sans-serif",letterSpacing:0.5}}>
                  {new Date(date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}
                  {date===todayStr&&<span style={{marginLeft:6,fontSize:9,background:`${CAL.accent}20`,color:CAL.accentLight,
                    padding:"1px 6px",borderRadius:10,fontWeight:700,border:`1px solid ${CAL.border}`}}>TODAY</span>}
                </div>
                <div style={{fontSize:11.5,color:CAL.subtext,lineHeight:1.5,
                  overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
                  {text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SUBJECT CARD (3D home screen tile) ─────────────────────────────────
function SubjectCard({subKey,ts,onPress}){
  const sub=SUB[subKey];
  const chaps=CHAPS.filter(c=>c.sub===subKey);
  const progs=chaps.map(c=>getProgress(c,ts));
  const total=progs.reduce((a,p)=>a+p.total,0);
  const mastered=progs.reduce((a,p)=>a+p.mastered,0);
  const practiced=progs.reduce((a,p)=>a+p.practiced,0);
  const learning=progs.reduce((a,p)=>a+p.learning,0);
  const pct=total?Math.round(mastered/total*100):0;
  const chapsDone=progs.filter(p=>p.pct===100).length;
  const donutData=[
    {value:mastered,color:"#22c55e"},
    {value:practiced,color:"rgba(255,255,255,0.85)"},
    {value:learning,color:"#fbbf24"},
    {value:Math.max(0,total-mastered-practiced-learning),color:"rgba(255,255,255,0.13)"},
  ];

  // Sky-blue Kanji-inspired theme for home screen cards
  const gradients={
    math:   "linear-gradient(135deg,#0f3460 0%,#1D4ED8 45%,#0EA5E9 100%)",
    physics:"linear-gradient(135deg,#0c2340 0%,#1e40af 45%,#38bdf8 100%)",
    chem:   "linear-gradient(135deg,#062638 0%,#0369a1 45%,#22d3ee 100%)",
  };
  const glowColors={
    math:   "rgba(29,78,216,0.55)",
    physics:"rgba(56,189,248,0.5)",
    chem:   "rgba(34,211,238,0.5)",
  };
  const accentColors={
    math:   "#93c5fd",
    physics:"#7dd3fc",
    chem:   "#67e8f9",
  };
  const icons={math:"∑",physics:"⚡",chem:"⚗"};

  return(
    <div className="subject-card-3d" onClick={()=>onPress(subKey)}
      style={{
        borderRadius:28,
        background:gradients[subKey],
        padding:"22px 22px 20px",
        cursor:"pointer",
        position:"relative",
        overflow:"hidden",
        boxShadow:`0 12px 40px ${glowColors[subKey]}, 0 2px 0 rgba(255,255,255,0.1) inset`,
        marginBottom:14,
      }}
      onMouseEnter={e=>{
        e.currentTarget.style.transform="perspective(700px) rotateY(-5deg) rotateX(2.5deg) translateY(-8px) scale(1.015)";
        e.currentTarget.style.boxShadow=`0 24px 60px ${glowColors[subKey]}, 0 2px 0 rgba(255,255,255,0.12) inset`;
      }}
      onMouseLeave={e=>{
        e.currentTarget.style.transform="none";
        e.currentTarget.style.boxShadow=`0 12px 40px ${glowColors[subKey]}, 0 2px 0 rgba(255,255,255,0.1) inset`;
      }}>

      {/* Shimmer effect */}
      <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,pointerEvents:"none",overflow:"hidden",borderRadius:28}}>
        <div style={{position:"absolute",top:0,bottom:0,width:"40%",
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent)",
          animation:"shimmer 3.5s infinite"}}/>
      </div>

      {/* Decorative blobs */}
      <div style={{position:"absolute",top:-40,right:-30,width:180,height:180,borderRadius:"50%",background:"rgba(255,255,255,0.05)",pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:-50,left:-20,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,0.04)",pointerEvents:"none"}}/>

      <div style={{display:"flex",alignItems:"center",gap:16,position:"relative"}}>

        {/* Left side */}
        <div style={{flex:1,minWidth:0}}>
          {/* Icon badge */}
          <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.15)",
            borderRadius:12,padding:"5px 12px",marginBottom:10,border:"1px solid rgba(255,255,255,0.2)"}}>
            <span style={{fontSize:16}}>{icons[subKey]}</span>
            <span style={{fontSize:10,fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,
              color:"rgba(255,255,255,0.9)",letterSpacing:2,textTransform:"uppercase"}}>
              {sub.short}
            </span>
          </div>

          {/* Subject name */}
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:44,color:"#fff",
            letterSpacing:3,lineHeight:0.88,marginBottom:14,textShadow:"0 2px 12px rgba(0,0,0,0.3)"}}>
            {sub.label.toUpperCase()}
          </div>

          {/* Mini stats row */}
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[
              {val:chaps.length,lbl:"Chapters"},
              {val:chapsDone,lbl:"Done"},
              {val:mastered,lbl:"Mastered"},
            ].map((s,i)=>(
              <div key={i} style={{background:"rgba(255,255,255,0.14)",borderRadius:10,
                padding:"6px 10px",border:"1px solid rgba(255,255,255,0.18)",textAlign:"center",minWidth:52}}>
                <div style={{fontFamily:"'Cinzel',sans-serif",fontSize:20,color:"#fff",lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:8,fontFamily:"'Josefin Sans',sans-serif",fontWeight:600,
                  color:"rgba(255,255,255,0.65)",letterSpacing:0.8,marginTop:1}}>{s.lbl.toUpperCase()}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
              <span style={{fontSize:10,fontFamily:"'Lora',serif",
                color:"rgba(255,255,255,0.65)",fontWeight:500}}>Overall progress</span>
              <span style={{fontSize:11,fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,color:"#fff"}}>{pct}%</span>
            </div>
            <div style={{height:6,background:"rgba(255,255,255,0.15)",borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,
                background:"linear-gradient(90deg,rgba(255,255,255,0.8),#fff)",
                borderRadius:99,transition:"width .6s ease",
                boxShadow:"0 0 8px rgba(255,255,255,0.5)"}}/>
            </div>
          </div>
        </div>

        {/* Right: Donut */}
        <div style={{flexShrink:0}}>
          <DonutChart data={donutData} size={92} strokeWidth={11} centerText={`${pct}%`} centerSub="done"/>
          <div style={{textAlign:"center",marginTop:6,fontSize:9,fontFamily:"'Josefin Sans',sans-serif",
            fontWeight:700,color:"rgba(255,255,255,0.55)",letterSpacing:1}}>TAP TO STUDY →</div>
        </div>
      </div>
    </div>
  );
}

// ── SUBJECT PAGE ────────────────────────────────────────────────────────
function SubjectPage({subKey,ts,setTs,onBack}){
  const sub=SUB[subKey];
  const [search,setSearch]=useState("");
  const [sortMode,setSortMode]=useState("default");
  const chaps=CHAPS.filter(c=>c.sub===subKey);
  const progs=chaps.map(c=>getProgress(c,ts));
  const total=progs.reduce((a,p)=>a+p.total,0);
  const mastered=progs.reduce((a,p)=>a+p.mastered,0);
  const pct=total?Math.round(mastered/total*100):0;
  const chapsDone=progs.filter(p=>p.pct===100).length;
  const xp=progs.reduce((a,p)=>a+p.xp,0);

  const gradients={
    math:"linear-gradient(135deg,#3b0764,#6d28d9,#9333ea)",
    physics:"linear-gradient(135deg,#431407,#c2410c,#f97316)",
    chem:"linear-gradient(135deg,#022c22,#065f46,#059669)",
  };

  let displayed=[...chaps];
  if(search)displayed=displayed.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()));
  if(sortMode==="progress_asc")displayed.sort((a,b)=>getProgress(a,ts).pct-getProgress(b,ts).pct);
  if(sortMode==="progress_desc")displayed.sort((a,b)=>getProgress(b,ts).pct-getProgress(a,ts).pct);
  if(sortMode==="weight")displayed.sort((a,b)=>{const w={High:0,Medium:1,Low:2};return w[a.weight]-w[b.weight];});

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",animation:"slideInRight .3s ease"}}>

      {/* Subject header */}
      <div style={{background:gradients[subKey],padding:"14px 16px 20px",
        flexShrink:0,position:"relative",overflow:"hidden"}}>

        {/* Decorative */}
        <div style={{position:"absolute",top:-40,right:-40,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.04)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-30,left:-10,width:130,height:130,borderRadius:"50%",background:"rgba(255,255,255,0.03)",pointerEvents:"none"}}/>

        {/* Back button */}
        <button onClick={onBack} style={{
          display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.15)",
          border:"1px solid rgba(255,255,255,0.25)",borderRadius:12,padding:"6px 14px",
          cursor:"pointer",marginBottom:14,color:"#fff",fontSize:12,
          fontFamily:"'Lora',serif",fontWeight:600,backdropFilter:"blur(8px)",
          position:"relative",zIndex:1}}>
          ← Back to Home
        </button>

        {/* Title + stats */}
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:12}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:52,color:"#fff",
              letterSpacing:4,lineHeight:1,textShadow:"0 3px 16px rgba(0,0,0,0.3)"}}>
              {sub.label.toUpperCase()}
            </div>
            <div style={{marginBottom:6,background:"rgba(255,255,255,0.18)",borderRadius:10,
              padding:"3px 10px",fontSize:10,fontFamily:"'Josefin Sans',sans-serif",
              fontWeight:700,color:"#fff",letterSpacing:2}}>{sub.short}</div>
          </div>
          <div style={{display:"flex",gap:10}}>
            {[
              {val:chaps.length,lbl:"Chapters"},
              {val:chapsDone,lbl:"Completed"},
              {val:`${pct}%`,lbl:"Progress"},
              {val:xp.toLocaleString(),lbl:"XP Earned"},
            ].map((s,i)=>(
              <div key={i} style={{background:"rgba(255,255,255,0.14)",borderRadius:10,
                padding:"6px 12px",border:"1px solid rgba(255,255,255,0.2)",textAlign:"center"}}>
                <div style={{fontFamily:"'Cinzel',sans-serif",fontSize:18,color:"#fff",lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:8,fontFamily:"'Josefin Sans',sans-serif",fontWeight:600,
                  color:"rgba(255,255,255,0.65)",letterSpacing:0.8,marginTop:1}}>{s.lbl.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search + sort bar */}
      <div style={{background:"#fff",padding:"10px 14px",flexShrink:0,
        borderBottom:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"center"}}>
        <div style={{position:"relative",flex:1}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",
            fontSize:14,color:C.dim,pointerEvents:"none"}}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search chapters…"
            style={{width:"100%",paddingLeft:36,paddingRight:12,paddingTop:9,paddingBottom:9,
              borderRadius:12,border:`1px solid ${C.border}`,background:"#fafafe",fontSize:13,
              fontFamily:"'Lora',serif",
              color:C.text,outline:"none",boxSizing:"border-box",transition:"border-color .15s"}}
            onFocus={e=>e.target.style.borderColor=`${sub.col}60`}
            onBlur={e=>e.target.style.borderColor=C.border}/>
        </div>
        <select value={sortMode} onChange={e=>setSortMode(e.target.value)}
          style={{padding:"8px 10px",borderRadius:12,border:`1px solid ${C.border}`,
            background:"#fff",fontSize:11,fontFamily:"'Lora',serif",
            fontWeight:600,color:C.text,cursor:"pointer",outline:"none"}}>
          <option value="default">Default</option>
          <option value="progress_asc">Progress ↑</option>
          <option value="progress_desc">Progress ↓</option>
          <option value="weight">By Weight</option>
        </select>
      </div>

      {/* Chapter list */}
      <div style={{flex:1,overflowY:"auto",padding:"12px 14px 20px"}}>
        {displayed.length===0?(
          <div style={{textAlign:"center",padding:"40px 0",color:C.dim}}>
            <div style={{fontSize:32,marginBottom:8}}>🔍</div>
            <div style={{fontSize:13,fontFamily:"'Lora',serif"}}>No chapters match "{search}"</div>
          </div>
        ):displayed.map((chap,i)=>(
          <div key={chap.id} style={{marginBottom:10,animation:`fadeSlideUp .2s ease ${i*0.04}s both`}}>
            <ChapterCard chap={chap} ts={ts} setTs={setTs}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── STUDY NEXT CARD ─────────────────────────────────────────────────────
function StudyNextCard({suggested,ts,onSubjectPress}){
  const s=SUB[suggested.sub];
  const prog=getProgress(suggested,ts);
  return(
    <div style={{margin:"0 14px",borderRadius:22,overflow:"hidden",
      boxShadow:`0 8px 32px ${s.col}25`,border:`1px solid ${s.col}30`,cursor:"pointer"}}
      onClick={()=>onSubjectPress(suggested.sub)}>
      <div style={{background:`linear-gradient(135deg,${s.col}18,${s.col}08)`,
        padding:"16px 18px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,right:0,width:80,height:80,
          background:`radial-gradient(circle,${s.col}20,transparent 70%)`,pointerEvents:"none"}}/>
        <div style={{fontSize:9,fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,
          color:s.col,letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>
          📌 Study Next — {s.label}
        </div>
        <div style={{fontFamily:"'Lora',serif",fontSize:15,fontWeight:700,
          color:"#e2e0f0",marginBottom:8,letterSpacing:-0.3}}>{suggested.name}</div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,height:5,background:"rgba(255,255,255,0.08)",borderRadius:99,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${prog.pct}%`,background:s.col,borderRadius:99}}/>
          </div>
          <span style={{fontSize:11,fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,
            color:s.col,letterSpacing:0.5}}>{prog.pct}% done →</span>
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD ──────────────────────────────────────────────────────────
function Dashboard({ts,streak,onSubjectPress}){
  const totalXP=computeXP(ts);
  const lvl=getLevel(totalXP);
  const nextLvl=XP_LEVELS.find(l=>l.min>totalXP);
  const lvlPct=nextLvl?Math.round((totalXP-lvl.min)/(nextLvl.min-lvl.min)*100):100;
  const allProgress=CHAPS.map(c=>getProgress(c,ts));
  const allTopics=allProgress.reduce((a,p)=>a+p.total,0);
  const allMastered=allProgress.reduce((a,p)=>a+p.mastered,0);
  const chapsDone=allProgress.filter(p=>p.pct===100).length;
  const avgPct=allTopics?Math.round(allMastered/allTopics*100):0;

  // Study Next suggestion
  const wScore={High:3,Medium:2,Low:1};
  const notDone=CHAPS.filter(c=>getProgress(c,ts).pct<100);
  const suggested=notDone.length?[...notDone].sort((a,b)=>{
    const wa=wScore[a.weight],wb=wScore[b.weight];
    if(wa!==wb)return wb-wa;
    const pa=getProgress(a,ts).pct>0?1:0,pb=getProgress(b,ts).pct>0?1:0;
    if(pa!==pb)return pb-pa;
    return getProgress(a,ts).pct-getProgress(b,ts).pct;
  })[0]:null;

  return(
    <div style={{flex:1,overflowY:"auto",background:"#0b0918",padding:"0 0 24px"}}>

      {/* ── Hero XP Banner ── */}
      <div style={{
        background:"linear-gradient(160deg,#0d0a2e 0%,#1a0f4a 40%,#2d1275 100%)",
        padding:"20px 18px 24px",position:"relative",overflow:"hidden",
        borderBottom:"1px solid rgba(139,92,246,0.15)",
      }}>
        {/* Animated orbs */}
        <div style={{position:"absolute",top:-60,right:-40,width:220,height:220,borderRadius:"50%",
          background:"radial-gradient(circle,rgba(139,92,246,0.18) 0%,transparent 70%)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-40,left:-30,width:160,height:160,borderRadius:"50%",
          background:"radial-gradient(circle,rgba(167,139,250,0.12) 0%,transparent 70%)",pointerEvents:"none"}}/>

        <div style={{display:"flex",alignItems:"center",gap:14,position:"relative"}}>
          {/* Level icon */}
          <div style={{width:60,height:60,borderRadius:18,
            background:"linear-gradient(135deg,rgba(124,58,237,0.4),rgba(168,85,247,0.25))",
            border:"1.5px solid rgba(168,85,247,0.4)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,
            boxShadow:"0 4px 20px rgba(124,58,237,0.35),inset 0 1px 0 rgba(255,255,255,0.1)",
            animation:"haloGlow 3s ease infinite"}}>
            {lvl.icon}
          </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,
              color:"#a78bfa",letterSpacing:1.5,textTransform:"uppercase",marginBottom:2}}>
              {lvl.label}
            </div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:"#fff",
              letterSpacing:2,lineHeight:1,textShadow:"0 2px 12px rgba(139,92,246,0.4)"}}>
              {totalXP.toLocaleString()} XP
            </div>
            <div style={{fontSize:11,fontFamily:"'Lora',serif",
              color:"rgba(255,255,255,0.45)",fontWeight:400,marginTop:2}}>
              {nextLvl?`${(nextLvl.min-totalXP).toLocaleString()} XP to ${nextLvl.label}`:"Max Level — IIT Bound! 🚀"}
            </div>
          </div>
          {streak>0&&(
            <div style={{background:"rgba(251,191,36,0.15)",border:"1px solid rgba(251,191,36,0.35)",
              borderRadius:14,padding:"8px 14px",textAlign:"center",backdropFilter:"blur(8px)"}}>
              <div style={{fontSize:22,lineHeight:1,animation:"float 3s ease infinite"}}>🔥</div>
              <div style={{fontFamily:"'Cinzel',sans-serif",fontSize:20,color:"#fbbf24",lineHeight:1,marginTop:3}}>{streak}</div>
              <div style={{fontSize:8,fontFamily:"'Josefin Sans',sans-serif",fontWeight:600,
                color:"rgba(251,191,36,0.7)",letterSpacing:0.8}}>DAY STREAK</div>
            </div>
          )}
        </div>

        {/* XP bar */}
        <div style={{marginTop:18,position:"relative"}}>
          <div style={{height:6,background:"rgba(255,255,255,0.1)",borderRadius:99,overflow:"hidden"}}>
            <div style={{width:`${lvlPct}%`,height:"100%",
              background:"linear-gradient(90deg,#7c3aed,#a855f7,#e879f9)",
              borderRadius:99,transition:"width .7s ease",
              boxShadow:"0 0 10px rgba(168,85,247,0.5)"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
            <span style={{fontSize:9,fontFamily:"'Lora',serif",
              color:"rgba(255,255,255,0.35)",fontWeight:500}}>Level Progress</span>
            <span style={{fontSize:9,fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,
              color:"rgba(255,255,255,0.55)",letterSpacing:0.5}}>{lvlPct}%</span>
          </div>
        </div>

        {/* Overall stats row */}
        <div style={{display:"flex",gap:8,marginTop:16}}>
          {[
            {val:CHAPS.length,lbl:"Total",icon:"📚"},
            {val:chapsDone,lbl:"Done",icon:"✅"},
            {val:`${avgPct}%`,lbl:"Overall",icon:"🎯"},
          ].map((s,i)=>(
            <div key={i} style={{flex:1,background:"rgba(255,255,255,0.07)",borderRadius:14,
              padding:"10px 8px",border:"1px solid rgba(255,255,255,0.1)",textAlign:"center",
              backdropFilter:"blur(8px)"}}>
              <div style={{fontSize:14,marginBottom:3}}>{s.icon}</div>
              <div style={{fontFamily:"'Cinzel',sans-serif",fontSize:22,color:"#fff",lineHeight:1}}>{s.val}</div>
              <div style={{fontSize:9,fontFamily:"'Josefin Sans',sans-serif",fontWeight:600,
                color:"rgba(255,255,255,0.45)",letterSpacing:0.8,marginTop:2}}>{s.lbl.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Subject Cards ── */}
      <div style={{padding:"20px 14px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <div style={{height:1,flex:1,background:"rgba(255,255,255,0.07)"}}/>
          <span style={{fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,fontSize:11,
            color:"rgba(255,255,255,0.35)",letterSpacing:2}}>CHOOSE YOUR SUBJECT</span>
          <div style={{height:1,flex:1,background:"rgba(255,255,255,0.07)"}}/>
        </div>

        {["math","physics","chem"].map((k,i)=>(
          <div key={k} style={{animation:`popIn .4s ease ${0.1+i*0.1}s both`}}>
            <SubjectCard subKey={k} ts={ts} onPress={onSubjectPress}/>
          </div>
        ))}
      </div>

      {/* ── Study Next ── */}
      {suggested&&<StudyNextCard suggested={suggested} ts={ts} onSubjectPress={onSubjectPress}/>}

      {/* Motivation */}
      <div style={{margin:"14px 14px 0",borderRadius:22,
        background:"linear-gradient(135deg,rgba(124,58,237,0.15),rgba(168,85,247,0.08))",
        border:"1px solid rgba(124,58,237,0.2)",padding:"18px 20px",textAlign:"center"}}>
        <div style={{fontSize:28,marginBottom:8}}>🚀</div>
        <div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,
          color:"#c4b5fd",marginBottom:6,letterSpacing:-0.2}}>Your IIT Journey</div>
        <div style={{fontSize:12,fontFamily:"'Lora',serif",
          color:"rgba(196,181,253,0.6)",lineHeight:1.65,fontWeight:400}}>
          {allMastered===0?"Start with any subject — every concept mastered is a step toward IIT!":
          avgPct<25?"Great start! Keep the momentum going. Consistency beats everything.":
          avgPct<50?"You're building a solid foundation. Keep pushing!":
          avgPct<75?"Over halfway there! The hard work is paying off.":
          avgPct<100?"Almost there! Final sprint — you've got this!":"🎉 All topics mastered! IIT Bound!"}
        </div>
      </div>
    </div>
  );
}
// ── MAIN APP ───────────────────────────────────────────────────────────
export default function App(){
  const [ts,setTsRaw]=useState({});
  const [mainTab,setMainTab]=useState("home");
  const [activeSub,setActiveSub]=useState(null); // null | "math" | "physics" | "chem"
  const [loaded,setLoaded]=useState(false);
  const [streak,setStreak]=useState(0);

  useEffect(()=>{
    // ── Android viewport fix — prevents font shrinkage on small screens
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

    // ── Google Fonts preconnect for faster load on Android
    ['https://fonts.googleapis.com','https://fonts.gstatic.com'].forEach(href=>{
      if(!document.querySelector(`link[href="${href}"]`)){
        const link=document.createElement('link');
        link.rel='preconnect'; link.href=href;
        if(href.includes('gstatic')) link.crossOrigin='anonymous';
        document.head.appendChild(link);
      }
    });

    const style=document.createElement("style");
    style.textContent=GLOBAL_CSS;
    document.head.appendChild(style);
    return()=>{document.head.removeChild(style);};
  },[]);

  useEffect(()=>{
    async function load(){
      try{
        const r=await window.storage.get("jee_v5_ts");
        if(r&&r.value)setTsRaw(JSON.parse(r.value));
        const sr=await window.storage.get("jee_v7_streak");
        if(sr&&sr.value){const{dates=[]}=JSON.parse(sr.value);setStreak(calcStreak(dates));}
      }catch(e){}
      setLoaded(true);
    }
    load();
  },[]);

  const setTs=useCallback((updater)=>{
    setTsRaw(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      window.storage.set("jee_v5_ts",JSON.stringify(next)).catch(()=>{});
      const today=getTodayStr();
      window.storage.get("jee_v7_streak").then(sr=>{
        const{dates=[]}=sr&&sr.value?JSON.parse(sr.value):{};
        if(!dates.includes(today)){
          const upd={dates:[...dates.filter(d=>d>new Date(Date.now()-31*86400000).toISOString().split("T")[0]),today]};
          window.storage.set("jee_v7_streak",JSON.stringify(upd)).catch(()=>{});
          setStreak(calcStreak(upd.dates));
        }
      }).catch(()=>{});
      return next;
    });
  },[]);

  function handleNavTab(tab){
    setMainTab(tab);
    setActiveSub(null);
  }

  const xp=computeXP(ts);
  const lvl=getLevel(xp);

  if(!loaded)return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      height:"100vh",background:"#0b0918",gap:16,fontFamily:"'Lora',serif"}}>
      <div style={{width:64,height:64,borderRadius:20,
        background:"linear-gradient(135deg,#7c3aed,#a855f7)",
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,
        boxShadow:"0 8px 32px rgba(124,58,237,.5)",animation:"pulse 1.5s ease infinite"}}>📚</div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:"#a78bfa",
        letterSpacing:4}}>LOADING...</div>
      <div style={{fontSize:12,color:"rgba(167,139,250,0.5)",fontFamily:"'Lora'"}}>JEE Master is waking up</div>
    </div>
  );

  // Determine what content to show
  const showSubject=mainTab==="home"&&activeSub;
  const showHome=mainTab==="home"&&!activeSub;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",
      background:"#0b0918",overflow:"hidden",
      fontFamily:"'Lora',serif",color:C.text}}>

      {/* ── HEADER ── */}
      <div style={{background:"#0d0a2e",padding:"0 16px",
        display:"flex",alignItems:"center",gap:12,height:52,flexShrink:0,
        borderBottom:"1px solid rgba(139,92,246,0.15)",
        boxShadow:"0 2px 20px rgba(0,0,0,0.4)"}}>

        {/* Logo */}
        {showSubject?(
          /* When in subject, show subject colored header */
          <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
            <div style={{width:30,height:30,borderRadius:9,
              background:`linear-gradient(135deg,${SUB[activeSub].col},${SUB[activeSub].col}88)`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
              {SUB[activeSub].icon}
            </div>
            <div>
              <div style={{fontFamily:"'Cinzel',sans-serif",fontSize:18,color:"#fff",
                letterSpacing:2,lineHeight:1}}>{SUB[activeSub].label.toUpperCase()}</div>
              <div style={{fontSize:9,fontFamily:"'Josefin Sans',sans-serif",fontWeight:600,
                color:"rgba(255,255,255,0.4)",letterSpacing:1}}>JEE MASTER</div>
            </div>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:30,height:30,borderRadius:9,
              background:"linear-gradient(135deg,#7c3aed,#a855f7)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,
              boxShadow:"0 2px 10px rgba(124,58,237,.5)"}}>
              📚
            </div>
            <div>
              <div style={{fontFamily:"'Cinzel',sans-serif",fontSize:18,color:"#fff",letterSpacing:2,lineHeight:1}}>
                JEE <span style={{color:"#a78bfa"}}>MASTER</span>
              </div>
              <div style={{fontSize:9,fontFamily:"'Josefin Sans',sans-serif",fontWeight:600,
                color:"rgba(255,255,255,0.35)",letterSpacing:1}}>IIT PREP TRACKER</div>
            </div>
          </div>
        )}

        <div style={{flex:1}}/>

        {streak>0&&(
          <div style={{display:"flex",alignItems:"center",gap:4,
            background:"rgba(251,191,36,0.12)",border:"1px solid rgba(251,191,36,0.25)",
            borderRadius:20,padding:"4px 10px"}}>
            <span style={{fontSize:12}}>🔥</span>
            <span style={{fontFamily:"'Josefin Sans',sans-serif",fontSize:11,fontWeight:700,color:"#fbbf24",letterSpacing:0.5}}>{streak}D</span>
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:5,
          background:"rgba(124,58,237,.22)",border:"1px solid rgba(124,58,237,.35)",
          borderRadius:20,padding:"4px 11px"}}>
          <span style={{fontSize:11}}>{lvl.icon}</span>
          <span style={{fontFamily:"'Josefin Sans',sans-serif",fontSize:11,fontWeight:700,color:"#c4b5fd",letterSpacing:0.5}}>{xp.toLocaleString()} XP</span>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",background:"#0b0918"}}>
        {showHome&&<Dashboard ts={ts} streak={streak} onSubjectPress={setActiveSub}/>}
        {showSubject&&<SubjectPage subKey={activeSub} ts={ts} setTs={setTs} onBack={()=>setActiveSub(null)}/>}
        {mainTab==="progress"&&<ProgressView ts={ts}/>}
        {mainTab==="journal"&&<JournalView/>}
      </div>

      {/* ── BOTTOM NAV — contextual colors ── */}
      <div style={{display:"flex",
        background:mainTab==="journal"?"#080C1E":mainTab==="progress"?"#4a0728":"#0d0a2e",
        borderTop:mainTab==="journal"?"1px solid rgba(212,175,55,0.2)":mainTab==="progress"?"1px solid rgba(236,72,153,0.2)":"1px solid rgba(139,92,246,0.2)",
        flexShrink:0,
        boxShadow:"0 -4px 24px rgba(0,0,0,0.5)",paddingBottom:"env(safe-area-inset-bottom,0px)",
        transition:"background 0.3s ease, border-top 0.3s ease"}}>
        {BOTTOM_NAV.map(t=>{
          const active=mainTab===t.k&&(t.k!=="home"||!activeSub)||
                       (t.k==="home"&&mainTab==="home");
          const isHome=t.k==="home";
          // Context-aware accent colors
          const navAccent=mainTab==="journal"?"#D4AF37":mainTab==="progress"?"#EC4899":"#a78bfa";
          const navGlow=mainTab==="journal"?"rgba(212,175,55,0.6)":mainTab==="progress"?"rgba(236,72,153,0.6)":"rgba(168,85,247,0.6)";
          const navGrad=mainTab==="journal"?"linear-gradient(90deg,#8B6914,#D4AF37)":mainTab==="progress"?"linear-gradient(90deg,#BE185D,#EC4899)":"linear-gradient(90deg,#7c3aed,#a855f7)";
          return(
            <button key={t.k}
              onClick={()=>{
                if(isHome&&activeSub&&mainTab==="home"){setActiveSub(null);}
                else{handleNavTab(t.k);}
              }}
              style={{flex:1,padding:"10px 4px 8px",border:"none",cursor:"pointer",
                background:"transparent",display:"flex",flexDirection:"column",
                alignItems:"center",gap:3,position:"relative",transition:"all .15s",
                WebkitTapHighlightColor:"transparent"}}>
              {active&&(
                <div style={{position:"absolute",top:0,left:"25%",right:"25%",height:2,
                  background:navGrad,
                  borderRadius:"0 0 4px 4px",animation:"navPop .2s ease",
                  boxShadow:`0 0 8px ${navGlow}`}}/>
              )}
              <span style={{
                fontSize:20,lineHeight:1,
                filter:active?"none":"grayscale(1) opacity(0.3)",
                transform:active?"scale(1.15)":"scale(1)",
                transition:"all .2s",display:"block",
              }}>{t.emoji}</span>
              <span style={{
                fontSize:8.5,fontFamily:"'Josefin Sans',sans-serif",fontWeight:700,
                letterSpacing:1,textTransform:"uppercase",
                color:active?navAccent:"rgba(255,255,255,0.25)",
                transition:"color .15s"}}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
