// Cerium NavLM v0.1: learned, dependency-free TF-IDF nearest-prototype intent classifier.
// This is a specialized classifier, not a generative language model.
// Inference is local. The caller validates the resulting route independently.
const STOPWORDS=new Set('a an the i me my our we you your is it are do does to for with by of in on at from into how where what can could would should please need want have there here me show find take go use open get new make help about all some that this then now just'.split(' '));

function terms(value){
  return String(value||'').toLowerCase().normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'')
    .match(/[a-z0-9]+/g)?.filter(token=>token.length>1&&!STOPWORDS.has(token))||[];
}
export function navlmFeatures(question){
  const words=terms(question).map(w=>w.length>4&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w).slice(0,80);
  const out=new Map();
  const add=(feature,weight)=>out.set(feature,(out.get(feature)||0)+weight);
  for(let i=0;i<words.length;i++){
    const w=words[i];
    add('w:'+w,3);
    if(i>0)add('b:'+words[i-1]+'_'+w,2);
    if(w.length>3)for(let j=0;j<=w.length-3;j++)add('c:'+w.slice(j,j+3),0.22);
  }
  return out;
}
function buildVector(features,idf){
  const entries=[];let magnitude=0;
  for(const [feature,weight] of features){
    const val=weight*(idf[feature]||0);
    if(!val)continue;
    entries.push([feature,val]);magnitude+=val*val;
  }
  if(!magnitude)return [];
  const scale=1/Math.sqrt(magnitude);
  return entries.map(([feature,val])=>[feature,Math.round(val*scale*1000000)/1000000]);
}
export function trainNavLM(examples){
  const docs=[];
  for(const [label,phrases] of Object.entries(examples)){
    if(!Array.isArray(phrases))throw Error('Expected labeled arrays');
    for(const phrase of phrases){
      if(!phrase||typeof phrase!=='string')throw Error('Invalid training phrase');
      docs.push({label,features:navlmFeatures(phrase)});
    }
  }
  const df=Object.create(null);
  for(const doc of docs)for(const key of doc.features.keys())df[key]=(df[key]||0)+1;
  const idf=Object.create(null);
  for(const key of Object.keys(df))idf[key]=Math.round((1+Math.log((docs.length+1)/(df[key]+1)))*1000)/1000;
  return {version:1,algorithm:'tfidf-nearest-prototype',labels:Object.keys(examples),idf,
    prototypes:docs.map(doc=>({label:doc.label,vector:buildVector(doc.features,idf)}))};
}
export function classifyNavLM(model,question,{minScore=0.29,minMargin=0.045}={}){
  const features=navlmFeatures(question);
  const query=buildVector(features,model.idf);
  if(!query.length)return {label:null,reason:'unknown-terms',score:0,margin:0};
  const vector=new Map(query);
  const bestByLabel=new Map();
  for(const item of model.prototypes){
    let score=0;
    for(const [feature,val] of item.vector)score+=(vector.get(feature)||0)*val;
    if(score>(bestByLabel.get(item.label)||0))bestByLabel.set(item.label,score);
  }
  const ranks=[...bestByLabel].sort((a,b)=>b[1]-a[1]);
  const [top,runner]=ranks;
  const score=top?.[1]||0;
  const margin=score-(runner?.[1]||0);
  if(!top||score<minScore)return {label:null,reason:'weak-match',score,margin};
  if(margin<minMargin)return {label:null,reason:'ambiguous',score,margin};
  // Reject unfamiliar questions that nearly match an explicitly unsupported example.
  if(runner?.[0]==='unsupported'&&score<0.50&&margin<0.12)
    return {label:null,reason:'possibly-unsupported',score,margin};
  if(top[0]==='unsupported')return {label:null,reason:'unsupported',score,margin};
  // Guard against a false 'Payments' match when the user explicitly asks
  // about unpaid customer bills; reminders are still selected by the model.
  if(top[0]==='payments'&&/\\b(?:bills?|invoices?)\\b/i.test(question)&&
    /\\b(?:unpaid|outstanding|not (?:been )?paid|yet to be paid)\\b/i.test(question)&&
    !/\\b(?:remind|reminder|chase|notify|notification|follow[\\s-]?up|message)\\b/i.test(question)&&
    model.labels.includes('invoices'))return {label:'invoices',reason:'unpaid-invoice-guard',score,margin};
  return {label:top[0],reason:'matched',score,margin};
}
