// Shared field metadata; the server independently validates all writes.
export const OPERATION_FIELDS=Object.freeze({
  availability:{label:'Crew availability',fields:[['workerId','Crew member','crew',true],['startAt','From (business local)','datetime-local',true],['endAt','Until (business local)','datetime-local',true],['type','Availability','Available|Unavailable',true],['notes','Notes','textarea']]},
  timesheets:{label:'Attendance & timesheets',fields:[['workerId','Crew member','crew',true],['jobId','Job (optional)','job'],['startAt','Clock in (business local)','datetime-local',true],['endAt','Clock out (blank while working)','datetime-local'],['breakMinutes','Break minutes','number'],['notes','Work notes','textarea']]},
  templates:{label:'Reminder templates',fields:[['name','Template name','text',true],['subject','Email subject','text',true],['body','Message · {customer}, {invoice}, {amount}, {dueDate}','textarea',true]]},
  expenses:{label:'Expenses',fields:[['description','Description','text',true],['date','Expense date','date',true],['amount','Amount','number',true],['currency','Currency','text',true],['reference','Receipt / reference','text'],['notes','Notes','textarea']]},
  inventory:{label:'Inventory',fields:[['name','Item name','text',true],['sku','SKU','text',true],['quantity','Quantity','number',true],['unit','Unit','text'],['notes','Notes','textarea']]},
});
