import {calculate} from './journey.js';
import {plannerRequestSchema, plannerRestName, plannerWeekdays, type PlannerConfig, type PlannerModel, type PlannerDraft, type PlannerResult, type PlannerIssue} from '../../shared/planner.js';

const DAY = 86400000;
const date = (iso:string) => new Date(`${iso}T00:00:00Z`);
const iso = (value:Date) => value.toISOString().slice(0,10);
const weekday = (value:Date) => (value.getUTCDay()+6)%7;
function monday(value:Date) { return new Date(value.getTime()-weekday(value)*DAY); }
export function plannerTeamHours(team:PlannerConfig['teams'][number]) {
  return calculate({pattern:'5x2',target:42,start:team.start,breakStart:team.breakStart,breakEnd:team.breakEnd,end:team.end,reducedNight:team.reducedNight}).daily;
}

export function planPeriod(raw:PlannerDraft):PlannerResult {
  const {config:c, rows:manual}=plannerRequestSchema.parse(raw);
  const modelName=(model:PlannerModel)=>plannerRestName(c,model);
  const works=(groupB:boolean,day:number)=>!c.restDays[groupB?'sunmon':'weekend'].includes(day);
  const modelWorks=(model:PlannerModel,day:number)=>!c.restDays[model].includes(day);
  const fixedRest=(day:number)=>c.distribution==='fixed' && c.allowedModels.every(model=>c.restDays[model].includes(day));
  const issues:PlannerIssue[]=[];
  const add = (severity:PlannerIssue['severity'],message:string) => {
    if(!issues.some(i=>i.severity===severity&&i.message===message)) issues.push({severity,message});
  };
  const first=date(c.start), last=date(c.end);
  const dates=Array.from({length:Math.round((last.getTime()-first.getTime())/DAY)+1},(_,i)=>{
    const value=new Date(first.getTime()+i*DAY);return{iso:iso(value),day:value.getUTCDate(),weekday:weekday(value)};
  });
  const weeks = new Map<string,number[]>();
  dates.forEach((d,i)=>{const key=iso(monday(date(d.iso)));weeks.set(key,[...(weeks.get(key)??[]),i]);});
  const daily=Object.fromEntries(c.teams.map(t=>[t.id,plannerTeamHours(t)]));
  const membersByTeam=Object.fromEntries(c.teams.map(t=>[t.id,c.members.filter(p=>p.teamId===t.id)]));
  if(c.members.length!==c.expectedPeople)add('error',`O quadro configurado é de ${c.expectedPeople} pessoas, mas há ${c.members.length} cadastradas. O quadro não será aumentado automaticamente.`);
  if(!c.members.length)add('error','Cadastre pelo menos uma pessoa para gerar a escala.');
  if(c.members.some(p=>!p.previousDays.length))add('warning','Histórico anterior não informado para parte da equipe. As sequências estão verificadas dentro do período; informe os dias anteriores para conferir a continuidade na entrada.');
  add('warning','A cobertura por turma conta pessoas escaladas. A presença simultânea durante os intervalos não é validada por faixa de horário.');

  const rows:Record<string,boolean[]>={};
  c.members.forEach(p=>rows[p.id]=dates.map(()=>false));
  const transitions:PlannerResult['transitions']=[];
  if(manual){
    for(const person of c.members){
      if(!manual[person.id]||manual[person.id].length!==dates.length)throw Error('As linhas editadas não correspondem ao período e à equipe atuais. Gere a escala novamente.');
      rows[person.id]=[...manual[person.id]];
    }
  }

  // Rotations happen at a complete weekly boundary: no mid-cycle reversal is invented.
  const requested=date(c.rotationStart);
  const rotationDate=new Date(requested.getTime()+((7-weekday(requested))%7)*DAY);
  if(c.rotation!=='none'&&iso(rotationDate)!==c.rotationStart)add('warning',`A troca solicitada em ${c.rotationStart} foi agendada para segunda-feira, ${iso(rotationDate)}, preservando os ciclos completos.`);
  const saturdayCounts:Record<string,number>=Object.fromEntries(c.members.map(p=>[p.id,0]));
  let selected=new Set<string>(), initialized=false, previousSignature='';
  const rotationMs=rotationDate.getTime();
  const assignmentHistory:Record<string,string>[]=[];
  let assignments:Record<string,PlannerModel>={};

  function chooseGroup(initial:boolean, previous:Set<string>):Set<string> {
    const n=c.members.length;
    let lower=0,upper=n;
    function bounds(size:number,minimum:number[],label:string){
      let min=0,max=size;
      minimum.forEach((required,day)=>{
        const a=works(false,day),b=works(true,day);
        if(a&&!b)max=Math.min(max,size-required);
        else if(!a&&b)min=Math.max(min,required);
        else if(required>(a?size:0))add('error',`${label}: mínimo de ${required} em ${plannerWeekdays[day]} incompatível com as folgas selecionadas.`);
      });
      return [min,max];
    }
    [lower,upper]=bounds(n,c.minimum,'Equipe');
    if(!c.allowedModels.includes('sunmon'))upper=Math.min(upper,0);
    if(!c.allowedModels.includes('weekend'))lower=Math.max(lower,n);
    const fixedOn=new Set<string>(), fixedOff=new Set<string>();
    c.members.forEach(p=>{
      if(initial){if(p.initialModel==='sunmon')fixedOn.add(p.id);if(p.initialModel==='weekend')fixedOff.add(p.id);}
      else if(!p.rotates)(previous.has(p.id)?fixedOn:fixedOff).add(p.id);
    });
    lower=Math.max(lower,fixedOn.size);upper=Math.min(upper,n-fixedOff.size);
    const minimums:Record<string,number>={},maximums:Record<string,number>={};
    c.teams.forEach(t=>{
      const members=membersByTeam[t.id],fixedWork=members.filter(p=>fixedOn.has(p.id)).length,fixedRest=members.filter(p=>fixedOff.has(p.id)).length;
      const [min,max]=c.teamCoverage==='required'?bounds(members.length,t.minimum,t.name):[0,members.length];
      minimums[t.id]=Math.max(fixedWork,min);
      maximums[t.id]=Math.min(members.length-fixedRest,max);
      if(minimums[t.id]>maximums[t.id])add('error',`${t.name}: as coberturas diárias, junto dos grupos fixados, não cabem na quantidade de pessoas da turma.`);
    });
    lower=Math.max(lower,Object.values(minimums).reduce((a,b)=>a+b,0));
    upper=Math.min(upper,Object.values(maximums).reduce((a,b)=>a+b,0));
    if(lower>upper){add('error','Não há divisão entre os grupos que atenda ao mesmo tempo aos mínimos, às turmas e aos modelos de folga selecionados.');return new Set();}
    const options=Array.from({length:Math.max(0,upper-lower+1)},(_,i)=>lower+i);
    const score=(groupB:number)=>c.desired.reduce((sum,target,day)=>sum+Math.abs((works(false,day)?n-groupB:0)+(works(true,day)?groupB:0)-target),0);
    options.sort((a,b)=>score(a)-score(b)||a-b);
    const target=options[0]??0,group=new Set(fixedOn),perTeam:Record<string,number>={};
    c.teams.forEach(t=>perTeam[t.id]=membersByTeam[t.id].filter(p=>group.has(p.id)).length);
    const rank=(a:PlannerConfig['members'][number],b:PlannerConfig['members'][number])=>{
      const balance=c.balanceSaturdays?(saturdayCounts[a.id]-saturdayCounts[b.id])*(Number(works(true,5))-Number(works(false,5)))*100:0;
      return balance+(Number(previous.has(a.id))-Number(previous.has(b.id)))*10||a.id.localeCompare(b.id,undefined,{numeric:true});
    };
    for(const team of c.teams){
      const pool=membersByTeam[team.id].filter(p=>!fixedOff.has(p.id)&&!group.has(p.id)).sort(rank);
      while(perTeam[team.id]<minimums[team.id]){const p=pool.shift();if(!p)break;group.add(p.id);perTeam[team.id]++;}
    }
    const pool=c.members.filter(p=>!fixedOff.has(p.id)&&!group.has(p.id));
    const preference=(a:PlannerConfig['members'][number],b:PlannerConfig['members'][number])=>{
      const deficit=(teamId:string)=>c.teams.find(t=>t.id===teamId)!.minimum.reduce((sum,min,day)=>sum+(!works(false,day)&&works(true,day)?Math.max(0,min-perTeam[teamId]):0),0);
      const prefA=deficit(a.teamId),prefB=deficit(b.teamId);
      return prefB-prefA||rank(a,b);
    };
    while(group.size<target){
      pool.sort(preference);
      const index=pool.findIndex(p=>perTeam[p.teamId]<maximums[p.teamId]);if(index<0)break;
      const [p]=pool.splice(index,1);group.add(p.id);perTeam[p.teamId]++;
    }
    if(group.size!==target)add('error','Não foi possível compor os grupos com as regras selecionadas. Reveja os mínimos e as pessoas excluídas do rodízio.');
    return group;
  }

  // Improve assignments against coverage while respecting fixed groups.
  function chooseMany(initial:boolean, previous:Record<string,PlannerModel>):Record<string,PlannerModel> {
    const models=c.allowedModels, result:Record<string,PlannerModel>={};
    for(const [i,p] of c.members.entries()) result[p.id]=initial && p.initialModel!=='auto' && models.includes(p.initialModel) ? p.initialModel : !initial && !p.rotates && previous[p.id] ? previous[p.id] : models[i%models.length];
    const score=()=>{
      let cost=0;
      for(let day=0;day<7;day++) {
        const present=c.members.filter(p=>modelWorks(result[p.id],day));
        cost+=Math.max(0,c.minimum[day]-present.length)*10000+Math.abs(c.desired[day]-present.length)*10;
        for(const t of c.teams){const count=present.filter(p=>p.teamId===t.id).length;cost+=Math.max(0,t.minimum[day]-count)*(c.teamCoverage==='required'?10000:20);}
      }
      if(!initial) for(const p of c.members) if(p.rotates && result[p.id]===previous[p.id])cost+=1;
      if(c.balanceSaturdays) for(const p of c.members) if(modelWorks(result[p.id],5))cost+=(saturdayCounts[p.id]??0)*0.1;
      return cost;
    };
    for(let pass=0;pass<100;pass++){
      let best=score(), change:{id:string;model:PlannerModel}|undefined;
      for(const p of c.members){
        if((initial && p.initialModel!=='auto' && models.includes(p.initialModel)) || (!initial && !p.rotates))continue;
        const old=result[p.id];for(const model of models){if(model===old)continue;result[p.id]=model;const value=score();if(value<best-0.00001){best=value;change={id:p.id,model};}}result[p.id]=old;
      }
      if(!change)break;result[change.id]=change.model;
    }
    return result;
  }

  if(c.distribution==='automatic') {
    const pairs:number[][]=[];
    for(let a=0;a<7;a++)for(let b=a+1;b<7;b++) if(c.sundayRule!=='all'||b===6)pairs.push([a,b]);
    const counts:Record<string,Record<string,number>>=Object.fromEntries(c.members.map(p=>[p.id,{}]));
    const previousPair:Record<string,number[]>={};
    for(const [weekStart,indexes] of weeks){
      // Deterministic local search evaluates coverage, continuity and Sunday quotas.
      const weekPairs:Record<string,number[]>={};
      for(const [i,p] of c.members.entries()){
        const sunday=indexes.find(i=>dates[i].weekday===6),prior=sunday===undefined?undefined:sunday-7;
        const priorWork=prior===undefined?false:prior>=0?rows[p.id][prior]:p.previousDays[p.previousDays.length+prior];
        weekPairs[p.id]=c.sundayRule==='alternate'&&priorWork?pairs.find(pair=>pair.includes(6))!:pairs[i%Math.min(c.automaticGroups,pairs.length)];
      }
      const evaluate=()=>{
        let cost=0;
        const distinct=new Set(c.members.map(p=>weekPairs[p.id].join(','))).size;
        cost+=Math.max(0,distinct-c.automaticGroups)*1000000;
        for(const i of indexes){const d=dates[i],present=c.members.filter(p=>!weekPairs[p.id].includes(d.weekday));cost+=Math.max(0,c.minimum[d.weekday]-present.length)*10000+Math.abs(c.desired[d.weekday]-present.length)*10;
          for(const t of c.teams){const n=present.filter(p=>p.teamId===t.id).length;cost+=Math.max(0,t.minimum[d.weekday]-n)*(c.teamCoverage==='required'?10000:20);}}
        for(const p of c.members){
          let run=0; const history=[...p.previousDays,...rows[p.id].slice(0,indexes[0])];for(let j=history.length-1;j>=0&&history[j];j--)run++;
          for(const i of indexes){run=weekPairs[p.id].includes(dates[i].weekday)?0:run+1;if(run>c.maxConsecutive)cost+=20000;}
          for(const i of indexes.filter(i=>dates[i].weekday===6)){const month=dates[i].iso.slice(0,7),off=weekPairs[p.id].includes(6)?1:0,remaining=dates.slice(i+1).filter(d=>d.weekday===6&&d.iso.startsWith(month)).length;
            if(c.sundayRule==='alternate'&&!off){const prior=i-7;const priorWork=prior>=0?rows[p.id][prior]:p.previousDays[p.previousDays.length+prior];if(priorWork)cost+=20000;}
            if(c.sundayRule==='minimum')cost+=Math.max(0,c.minimumSundays-(counts[p.id][month]??0)-off-remaining)*20000;
            if(c.sundayRule==='minimum' && (counts[p.id][month]??0)<c.minimumSundays && off)cost-=2;
          }
          if(c.rotation!=='none'&&p.rotates&&previousPair[p.id]?.join(',')===weekPairs[p.id].join(','))cost+=0.1;
        }
        return cost;
      };
      for(let pass=0;pass<40;pass++){let best=evaluate(),change:{id:string;pair:number[]}|undefined;
        for(const p of c.members){const old=weekPairs[p.id];for(const pair of pairs){if(pair===old)continue;const sunday=indexes.find(i=>dates[i].weekday===6),prior=sunday===undefined?undefined:sunday-7;const priorWork=prior===undefined?false:prior>=0?rows[p.id][prior]:p.previousDays[p.previousDays.length+prior];if(c.sundayRule==='alternate'&&priorWork&&!pair.includes(6))continue;weekPairs[p.id]=pair;const value=evaluate();if(value<best-0.0001){best=value;change={id:p.id,pair};}}weekPairs[p.id]=old;}
        if(!change)break;weekPairs[change.id]=change.pair;
      }
      const labels:Record<string,string>={};for(const p of c.members){const pair=weekPairs[p.id];labels[p.id]=pair.map(day=>plannerWeekdays[day]).join(' + ');previousPair[p.id]=pair;
        for(const i of indexes){if(!manual)rows[p.id][i]=!pair.includes(dates[i].weekday);if(dates[i].weekday===6&&!rows[p.id][i]){const month=dates[i].iso.slice(0,7);counts[p.id][month]=(counts[p.id][month]??0)+1;}if(rows[p.id][i]&&dates[i].weekday===5)saturdayCounts[p.id]++;}}
      assignmentHistory.push(labels);
    }
    if(c.sundayRule==='minimum'){
      const months=new Set(dates.map(d=>d.iso.slice(0,7)));for(const month of months){const start=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);if(c.start>start||c.end<end)add('warning',`Mês parcial ${month}: o mínimo de domingos deve ser conferido considerando os dias fora do período.`);}
    }
  } else {
  for(const [weekStart,indexes] of weeks){
    const ms=date(weekStart).getTime();
    let phase='initial';
    if(c.rotation!=='none'&&ms>=rotationMs){
      const elapsed=Math.floor((ms-rotationMs)/(7*DAY));
      phase=c.rotation==='once'?'rotation-0':`rotation-${Math.floor(elapsed/(c.rotation==='fortnightly'?2:1))}`;
    }
    const previousAssignments={...assignments};
    if(!initialized||phase!==previousSignature){
      const wasInitialized=initialized;
      if(c.allowedModels.every(model=>model==='weekend'||model==='sunmon')) {
        selected=chooseGroup(!initialized,selected);
        if(!initialized&&phase!=='initial')selected=chooseGroup(false,selected);
        assignments=Object.fromEntries(c.members.map(p=>[p.id,selected.has(p.id)?'sunmon':'weekend'])) as Record<string,PlannerModel>;
      } else {
        assignments=chooseMany(!initialized,assignments);
        if(!initialized&&phase!=='initial')assignments=chooseMany(false,assignments);
      }
      if(wasInitialized&&phase!==previousSignature){
        const changed=c.members.filter(p=>previousAssignments[p.id]!==assignments[p.id]).map(p=>p.id);
        if(changed.length)transitions.push({date:weekStart,requested:c.rotationStart,changed,before:Object.fromEntries(c.members.map(p=>[p.id,modelName(previousAssignments[p.id])])),after:Object.fromEntries(c.members.map(p=>[p.id,modelName(assignments[p.id])]))});
        else add('warning',`${weekStart}: nenhuma pessoa mudou de grupo; confira as restrições e a participação no rodízio.`);
      }
      initialized=true;previousSignature=phase;
    }
    assignmentHistory.push(Object.fromEntries(c.members.map(p=>[p.id,modelName(assignments[p.id])])));
    for(const i of indexes)for(const p of c.members){
      if(!manual)rows[p.id][i]=modelWorks(assignments[p.id],dates[i].weekday);
      if(rows[p.id][i]&&dates[i].weekday===5)saturdayCounts[p.id]++;
    }
  }

  }

  const coverage=dates.map((d,i)=>{
    const present=c.members.filter(p=>rows[p.id][i]),teams=Object.fromEntries(c.teams.map(t=>[t.id,present.filter(p=>p.teamId===t.id).length]));
    let valid=present.length>=c.minimum[d.weekday];
    if(!valid)add('error',`${d.iso}: ${present.length} pessoas previstas; mínimo de ${c.minimum[d.weekday]}.`);
    if(fixedRest(d.weekday)&&present.length){valid=false;add('error',`${d.iso}: há trabalho em ${plannerWeekdays[d.weekday]}, folga em todas as combinações permitidas.`);}
    if(present.length!==c.desired[d.weekday])add('warning',`${d.iso}: cobertura de ${present.length}, diferente da meta de ${c.desired[d.weekday]}.`);
    c.teams.forEach(t=>{if(teams[t.id]<t.minimum[d.weekday]){const severity=c.teamCoverage==='required'?'error':'warning';if(severity==='error')valid=false;add(severity,`${d.iso}: ${t.name} tem ${teams[t.id]} pessoas; referência de ${t.minimum[d.weekday]}.`);}});
    return{date:d.iso,weekday:d.weekday,present:present.length,minimum:c.minimum[d.weekday],desired:c.desired[d.weekday],teams,valid};
  });

  if(c.distribution==='automatic')for(const indexes of weeks.values())if(indexes.length===7){const combinations=new Set(c.members.map(p=>indexes.filter(i=>!rows[p.id][i]).map(i=>dates[i].weekday).join(',')));if(combinations.size>c.automaticGroups)add('error',`Semana de ${dates[indexes[0]].iso}: ${combinations.size} combinações de folga; máximo de ${c.automaticGroups} grupos.`);}
  const validation=c.members.map(person=>{
    const row=rows[person.id],personIssues:string[]=[];
    let run=0,maximum=0;for(const work of person.previousDays)run=work?run+1:0;
    row.forEach(work=>{run=work?run+1:0;maximum=Math.max(maximum,run);});
    if(maximum>c.maxConsecutive)personIssues.push(`Sequência de ${maximum} dias; máximo de ${c.maxConsecutive}.`);
    if(row.some((work,i)=>work&&fixedRest(dates[i].weekday)))personIssues.push('Trabalho em dia de folga em todas as combinações permitidas.');
    const hours=daily[person.teamId].calculated;
    const weekly=[...weeks.values()].map(indexes=>{
      const days=indexes.filter(i=>row[i]).length,partial=indexes.length<7,total=days*hours;
      if(!partial&&days!==5)personIssues.push(`Semana de ${dates[indexes[0]].iso}: ${days} dias de trabalho; esperado 5.`);
      if(total>c.targetHours*60+.01)personIssues.push(`Semana de ${dates[indexes[0]].iso}: horas calculadas acima da meta configurada.`);
      return{start:dates[indexes[0]].iso,end:dates[indexes.at(-1)!].iso,days,hours:total,partial};
    });
    // Verify that each complete week uses one of the permitted rest models.
    for(const indexes of weeks.values())if(indexes.length===7){
      const full=indexes.map(i=>row[i]);
      if(c.distribution==='fixed'&&!c.allowedModels.some(model=>full.every((v,i)=>v===!c.restDays[model].includes(i))))personIssues.push(`Semana de ${dates[indexes[0]].iso}: folgas fora dos modelos permitidos.`);
    }
    if(c.distribution==='automatic'){
      if(c.sundayRule==='alternate')for(let i=0;i<dates.length;i++)if(dates[i].weekday===6&&row[i]){const prior=i-7,priorWork=prior>=0?row[prior]:person.previousDays[person.previousDays.length+prior];if(priorWork)personIssues.push(`${dates[i].iso}: dois domingos trabalhados seguidos.`);}
      if(c.sundayRule==='all'&&row.some((work,i)=>work&&dates[i].weekday===6))personIssues.push('Trabalho em domingo, mas todos os domingos devem ser de folga.');
      if(c.sundayRule==='minimum')for(const month of new Set(dates.map(d=>d.iso.slice(0,7)))){const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);if(c.start<=month+'-01'&&c.end>=end){const count=dates.filter((d,i)=>d.iso.startsWith(month)&&d.weekday===6&&!row[i]).length;if(count<c.minimumSundays)personIssues.push(`${month}: ${count} domingos de folga; mínimo de ${c.minimumSundays}.`);}}
    }
    const team=c.teams.find(t=>t.id===person.teamId)!;
    const shiftStart=Number(team.start.slice(0,2))*60+Number(team.start.slice(3));
    const shiftEnd=Number(team.end.slice(0,2))*60+Number(team.end.slice(3));
    const rest=1440+shiftStart-(shiftEnd+(shiftEnd<=shiftStart?1440:0));
    if(rest<660&&row.some((v,i)=>v&&(i?row[i-1]:person.previousDays.at(-1))))personIssues.push('Há intervalo entre jornadas inferior a 11 horas.');
    personIssues.forEach(message=>add('error',`${person.name}: ${message}`));
    const worked=row.filter(Boolean).length;
    return{id:person.id,name:person.name,teamId:person.teamId,before:assignmentHistory[0]?.[person.id]??modelName(c.allowedModels[0]),after:assignmentHistory.at(-1)?.[person.id]??modelName(c.allowedModels[0]),maximum,workingDays:worked,hours:worked*hours,saturdays:row.filter((v,i)=>v&&dates[i].weekday===5).length,mondays:row.filter((v,i)=>v&&dates[i].weekday===0).length,weekly,issues:personIssues,result:personIssues.length?'ERRO' as const:'OK' as const};
  });
  const counts=validation.map(p=>p.saturdays),minSat=counts.length?Math.min(...counts):0,maxSat=counts.length?Math.max(...counts):0;
  if(c.balanceSaturdays&&maxSat-minSat>1)add('warning',`Sábados distribuídos entre ${minSat} e ${maxSat} por pessoa. O início do rodízio e os mínimos por turma limitam o equilíbrio; antecipe as trocas para aproximar as quantidades.`);
  const excluded=validation.filter(p=>!p.saturdays);
  if(c.rotation!=='none'&&excluded.length)add('warning',`${excluded.length} pessoas não trabalham em sábados neste período. Confira a frequência e quem participa do rodízio.`);
  if(manual)add('warning','A grade informada foi revalidada. Os regimes antes/depois são a referência planejada; os dias da grade são a fonte dos totais.');
  return{dates,rows,coverage,validation,issues,transitions,valid:!issues.some(i=>i.severity==='error'),statistics:{days:dates.length,people:c.members.length,hours:validation.reduce((sum,p)=>sum+p.hours,0),minimumSaturdays:minSat,maximumSaturdays:maxSat}};
}
