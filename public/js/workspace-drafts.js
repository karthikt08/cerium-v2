// Drafts exist only in this page's memory. No customer data enters browser storage.
// Dialog editors live outside the feature panel and remain mounted during navigation.
const keyFor=element=>element.id?'#'+element.id:element.name&&element.form?.getAttribute('id')?'#'+element.form.getAttribute('id')+' [name="'+element.name+'"]':
  [...element.attributes].find(a=>a.name.startsWith('data-marketing-'))?.name;
export function createWorkspaceDrafts(root,getSection){
  const drafts=new Map();
  const track=event=>{
    const el=event.target;if(!el.matches('input,textarea,select')||el.closest('dialog')||el.type==='password'||el.type==='file'||el.type==='hidden'||el.disabled||el.readOnly)return;
    const key=keyFor(el);if(!key)return;
    const section=getSection();if(!drafts.has(section))drafts.set(section,new Map());
    if(el.form?.matches('[data-operation-form]')){const identity=el.form.elements.id;drafts.get(section).set(keyFor(identity),{value:identity.value,type:'hidden'});}
    drafts.get(section).set(key,{value:el.value,checked:el.checked,type:el.type});
  };
  root.addEventListener('input',track);root.addEventListener('change',track);
  return {
    restore(section){
      for(const [key,saved] of drafts.get(section)||[]){
        const el=root.querySelector(key.startsWith('data-')?'['+key+']':key);
        if(!el||el.disabled||el.readOnly)continue;
        if(saved.type==='checkbox'||saved.type==='radio')el.checked=saved.checked;
        else if(el.tagName!=='SELECT'||[...el.options].some(o=>o.value===saved.value&&!o.disabled))el.value=saved.value;
      }
    },
    clear(section){drafts.delete(section);},
    clearAll(){drafts.clear();}
  };
}
