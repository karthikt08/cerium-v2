import {GUIDE_SECTIONS, pickGuide} from './guide-knowledge.js';
import {WORKSPACE_MODULES} from './industry-workspaces.js';
import {isToolRecommendationRequest} from './business-tool-advisor.js';

// Purely navigational: this widget never submits, edits, deletes, or pays on a user's behalf.
export function mountGuideAssistant({api, getSection, root=document.getElementById('workspace')}={}) {
  if(!root || root.querySelector('#cerium-guide'))return;
  const shell=document.createElement('div');
  shell.id='cerium-guide';
  shell.className='cerium-guide';
  shell.innerHTML='<button type="button" class="guide-trigger" id="guide-trigger" aria-expanded="false" aria-controls="guide-panel">'+
    '<span class="guide-mark" aria-hidden="true">✦</span><span>Ask Cerium</span></button>'+
    '<section class="guide-panel" id="guide-panel" aria-label="Cerium navigation assistant" hidden>'+
      '<div class="guide-header"><div><span class="guide-eyebrow">CERIUM · WORKSPACE GUIDE</span><h2>What would you like to do?</h2></div>'+
      '<button type="button" class="guide-close" aria-label="Close assistant" id="guide-close">×</button></div>'+
      '<div class="guide-messages" id="guide-messages" role="log" aria-live="polite" aria-relevant="additions"></div>'+
      '<div class="guide-suggestions" id="guide-suggestions" aria-label="Common questions">'+
        '<button type="button" data-guide-prompt="How do I create an invoice?">Create an invoice</button>'+
        '<button type="button" data-guide-prompt="How can I import an Excel or CSV file?">Import a spreadsheet</button>'+
        '<button type="button" data-guide-prompt="How do I schedule a job?">Schedule work</button>'+
        '<button type="button" data-guide-prompt="Which Cerium tools should I use for my business?">Recommend my tools</button>'+
      '</div>'+
      '<form class="guide-form" id="guide-form"><input type="text" id="guide-question" aria-label="Ask about Cerium" placeholder="e.g. Where do I import customers?" autocomplete="off" maxlength="420" required>'+
        '<button type="submit" class="guide-send" id="guide-send">Ask</button></form>'+
      '<p class="guide-privacy">Navigation only. No changes to your records. For AI replies, your question and current tab go to Cerium’s configured model (local or external). Avoid personal or payment details.</p>'+
    '</section>';
  root.append(shell);
  const trigger=shell.querySelector('#guide-trigger');
  const panel=shell.querySelector('#guide-panel');
  const close=shell.querySelector('#guide-close');
  const messages=shell.querySelector('#guide-messages');
  const input=shell.querySelector('#guide-question');
  const send=shell.querySelector('#guide-send');
  let pending=false;
  let awaitingBusinessDescription=false;
  function openGuide(){
    panel.hidden=false;
    trigger.setAttribute('aria-expanded','true');
    input.focus();
  }
  function closeGuide(){
    panel.hidden=true;
    trigger.setAttribute('aria-expanded','false');
    trigger.focus();
  }
  function bubble(text,kind='assistant'){
    const el=document.createElement('div');
    el.className='guide-bubble'+(kind==='user'?' user':'');
    el.textContent=text;
    messages.append(el);
    while(messages.children.length>18)messages.firstElementChild.remove();
    messages.scrollTop=messages.scrollHeight;
    return el;
  }
  function routeButton(section,title){
    if(!GUIDE_SECTIONS.includes(section))return;
    const row=document.createElement('div');
    row.className='guide-actions';
    const action=document.createElement('button');
    action.type='button';
    action.className='guide-action';
    action.dataset.guideDestination=section;
    action.textContent='Open '+title+' →';
    row.append(action);
    messages.append(row);
    messages.scrollTop=messages.scrollHeight;
  }
  function renderToolRecommendations(result){
    const known=new Map(WORKSPACE_MODULES.map(m=>[m.id,m]));
    const items=Array.isArray(result.recommendations)?result.recommendations
      .filter(x=>x&&known.has(x.id)).slice(0,6):[];
    if(!items.length)return;
    const container=document.createElement('div');
    container.className='guide-recommendations';
    container.setAttribute('aria-label','Recommended Cerium tools');
    for(const item of items){
      const card=document.createElement('div');
      card.className='guide-recommendation';
      const name=document.createElement('strong');
      name.textContent=known.get(item.id).label;
      const explanation=document.createElement('span');
      explanation.textContent=String(item.reason||'Recommended for the work you described.').slice(0,220);
      card.append(name,explanation);
      container.append(card);
    }
    const notes=Array.isArray(result.limitations)?result.limitations.slice(0,2):[];
    for(const note of notes){
      const element=document.createElement('p');
      element.className='guide-recommendation-limit';
      element.textContent=String(note).slice(0,200);
      container.append(element);
    }
    const action=document.createElement('button');
    action.type='button';
    action.className='guide-action guide-review-tools';
    action.textContent='Review suggested tools in Settings →';
    action.addEventListener('click',()=>{
      const modules=items.map(x=>x.id);
      document.dispatchEvent(new CustomEvent('cerium:review-tools',{detail:{modules}}));
      closeGuide();
    });
    container.append(action);
    messages.append(container);
    messages.scrollTop=messages.scrollHeight;
  }
  function localAnswer(question,section){
    const match=pickGuide(question,section);
    return {reply:match.answer,steps:match.steps,section:match.section,title:match.title,source:'guide'};
  }
  async function ask(question){
    const clean=String(question||'').trim();
    if(!clean || pending)return;
    const current=GUIDE_SECTIONS.includes(getSection?.())?getSection():'overview';
    const wantRecommendations=awaitingBusinessDescription||isToolRecommendationRequest(clean);
    pending=true;input.disabled=true;send.disabled=true;
    bubble(clean,'user');
    const progress=bubble('Finding the right tool…');
    shell.querySelector('#guide-suggestions').hidden=true;
    try{
      let result;
      try{
        result=typeof api?.askGuide==='function'
          ? await api.askGuide({question:clean,currentSection:current,recommendTools:wantRecommendations})
          : localAnswer(clean,current);
      }catch{
        result=localAnswer(clean,current);
      }
      if(!result || typeof result.reply!=='string')result=localAnswer(clean,current);
      // Recommendations and NavLM uncertainty deliberately have no destination.
      const recommendation=result.type==='tool_recommendations'&&Array.isArray(result.recommendations);
      const uncertain=result.source==='navlm'&&result.matched===false&&result.section===null;
      const safe=recommendation||uncertain||GUIDE_SECTIONS.includes(result.section)
        ? result : {...result,...localAnswer(clean,current)};
      progress.textContent=safe.reply.slice(0,850)+
        (safe.steps && (safe.source==='guide'||safe.source==='navlm')?'\n\n'+safe.steps.slice(0,400):'');
      awaitingBusinessDescription=recommendation&&safe.needsMoreInfo===true;
      if(recommendation)renderToolRecommendations(safe);
      else if(GUIDE_SECTIONS.includes(safe.section))routeButton(safe.section,safe.title||safe.section);
    }finally{
      pending=false;input.disabled=false;send.disabled=false;
      messages.scrollTop=messages.scrollHeight;
      if(!panel.hidden)input.focus();
    }
  }
  bubble('Hi! I can help you find a feature, explain the steps, and take you to the right section. I will never change your records for you.');
  trigger.addEventListener('click',()=>panel.hidden?openGuide():closeGuide());
  close.addEventListener('click',closeGuide);
  shell.querySelector('#guide-form').addEventListener('submit',event=>{
    event.preventDefault();const question=input.value;input.value='';ask(question);
  });
  shell.addEventListener('click',event=>{
    const prompt=event.target.closest('[data-guide-prompt]');
    if(prompt){ask(prompt.dataset.guidePrompt);return;}
    const destination=event.target.closest('[data-guide-destination]')?.dataset.guideDestination;
    if(!GUIDE_SECTIONS.includes(destination))return;
    closeGuide();
    if(location.hash==='#'+destination){
      document.getElementById('workspace-main')?.focus({preventScroll:true});
    }else{
      location.hash='#'+destination;
    }
  });
  shell.addEventListener('keydown',event=>{
    if(event.key==='Escape' && !panel.hidden){event.preventDefault();closeGuide();}
  });
}
