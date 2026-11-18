export type Pattern = '5x2' | '6x1' | '12x36';
export interface ShiftTimes { start:string; breakStart:string; breakEnd:string; end:string; }
export interface JourneyInput extends ShiftTimes { dailyTimes?:ShiftTimes[]; pattern:Pattern; reducedNight:boolean; target:number; workingDays?:boolean[]; }
export interface Day { label:string; working:boolean; real:number; daytime:number; nighttime:number; calculated:number; }
export interface JourneyResult { days:Day[]; daily:Omit<Day,'label'|'working'>; totals:{real:number;daytime:number;nighttime:number;calculated:number;workingDays:number;offDays:number;difference:number}; nextWeek:number; average:number; cycleValid:boolean; warnings:string[]; }
export interface Person { id:string; name:string; role:string; initials:string; color:string; sex?:'F'|'M'; start?:string; breakStart?:string; breakEnd?:string; end?:string; off?:number; limit?:number; }
export interface MonthRules { minimum:number; maxDays:number; sunday:'alternate'|'none'; holidays:number[]; }
export interface MonthlyRequest { month:string; input:JourneyInput; people:Person[]; rules:MonthRules; previousRows?:Record<string,boolean[]>; rows?:Record<string,boolean[]>; }
export interface MonthResult { dates:{day:number;weekday:number}[]; rows:Record<string,boolean[]>; warnings?:string[]; summaries?:{id:string;name:string;real:number;nighttime:number;calculated:number;workingDays:number;weekly:number[]}[]; weeks?:{start:number;end:number}[]; }
