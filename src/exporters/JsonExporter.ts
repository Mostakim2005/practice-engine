import { QuestionBank } from '../types/question';
export function exportQuestionBank(bank:QuestionBank):void{const blob=new Blob([`${JSON.stringify(bank,null,2)}\n`],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${safe(bank.bank.name)}.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
function safe(s:string):string{return s.trim().replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'')||'question-bank';}
