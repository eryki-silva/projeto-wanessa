import {z} from 'zod';

export const plannerWeekdays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Informe uma data válida.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido.');
const coverage = z.array(z.number().int().min(0).max(100)).length(7);
const restPair = z.array(z.number().int().min(0).max(6)).length(2,'Escolha exatamente dois dias de folga em cada grupo.').refine(days=>new Set(days).size===days.length, 'Escolha dois dias diferentes para cada combinação de folga.').transform(days=>days as [number,number]);
export const plannerModels = ['weekend','sunmon','groupC','groupD','groupE'] as const;
export type PlannerModel = typeof plannerModels[number];
export const defaultRestDays = {weekend:[5,6] as [number,number],sunmon:[6,0] as [number,number],groupC:[6,1] as [number,number],groupD:[6,2] as [number,number],groupE:[6,3] as [number,number]};
export function plannerRestName(config:{restDays?:typeof defaultRestDays},model:PlannerModel) {
  return (config.restDays??defaultRestDays)[model].map(day=>plannerWeekdays[day]).join(' + ');
}

export const plannerConfigSchema = z.object({
  start: isoDate,
  end: isoDate,
  expectedPeople: z.number().int().min(1).max(100),
  targetHours: z.number().positive().max(168),
  maxConsecutive: z.number().int().min(1).max(6),
  allowedModels: z.array(z.enum(plannerModels)).min(1).max(5).refine(x=>new Set(x).size===x.length,'Grupos duplicados.'),
  distribution: z.enum(['fixed','automatic']).default('fixed'),
  automaticGroups: z.number().int().min(1).max(5).default(5),
  sundayRule: z.enum(['minimum','alternate','all']).default('minimum'),
  minimumSundays: z.number().int().min(0).max(5).default(1),
  restDays: z.object({weekend:restPair,sunmon:restPair,groupC:restPair.default(defaultRestDays.groupC),groupD:restPair.default(defaultRestDays.groupD),groupE:restPair.default(defaultRestDays.groupE)}).default(defaultRestDays),
  minimum: coverage,
  desired: coverage,
  teamCoverage: z.enum(['required', 'preferred']),
  rotation: z.enum(['none', 'once', 'weekly', 'fortnightly']),
  rotationStart: isoDate,
  balanceSaturdays: z.boolean(),
  teams: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    color: z.enum(['blue', 'green', 'amber', 'purple']),
    start: time,
    breakStart: time,
    breakEnd: time,
    end: time,
    reducedNight: z.boolean(),
    minimum: coverage,
  })).min(1).max(12),
  members: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(120),
    teamId: z.string().min(1),
    initialModel: z.enum(['auto', ...plannerModels]),
    rotates: z.boolean(),
    previousDays: z.array(z.boolean()).max(14),
  })).max(100),
}).superRefine((value, ctx) => {
  const days = (Date.parse(value.end) - Date.parse(value.start)) / 86400000 + 1;
  if (days < 1 || days > 366) ctx.addIssue({code:'custom', message:'Escolha um período de 1 a 366 dias.'});
  if (new Set(value.members.map(p => p.id)).size !== value.members.length) ctx.addIssue({code:'custom', message:'Existem colaboradores duplicados.'});
  if (new Set(value.teams.map(p => p.id)).size !== value.teams.length) ctx.addIssue({code:'custom', message:'Existem turmas duplicadas.'});
  if (new Set(value.teams.map(p => p.name.trim().toLocaleLowerCase())).size !== value.teams.length) ctx.addIssue({code:'custom', message:'Use nomes diferentes para cada turma.'});
  if (value.members.some(p => !value.teams.some(t => t.id === p.teamId))) ctx.addIssue({code:'custom', message:'Associe todos os colaboradores a uma turma existente.'});
});

export type PlannerConfig = z.infer<typeof plannerConfigSchema>;
export type PlannerMember = PlannerConfig['members'][number];
export type PlannerTeam = PlannerConfig['teams'][number];
export const plannerRequestSchema = z.object({
  config: plannerConfigSchema,
  rows: z.record(z.array(z.boolean()).max(366)).optional(),
});
export type PlannerDraft = z.infer<typeof plannerRequestSchema>;
export interface PlannerIssue { severity:'error'|'warning'; message:string; }
export interface PlannerValidation {
  id:string; name:string; teamId:string; before:string; after:string;
  maximum:number; workingDays:number; hours:number; saturdays:number; mondays:number;
  weekly:{start:string;end:string;days:number;hours:number;partial:boolean}[];
  issues:string[]; result:'OK'|'ERRO';
}
export interface PlannerResult {
  dates:{iso:string;day:number;weekday:number}[];
  rows:Record<string,boolean[]>;
  coverage:{date:string;weekday:number;present:number;minimum:number;desired:number;teams:Record<string,number>;valid:boolean}[];
  validation:PlannerValidation[];
  issues:PlannerIssue[];
  transitions:{date:string;requested:string;changed:string[];before:Record<string,string>;after:Record<string,string>}[];
  valid:boolean;
  statistics:{days:number;people:number;hours:number;minimumSaturdays:number;maximumSaturdays:number};
}

export function createPlannerExample():PlannerConfig {
  return {
    start:'2026-12-16', end:'2027-02-15', expectedPeople:13, targetHours:42, maxConsecutive:5,
    allowedModels:['weekend','sunmon'], distribution:'fixed', automaticGroups:5, sundayRule:'minimum', minimumSundays:1, restDays:{...defaultRestDays}, minimum:[8,13,13,13,13,5,0], desired:[8,13,13,13,13,5,0],
    teamCoverage:'required', rotation:'weekly', rotationStart:'2027-01-18', balanceSaturdays:true,
    teams:[
      {id:'t1',name:'Turma 1',color:'blue',start:'06:00',breakStart:'11:00',breakEnd:'12:36',end:'16:00',reducedNight:false,minimum:[0,0,0,0,0,2,0]},
      {id:'t2',name:'Turma 2',color:'green',start:'07:00',breakStart:'12:00',breakEnd:'13:36',end:'17:00',reducedNight:false,minimum:[0,0,0,0,0,1,0]},
      {id:'t3',name:'Turma 3',color:'amber',start:'10:00',breakStart:'14:00',breakEnd:'15:36',end:'20:00',reducedNight:false,minimum:[0,0,0,0,0,2,0]},
    ],
    members:Array.from({length:13},(_,i)=>({
      id:`example-${i+1}`, name:`Colaborador ${String(i+1).padStart(2,'0')}`,
      teamId:i<5?'t1':i<8?'t2':'t3',initialModel:'auto',rotates:true,previousDays:[],
    })),
  };
}
