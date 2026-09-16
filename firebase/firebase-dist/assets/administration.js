export const administrationEmails = ['tspillersfadap@gmail.com', 'peggerfadap@gmail.com', 'arouttenfadap@gmail.com', 'spietzfadap@gmail.com'];
export const administrationTypes = ['RSP', 'Union Meetings', 'Company Meetings'];
export const canLogAdministration = email => administrationEmails.includes(String(email || '').trim().toLowerCase());
export function administrationDuration({mode, hours, minutes, start, end, overnight}) {
  if (mode === 'total') {
    const h = Number(hours), m = Number(minutes);
    return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && m >= 0 && m < 60 && h * 60 + m <= 1440 ? (h * 60 + m) * 60 : 0;
  }
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
  const parse = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const duration = parse(end) - parse(start) + (overnight ? 1440 : 0);
  return duration > 0 && duration <= 1440 ? duration * 60 : 0;
}
export function createAdministrationForm(React, jsx, centralDateTime, currentCentralInput) {
  const {jsx: el, jsxs: els} = jsx;
  return function AdministrationForm({initial, onSave, busy, backRef}) {
    const [type, setType] = React.useState(initial?.detail || '');
    React.useEffect(() => {
      if (backRef) backRef.current = type ? () => setType('') : null;
      return () => {if (backRef) backRef.current = null;};
    }, [type, backRef]);
    const [date, setDate] = React.useState(initial?.administrationDate || (initial?.startedAt ? new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(initial.startedAt)) : currentCentralInput().date));
    const [mode, setMode] = React.useState(initial?.timeEntryMode || 'total');
    const [hours, setHours] = React.useState(Math.floor((initial?.duration || 0) / 3600));
    const [minutes, setMinutes] = React.useState(Math.floor((initial?.duration || 0) % 3600 / 60));
    const [start, setStart] = React.useState(initial?.administrationStart || '');
    const [end, setEnd] = React.useState(initial?.administrationEnd || '');
    const [overnight, setOvernight] = React.useState(initial?.administrationOvernight || false);
    const [notes, setNotes] = React.useState(initial?.comment || '');
    const duration = administrationDuration({mode,hours,minutes,start,end,overnight});
    const field = (label, props) => els('label', {className:'administration-field',children:[el('span',{children:label}),el('input',{className:'comment-input',...props})]});
    if (!type) return els('div', {className:'administration-form',children:[
      el('p',{className:'administration-info',children:'Choose an Administration subcategory.'}),
      el('div',{className:'detail-options',children:administrationTypes.map(value=>
        els('button',{type:'button',onClick:()=>setType(value),children:[value,el('span',{'aria-hidden':true,children:'›'})]},value))}),
    ]});
    return els('form', {className:'administration-form',onSubmit:async event=>{
      event.preventDefault();
      if (!administrationTypes.includes(type) || !date || !duration || busy) return;
      const [h,m] = (mode === 'range' ? start : '12:00').split(':').map(Number);
      await onSave({id:initial?.id || crypto.randomUUID(),activity:'Administration',detail:type,
        startedAt:centralDateTime(date,h,m),duration,comment:notes.trim().slice(0,500),
        administrationDate:date,timeEntryMode:mode,administrationStart:mode==='range'?start:'',
        administrationEnd:mode==='range'?end:'',administrationOvernight:mode==='range'&&overnight});
    },children:[
      el('p',{className:'administration-info',children:'Hours tracked separately from paid and volunteer hours.'}),
      els('div',{className:'administration-subcategory',children:[
        el('h3',{children:type}),
        el('button',{type:'button',className:'close-button',onClick:()=>setType(''),children:'Change subcategory'}),
      ]}),
      field('Date',{type:'date',required:true,value:date,onChange:e=>setDate(e.target.value)}),
      els('div',{className:'administration-modes',children:['total','range'].map(value=>el('button',{type:'button','aria-pressed':mode===value,onClick:()=>setMode(value),children:value==='total'?'Total time':'Start / end time'},value))}),
      mode==='total'?els('div',{className:'administration-times',children:[field('Hours',{type:'number',min:0,max:24,step:1,required:true,value:hours,onChange:e=>setHours(e.target.value)}),field('Minutes',{type:'number',min:0,max:59,step:1,required:true,value:minutes,onChange:e=>setMinutes(e.target.value)})]}):els('div',{children:[
        els('div',{className:'administration-times',children:[field('Start (Central)',{type:'time',required:true,value:start,onChange:e=>setStart(e.target.value)}),field('End (Central)',{type:'time',required:true,value:end,onChange:e=>setEnd(e.target.value)})]}),
        els('label',{className:'administration-overnight',children:[el('input',{type:'checkbox',checked:overnight,onChange:e=>setOvernight(e.target.checked)}),' Ends the following day']}),
        el('p',{role:'status',children:duration?`Total: ${Math.floor(duration/3600)} hr ${duration%3600/60} min`:'Enter an end time after the start time.'})]}),
      els('label',{className:'administration-field',children:[el('span',{children:'Notes'}),el('textarea',{className:'comment-input',rows:4,maxLength:500,value:notes,onChange:e=>setNotes(e.target.value)})]}),
      el('button',{type:'submit',className:'save-button administration-save-button',disabled:busy||!type||!date||!duration,children:busy?'Saving…':'Save Administration hours'})]});
  };
}
