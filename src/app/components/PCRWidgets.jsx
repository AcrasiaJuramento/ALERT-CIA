import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Circle, Eraser, Hand, Pen, Redo2, RotateCcw, Save, Trash2, Type, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { GCS_OPTIONS, INTERVENTIONS } from "../utils/pcrStorage";

const anatomyPath = "M150 28c-18 0-29 13-29 31 0 15 9 27 21 31l-5 25-30 18-19 71 13 4 22-59 2 62-13 97 15 3 23-83 23 83 15-3-13-97 2-62 22 59 13-4-19-71-30-18-5-25c12-4 21-16 21-31 0-18-11-31-29-31Z";
const backPath = "M450 28c-18 0-29 13-29 31 0 15 9 27 21 31l-5 25-30 18-19 71 13 4 22-59 2 62-13 97 15 3 23-83 23 83 15-3-13-97 2-62 22 59 13-4-19-71-30-18-5-25c12-4 21-16 21-31 0-18-11-31-29-31Z";

function Mark({ mark }) {
  const common = { stroke: mark.color, strokeWidth: mark.width || 3, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  if (mark.type === "pen" || mark.type === "eraser") return <polyline points={mark.points.map(p => `${p.x},${p.y}`).join(" ")} {...common} stroke={mark.type === "eraser" ? "white" : mark.color} strokeWidth={mark.type === "eraser" ? 14 : mark.width || 3} />;
  if (mark.type === "circle") return <ellipse cx={(mark.x1 + mark.x2) / 2} cy={(mark.y1 + mark.y2) / 2} rx={Math.abs(mark.x2 - mark.x1) / 2} ry={Math.abs(mark.y2 - mark.y1) / 2} {...common} />;
  if (mark.type === "arrow") return <g {...common}><line x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} /><path d={`M ${mark.x2} ${mark.y2} l -12 -7 m 12 7 l -7 12`} /></g>;
  if (mark.type === "text") return <text x={mark.x} y={mark.y} fill={mark.color} fontSize="15" fontWeight="700">{mark.text}</text>;
  return null;
}

export function AnatomyFigure({ marks = [], className = "" }) {
  return <svg viewBox="0 0 600 330" className={className} aria-label="Front and back human anatomy body map">
    <rect width="600" height="330" fill="white" />
    <text x="150" y="18" textAnchor="middle" fontSize="12" fill="#475569">FRONT</text><text x="450" y="18" textAnchor="middle" fontSize="12" fill="#475569">BACK</text>
    <path d={anatomyPath} fill="#f8fafc" stroke="#334155" strokeWidth="2" /><path d={backPath} fill="#f8fafc" stroke="#334155" strokeWidth="2" />
    <path d="M150 92v132M126 145h48M138 225l12-18 12 18M450 92v132M426 145h48M438 225l12-18 12 18" stroke="#94a3b8" fill="none" />
    {marks.map((mark, index) => <Mark key={mark.id || index} mark={mark} />)}
  </svg>;
}

export function AnatomyEditor({ value, onSave, onClose }) {
  const [marks, setMarks] = useState(value?.marks || []); const [redo, setRedo] = useState([]); const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#dc2626"); const [draft, setDraft] = useState(null); const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 });
  const [label, setLabel] = useState("Cut"); const [customLabel, setCustomLabel] = useState(""); const svgRef = useRef(null); const pointerRef = useRef(null);
  const point = e => { const rect = svgRef.current.getBoundingClientRect(); return { x: (e.clientX - rect.left - pan.x) / zoom * (600 / (rect.width / zoom)), y: (e.clientY - rect.top - pan.y) / zoom * (330 / (rect.height / zoom)) }; };
  const down = e => { e.currentTarget.setPointerCapture(e.pointerId); pointerRef.current = { screen: { x: e.clientX, y: e.clientY }, pan }; if (tool === "pan") return; const p = point(e); if (tool === "text") { const text = label === "Others" ? customLabel : label; if (text) setMarks(m => [...m, { id: crypto.randomUUID(), type: "text", x: p.x, y: p.y, text, color }]); return; } setDraft(tool === "pen" || tool === "eraser" ? { id: crypto.randomUUID(), type: tool, points: [p], color } : { id: crypto.randomUUID(), type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color }); };
  const move = e => { if (!pointerRef.current) return; if (tool === "pan") { setPan({ x: pointerRef.current.pan.x + e.clientX - pointerRef.current.screen.x, y: pointerRef.current.pan.y + e.clientY - pointerRef.current.screen.y }); return; } if (!draft) return; const p = point(e); setDraft(d => d.type === "pen" || d.type === "eraser" ? { ...d, points: [...d.points, p] } : { ...d, x2: p.x, y2: p.y }); };
  const up = () => { pointerRef.current = null; if (draft) { setMarks(m => [...m, draft]); setDraft(null); setRedo([]); } };
  const save = () => { const all = draft ? [...marks, draft] : marks; const clone = svgRef.current.cloneNode(true); clone.removeAttribute("style"); clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); const svg = new XMLSerializer().serializeToString(clone); onSave({ marks: all, image: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}` }); };
  const tools = [["pen", <Pen size={14}/>], ["eraser", <Eraser size={14}/>], ["arrow", <ArrowUpRight size={14}/>], ["circle", <Circle size={14}/>], ["text", <Type size={14}/>], ["pan", <Hand size={14}/>]];
  return <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-2 md:p-5" role="dialog" aria-modal="true">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[96vh] overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Human Anatomy Body Mapping</h3><p className="text-xs text-slate-500">Draw with mouse, touch, or stylus. Use Pan and zoom for precision.</p></div><button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button></div>
      <div className="p-3 border-b flex flex-wrap gap-2 items-center">
        {tools.map(([name, icon]) => <button key={name} onClick={() => setTool(name)} className={`px-3 py-2 rounded-lg text-xs font-semibold flex gap-1 items-center ${tool === name ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{icon}{name[0].toUpperCase() + name.slice(1)}</button>)}
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-9 h-9" title="Marking color" />
        {tool === "text" && <><select value={label} onChange={e => setLabel(e.target.value)} className="border rounded-lg px-2 py-2 text-xs">{["Cut", "Bruise", "Burn", "Fracture", "Swelling", "Bleeding", "Pain", "Gunshot", "Stab Wound", "Others"].map(x => <option key={x}>{x}</option>)}</select>{label === "Others" && <input value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="Custom injury" className="border rounded-lg px-2 py-2 text-xs" />}</>}
        <button onClick={() => { const last = marks.at(-1); if (last) { setMarks(m => m.slice(0, -1)); setRedo(r => [...r, last]); } }} className="p-2 bg-slate-100 rounded-lg" title="Undo"><Undo2 size={16} /></button>
        <button onClick={() => { const item = redo.at(-1); if (item) { setRedo(r => r.slice(0, -1)); setMarks(m => [...m, item]); } }} className="p-2 bg-slate-100 rounded-lg" title="Redo"><Redo2 size={16} /></button>
        <button onClick={() => setMarks([])} className="p-2 bg-red-50 text-red-600 rounded-lg" title="Clear"><Trash2 size={16} /></button>
        <button onClick={() => setZoom(z => Math.min(3, z + .25))} className="p-2 bg-slate-100 rounded-lg"><ZoomIn size={16} /></button><button onClick={() => setZoom(z => Math.max(.75, z - .25))} className="p-2 bg-slate-100 rounded-lg"><ZoomOut size={16} /></button><span className="text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="flex-1 overflow-hidden bg-slate-200 min-h-[360px] touch-none cursor-crosshair">
        <svg ref={svgRef} viewBox="0 0 600 330" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="w-full h-full select-none" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "center" }}>
          <rect width="600" height="330" fill="white" /><text x="150" y="18" textAnchor="middle" fontSize="12">FRONT</text><text x="450" y="18" textAnchor="middle" fontSize="12">BACK</text><path d={anatomyPath} fill="#f8fafc" stroke="#334155" strokeWidth="2" /><path d={backPath} fill="#f8fafc" stroke="#334155" strokeWidth="2" />{marks.map((m, i) => <Mark key={m.id || i} mark={m} />)}{draft && <Mark mark={draft} />}
        </svg>
      </div>
      <div className="p-3 border-t flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button><button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-2"><Save size={15} />Save Body Map</button></div>
    </div>
  </div>;
}

export function SignaturePad({ value, onChange, label = "Digital Signature" }) {
  const ref = useRef(null); const drawing = useRef(false);
  useEffect(() => { if (!value) return; const image = new Image(); image.onload = () => ref.current?.getContext("2d").drawImage(image, 0, 0, ref.current.width, ref.current.height); image.src = value; }, [value]);
  const pos = e => { const r = ref.current.getBoundingClientRect(); const p = e.touches?.[0] || e; return { x: (p.clientX-r.left)*(ref.current.width/r.width), y: (p.clientY-r.top)*(ref.current.height/r.height) }; };
  const start = e => { e.preventDefault(); drawing.current = true; const p=pos(e); const c=ref.current.getContext("2d"); c.beginPath(); c.moveTo(p.x,p.y); };
  const move = e => { if(!drawing.current)return; e.preventDefault(); const p=pos(e); const c=ref.current.getContext("2d"); c.lineWidth=2; c.lineCap="round"; c.strokeStyle="#0f172a"; c.lineTo(p.x,p.y); c.stroke(); };
  const end = () => { if (!drawing.current) return; drawing.current=false; onChange(ref.current.toDataURL("image/png")); };
  const clear = () => { ref.current.getContext("2d").clearRect(0,0,ref.current.width,ref.current.height); onChange(""); };
  return <div><div className="flex justify-between mb-1"><span className="text-xs font-medium text-slate-600">{label}</span><button type="button" onClick={clear} className="text-[11px] text-red-500 flex items-center gap-1"><RotateCcw size={11}/>Clear</button></div><canvas ref={ref} width="520" height="130" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} className="w-full h-28 bg-white border border-slate-300 rounded-lg touch-none" /></div>;
}

const Yn = ({ value }) => <span>{value === "yes" || value === true ? "☒ YES  ☐ NO" : value === "no" || value === false ? "☐ YES  ☒ NO" : "☐ YES  ☐ NO"}</span>;
const Checked = ({ on }) => <span>{on ? "☒" : "☐"}</span>;
const Cell = ({ label, value, className = "" }) => <div className={`pcr-cell ${className}`}><b>{label}</b>{value != null && <span> {value || ""}</span>}</div>;
export function PrintablePCR({ record, printOnly = false }) {
  if (!record) return null; const gcsTotal = [record.gcs?.eye, record.gcs?.verbal, record.gcs?.motor].reduce((a,b)=>a+Number(b||0),0);
  return <div className={`pcr-paper ${printOnly ? "pcr-print-source" : "pcr-preview"} text-black bg-white`} data-pcr-export-id={record.id}>
    <style>{`@media screen{.pcr-print-source{position:absolute;left:-10000px;width:210mm}}@media print{body *{visibility:hidden!important}.pcr-preview{display:none!important}.pcr-print-source,.pcr-print-source *{visibility:visible!important}.pcr-print-source{position:absolute!important;left:0!important;top:0!important;width:100%!important}.pcr-page{page-break-after:always}.pcr-page:last-child{page-break-after:auto}}.pcr-paper{font-family:Arial,sans-serif;font-size:9px}.pcr-page{padding:7mm}.pcr-title{text-align:center;font-weight:700;font-size:16px;margin:4px}.pcr-grid{display:grid;border-left:1px solid #111;border-top:1px solid #111}.pcr-cell{min-height:25px;padding:4px;border-right:1px solid #111;border-bottom:1px solid #111}.pcr-cell b{font-size:8px;text-transform:uppercase}.pcr-section{text-align:center;font-weight:700;background:#eee;padding:3px;border:1px solid #111;border-bottom:0}.pcr-table{width:100%;border-collapse:collapse}.pcr-table td,.pcr-table th{border:1px solid #111;padding:3px}.pcr-sign{height:55px;object-fit:contain;max-width:100%}.pcr-anatomy{height:235px;width:100%}`}</style>
    <section className="pcr-page">
      <div className="text-center text-[9px]">Republic of the Philippines<br/>Province of Isabela<br/><b>MUNICIPALITY OF ECHAGUE</b></div><div className="pcr-title">PATIENT CARE REPORT</div><div className="text-center mb-2">Echague Rescue Emergency Medical Service</div>
      <div className="pcr-grid" style={{gridTemplateColumns:"1fr 1fr 1fr"}}><Cell label="Response No." value={record.responseNumber}/><Cell label="Responding Team" value={record.respondingTeam}/><Cell label="Vehicle" value={record.vehicle}/><Cell label="Driver" value={record.driver}/><Cell label="Main Aider" value={record.mainAider}/><Cell label="Assistant Aider" value={record.assistantAider}/></div>
      <div className="pcr-grid mt-1" style={{gridTemplateColumns:"2fr .5fr 1fr .7fr 1fr"}}><Cell label="Patient Name" value={record.patientName}/><Cell label="Age" value={record.age}/><Cell label="Birthday" value={record.birthday}/><Cell label="Gender" value={record.gender}/><Cell label="Civil Status" value={record.civilStatus}/></div>
      <div className="pcr-grid" style={{gridTemplateColumns:"2fr 1.3fr 1fr"}}><Cell label="Address" value={record.address}/><Cell label="Contact Person" value={record.contactPerson}/><Cell label="Contact Number" value={record.contactNumber}/></div>
      <div className="pcr-grid mt-1" style={{gridTemplateColumns:"1fr 1fr 1fr 1fr"}}><Cell label="Nature of Call" value={record.natureOfCall}/><Cell label="Date of Incident" value={record.dateOfIncident}/><Cell label="Time of Incident" value={record.timeOfIncident}/><Cell label="Place of Incident" value={record.placeOfIncident}/></div>
      <table className="pcr-table"><tbody><tr>{["Dispatch","Arrival Scene","Departure Scene","Arrival Hospital","Departure Hospital","Back to Base"].map((x,i)=><td key={x}><b>{x}</b><br/>{[record.dispatchTime,record.arrivalScene,record.departureScene,record.arrivalHospital,record.departureHospital,record.backToBase][i]}</td>)}</tr></tbody></table>
      <div className="pcr-section">PATIENT ASSESSMENT</div><div className="pcr-cell"><b>TRIAGE:</b> ☐ RED ☐ YELLOW ☐ GREEN ☐ BLACK &nbsp; <b>Selected:</b> {record.triage}</div>
      <div className="pcr-cell"><b>TYPE OF EMERGENCY:</b> {[...record.emergencyTypes,...record.traumaTypes].join(", ")} {record.emergencyOther}</div>
      <div className="pcr-grid" style={{gridTemplateColumns:"1fr 1fr"}}><Cell label="Obstetric Data" value={`LMP ${record.obstetric?.lmp} G ${record.obstetric?.g} P ${record.obstetric?.p} EDC ${record.obstetric?.edc} AOG ${record.obstetric?.aog}`}/><Cell label="Motor Vehicle Crash" value={`${record.crash?.vehicle} ${record.crash?.role} Plate ${record.crash?.plate}`}/><Cell label="Chief Complaint / Initial Assessment" value={record.chiefComplaint}/><div className="pcr-cell row-span-2"><AnatomyFigure marks={record.bodyMap?.marks} className="pcr-anatomy"/></div><div className="pcr-cell"><b>VITAL SIGNS</b><table className="pcr-table"><thead><tr><th>Time</th><th>BP</th><th>Pulse</th><th>Resp.</th><th>Temp.</th><th>SpO2</th></tr></thead><tbody>{record.vitals.map(v=><tr key={v.id}><td>{v.time}</td><td>{v.bp}</td><td>{v.pulse}</td><td>{v.respiratory}</td><td>{v.temperature}</td><td>{v.oxygen}</td></tr>)}</tbody></table></div></div>
      <div className="pcr-section">GLASGOW COMA SCALE (GCS)</div><table className="pcr-table"><tbody><tr>{Object.entries(GCS_OPTIONS).map(([k,opts])=><td key={k}><b>{k.toUpperCase()} RESPONSE</b><br/>{opts.map(([n,s])=><span key={s}><Checked on={Number(record.gcs?.[k])===s}/> {n} ({s})<br/></span>)}</td>)}<td><b>TOTAL SCORE</b><br/><span className="text-xl">{gcsTotal || ""}</span><br/>Best Response = 15<br/>Comatose = 8 or less<br/>Unresponsive = 3</td></tr></tbody></table>
      <div className="pcr-grid" style={{gridTemplateColumns:"1fr 1fr"}}><Cell label="Consent for Care" value={record.consentForCare}/><Cell label="Endorsed To / Received By / Hospital" value={`${record.endorsedTo} / ${record.receivedBy} / ${record.endorsementHospital}`}/><Cell label="Endorsement of Valuables" value={record.valuables}/><Cell label="Received By / Contact" value={`${record.valuablesReceivedBy} / ${record.valuablesContact}`}/></div>
    </section>
    <section className="pcr-page">
      <div className="pcr-title">PATIENT CARE REPORT - CONTINUATION</div><div className="pcr-grid" style={{gridTemplateColumns:"1fr 1fr"}}><Cell label="Suspected Spinal Injury" value={record.suspectedSpinal}/><Cell label="Airway" value={record.airway.join(", ")}/><Cell label="Breathing" value={`${record.breathing.join(", ")} O2 ${record.oxygenLpm} LPM via ${record.oxygenVia}`}/><Cell label="Circulation" value={`Pulse: ${record.pulseFindings.join(", ")} Bleeding: ${record.bleeding} ${record.bleedingLocation} Controlled: ${record.bleedingControlled}`}/><Cell label="Capillary Refill / Pupils" value={`${record.capillary}; ${record.pupils.join(", ")}`}/><Cell label="Skin" value={record.skin.join(", ")}/><Cell label="Pain Assessment" value={`${record.painPositive} Score ${record.painScore}; ${record.painOnset}; ${record.painQuality.join(", ")} ${record.painOther}`}/><Cell label="Events Prior to Injury" value={record.eventsPrior}/></div>
      <div className="pcr-grid" style={{gridTemplateColumns:"1fr 1fr"}}><Cell label="Allergies" value={`${record.allergies?.status}; Food: ${record.allergies?.food}; Drug: ${record.allergies?.drug}; Other: ${record.allergies?.other}`}/><Cell label="Medications" value={record.medications.map(m=>`${m.drug} ${m.dose} ${m.dateTime}`).join("; ")}/><Cell label="Medical History" value={`${record.medicalHistory.join(", ")} ${record.medicalHistoryOther}`}/><Cell label="Hospitalization History" value={`${record.hospitalization?.status}; ${record.hospitalization?.date}; ${record.hospitalization?.where}; ${record.hospitalization?.reason}`}/><Cell label="Last Oral Intake" value={`${record.oralIntake} ${record.oralIntakeDateTime}`}/><Cell label="Smoking / Alcohol" value={`Smoke: ${record.smoking?.status} ${record.smoking?.sticks}; Alcohol: ${record.alcohol?.status} ${record.alcohol?.frequency}`}/></div>
      <div className="pcr-section">INTERVENTIONS</div><table className="pcr-table"><tbody>{INTERVENTIONS.map((item,i)=>i%2===0&&<tr key={item}><td>{item}</td><td><Yn value={record.interventions[item]}/></td><td>{INTERVENTIONS[i+1]}</td><td><Yn value={record.interventions[INTERVENTIONS[i+1]]}/></td></tr>)}</tbody></table>
      <div className="pcr-grid mt-1" style={{gridTemplateColumns:"1fr 1fr"}}><Cell label="Reason/s for Transfer / Not Admitting" value={record.transferReason}/><Cell label="Name of Hospital / Facility" value={record.hospitalName}/><Cell label="Resident on Duty" value={record.residentOnDuty}/><Cell label="Date / Time" value={`${record.hospitalDate} ${record.hospitalTime}`}/></div>
      <div className="pcr-section">WAIVER (PATIENT'S / VICTIM'S REFUSAL OF TREATMENT AND/OR TRANSPORT)</div><div className="pcr-cell text-justify">I, the undersigned, have been advised that medical assistance on my behalf is necessary and that refusal of medical assistance and/or transportation for further treatment may result in death or imperil my health. Nevertheless, I refuse treatment and/or transport, assume all risks and consequences of my decision, and release the emergency services crew from liability arising from my refusal.<br/><b>Reason:</b> {record.waiverReason}</div>
      <div className="pcr-grid" style={{gridTemplateColumns:"1fr 1fr 1fr"}}>{[["Patient","patient"],["Witness","witness1"],["Witness","witness2"]].map(([title,key])=><div className="pcr-cell text-center" key={key}><b>{title}</b><br/>{record.signatures[key]&&<img src={record.signatures[key]} className="pcr-sign mx-auto"/>}<br/>{record.signatureNames[key]}<br/>Signature over printed name<br/>Date & Time: {record.signatureDates[key]}</div>)}</div>
      {record.annotation && <div className="pcr-cell"><b>REPORT ANNOTATION</b><img src={record.annotation} className="max-h-32 mx-auto"/></div>}
      <div className="text-center mt-2 text-[8px]">Logo-free operational copy generated by ALERT-CIA</div>
    </section>
  </div>;
}
