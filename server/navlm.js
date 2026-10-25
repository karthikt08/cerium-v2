// Trained at server start on a versioned, non-private navigation dataset.
// Inference uses no model provider, no network request and no GPU.
import {trainNavLM,classifyNavLM} from './navlm-core.js';
import {NAVLM_EXAMPLES} from './navlm-data.js';
import {GUIDE_SECTIONS,GUIDE_TOPICS} from '../public/js/guide-knowledge.js';

const model=trainNavLM(NAVLM_EXAMPLES);
const topics=new Map(GUIDE_TOPICS.map(topic=>[topic.section,topic]));
const UNCERTAIN_REPLY="I'm not sure which Cerium feature you mean. Please ask about a specific task, such as importing a spreadsheet, creating an invoice, or scheduling a job.";

export function navigateWithNavLM(question){
  const prediction=classifyNavLM(model,question);
  // A learned label is never trusted as an executable route.
  if(!prediction.label||!GUIDE_SECTIONS.includes(prediction.label)||!topics.has(prediction.label)){
    return {source:'navlm',matched:false,section:null,title:null,steps:null,reply:UNCERTAIN_REPLY};
  }
  const topic=topics.get(prediction.label);
  return {source:'navlm',matched:true,section:topic.section,title:topic.title,steps:topic.steps,reply:topic.answer};
}
export function evaluateNavLM(holdout){
  const results=holdout.map(([expected,question])=>{
    const result=classifyNavLM(model,question);
    return {expected,predicted:result.label||'unsupported',reason:result.reason,score:result.score,question};
  });
  const correct=results.filter(x=>x.expected===x.predicted).length;
  return {correct,total:results.length,accuracy:results.length?correct/results.length:0,results};
}
