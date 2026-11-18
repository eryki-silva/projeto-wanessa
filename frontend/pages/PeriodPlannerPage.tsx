import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,CalendarRange,Info,LoaderCircle,Printer,Sparkles} from 'lucide-react';
import type {Person} from '../../shared/contracts';
import {createPlannerExample,plannerConfigSchema,type PlannerConfig,type PlannerDraft,type PlannerResult} from '../../shared/planner';
import {generatePeriod,downloadPeriod} from '../lib/api';
import {PlannerSetup} from '../components/planner/PlannerSetup';
import {PlannerResults} from '../components/planner/PlannerResults';

export function PeriodPlannerPage({draft,people,saveDraft}:{draft?:PlannerDraft;people:Person[];saveDraft:(draft:PlannerDraft)=>void}){
  const [config,setConfig]=useState<PlannerConfig>(()=>draft?.config?plannerConfigSchema.parse(draft.config):createPlannerExample());
  const [result,setResult]=useState<PlannerResult|null>(null),[pending,setPending]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState(''),[format,setFormat]=useState<'xlsx'|'csv'>('xlsx');
  const requestId=useRef(0),resultAnchor=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!draft?.rows)return;const controller=new AbortController(),id=++requestId.current;
    setPending(true);generatePeriod(draft,controller.signal).then(data=>{if(id===requestId.current)setResult(data);}).catch(e=>{if(e.name!=='AbortError'&&id===requestId.current)setError(e.message);}).finally(()=>{if(id===requestId.current)setPending(false);});
    return()=>controller.abort();
  },[]);
  function changeConfig(next:PlannerConfig){requestId.current++;setConfig(next);setResult(null);setError('');setPending(false);if(plannerConfigSchema.safeParse(next).success)saveDraft({config:next});}
  async function generate(){
    const parsed=plannerConfigSchema.safeParse(config);
    if(!parsed.success){setError(parsed.error.issues.slice(0,4).map(i=>i.message).join(' '));return;}
    const id=++requestId.current;setPending(true);setError('');
    try{const data=await generatePeriod({config});if(id!==requestId.current)return;setResult(data);saveDraft({config,rows:data.rows});resultAnchor.current?.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){if(id===requestId.current)setError((e as Error).message);}finally{if(id===requestId.current)setPending(false);}
  }
  async function toggle(person:string,index:number){
    if(!result||pending)return;const id=++requestId.current;setPending(true);setError('');
    const rows={...result.rows,[person]:result.rows[person].map((v,i)=>i===index?!v:v)};
    try{const data=await generatePeriod({config,rows});if(id!==requestId.current)return;setResult(data);saveDraft({config,rows:data.rows});}catch(e){if(id===requestId.current)setError((e as Error).message);}finally{if(id===requestId.current)setPending(false);}
  }
  async function exportFile(){if(!result?.valid)return;setExporting(true);setError('');try{await downloadPeriod({config,rows:result.rows},format);}catch(e){setError((e as Error).message);}finally{setExporting(false);}}
  const days=Math.round((Date.parse(config.end)-Date.parse(config.start))/86400000)+1;
  return <div className="period-planner"><div className="page-heading"><div className="eyebrow"><span/>EQUIPES EM MOVIMENTO</div><h1>Uma escala que acompanha<br/><span>a sua operação.</span></h1><p>Períodos contínuos, turmas e rodízios. Cada pessoa, cada dia, cada transição.</p></div><div className="planner-overview"><div><CalendarRange size={16}/><span>Período contínuo<strong>{Number.isFinite(days)?days:'—'} dias</strong></span></div><div><span>Quadro configurado<strong>{config.members.length} / {config.expectedPeople} pessoas</strong></span></div><div><span>Turmas<strong>{config.teams.length} jornadas</strong></span></div><div><span>Modelo<strong>5×2 · folgas editáveis</strong></span></div></div><div className="planner-example-note"><Info size={14}/><span>O exemplo usa nomes fictícios e horários de intervalo sugeridos. Configure as turmas e a equipe antes de utilizar na operação.</span></div>
    <PlannerSetup config={config} onChange={changeConfig} people={people}/>
    <div className="planner-generate-bar"><div><strong>{result?'As regras foram verificadas no período.':'Pronto para organizar o período?'}</strong><p>Quadro fixo, semanas completas e sequência individual — sem aumentar a equipe.</p></div><button className="button primary" disabled={pending||exporting} onClick={generate}>{pending?<LoaderCircle size={16} className="spin"/>:<Sparkles size={16}/>} {pending?'Validando o período…':'Gerar e validar escala'}</button></div>
    {error&&<div className="error" role="alert">{error}</div>}
    <div ref={resultAnchor} className="planner-result-anchor"/>
    {result&&<><PlannerResults config={config} result={result} pending={pending} onToggle={toggle}/><div className="planner-export-bar"><div><select aria-label="Formato do planejamento" value={format} onChange={e=>setFormat(e.target.value as 'xlsx'|'csv')}><option value="xlsx">Excel (.xlsx) · 4 abas</option><option value="csv">CSV (.csv)</option></select><button className="button primary" disabled={!result.valid||pending||exporting} onClick={exportFile}><ArrowDownToLine size={15}/>{exporting?'Gerando arquivo…':'Exportar planejamento'}</button><button className="button" disabled={!result.valid||pending} onClick={()=>window.print()}><Printer size={15}/>Imprimir visão atual</button></div><span>{result.valid?'O Excel inclui Escala, Cobertura, Validação e Transição.':'Exportação bloqueada até corrigir os conflitos obrigatórios.'}</span></div></>}
    <div className="planner-local-note">Teste local · as regras configuradas não substituem a análise das condições contratuais e da categoria. Os arquivos originais enviados permanecem intactos.</div>
  </div>;
}
