import {z} from 'zod';
import type {JourneyInput,Person,MonthRules} from '../../shared/contracts';
import {plannerRequestSchema} from '../../shared/planner';
export const defaultJourney:JourneyInput={start:'08:00',breakStart:'12:00',breakEnd:'13:00',end:'17:24',pattern:'5x2',reducedNight:false,target:42};
export const defaultRules:MonthRules={minimum:1,maxDays:6,sunday:'alternate',holidays:[]};
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),identifier=z.string().min(1).max(120);
const person=z.object({id:identifier,name:z.string().min(1).max(120),role:z.string().max(120),initials:z.string().max(6),color:z.string().max(20),sex:z.enum(['F','M']).optional(),start:time.optional(),breakStart:time.optional(),breakEnd:time.optional(),end:time.optional(),off:z.number().int().min(1).max(6).optional(),limit:z.number().positive().max(168).optional()});
const rules=z.object({minimum:z.number().int().min(0).max(100),maxDays:z.number().int().min(1).max(31),sunday:z.enum(['alternate','none']),holidays:z.array(z.number().int().min(1).max(31))});
const journey=z.object({start:time,breakStart:time,breakEnd:time,end:time,dailyTimes:z.array(z.object({start:time,breakStart:time,breakEnd:time,end:time})).length(7).optional(),pattern:z.enum(['5x2','6x1','12x36']),reducedNight:z.boolean(),target:z.number().positive().max(168),workingDays:z.array(z.boolean()).length(7).optional()});
const sectorSchema=z.object({id:identifier,name:z.string().min(1).max(120),people:z.array(person).max(100),rules,plans:z.record(z.record(z.array(z.boolean()).max(31))),planner:plannerRequestSchema.optional()});
export const workspaceSchema=z.object({version:z.literal(2),journey,branches:z.array(z.object({id:identifier,name:z.string().min(1).max(120),sectors:z.array(sectorSchema).min(1)})).min(1),branch:identifier,sector:identifier}).superRefine((value,ctx)=>{const b=value.branches.find(b=>b.id===value.branch);if(!b?.sectors.some(s=>s.id===value.sector))ctx.addIssue({code:'custom',message:'Filial ou setor inválido.'});if(new Set(value.branches.map(b=>b.id)).size!==value.branches.length)ctx.addIssue({code:'custom',message:'Filiais duplicadas.'});for(const b of value.branches){if(new Set(b.sectors.map(s=>s.id)).size!==b.sectors.length)ctx.addIssue({code:'custom',message:'Setores duplicados.'});for(const s of b.sectors)if(new Set(s.people.map(p=>p.id)).size!==s.people.length)ctx.addIssue({code:'custom',message:'Colaboradores duplicados.'});}});
export type Workspace=z.infer<typeof workspaceSchema>;
export type Sector=Workspace['branches'][number]['sectors'][number];
export function newSector(name='Meu setor'):Sector{return{id:crypto.randomUUID(),name,people:[],rules:{...defaultRules},plans:{}};}
const legacySchema=z.object({branch:z.string(),sector:z.string(),branches:z.array(z.object({id:z.string(),name:z.string(),sectors:z.array(z.object({id:z.string(),name:z.string(),people:z.array(z.object({id:z.string(),name:z.string(),sex:z.enum(['F','M']),start:time,breakStart:time,breakEnd:time,end:time,off:z.number(),limit:z.number()})),minimum:z.number(),maxDays:z.number(),sunday:z.enum(['alternate','none']),night:z.boolean().optional(),holidays:z.string(),plans:z.record(z.object({rows:z.record(z.array(z.enum(['W','F','X'])))}))})).min(1)})).min(1)});
export function parseBackup(raw:unknown):Workspace{
 const current=workspaceSchema.safeParse(raw);if(current.success)return current.data;
 const old=legacySchema.parse(raw);
 return workspaceSchema.parse({version:2,journey:{...defaultJourney,reducedNight:old.branches.find(b=>b.id===old.branch)?.sectors.find(s=>s.id===old.sector)?.night??false},branch:old.branch,sector:old.sector,branches:old.branches.map(b=>({...b,sectors:b.sectors.map(s=>({id:s.id,name:s.name,people:s.people.map((p,i)=>({...p,role:s.name,initials:p.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]??'').join('').toUpperCase(),color:['green','blue','purple','amber'][i%4]})),rules:{minimum:s.minimum,maxDays:s.maxDays,sunday:s.sunday,holidays:s.holidays.split(',').map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=31)},plans:Object.fromEntries(Object.entries(s.plans).map(([month,plan])=>[month,Object.fromEntries(Object.entries(plan.rows).map(([id,row])=>[id,row.map(v=>v==='W')]))]))}))}))});
}
export function loadWorkspace():Workspace{
 const saved=localStorage.getItem('compasso-v2');if(saved)return parseBackup(JSON.parse(saved));
 const legacy=localStorage.getItem('compasso-v1');if(legacy)return parseBackup(JSON.parse(legacy));
 const sector=newSector(),branch={id:crypto.randomUUID(),name:'Minha filial',sectors:[sector]};return{version:2,journey:defaultJourney,branches:[branch],branch:branch.id,sector:sector.id};
}
