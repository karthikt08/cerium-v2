// Cerium Copilot MVP: local business snapshots plus existing read-only navigation.
import {GUIDE_SECTIONS,pickGuide} from './guide-knowledge.js';
import {guideNavigationLinks,trustedGuideLink} from './guide-links.js';
import {workspaceDestination,workspacePathLabel} from './workspace-registry.js';
import {WORKSPACE_MODULES} from './industry-workspaces.js';
import {isToolRecommendationRequest,recommendBusinessTools} from './business-tool-advisor.js';
import {conversationReply,workflowReply,conciseGuideResponse,unknownGuideResponse,resolveGuideQuestion,verifiedGuideTask} from './guide-dialogue.js';
import {guideReplyBlocks,typeGuideReply} from './guide-response.js';

const SECTION_NAMES=Object.fromEntries(GUIDE_SECTIONS.map(section=>[section,workspacePathLabel(workspaceDestination(section))]));

const COPILOT_PROMPTS = {
  invoices: [{prompt:'Which invoices are overdue?',label:'Overdue invoices'}],
  leads: [{prompt:'Which leads have stalled?',label:'Older open leads'}],
  followups: [{prompt:'Which customers need follow-ups?',label:'Follow-ups due'}],
  jobs: [{prompt:'What should I focus on today?',label:'Today\'s priorities'}],
  payments: [{prompt:'Which invoices are overdue?',label:'Overdue invoices'}],
  insights: [{prompt:'How is my business performing this month?',label:'Monthly activity'}]
};

const CONTEXT_SUGGESTIONS = {
  overview: [
    { prompt: "What should I focus on today?", label: "Today's priorities" },
    { prompt: "Which invoices are overdue?", label: "Overdue invoices" },
    { prompt: "Which customers need follow-ups?", label: "Follow-ups due" },
    { prompt: "Which leads have stalled?", label: "Older open leads" },
    { prompt: "How is my business performing this month?", label: "Monthly activity" },
    { prompt: "Suggest three ways to improve my sales follow-up process", label: "Improve sales process" },
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
    { prompt: "How do I schedule a job and invoice it?", label: "Schedule & invoice" },
    { prompt: "How do I request customer reviews after completing a job?", label: "Review loop" }
  ],
  leads: [
    { prompt: "How do I upload an Excel or CSV spreadsheet?", label: "Import contacts" },
    { prompt: "How do I turn a lead into an invoice?", label: "Lead to payment" },
    { prompt: "How do I bulk import leads and schedule appointments?", label: "Import & dispatch" }
  ],
  marketing: [
    { prompt: "Where can I draft a social media post?", label: "Create a post" },
    { prompt: "Where can I re-book past customers?", label: "Re-book customers" },
    { prompt: "Show marketing performance and lead sources", label: "Lead sources" },
    { prompt: "How do I request customer reviews after completing a job?", label: "Ask for reviews" }
  ],
  payments: [
    { prompt: "How do I reconcile bank deposits with invoices?", label: "Match deposit" },
    { prompt: "What if the amount does not match?", label: "Partial payments" },
    { prompt: "What if a deposit was linked to the wrong invoice?", label: "Undo match" },
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
    '<span class="guide-mark" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/></svg></span><span>Cerium Copilot</span></button>'+
    '<section class="guide-panel" id="guide-panel" aria-label="Cerium Copilot" hidden>'+
      '<div class="guide-header">'+
        '<div class="guide-header-main">'+
          '<div class="guide-header-badge-row">'+
            '<span class="guide-eyebrow">CERIUM COPILOT</span>'+
            '<span class="guide-status-pill" aria-label="AI Status: Ready">'+
              '<span class="guide-status-dot" aria-hidden="true"></span>'+
              '<span class="guide-status-text">Ready</span>'+
            '</span>'+
            '<span class="guide-context-badge" id="guide-context-badge">Overview</span><span class="guide-model-badge" id="guide-model-badge">Local mode</span>'+
          '</div>'+
          '<h2>Cerium <span class="ac">Copilot<svg class="ul" viewBox="0 0 300 14" aria-hidden="true"><defs><linearGradient id="ug-copilot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3b5bff"/><stop offset=".55" stop-color="#7c3aed"/><stop offset="1" stop-color="#d946ef"/></linearGradient></defs><path pathLength="1" stroke="url(#ug-copilot)" d="M3 9C60 3 120 12 180 6s90 3 117 0"/></svg></span></h2>'+
        '</div>'+
        '<div class="guide-header-actions">'+
          '<button type="button" class="guide-header-btn guide-reset" id="guide-reset" aria-label="Start new conversation" title="Clear conversation">'+
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
              '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>'+
              '<path d="M21 3v5h-5"/>'+
              '<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>'+
              '<path d="M3 21v-5h5"/>'+
            '</svg>'+
          '</button>'+
          '<button type="button" class="guide-close" aria-label="Close assistant" id="guide-close">×</button>'+
        '</div>'+
      '</div>'+
      '<div class="guide-messages" id="guide-messages" role="log" aria-label="Conversation" aria-live="off"></div>'+
      '<div class="guide-announcer" id="guide-announcer" role="status" aria-live="polite" aria-atomic="true"></div>'+
      '<div class="guide-suggestions" id="guide-suggestions" aria-label="Suggested topics">'+
        '<div class="guide-suggestions-header">'+
          '<span class="guide-suggestions-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span>'+
          '<span>Suggested for <strong class="guide-section-name" id="guide-section-name">Overview</strong></span>'+
        '</div>'+
        '<div class="guide-suggestions-chips" id="guide-suggestions-chips">'+
          '<button type="button" data-guide-prompt="Which Cerium tools should I use for my business?">Recommend tools</button>'+
          '<button type="button" data-guide-prompt="How do I convert an accepted quote into a scheduled job and invoice?">Quote to invoice</button>'+
          '<button type="button" data-guide-prompt="How do I reconcile bank deposits with invoices?">Reconcile deposits</button>'+
          '<button type="button" data-guide-prompt="How do I prepare a GST tax invoice with line item rates?">GST tax invoice</button>'+
          '<button type="button" data-guide-prompt="How do I import an Excel spreadsheet?">Import Excel</button>'+
          '<button type="button" data-guide-prompt="What should I focus on today?">Daily priorities</button>'+
        '</div>'+
      '</div>'+
      '<div class="guide-footer-zone">'+
        '<div class="guide-response-controls" id="guide-response-controls" hidden><button type="button" id="guide-reveal">Show full answer</button></div>'+
        '<form class="guide-form" id="guide-form">'+
          '<input type="text" id="guide-question" aria-label="Ask a Cerium question" placeholder="Ask about your business or Cerium workflows…" autocomplete="off" maxlength="420" required>'+
          '<button type="submit" class="guide-send" id="guide-send" aria-label="Send question">Send</button>'+
        '</form>'+
        '<div class="guide-privacy">'+
          '<span class="guide-privacy-icon" aria-hidden="true"><svg class="guide-privacy-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>'+
          '<span>Business records stay in Cerium. A configured model may process your typed chat and permitted summary totals. Read-only.</span>'+
        '</div>'+
      '</div>'+
    '</section>';
  root.append(shell);
  const trigger=shell.querySelector('#guide-trigger');
  const panel=shell.querySelector('#guide-panel');
  const close=shell.querySelector('#guide-close');
  const resetBtn=shell.querySelector('#guide-reset');
  const messages=shell.querySelector('#guide-messages');
  const input=shell.querySelector('#guide-question');
  const send=shell.querySelector('#guide-send');
  const suggestions=shell.querySelector('#guide-suggestions');
  const chips=shell.querySelector('#guide-suggestions-chips');
  const contextBadge=shell.querySelector('#guide-context-badge');
  const sectionNameLabel=shell.querySelector('#guide-section-name');
  const announcer=shell.querySelector('#guide-announcer');
  const responseControls=shell.querySelector('#guide-response-controls');
  const reveal=shell.querySelector('#guide-reveal');
  const status=shell.querySelector('.guide-status-text');
  const modelBadge=shell.querySelector('#guide-model-badge');
  const known=new Map(WORKSPACE_MODULES.map(item=>[item.id,item]));
  let pending=false;
  let awaitingBusinessDescription=false;
  let lastBusinessDescription='';
  let lastSection=null;
  let lastQuestion=null;
  let modelHistory=[];
  let turn=0;
  let typing=null;
  let controller=null;
  let followBottom=true;

  function scrollToLatest(){if(followBottom)messages.scrollTop=messages.scrollHeight;}
  messages.addEventListener('scroll',()=>{followBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<44;});
  function setStatus(label){
    status.textContent=label;
    status.parentElement.setAttribute('aria-label','Assistant status: '+label);
  }

  function updateSuggestions(section){
    const sec=GUIDE_SECTIONS.includes(section)?section:'overview';
    const friendlyName=SECTION_NAMES[sec]||'Overview';
    if(contextBadge)contextBadge.textContent=friendlyName;
    if(sectionNameLabel)sectionNameLabel.textContent=friendlyName;
    const list=[...(COPILOT_PROMPTS[sec]||[]),...(CONTEXT_SUGGESTIONS[sec]||CONTEXT_SUGGESTIONS.overview)].slice(0,8);
    if(chips){
      chips.innerHTML='';
      for(const item of list){
        const btn=document.createElement('button');
        btn.type='button';
        btn.dataset.guidePrompt=item.prompt;
        btn.textContent=item.label;
        chips.append(btn);
      }
    }
  }

  async function refreshModelStatus(){
    try{
      const result=typeof api?.getCopilotStatus==='function'?await api.getCopilotStatus():null;
      modelBadge.textContent=result?.mode==='llm'?'LLM configured':'Local mode';
    }catch{modelBadge.textContent='Local mode';}
  }
  function openGuide(){
    panel.hidden=false;
    void refreshModelStatus();
    trigger.setAttribute('aria-expanded','true');
    updateSuggestions(getSection?.());
    input.focus();
  }
  function closeGuide(){
    panel.hidden=true;
    typing?.finish();
    trigger.setAttribute('aria-expanded','false');
    trigger.focus();
  }
  function createWelcomeCard(){
    messages.innerHTML='';
    const card=document.createElement('div');
    card.className='guide-welcome-card';
    card.id='guide-welcome-card';
    card.innerHTML=
      '<div class="guide-welcome-header">'+
        '<span class="guide-welcome-mark" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/></svg></span>'+
        '<div><strong>Cerium Copilot · Early access</strong>'+
        '<p class="guide-welcome-sub">Ask about business decisions and workflows. Live record summaries work even without an LLM.</p></div>'+
      '</div>'+
      '<div class="guide-welcome-features">'+
        '<span class="guide-welcome-pill"><svg class="guide-pill-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><span>Live business summaries</span></span>'+
        '<span class="guide-welcome-pill"><svg class="guide-pill-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>Guided workflows</span></span>'+
        '<span class="guide-welcome-pill"><svg class="guide-pill-svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>Private & read-only</span></span>'+
      '</div>';
    messages.append(card);
    scrollToLatest();
  }
  function resetGuide(){
    turn++;
    controller?.abort();
    typing=null;
    pending=false;
    send.disabled=false;
    responseControls.hidden=true;
    messages.setAttribute('aria-busy','false');
    announcer.textContent='New conversation started.';
    setStatus('Ready');
    followBottom=true;
    lastSection=null;
    lastQuestion=null;
    modelHistory=[];
    lastBusinessDescription='';
    awaitingBusinessDescription=false;
    createWelcomeCard();
    updateSuggestions(getSection?.());
    suggestions.hidden=false;
    input.value='';
    input.focus();
  }

  function bubble(text,kind='assistant'){
    const item=document.createElement('div');
    item.className='guide-bubble'+(kind==='user'?' user':'');
    item.textContent=String(text||'');
    messages.append(item);
    while(messages.children.length>24)messages.firstElementChild.remove();
    scrollToLatest();
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
    scrollToLatest();
  }
  function renderGuideLinks(result,question){
    // Never trust model-generated destinations. Resolve every link from the
    // local allowlist; render a unique set of real same-app anchors.
    const links=guideNavigationLinks(result,question);
    if(!links.length)return;
    if(result.type==='workflow'&&Array.isArray(result.actions)){
      // Group related multi-step or choice workflow steps inside an organized card
      const card=document.createElement('div');
      card.className='guide-workflow-card';
      const isChoice=/^Choose\b/i.test(result.steps||'');
      const header=document.createElement('div');
      header.className='guide-workflow-header';
      header.innerHTML='<span class="guide-plan-tag">'+(isChoice?'Available Options':'Recommended Sequence')+'</span>'+
        '<span class="guide-plan-count">'+links.length+' '+(isChoice?'options':'steps')+'</span>';
      card.append(header);

      const actionList=document.createElement('div');
      actionList.className='guide-actions guide-workflow-actions';

      links.forEach((link,i)=>{
        const step=result.actions.find(action=>trustedGuideLink('#'+action?.section)?.href===link.href);
        const sec=link.href.slice(1);
        if(!GUIDE_SECTIONS.includes(sec))return;
        const trusted=trustedGuideLink(link.href);
        if(!trusted)return;

        const anchor=document.createElement('a');
        anchor.className='guide-action guide-workflow-link';
        anchor.href=trusted.href;
        anchor.dataset.guideDestination=trusted.href;

        const badge=document.createElement('span');
        badge.className='guide-step-badge'+(isChoice?' guide-choice-badge':'');
        badge.textContent=isChoice?'Option '+(i+1):'Step '+(i+1);
        anchor.append(badge);

        const label=document.createElement('span');
        label.className='guide-action-label';
        label.textContent='Open '+String(step?.title||link.label||trusted.label).slice(0,75);
        anchor.append(label);

        const arrow=document.createElement('span');
        arrow.className='guide-action-arrow';
        arrow.setAttribute('aria-hidden','true');
        arrow.textContent='→';
        anchor.append(arrow);

        actionList.append(anchor);
      });
      card.append(actionList);
      messages.append(card);
      scrollToLatest();
      return;
    }
    const row=document.createElement('nav');
    row.className='guide-actions guide-direct-links';
    row.setAttribute('aria-label','Open relevant Cerium pages');
    const heading=document.createElement('span');
    heading.className='guide-links-heading';
    heading.textContent='GO STRAIGHT TO';
    row.append(heading);
    for(const link of links){
      const trusted=trustedGuideLink(link.href);
      if(!trusted)continue;
      const anchor=document.createElement('a');
      anchor.className='guide-action guide-page-link';
      anchor.href=trusted.href;
      anchor.dataset.guideDestination=trusted.href;
      const label=document.createElement('span');
      label.className='guide-action-label';
      label.textContent='Open '+trusted.label;
      const arrow=document.createElement('span');
      arrow.className='guide-action-arrow';
      arrow.setAttribute('aria-hidden','true');
      arrow.textContent='→';
      anchor.append(label,arrow);
      row.append(anchor);
    }
    if(row.querySelector('a'))messages.append(row);
    scrollToLatest();
  }
  function renderToolRecommendations(result){
    const items=Array.isArray(result.recommendations)?result.recommendations
      .filter(item=>item&&known.has(item.id)).slice(0,6):[];
    if(!items.length)return;
    const container=document.createElement('div');
    container.className='guide-recommendations';
    container.setAttribute('aria-label','Recommended Cerium tools');

    const recHeader=document.createElement('div');
    recHeader.className='guide-recommendations-header';
    recHeader.innerHTML='<span class="guide-rec-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg></span><span>Recommended Workspace Tools</span>';
    container.append(recHeader);

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
    scrollToLatest();
  }
  function localAnswer(question,section,recommendTools=false,businessDescription=question){
    question=resolveGuideQuestion(question,{lastQuestion});
    const conversational=conversationReply(question,{lastSection});
    if(conversational)return conversational;
    const precise=verifiedGuideTask(question);
    if(precise)return precise;
    const workflow=workflowReply(question);
    if(workflow)return workflow;
    if(recommendTools)return recommendBusinessTools({...getBusiness(),description:businessDescription});
    const match=pickGuide(question,section);
    return match.matched?conciseGuideResponse(question,match):unknownGuideResponse();
  }
  async function ask(question){
    const clean=String(question||'').trim().slice(0,420);
    if(!clean||pending)return;
    const current=GUIDE_SECTIONS.includes(getSection?.())?getSection():'overview';
    const isRefinement=Boolean(lastBusinessDescription)&&
      (/^(?:mostly|mainly|primarily|retail|wholesale|bulk|walk[ -]?in|tailor\w*|custom|both|b2b|b2c|we (?:mostly|mainly)|i (?:mostly|mainly))\b/i.test(clean)||
      /\b(?:mostly|mainly|primarily)\s+(?:wholesale|retail|bulk|tailoring|walk[ -]?in|custom)\b/i.test(clean));
    const wantRecommendations=awaitingBusinessDescription||isRefinement||isToolRecommendationRequest(clean);
    const businessDescription=isRefinement?(lastBusinessDescription+'; '+clean).slice(0,600):clean;
    const resolved=resolveGuideQuestion(clean,{lastQuestion});
    const thisTurn=++turn;
    controller=new AbortController();
    pending=true;
    send.disabled=true;
    followBottom=true;
    messages.setAttribute('aria-busy','true');
    announcer.textContent='Cerium Copilot is checking your question.';
    setStatus('Thinking');
    suggestions.hidden=true;
    const welcome=messages.querySelector('#guide-welcome-card');
    if(welcome)welcome.remove();
    bubble(clean,'user');
    const progress=bubble('Thinking…');
    progress.classList.add('guide-thinking');
    try{
      let result;
      try{
        result=typeof api?.askGuide==='function'
          ?await api.askGuide({question:clean,currentSection:current,lastSection,lastQuestion,history:modelHistory,recommendTools:wantRecommendations,businessDescription})
          :localAnswer(clean,current,wantRecommendations,businessDescription);
      }catch{
        if(thisTurn!==turn)return;
        result=localAnswer(clean,current,wantRecommendations,businessDescription);
      }
      if(thisTurn!==turn)return;
      const valid=result&&typeof result.reply==='string'&&result.reply.trim()&&(
        GUIDE_SECTIONS.includes(result.section)||
        (result.type==='tool_recommendations'&&Array.isArray(result.recommendations))||
        (result.type==='workflow'&&Array.isArray(result.actions)&&result.section===null)||
        (result.type==='conversation'&&result.section===null)||
        (result.type==='copilot'&&['copilot','llm'].includes(result.source)&&result.section===null&&Array.isArray(result.destinations))||
        (result.source==='navlm'&&result.matched===false&&result.section===null));
      if(!valid)result=localAnswer(clean,current,wantRecommendations,businessDescription);
      const recommendation=result.type==='tool_recommendations'&&Array.isArray(result.recommendations);
      const workflow=result.type==='workflow'&&Array.isArray(result.actions)&&result.section===null;
      // A deliberate NavLM abstention, or conversational reply, must never inherit
      // the previously opened section and display a bogus navigation button.
      const uncertain=result.source==='navlm'&&result.matched===false&&result.section===null;
      const conversational=result.type==='conversation'&&result.section===null;
      // Only model-generated conversation text is forwarded to the next model
      // call. Deterministic account answers can contain private customer names.
      if(result.source==='llm'){
        modelHistory.push({role:'user',content:clean},{role:'assistant',content:result.reply.slice(0,650)});
        modelHistory=modelHistory.slice(-8);
        modelBadge.textContent='LLM answer';
      }else{
        modelHistory=[];
        modelBadge.textContent='Local answer';
      }
      const safe=result;
      progress.classList.remove('guide-thinking');
      if(safe.reasoning){
        const thoughtBox=document.createElement('details');
        thoughtBox.className='guide-thought-box';
        thoughtBox.innerHTML='<summary class="guide-thought-summary">'+
          '<svg class="guide-thought-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8c0 3 2 5.5 4 7v3h8v-3c2-1.5 4-4 4-7a8 8 0 0 0-8-8z"/><path d="M10 22h4"/></svg>'+
          '<span>Reasoning process</span></summary>'+
          '<div class="guide-thought-body"></div>';
        thoughtBox.querySelector('.guide-thought-body').textContent=safe.reasoning;
        messages.insertBefore(thoughtBox, progress);
      }
      setStatus('Typing');
      responseControls.hidden=panel.hidden;
      const blocks=guideReplyBlocks({...safe,type:safe.type||'copilot'},clean);
      typing=typeGuideReply(progress,blocks,{
        signal:controller.signal,instant:panel.hidden,onUpdate:scrollToLatest
      });
      const completed=await typing.finished;
      if(!completed||thisTurn!==turn)return;
      typing=null;
      responseControls.hidden=true;
      announcer.textContent='Cerium: '+blocks.map(block=>block.items.join('\n')).join('\n').replace(/\*\*/g,'');
      awaitingBusinessDescription=recommendation&&safe.needsMoreInfo===true;
      if(recommendation&&!safe.needsMoreInfo)lastBusinessDescription=businessDescription;
      if(recommendation)renderToolRecommendations(safe);
      if(workflow||safe.type==='copilot')lastSection=null;
      renderGuideLinks(safe,resolved);
      if(GUIDE_SECTIONS.includes(safe.section))lastSection=safe.section;
      if(workflow||GUIDE_SECTIONS.includes(safe.section))lastQuestion=resolved;
      if(safe.type==='copilot'||recommendation||uncertain||['unknown','clarify'].includes(safe.kind)){
        lastSection=null;
        lastQuestion=null;
      }
      updateSuggestions(getSection?.());
      suggestions.hidden=!(conversational||uncertain||safe.needsMoreInfo);
    }finally{
      if(thisTurn===turn){
        pending=false;
        send.disabled=false;
        messages.setAttribute('aria-busy','false');
        setStatus('Ready');
        scrollToLatest();
        if(!panel.hidden&&(document.activeElement===reveal||document.activeElement===document.body))input.focus();
      }
    }
  }

  createWelcomeCard();
  trigger.addEventListener('click',()=>panel.hidden?openGuide():closeGuide());
  close.addEventListener('click',closeGuide);
  if(resetBtn)resetBtn.addEventListener('click',resetGuide);
  reveal.addEventListener('click',()=>typing?.finish());
  shell.querySelector('#guide-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(pending)return;
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
  window.addEventListener('cerium:navigation',()=>updateSuggestions(getSection?.()));
}
