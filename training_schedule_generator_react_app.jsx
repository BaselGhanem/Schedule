import React, { useState, useEffect } from 'react';
import { addDays, format, parseISO, isEqual, isBefore, isAfter, addHours, setHours, setMinutes } from 'date-fns';

export default function TrainingScheduleApp(){
  const weekdays = [
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
  ];

  const [courseName, setCourseName] = useState('');
  const [traineeName, setTraineeName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [totalHours, setTotalHours] = useState(20);
  const [selectedWeekdays, setSelectedWeekdays] = useState([1,3]);
  const [excludedDates, setExcludedDates] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [defaultStartTime, setDefaultStartTime] = useState('09:00');

  useEffect(()=>{
    // regenerate when core inputs change
    if(!startDate || selectedWeekdays.length===0) return;
    generateSchedule();
  }, [startDate, hoursPerDay, totalHours, selectedWeekdays, excludedDates]);

  function toggleWeekday(day){
    setSelectedWeekdays(prev=> prev.includes(day) ? prev.filter(x=>x!==day) : [...prev, day].sort());
  }

  function addExcludedDate(date){
    if(!date) return;
    if(!excludedDates.includes(date)) setExcludedDates(prev=>[...prev, date].sort());
  }

  function removeExcludedDate(date){
    setExcludedDates(prev=>prev.filter(d=>d!==date));
  }

  function generateSchedule(){
    const start = parseISO(startDate);
    const sessionsList = [];
    let hoursRemaining = Number(totalHours);
    let cursor = start;
    let sessionNumber = 1;

    // Keep generating until hoursRemaining <= 0
    while(hoursRemaining > 0){
      const dayOfWeek = cursor.getDay();
      const cursorStr = format(cursor, 'yyyy-MM-dd');

      const weekdayAllowed = selectedWeekdays.includes(dayOfWeek);
      const excluded = excludedDates.includes(cursorStr);

      if(weekdayAllowed && !excluded){
        const plannedHours = Math.min(hoursPerDay, hoursRemaining);
        const [h, m] = defaultStartTime.split(':').map(Number);
        const startTime = setMinutes(setHours(cursor, h), m);
        const endTime = addHours(startTime, plannedHours);

        sessionsList.push({
          id: sessionNumber,
          sessionNumber,
          date: cursorStr,
          startTime: format(startTime, 'HH:mm'),
          endTime: format(endTime, 'HH:mm'),
          hours: plannedHours,
        });

        hoursRemaining -= plannedHours;
        sessionNumber++;
      }

      cursor = addDays(cursor, 1);

      // safety guard to avoid infinite loops
      if(sessionNumber>5000) break;
    }

    // compute remaining hours per session row
    let cumulative = 0;
    const withRemaining = sessionsList.map(s=>{
      cumulative += s.hours;
      return {...s, remaining: Math.max(0, totalHours - cumulative)};
    });

    setSessions(withRemaining);
  }

  function updateSession(id, field, value){
    setSessions(prev=>{
      const copy = prev.map(s=> s.id===id ? {...s, [field]: field==='hours' ? Number(value) : value } : s);

      // Recompute cumulative remaining based on edited hours, but keep totalHours as fixed target.
      let cumulative = 0;
      const recomputed = copy.map(s=>{ cumulative += s.hours; return {...s, remaining: Math.max(0, totalHours - cumulative)}; });

      return recomputed;
    });
  }

  function addSessionAbove(id){
    setSessions(prev=>{
      const idx = prev.findIndex(s=>s.id===id);
      const newId = Math.max(...prev.map(s=>s.id))+1;
      const newRow = { id:newId, sessionNumber: newId, date: prev[idx].date, startTime: prev[idx].startTime, endTime: prev[idx].endTime, hours: 0, remaining:0 };
      const newArr = [...prev.slice(0, idx), newRow, ...prev.slice(idx)];

      // renumber sessionNumber
      return newArr.map((r,i)=>({...r, sessionNumber: i+1, id: i+1}));
    });
  }

  function removeSession(id){
    setSessions(prev=>{
      const newArr = prev.filter(s=>s.id!==id).map((r,i)=>({...r, sessionNumber: i+1, id: i+1}));
      // recompute remaining
      let cum=0;
      return newArr.map(r=>{ cum += r.hours; return {...r, remaining: Math.max(0, totalHours - cum)}; });
    });
  }

  // Exports
  async function exportExcel(){
    // Uses SheetJS (xlsx) and FileSaver in the project.
    const wsData = [
      ['Course Name', courseName],
      ['Trainee Name', traineeName],
      ['Generated On', format(new Date(), 'yyyy-MM-dd HH:mm')],
      [],
      ['Session No', 'Date', 'Start Time', 'End Time', 'Hours', 'Remaining']
    ];
    sessions.forEach(s=> wsData.push([s.sessionNumber, s.date, s.startTime, s.endTime, s.hours, s.remaining]));

    const XLSX = window.XLSX;
    if(!XLSX) return alert('XLSX library not found. Please install xlsx to enable Excel export.');

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    XLSX.writeFile(wb, `${courseName || 'Course'} - ${traineeName || 'Trainee'} - Schedule.xlsx`);
  }

  async function exportPDF(){
    // Uses html2canvas + jsPDF approach. Renders the schedule area.
    const html2canvas = window.html2canvas;
    const jsPDF = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : window.jsPDF;
    if(!html2canvas || !jsPDF) return alert('PDF libraries not found. Include html2canvas and jsPDF.');

    const node = document.getElementById('schedule-print-area');
    const canvas = await html2canvas(node, { scale:2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p','mm','a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgProps = pdf.getImageProperties(imgData);
    const imgWidth = pageWidth - 20;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save(`${courseName || 'Course'} - ${traineeName || 'Trainee'} - Schedule.pdf`);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto bg-white shadow rounded-lg p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Training Schedule Generator</h1>
          <p className="text-sm text-gray-600">Create and export a professional training schedule quickly.</p>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1 space-y-4">
            <div>
              <label className="block text-sm">Course Name</label>
              <input className="mt-1 w-full border rounded p-2" value={courseName} onChange={e=>setCourseName(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm">Trainee Name</label>
              <input className="mt-1 w-full border rounded p-2" value={traineeName} onChange={e=>setTraineeName(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm">Start Date</label>
              <input type="date" className="mt-1 w-full border rounded p-2" value={startDate} onChange={e=>setStartDate(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm">Default Start Time</label>
              <input type="time" className="mt-1 w-full border rounded p-2" value={defaultStartTime} onChange={e=>setDefaultStartTime(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm">Hours per Day</label>
              <input type="number" min="0.25" step="0.25" className="mt-1 w-full border rounded p-2" value={hoursPerDay} onChange={e=>setHoursPerDay(Number(e.target.value))} />
            </div>

            <div>
              <label className="block text-sm">Total Course Hours</label>
              <input type="number" min="1" className="mt-1 w-full border rounded p-2" value={totalHours} onChange={e=>setTotalHours(Number(e.target.value))} />
            </div>

            <div>
              <label className="block text-sm">Select Weekdays</label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {weekdays.map(w=> (
                  <button key={w.value} onClick={()=>toggleWeekday(w.value)} className={`px-3 py-1 rounded border ${selectedWeekdays.includes(w.value) ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm">Excluded Dates</label>
              <div className="flex gap-2 mt-2">
                <input type="date" id="excluded-input" className="border rounded p-2" />
                <button className="px-3 py-2 bg-gray-100 border rounded" onClick={()=>{
                  const el = document.getElementById('excluded-input');
                  if(el && el.value) addExcludedDate(el.value);
                }}>Add</button>
              </div>
              <div className="mt-2 space-y-1">
                {excludedDates.map(d=> (
                  <div key={d} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <div className="text-sm">{d}</div>
                    <button className="text-sm text-red-500" onClick={()=>removeExcludedDate(d)}>Remove</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={generateSchedule}>Regenerate</button>
              <button className="px-4 py-2 bg-white border rounded" onClick={()=>{ navigator.clipboard.writeText(JSON.stringify({courseName,traineeName,startDate,hoursPerDay,totalHours,selectedWeekdays,excludedDates})); alert('Inputs copied to clipboard'); }}>Copy Inputs</button>
            </div>
          </div>

          <div className="col-span-2">
            <div id="schedule-print-area">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-lg font-medium">{courseName || 'Course Name'}</div>
                  <div className="text-sm text-gray-600">{traineeName || 'Trainee Name'}</div>
                </div>
                <div className="text-sm text-gray-500">Generated: {format(new Date(), 'yyyy-MM-dd')}</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-left">
                      <th className="p-2 border">#</th>
                      <th className="p-2 border">Date</th>
                      <th className="p-2 border">Start</th>
                      <th className="p-2 border">End</th>
                      <th className="p-2 border">Hours</th>
                      <th className="p-2 border">Remaining</th>
                      <th className="p-2 border">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s=> (
                      <tr key={s.id} className="odd:bg-white even:bg-gray-50">
                        <td className="p-2 border">{s.sessionNumber}</td>
                        <td className="p-2 border">
                          <input type="date" className="p-1 border rounded" value={s.date} onChange={e=>updateSession(s.id, 'date', e.target.value)} />
                        </td>
                        <td className="p-2 border">
                          <input type="time" className="p-1 border rounded" value={s.startTime} onChange={e=>updateSession(s.id, 'startTime', e.target.value)} />
                        </td>
                        <td className="p-2 border">
                          <input type="time" className="p-1 border rounded" value={s.endTime} onChange={e=>updateSession(s.id, 'endTime', e.target.value)} />
                        </td>
                        <td className="p-2 border">
                          <input type="number" min="0" step="0.25" className="p-1 border rounded w-20" value={s.hours} onChange={e=>updateSession(s.id, 'hours', e.target.value)} />
                        </td>
                        <td className="p-2 border">{s.remaining}</td>
                        <td className="p-2 border">
                          <div className="flex gap-2">
                            <button className="px-2 py-1 border rounded" onClick={()=>addSessionAbove(s.id)}>Add Above</button>
                            <button className="px-2 py-1 border rounded text-red-600" onClick={()=>removeSession(s.id)}>Remove</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>

            <div className="flex gap-2 mt-4">
              <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={exportExcel}>Export Excel</button>
              <button className="px-4 py-2 bg-teal-600 text-white rounded" onClick={exportPDF}>Export PDF</button>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}

/*
Notes for developers:
1. Install dependencies: date-fns, xlsx, file-saver, html2canvas, jspdf.
2. Example npm install: npm install date-fns xlsx file-saver html2canvas jspdf
3. Include Tailwind CSS in the project for styles, or adapt to your preferred styling.
4. The code relies on window.XLSX, window.html2canvas, and window.jspdf if you prefer CDN usage. Alternatively import libraries directly.
5. The schedule generation respects selected weekdays and excluded dates. It generates sessions until the required total hours are reached.
6. Editing a session updates cumulative remaining values while keeping the total target fixed.
*/
