import {GUIDE_SECTIONS,pickGuide} from './guide-knowledge.js';
import {WORKSPACE_MODULES} from './industry-workspaces.js';
import {isToolRecommendationRequest,recommendBusinessTools} from './business-tool-advisor.js';
import {conversationReply,workflowReply,conciseGuideResponse,unknownGuideResponse} from './guide-dialogue.js';

// A read-only workspace companion. Replies never execute writes, model-generated URLs,
// payment actions or arbitrary browser navigation.
export function mountGuideAssistant({api,getSection,getBusiness=()=>({}),root=document.getElementById('workspace')}={}){
  if(!root||root.querySelector('#cerium-guide'))return;
  const shell=document.createElement('div');
  shell.id='cerium-guide';
  shell.className='cerium-guide';
  shell.innerHTML='<button type="button" class="guide-trigger" id="guide-trigger" aria-expanded="false" aria-controls="guide-panel">'+
    '<span class="guide-mark" aria-hidden="true">✦</span><span>Ask Cerium</span></button>'+
    '<section class="guide-panel" id="guide-panel" aria-label="Cerium assistant" hidden>'+
      '<div class="guide-header"><div><span class="guide-eyebrow">CERIUM · YOUR WORKSPACE</span><h2>Ask Cerium</h2></div>'+
        '<button type="button" class="guide-close" aria-label="Close assistant" id="guide-close">×</button></div>'+
      '<div class="guide-messages" id="guide-messages" role="log" aria-live="polite" aria-relevant="additions"></div>'+
      '<div class="guide-suggestions" id="guide-suggestions" aria-label="Try asking">'+
        '<button type="button" data-guide-prompt="Which Cerium tools should I use for my business?">Recommend tools</button>'+
        '<button type="button" data-guide-prompt="How do I import an Excel spreadsheet?">Import Excel</button>'+
        '<button type="button" data-guide-prompt="How can I save an invoice PDF?">Invoice PDFs</button>'+
        '<button type="button" data-guide-prompt="How do I schedule a job?">Schedule a job</button>'+
      '</div>'+
      '<form class="guide-form" id="guide-form"><input type="text" id="guide-question" aria-label="Ask a Cerium question" placeholder="Ask about a task or your business…" autocomplete="off" maxlength="420" required>'+
        '<button type="submit" class="guide-send" id="guide-send" aria-label="Send question">Send</button></form>'+
      '<p class="guide-privacy">Read-only guidance. Avoid private details; an enabled AI provider may process your question.</p>'+
    '</section>';
  root.append(shell);
  const trigger=shell.querySelector('#guide-trigger');
  const panel=shell.querySelector('#guide-panel');
  const close=shell.querySelector('#guide-close');
  const messages=shell.querySelector('#guide-messages');
  const input=shell.querySelector('#guide-question');
  const send=shell.querySelector('#guide-send');
  const suggestions=shell.querySelector('#guide-suggestions');
  const known=new Map(WORKSPACE_MODULES.map(item=>[item.id,item]));
  let pending=false;
  let awaitingBusinessDescription=false;
  let lastBusinessDescription='';
  let lastSection=null;

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
    const item=document.createElement('div');
    item.className='guide-bubble'+(kind==='user'?' user':'');
    item.textContent=String(text||'');
    messages.append(item);
    while(messages.children.length>22)messages.firstElementChild.remove();
    messages.scrollTop=messages.scrollHeight;
    return item;
  }
  function routeButton(section,title){
    if(!GUIDE_SECTIONS.includes(section))return;
    const row=document.createElement('div');
    row.className='guide-actions';
    const action=document.createElement('button');
    action.type='button';
    action.className='guide-action';
    action.dataset.guideDestination=section;
    action.textContent='Open '+String(title||section).slice(0,75)+' →';
    row.append(action);
    messages.append(row);
    messages.scrollTop=messages.scrollHeight;
  }
  function renderToolRecommendations(result){
    const items=Array.isArray(result.recommendations)?result.recommendations
      .filter(item=>item&&known.has(item.id)).slice(0,6):[];
    if(!items.length)return;
    const container=document.createElement('div');
    container.className='guide-recommendations';
    container.setAttribute('aria-label','Recommended Cerium tools');
    for(const item of items){
      const card=document.createElement('div');
      card.className='guide-recommendation';
      const name=document.createElement('strong');
      name.textContent=known.get(item.id).label;
      if(item.priority==='core'||item.priority==='optional'){
        const priority=document.createElement('small');
        priority.className='guide-recommendation-priority';
        priority.textContent=item.priority==='core'?'Start here':'If relevant';
        name.append(' ',priority);
      }
      const reason=document.createElement('span');
      reason.textContent=String(item.reason||'Recommended for your workflow.').slice(0,170);
      card.append(name,reason);
      container.append(card);
    }
    for(const note of (Array.isArray(result.limitations)?result.limitations:[]).slice(0,2)){
      const limitation=document.createElement('p');
      limitation.className='guide-recommendation-limit';
      limitation.textContent=String(note).slice(0,180);
      container.append(limitation);
    }
    if(typeof result.followUp==='string'&&result.followUp){
      const question=document.createElement('p');
      question.className='guide-business-followup';
      question.textContent=result.followUp.slice(0,250);
      container.append(question);
      const options=Array.isArray(result.followUpOptions)?result.followUpOptions.slice(0,4):[];
      if(options.length){
        const choices=document.createElement('div');
        choices.className='guide-business-choices';
        for(const option of options){
          if(typeof option!=='string'||option.length>45)continue;
          const choice=document.createElement('button');
          choice.type='button';
          choice.className='guide-business-choice';
          choice.textContent=option;
          choice.addEventListener('click',()=>ask(option));
          choices.append(choice);
        }
        container.append(choices);
      }
    }
    const action=document.createElement('button');
    action.type='button';
    action.className='guide-action guide-review-tools';
    action.textContent='Review these tools in Settings →';
    action.addEventListener('click',()=>{
      const modules=items.map(item=>item.id);
      closeGuide();
      document.dispatchEvent(new CustomEvent('cerium:review-tools',{detail:{modules}}));
    });
    container.append(action);
    messages.append(container);
    messages.scrollTop=messages.scrollHeight;
  }
  function localAnswer(question,section,recommendTools=false,businessDescription=question){
    const conversational=conversationReply(question,{lastSection});
    if(conversational)return conversational;
    const workflow=workflowReply(question);
    if(workflow)return workflow;
    if(recommendTools)return recommendBusinessTools({...getBusiness(),description:businessDescription});
    const match=pickGuide(question,section);
    return match.matched?conciseGuideResponse(question,match):unknownGuideResponse();
  }
  async function ask(question){
    const clean=String(question||'').trim();
    if(!clean||pending)return;
    const current=GUIDE_SECTIONS.includes(getSection?.())?getSection():'overview';
    const isRefinement=Boolean(lastBusinessDescription)&&
      (/^(?:mostly|mainly|primarily|retail|wholesale|bulk|walk[ -]?in|tailor\\w*|custom|both|b2b|b2c|we (?:mostly|mainly)|i (?:mostly|mainly))\b/i.test(clean)||
      /\b(?:mostly|mainly|primarily)\s+(?:wholesale|retail|bulk|tailoring|walk[ -]?in|custom)\b/i.test(clean));
    const wantRecommendations=awaitingBusinessDescription||isRefinement||isToolRecommendationRequest(clean);
    const businessDescription=isRefinement?(lastBusinessDescription+'; '+clean).slice(0,600):clean;
    pending=true;
    input.disabled=true;
    send.disabled=true;
    suggestions.hidden=true;
    bubble(clean,'user');
    const progress=bubble('Thinking…');
    try{
      let result;
      try{
        result=typeof api?.askGuide==='function'
          ?await api.askGuide({question:clean,currentSection:current,lastSection,recommendTools:wantRecommendations,businessDescription})
          :localAnswer(clean,current,wantRecommendations,businessDescription);
      }catch{
        result=localAnswer(clean,current,wantRecommendations,businessDescription);
      }
      if(!result||typeof result.reply!=='string')result=localAnswer(clean,current,wantRecommendations,businessDescription);
      const recommendation=result.type==='tool_recommendations'&&Array.isArray(result.recommendations);
      const workflow=result.type==='workflow'&&Array.isArray(result.actions)&&result.section===null;
      // A deliberate NavLM abstention, or conversational reply, must never inherit
      // the previously opened section and display a bogus navigation button.
      const uncertain=result.source==='navlm'&&result.matched===false&&result.section===null;
      const conversational=result.type==='conversation'&&result.section===null;
      const safe=recommendation||workflow||conversational||uncertain||GUIDE_SECTIONS.includes(result.section)
        ?result:localAnswer(clean,current,wantRecommendations,businessDescription);
      progress.textContent=safe.reply.slice(0,850);
      if(safe.steps&&/^(?:how\b|show me how|walk me through|what are the steps)/i.test(clean)&&
        !safe.reply.includes('→')){
        const steps=document.createElement('span');
        steps.className='guide-steps';
        steps.textContent=safe.steps.slice(0,250);
        progress.append(steps);
      }
      awaitingBusinessDescription=recommendation&&safe.needsMoreInfo===true;
      if(recommendation&&!safe.needsMoreInfo)lastBusinessDescription=businessDescription;
      if(recommendation)renderToolRecommendations(safe);
      else if(workflow){
        for(const step of safe.actions.slice(0,5)){
          if(step&&GUIDE_SECTIONS.includes(step.section))routeButton(step.section,step.title||step.section);
        }
        lastSection=null;
      }
      else if(GUIDE_SECTIONS.includes(safe.section))routeButton(safe.section,safe.title||safe.section);
      if(GUIDE_SECTIONS.includes(safe.section))lastSection=safe.section;
      suggestions.hidden=!(conversational||uncertain||safe.needsMoreInfo);
    }finally{
      pending=false;
      input.disabled=false;
      send.disabled=false;
      messages.scrollTop=messages.scrollHeight;
      if(!panel.hidden)input.focus();
    }
  }
  bubble('Find a feature, ask about a workflow, or describe your business for tailored tool suggestions.');
  trigger.addEventListener('click',()=>panel.hidden?openGuide():closeGuide());
  close.addEventListener('click',closeGuide);
  shell.querySelector('#guide-form').addEventListener('submit',event=>{
    event.preventDefault();
    const text=input.value;input.value='';ask(text);
  });
  shell.addEventListener('click',event=>{
    const prompt=event.target.closest('[data-guide-prompt]');
    if(prompt){ask(prompt.dataset.guidePrompt);return;}
    const destination=event.target.closest('[data-guide-destination]')?.dataset.guideDestination;
    if(!GUIDE_SECTIONS.includes(destination))return;
    closeGuide();
    if(location.hash==='#'+destination)document.getElementById('workspace-main')?.focus({preventScroll:true});
    else location.hash='#'+destination;
  });
  shell.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!panel.hidden){event.preventDefault();closeGuide();}
  });
}
