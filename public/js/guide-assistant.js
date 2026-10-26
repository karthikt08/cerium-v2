import {GUIDE_SECTIONS,pickGuide} from './guide-knowledge.js';
import {guideNavigationLinks,trustedGuideLink} from './guide-links.js';
import {WORKSPACE_MODULES} from './industry-workspaces.js';
import {isToolRecommendationRequest,recommendBusinessTools} from './business-tool-advisor.js';
import {conversationReply,workflowReply,conciseGuideResponse,unknownGuideResponse} from './guide-dialogue.js';

const CONTEXT_SUGGESTIONS = {
  overview: [
    { prompt: "Which Cerium tools should I use for my business?", label: "Recommend tools" },
    { prompt: "How do I convert an accepted quote into a scheduled job and invoice?", label: "Quote to invoice" },
    { prompt: "How do I reconcile bank deposits with invoices?", label: "Reconcile deposits" },
    { prompt: "How do I prepare a GST tax invoice with line item rates?", label: "GST tax invoice" },
    { prompt: "How do I import an Excel spreadsheet?", label: "Import Excel" },
    { prompt: "What should I focus on today?", label: "Daily priorities" }
  ],
  invoices: [
    { prompt: "How can I save an invoice PDF?", label: "Save invoice PDF" },
    { prompt: "How do I prepare a GST tax invoice with line item rates?", label: "GST tax invoice" },
    { prompt: "What payment terms should I offer for contractor invoices?", label: "Payment terms" },
    { prompt: "How do I handle partial payments and reconcile invoices?", label: "Reconcile deposits" },
    { prompt: "How do I handle a customer who won't pay?", label: "Past due escalation" }
  ],
  quotes: [
    { prompt: "How do I convert an accepted quote into a scheduled job and invoice?", label: "Quote to invoice" },
    { prompt: "What is the difference between an estimate and an invoice?", label: "Estimate vs invoice" },
    { prompt: "How do I handle a change order for extra work?", label: "Change orders" },
    { prompt: "How do I price jobs to be profitable?", label: "Job costing & markup" }
  ],
  jobs: [
    { prompt: "How do I dispatch crew and avoid schedule conflicts?", label: "Crew dispatch" },
    { prompt: "How do I reschedule or cancel an appointment?", label: "Reschedule job" },
    { prompt: "How do I schedule a job and invoice it?", label: "Schedule to invoice" },
    { prompt: "How do I request customer reviews after completing a job?", label: "Review request" }
  ],
  leads: [
    { prompt: "How do I import an Excel spreadsheet?", label: "Import Excel" },
    { prompt: "How do I import contacts and deduplicate them in Leads?", label: "Deduplicate contacts" },
    { prompt: "How do I turn a lead into an invoice?", label: "Lead to invoice" },
    { prompt: "How do I advance leads through pipeline stages?", label: "Pipeline stages" }
  ],
  payments: [
    { prompt: "How do I reconcile bank deposits with invoices?", label: "Match deposits" },
    { prompt: "How do I handle partial payments and reconcile invoices?", label: "Partial payments" },
    { prompt: "How do I undo a matched bank transaction?", label: "Undo bank match" },
    { prompt: "How do I collect an upfront deposit before starting work?", label: "Deposit workflow" }
  ],
  reminders: [
    { prompt: "How do I send an automatic payment reminder?", label: "Schedule reminder" },
    { prompt: "How do I handle a customer who won't pay?", label: "Overdue escalation" },
    { prompt: "How do I schedule late invoice reminder follow-up?", label: "Late reminder timing" }
  ],
  followups: [
    { prompt: "How do I create a callback task in Follow-ups?", label: "Create callback" },
    { prompt: "What should I focus on today?", label: "Daily priorities" },
    { prompt: "How do I record crew instructions in Follow-ups?", label: "Crew briefing" }
  ],
  reviews: [
    { prompt: "How do I request customer reviews after completing a job?", label: "Request reviews" },
    { prompt: "How do I get more 5-star Google reviews?", label: "Get more 5-stars" },
    { prompt: "When is the best time to ask for a customer review?", label: "Review timing" }
  ],
  settings: [
    { prompt: "How can I customize my tools?", label: "Customize tools" },
    { prompt: "How do I close out the month and export financial records for accountant?", label: "Export for accountant" },
    { prompt: "How do I configure GST rates and business tax settings?", label: "GST tax setup" },
    { prompt: "Which Cerium tools should I use for my business?", label: "Recommend tools" }
  ]
};

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
      '<div class="guide-header"><div><span class="guide-eyebrow">CERIUM · WORKSPACE AI</span><h2>Ask <span class="ac">Cerium<svg class="ul" viewBox="0 0 300 14" aria-hidden="true"><path pathLength="1" d="M3 9C60 3 120 12 180 6s90 3 117 0"/></svg></span></h2></div>'+
        '<button type="button" class="guide-close" aria-label="Close assistant" id="guide-close">×</button></div>'+
      '<div class="guide-messages" id="guide-messages" role="log" aria-live="polite" aria-relevant="additions"></div>'+
      '<div class="guide-suggestions" id="guide-suggestions" aria-label="Try asking">'+
        '<button type="button" data-guide-prompt="Which Cerium tools should I use for my business?">Recommend tools</button>'+
        '<button type="button" data-guide-prompt="How do I convert an accepted quote into a scheduled job and invoice?">Quote to invoice</button>'+
        '<button type="button" data-guide-prompt="How do I reconcile bank deposits with invoices?">Reconcile deposits</button>'+
        '<button type="button" data-guide-prompt="How do I prepare a GST tax invoice with line item rates?">GST tax invoice</button>'+
        '<button type="button" data-guide-prompt="How do I import an Excel spreadsheet?">Import Excel</button>'+
        '<button type="button" data-guide-prompt="What should I focus on today?">Daily priorities</button>'+
      '</div>'+
      '<form class="guide-form" id="guide-form"><input type="text" id="guide-question" aria-label="Ask a Cerium question" placeholder="Ask about an advanced task, workflow, or your tools…" autocomplete="off" maxlength="420" required>'+
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

  function updateSuggestions(section){
    const sec=GUIDE_SECTIONS.includes(section)?section:'overview';
    const list=CONTEXT_SUGGESTIONS[sec]||CONTEXT_SUGGESTIONS.overview;
    suggestions.innerHTML='';
    for(const item of list){
      const btn=document.createElement('button');
      btn.type='button';
      btn.dataset.guidePrompt=item.prompt;
      btn.textContent=item.label;
      suggestions.append(btn);
    }
  }

  function openGuide(){
    panel.hidden=false;
    trigger.setAttribute('aria-expanded','true');
    updateSuggestions(getSection?.());
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
  function routeButton(section,title,stepNumber=null){
    // Advanced workflow steps retain numbered action pills, but are real
    // anchors whose destinations are revalidated against the internal allowlist.
    if(!GUIDE_SECTIONS.includes(section))return;
    const trusted=trustedGuideLink('#'+section);
    if(!trusted)return;
    const row=document.createElement('div');
    row.className='guide-actions';
    const anchor=document.createElement('a');
    anchor.className='guide-action guide-workflow-link';
    anchor.href=trusted.href;
    anchor.dataset.guideDestination=trusted.href;
    if(stepNumber){
      const badge=document.createElement('span');
      badge.className='guide-step-badge';
      badge.textContent='Step '+stepNumber;
      anchor.append(badge);
    }
    const label=document.createElement('span');
    label.className='guide-action-label';
    label.textContent='Open '+String(title||trusted.label).slice(0,75)+' →';
    anchor.append(label);
    row.append(anchor);
    messages.append(row);
    messages.scrollTop=messages.scrollHeight;
  }
  function renderGuideLinks(result,question){
    // Never trust model-generated destinations. Resolve every link from the
    // local allowlist; render a unique set of real same-app anchors.
    const links=guideNavigationLinks(result,question);
    if(!links.length)return;
    if(result.type==='workflow'&&Array.isArray(result.actions)){
      // Preserve the newer advanced-workflow step badges without duplicating
      // the same navigation links in another row.
      links.forEach((link,i)=>{
        const step=result.actions.find(action=>'#'+action?.section===link.href);
        routeButton(link.href.slice(1),step?.title||link.label,i+1);
      });
      return;
    }
    const row=document.createElement('nav');
    row.className='guide-actions guide-direct-links';
    row.setAttribute('aria-label','Open relevant Cerium pages');
    for(const link of links){
      const trusted=trustedGuideLink(link.href);
      if(!trusted)continue;
      const anchor=document.createElement('a');
      anchor.className='guide-action guide-page-link';
      anchor.href=trusted.href;
      anchor.dataset.guideDestination=trusted.href;
      anchor.textContent='Open '+trusted.label+' →';
      row.append(anchor);
    }
    if(row.children.length)messages.append(row);
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
    if(typeof result.workflow==='string'&&result.workflow){
      const flow=document.createElement('div');
      flow.className='guide-business-workflow';
      const heading=document.createElement('strong');
      heading.textContent='Typical workflow';
      const body=document.createElement('span');
      body.textContent=result.workflow.slice(0,200);
      flow.append(heading,body);
      container.append(flow);
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
      (/^(?:mostly|mainly|primarily|retail|wholesale|bulk|walk[ -]?in|tailor\w*|custom|both|b2b|b2c|we (?:mostly|mainly)|i (?:mostly|mainly))\b/i.test(clean)||
      /\b(?:mostly|mainly|primarily)\s+(?:wholesale|retail|bulk|tailoring|walk[ -]?in|custom)\b/i.test(clean));
    const wantRecommendations=awaitingBusinessDescription||isRefinement||isToolRecommendationRequest(clean);
    const businessDescription=isRefinement?(lastBusinessDescription+'; '+clean).slice(0,600):clean;
    pending=true;
    input.disabled=true;
    send.disabled=true;
    suggestions.hidden=true;
    bubble(clean,'user');
    const progress=bubble('Thinking…');
    progress.classList.add('guide-thinking');
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
      progress.classList.remove('guide-thinking');
      progress.textContent=safe.reply.slice(0,850);
      if(safe.steps&&(/^(?:how\b|show me how|walk me through|what are the steps)/i.test(clean)||workflow)&&
        !safe.reply.includes('→')){
        const steps=document.createElement('span');
        steps.className='guide-steps';
        steps.textContent=safe.steps.slice(0,350);
        progress.append(steps);
      }
      awaitingBusinessDescription=recommendation&&safe.needsMoreInfo===true;
      if(recommendation&&!safe.needsMoreInfo)lastBusinessDescription=businessDescription;
      if(recommendation)renderToolRecommendations(safe);
      if(workflow)lastSection=null;
      renderGuideLinks(safe,clean);
      if(GUIDE_SECTIONS.includes(safe.section))lastSection=safe.section;
      updateSuggestions(getSection?.());
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
    const anchor=event.target.closest('a[data-guide-destination]');
    const destination=trustedGuideLink(anchor?.getAttribute('href'));
    if(!destination)return;
    closeGuide();
    if(location.hash===destination.href){
      event.preventDefault();
      document.getElementById('workspace-main')?.focus({preventScroll:true});
    }
  });
  shell.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!panel.hidden){event.preventDefault();closeGuide();}
  });
  window.addEventListener('hashchange',()=>updateSuggestions(getSection?.()));
}
