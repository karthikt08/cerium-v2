// Small, text-only response format shared by every assistant provider.
// Model output is never interpreted as HTML or used to create destinations.
export const MAX_GUIDE_REPLY=2400;
const clean=value=>String(value||'').slice(0,MAX_GUIDE_REPLY)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'')
  .replace(/\[([^\]\n]+)\]\([^\)\n]*\)/g,'$1')
  .replace(/[ \t]{2,}/g,' ')
  .trim();
const sentences=text=>text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/u).filter(Boolean);

export function guideReplyBlocks(result,question=''){
  const reply=clean(result?.reply);
  if(!reply)return [];
  const social=result.type==='conversation'&&['greeting','thanks'].includes(result.kind);
  const lines=reply.split(/\n+/).map(line=>line.trim()).filter(Boolean);
  const explicit=lines.some(line=>/^(?:[-*•]|\d+[.)])\s+/.test(line));
  const blocks=[];
  const add=(type,text)=>{
    const last=blocks.at(-1);
    if(last?.type===type)last.items.push(text);
    else blocks.push({type,items:[text]});
  };
  for(const line of lines){
    const numbered=line.match(/^\d+[.)]\s+(.+)/);
    const bullet=line.match(/^[-*•]\s+(.+)/);
    if(numbered)add('ol',numbered[1]);
    else if(bullet)add('ul',bullet[1]);
    else if(social||explicit||lines.length>1||['llm','copilot'].includes(result.source)||result.type==='copilot')add('p',line.replace(/^#{1,6}\s+/,''));
    else for(const sentence of sentences(line))add('ul',sentence);
  }
  // Provider answers already contain their own steps. Never append a second,
  // generic route recipe to a specific generated answer.
  const wantsSteps=/\b(?:how|steps?|walk me through|explain|more detail)\b/i.test(question);
  const choice=result.type==='workflow'&&/^Choose\b/i.test(result.steps||'');
  if(result.source!=='ai'&&result.steps&&!choice&&(wantsSteps||result.type==='workflow')){
    const steps=clean(result.steps).split(/\s*→\s*|\n+/).filter(Boolean);
    if(steps.length>1){
      // Join page navigation and its task so each numbered item is useful.
      const grouped=[];
      for(let i=0;i<steps.length;i++){
        let step=steps[i];
        if(result.type==='workflow'&&/^Open\b/.test(step))while(i+1<steps.length&&!/^Open\b/.test(steps[i+1]))step+=' → '+steps[++i];
        grouped.push(step);
      }
      blocks.push({type:'ol',label:'Steps',items:grouped});
    }
  }
  return blocks;
}

// Build real list/bold elements before typing, revealing only textContent.
// A completed message is announced separately by the host once, not per letter.
export function typeGuideReply(container,blocks,{signal,instant=false,onUpdate=()=>{}}={}){
  const doc=container.ownerDocument;
  const win=doc.defaultView;
  const segments=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
  const units=text=>segments?Array.from(segments.segment(text),part=>part.segment):Array.from(text);
  const runs=[];
  container.replaceChildren();
  container.classList.add('guide-formatted');
  for(const block of blocks){
    const group=doc.createElement('div');
    group.className='guide-answer-block';group.hidden=true;
    if(block.label){const label=doc.createElement('strong');label.className='guide-steps-label';label.textContent=block.label;group.append(label);}
    const list=block.type==='p'?group:doc.createElement(block.type==='ol'?'ol':'ul');
    if(list!==group){list.className='guide-answer-list';group.append(list);}
    for(const text of block.items){
      const item=doc.createElement(block.type==='p'?'p':'li');item.hidden=true;
      list.append(item);
      for(const part of String(text).split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean)){
        const bold=part.startsWith('**')&&part.endsWith('**');
        const node=doc.createElement(bold?'strong':'span');
        const value=units(bold?part.slice(2,-2):part);
        item.append(node);runs.push({node,value,group,item});
      }
    }
    container.append(group);
  }
  const total=runs.reduce((sum,run)=>sum+run.value.length,0);
  const duration=Math.min(5000,Math.max(300,total*4));
  let frame=null,done=false,index=0,offset=0,shown=0,elapsed=0,previous=null;
  let resolveFinished;
  const finished=new Promise(resolve=>{resolveFinished=resolve;});
  const paint=limit=>{
    while(index<runs.length&&shown<limit){
      const run=runs[index];
      const count=Math.min(run.value.length-offset,limit-shown);
      offset+=count;shown+=count;
      run.group.hidden=false;run.item.hidden=false;
      run.node.textContent=run.value.slice(0,offset).join('');
      container.querySelector('.guide-typing-cursor')?.classList.remove('guide-typing-cursor');
      run.node.classList.add('guide-typing-cursor');
      if(offset===run.value.length){index++;offset=0;}
    }
    onUpdate();
  };
  const settle=completed=>{
    if(done)return;
    done=true;
    if(frame!==null)win.cancelAnimationFrame(frame);
    signal?.removeEventListener('abort',cancel);
    container.classList.remove('guide-typing');
    container.querySelector('.guide-typing-cursor')?.classList.remove('guide-typing-cursor');
    resolveFinished(completed);
  };
  const cancel=()=>settle(false);
  const finish=()=>{if(!done){paint(total);settle(true);}};
  const tick=time=>{
    if(signal?.aborted||!container.isConnected){cancel();return;}
    elapsed+=previous===null?16:Math.min(50,time-previous);previous=time;
    paint(Math.min(total,Math.max(1,Math.floor(total*elapsed/duration))));
    if(shown>=total)settle(true);
    else frame=win.requestAnimationFrame(tick);
  };
  if(signal?.aborted)cancel();
  else if(instant||!total||win.matchMedia?.('(prefers-reduced-motion: reduce)').matches)finish();
  else{
    container.classList.add('guide-typing');
    signal?.addEventListener('abort',cancel,{once:true});
    frame=win.requestAnimationFrame(tick);
  }
  return {finished,finish,cancel};
}
