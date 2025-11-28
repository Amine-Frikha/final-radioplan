import React, { useContext, useState, useMemo } from 'react';
import { AppContext } from '../App';
import { DayOfWeek, Period, SlotType } from '../types';
import { Activity, Plus, Settings, User, Wand2, ChevronLeft, ChevronRight, Calendar, LayoutGrid, AlertTriangle, Minimize2, Maximize2 } from 'lucide-react';
import { generateMonthSchedule, getDateForDayOfWeek, generateScheduleForWeek, detectConflicts } from '../services/scheduleService';

const Activities: React.FC = () => {
  const { 
    activityDefinitions, 
    addActivityDefinition, 
    doctors, 
    template,
    unavailabilities,
    shiftHistory,
    rcpTypes,
    manualOverrides,
    setManualOverrides,
    rcpAttendance,
    rcpExceptions
  } = useContext(AppContext);

  // Local Week State
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      d.setHours(0,0,0,0);
      return d;
  });

  // Local Schedule Generation
  const schedule = useMemo(() => {
      const generated = generateScheduleForWeek(
          currentWeekStart,
          template,
          unavailabilities,
          doctors,
          activityDefinitions,
          rcpTypes,
          true,
          shiftHistory,
          rcpAttendance,
          rcpExceptions
      );
      return generated.map(slot => {
          const overrideValue = manualOverrides[slot.id];
          if (overrideValue) {
             if (overrideValue === '__CLOSED__') {
                return { ...slot, assignedDoctorId: null, isLocked: true, isClosed: true };
             } else {
                return { ...slot, assignedDoctorId: overrideValue, isLocked: true };
             }
          }
          return slot;
      });
  }, [currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, shiftHistory, rcpAttendance, rcpExceptions, manualOverrides]);

  const conflicts = useMemo(() => {
      return detectConflicts(schedule, unavailabilities, doctors, activityDefinitions);
  }, [schedule, unavailabilities, doctors, activityDefinitions]);


  const [activeTabId, setActiveTabId] = useState<string>(activityDefinitions[0]?.id || "");
  const [showSettings, setShowSettings] = useState(false);
  const [newActName, setNewActName] = useState("");
  const [newActType, setNewActType] = useState<'HALF_DAY' | 'WEEKLY'>('HALF_DAY');
  const [viewMode, setViewMode] = useState<'WEEK' | 'MONTH'>('WEEK');
  
  // Weekly Assignment Mode Toggle (Auto vs Manual)
  const [weeklyAssignmentMode, setWeeklyAssignmentMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  
  // Length Controls
  const [choiceSectionExpanded, setChoiceSectionExpanded] = useState(true);
  const [statsSectionExpanded, setStatsSectionExpanded] = useState(true);

  const days = Object.values(DayOfWeek);
  const currentActivity = activityDefinitions.find(a => a.id === activeTabId);

  // Month Generation Logic
  const monthSchedule = useMemo(() => {
      if (viewMode === 'WEEK') return [];
      const startOfMonth = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), 1);
      // Adjust to start on a Monday for cleaner grid
      const day = startOfMonth.getDay();
      const diff = startOfMonth.getDate() - day + (day === 0 ? -6 : 1);
      const startOfGrid = new Date(startOfMonth);
      startOfGrid.setDate(diff);

      return generateMonthSchedule(
          startOfGrid,
          template,
          unavailabilities,
          doctors,
          activityDefinitions,
          rcpTypes,
          shiftHistory,
          {} 
      );
  }, [viewMode, currentWeekStart, template, unavailabilities, doctors, activityDefinitions, rcpTypes, shiftHistory]);

  // Activity Specific Conflicts
  const activityConflicts = useMemo(() => {
      // Find conflicts relevant to this activity's slots
      const actSlotIds = schedule.filter(s => s.activityId === activeTabId).map(s => s.id);
      return conflicts.filter(c => actSlotIds.includes(c.slotId));
  }, [conflicts, schedule, activeTabId]);

  const handleCreateActivity = (e: React.FormEvent) => {
      e.preventDefault();
      if(newActName.trim()) {
          addActivityDefinition({
              id: `act_${Date.now()}`,
              name: newActName,
              granularity: newActType,
              allowDoubleBooking: false,
              color: 'bg-gray-100 text-gray-800'
          });
          setNewActName("");
          setShowSettings(false);
      }
  }

  // Handle Manual Assignment with Persistence (Single Slot)
  const handleManualAssign = (slotId: string, doctorId: string) => {
      const newOverrides = { ...manualOverrides };
      
      if (doctorId === "") {
          // Revert to Auto (Delete override)
          delete newOverrides[slotId];
      } else {
          // Set Override
          newOverrides[slotId] = doctorId;
      }
      
      setManualOverrides(newOverrides);
  }

  // Handle Batch Assignment for Weekly Activity
  const handleWeeklyAssign = (doctorId: string) => {
      const weekSlots = schedule.filter(s => s.activityId === activeTabId);
      const newOverrides = { ...manualOverrides };
      
      weekSlots.forEach(s => {
          if (doctorId === "") {
              delete newOverrides[s.id];
          } else {
              newOverrides[s.id] = doctorId;
          }
      });
      
      setManualOverrides(newOverrides);
      if (doctorId !== "") {
          setWeeklyAssignmentMode('MANUAL');
      } else {
          setWeeklyAssignmentMode('AUTO');
      }
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedDate = new Date(e.target.value);
      const day = selectedDate.getDay();
      const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
      selectedDate.setDate(diff);
      selectedDate.setHours(0,0,0,0);
      setCurrentWeekStart(selectedDate);
  }

  const handleWeekChange = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentWeekStart);
    if (viewMode === 'WEEK') {
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setCurrentWeekStart(newDate);
  };

  const calculateStats = () => {
      const stats: Record<string, number> = {};
      const historyStats: Record<string, number> = {};

      doctors.forEach(d => {
          // Initialize with history
          const hCount = shiftHistory[d.id]?.[activeTabId] || 0;
          historyStats[d.id] = hCount;
          stats[d.id] = 0;
      });

      // Count CURRENT schedule slots
      const sourceSchedule = viewMode === 'WEEK' ? schedule : monthSchedule;
      sourceSchedule.forEach(s => {
          if (s.activityId === activeTabId && s.assignedDoctorId) {
              stats[s.assignedDoctorId] = (stats[s.assignedDoctorId] || 0) + 1;
          }
      });

      return { current: stats, history: historyStats };
  }
  const { current: currentStats, history: historyStats } = calculateStats();

  const renderSlot = (day: DayOfWeek, period: Period, weekDate?: Date) => {
      const dateStr = weekDate 
        ? weekDate.toISOString().split('T')[0] 
        : getDateForDayOfWeek(currentWeekStart, day);
      
      const sourceSchedule = viewMode === 'WEEK' ? schedule : monthSchedule;

      // Find the generated slot for this activity
      const slot = sourceSchedule.find(s => 
          s.date === dateStr && 
          s.period === period && 
          s.activityId === activeTabId
      );

      if (!slot) return <div className="text-xs text-slate-300 p-2">--</div>;

      const doc = doctors.find(d => d.id === slot.assignedDoctorId);

      // In month view, simplify display
      if (viewMode === 'MONTH') {
          return (
              <div className="text-[10px] p-1 bg-slate-50 border rounded truncate min-h-[1.5rem] flex items-center">
                  {doc ? (
                      <span className="font-bold text-slate-700">{doc.name}</span>
                  ) : <span className="text-slate-300">--</span>}
              </div>
          )
      }

      return (
          <div className={`p-2 rounded border h-full flex flex-col justify-center min-h-[60px] ${slot.isLocked ? 'border-blue-400 bg-blue-50' : 'border-dashed border-slate-300'}`}>
              <select 
                className={`w-full text-xs bg-transparent outline-none font-medium cursor-pointer ${slot.isLocked ? 'text-blue-800' : 'text-slate-700'}`}
                value={slot.isLocked ? slot.assignedDoctorId || "" : ""}
                onChange={(e) => handleManualAssign(slot.id, e.target.value)}
              >
                  <option value="">-- IA / Auto --</option>
                  {doctors.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
              </select>
              
              {/* If it's NOT locked, it's AI generated */}
              {!slot.isLocked && doc && (
                  <div className="mt-1 flex items-center justify-center">
                       <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded flex items-center shadow-sm">
                           <Wand2 className="w-3 h-3 mr-1" /> {doc.name}
                       </span>
                  </div>
              )}
          </div>
      )
  };

  const renderMonthGrid = () => {
      const startOfMonth = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), 1);
      const day = startOfMonth.getDay();
      const diff = startOfMonth.getDate() - day + (day === 0 ? -6 : 1);
      const startOfGrid = new Date(startOfMonth);
      startOfGrid.setDate(diff);

      const gridWeeks = [];
      let currentDay = new Date(startOfGrid);

      for(let w=0; w<5; w++) {
          const weekDays = [];
          for(let d=0; d<5; d++) { // Mon-Fri
             weekDays.push(new Date(currentDay));
             currentDay.setDate(currentDay.getDate() + 1);
          }
          currentDay.setDate(currentDay.getDate() + 2); // Skip Sat/Sun
          gridWeeks.push(weekDays);
      }

      return (
          <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2 font-bold text-center text-slate-600 mb-2">
                  {days.map(d => <div key={d}>{d}</div>)}
              </div>
              {gridWeeks.map((weekDays, i) => (
                  <div key={i} className="grid grid-cols-5 gap-2 border-b pb-4">
                      {weekDays.map(date => (
                          <div key={date.toISOString()} className="border rounded p-2 bg-white min-h-[100px] flex flex-col">
                               <div className="text-xs font-bold text-slate-400 mb-1 border-b border-slate-100 pb-1">{date.getDate()}</div>
                               <div className="flex-1 flex flex-col justify-center space-y-2">
                                   <div className="flex items-start text-[10px] text-slate-500">
                                       <span className="w-6 text-[9px] uppercase font-bold pt-1">Mat</span>
                                       <div className="flex-1 min-w-0">
                                          {renderSlot(DayOfWeek.MONDAY, Period.MORNING, date)} 
                                       </div>
                                   </div>
                                   <div className="flex items-start text-[10px] text-slate-500">
                                       <span className="w-6 text-[9px] uppercase font-bold pt-1">ApM</span>
                                       <div className="flex-1 min-w-0">
                                          {renderSlot(DayOfWeek.MONDAY, Period.AFTERNOON, date)}
                                       </div>
                                   </div>
                               </div>
                          </div>
                      ))}
                  </div>
              ))}
          </div>
      )
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <div>
             <h1 className="text-2xl font-bold text-slate-800 flex items-center">
                <Activity className="w-6 h-6 mr-3 text-orange-600" />
                Activités & Astreintes
            </h1>
        </div>
        
        <div className="flex items-center space-x-2">
            
            {/* View Toggle */}
            <div className="flex bg-slate-200 p-1 rounded-lg mr-4">
                <button 
                    onClick={() => setViewMode('WEEK')}
                    className={`px-3 py-1 text-xs font-bold rounded ${viewMode === 'WEEK' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                    Semaine
                </button>
                <button 
                    onClick={() => setViewMode('MONTH')}
                    className={`px-3 py-1 text-xs font-bold rounded ${viewMode === 'MONTH' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                >
                    Mois
                </button>
            </div>

            <div className="flex items-center bg-white rounded-lg shadow-sm border border-slate-200 p-1 mr-4">
                 <button onClick={() => handleWeekChange('prev')} className="p-1 hover:bg-slate-100 rounded">
                    <ChevronLeft className="w-5 h-5 text-slate-600" />
                </button>
                
                {viewMode === 'WEEK' ? (
                     <input 
                        type="date"
                        className="border-none text-slate-700 font-medium text-sm focus:ring-0 bg-transparent mx-2 w-32"
                        value={currentWeekStart.toISOString().split('T')[0]}
                        onChange={handleDateChange}
                    />
                ) : (
                    <span className="px-4 text-sm font-bold text-slate-700 capitalize w-32 text-center">
                        {currentWeekStart.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                )}

                <button onClick={() => handleWeekChange('next')} className="p-1 hover:bg-slate-100 rounded">
                    <ChevronRight className="w-5 h-5 text-slate-600" />
                </button>
            </div>

            <button 
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center px-3 py-2 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 text-sm font-medium"
            >
                <Settings className="w-4 h-4 mr-2" />
                Gérer
            </button>
        </div>
      </div>

      {showSettings && (
          <div className="bg-white p-4 rounded-lg shadow border border-slate-200 mb-4 animate-in fade-in slide-in-from-top-2">
              <h3 className="font-bold text-sm mb-3">Créer une nouvelle activité</h3>
              <form onSubmit={handleCreateActivity} className="flex gap-4 items-end">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Nom</label>
                      <input 
                        type="text" 
                        value={newActName}
                        onChange={e => setNewActName(e.target.value)}
                        className="border rounded px-2 py-1 text-sm" 
                        placeholder="Ex: Consult Douleur"
                        required
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Rythme</label>
                      <select 
                        value={newActType}
                        onChange={e => setNewActType(e.target.value as any)}
                        className="border rounded px-2 py-1 text-sm"
                      >
                          <option value="HALF_DAY">Demi-journée</option>
                          <option value="WEEKLY">Semaine entière</option>
                      </select>
                  </div>
                  <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-sm flex items-center">
                      <Plus className="w-4 h-4 mr-1" /> Ajouter
                  </button>
              </form>
          </div>
      )}

      {/* TABS */}
      <div className="flex space-x-2 border-b border-slate-200 pb-1 overflow-x-auto shrink-0">
          {activityDefinitions.map(act => (
              <button
                key={act.id}
                onClick={() => setActiveTabId(act.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-t border-l border-r whitespace-nowrap ${
                    activeTabId === act.id 
                    ? 'bg-white border-slate-300 text-blue-700 -mb-px' 
                    : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                  {act.name}
              </button>
          ))}
      </div>

      {/* CONTENT */}
      <div className="flex-1 bg-white border border-slate-300 rounded-b-lg p-4 shadow-sm overflow-auto min-h-0">
          {viewMode === 'MONTH' ? (
              renderMonthGrid()
          ) : currentActivity?.granularity === 'WEEKLY' ? (
               // Weekly Single Assign View
              <div className="flex flex-col items-center">
                   <div className="w-full flex justify-end mb-2">
                       <button onClick={() => setChoiceSectionExpanded(!choiceSectionExpanded)} className="text-slate-400 hover:text-slate-600">
                           {choiceSectionExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                       </button>
                   </div>
                   
                   {choiceSectionExpanded && (
                      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center max-w-md w-full transition-all">
                          
                          <div className="flex items-center space-x-4 mb-6 bg-white p-2 rounded-lg border border-slate-200">
                              <button 
                                onClick={() => setWeeklyAssignmentMode('AUTO')}
                                className={`px-4 py-2 text-sm font-bold rounded transition-colors ${weeklyAssignmentMode === 'AUTO' ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}
                              >
                                  <Wand2 className="w-4 h-4 inline-block mr-1" /> Auto / IA
                              </button>
                              <button 
                                onClick={() => setWeeklyAssignmentMode('MANUAL')}
                                className={`px-4 py-2 text-sm font-bold rounded transition-colors ${weeklyAssignmentMode === 'MANUAL' ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}
                              >
                                  <User className="w-4 h-4 inline-block mr-1" /> Manuel
                              </button>
                          </div>

                          <h3 className="text-lg font-bold text-slate-800 mb-4">Responsable de la Semaine</h3>
                          <div className="w-full">
                              {/* We use the first generated slot for this activity to control the logic */}
                              {(() => {
                                  const sampleSlot = schedule.find(s => s.activityId === activeTabId);
                                  if (!sampleSlot) return <div>Pas de créneau généré.</div>;

                                  return (
                                      <select 
                                            className={`w-full p-3 border rounded-lg text-lg text-center font-bold outline-none ring-2 ${sampleSlot.isLocked ? 'ring-blue-500 bg-white text-blue-800' : 'ring-transparent bg-slate-100 text-slate-500'}`}
                                            value={sampleSlot.isLocked ? sampleSlot.assignedDoctorId || "" : ""}
                                            onChange={(e) => handleWeeklyAssign(e.target.value)}
                                        >
                                            <option value="">-- {weeklyAssignmentMode === 'AUTO' ? 'Calcul Automatique' : 'Sélectionner'} --</option>
                                            {doctors.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                  )
                              })()}
                          </div>
                          
                          <div className="mt-4 text-sm text-slate-500 text-center">
                              {weeklyAssignmentMode === 'AUTO' ? (
                                  <p className="flex items-center justify-center text-green-600 font-medium">
                                      <Wand2 className="w-4 h-4 mr-1"/>
                                      L'algorithme choisit automatiquement en fonction de l'équité, excluant les absents et les personnes exclues de l'activité.
                                  </p>
                              ) : (
                                  <p className="text-blue-600">
                                      Vous avez la main. Cette affectation s'appliquera à toute la semaine et bloquera les choix auto.
                                  </p>
                              )}
                              
                              {(() => {
                                  const sampleSlot = schedule.find(s => s.activityId === activeTabId);
                                  if (sampleSlot && !sampleSlot.isLocked && sampleSlot.assignedDoctorId) {
                                      const doc = doctors.find(d => d.id === sampleSlot.assignedDoctorId);
                                      return (
                                          <div className="mt-2 text-slate-400 font-bold text-xs">
                                              (Actuellement assigné : {doc?.name})
                                          </div>
                                      )
                                  }
                              })()}
                          </div>
                          
                          {/* Explicit AUTO trigger */}
                          {weeklyAssignmentMode === 'AUTO' && (
                              <div className="mt-2">
                                  <button 
                                        onClick={() => handleWeeklyAssign("")} // Clear Overrides
                                        className="text-xs underline text-slate-400 hover:text-blue-600"
                                    >
                                        Forcer le recalcul Auto
                                    </button>
                              </div>
                          )}
                      </div>
                   )}
              </div>
          ) : (
              // Standard Weekly Grid
              <table className="w-full border-collapse table-fixed">
                  <thead>
                      <tr>
                          <th className="p-2 border bg-slate-100 text-xs font-bold text-slate-500 uppercase w-24">Période</th>
                          {days.map(d => (
                              <th key={d} className="p-2 border bg-slate-50 text-sm font-bold text-slate-700">
                                  {d}
                              </th>
                          ))}
                      </tr>
                  </thead>
                  <tbody>
                      <tr>
                          <td className="p-2 border bg-slate-50 text-xs font-bold text-center align-middle">Matin</td>
                          {days.map(d => (
                              <td key={`m-${d}`} className="p-2 border align-top h-auto">
                                  {renderSlot(d, Period.MORNING)}
                              </td>
                          ))}
                      </tr>
                      <tr>
                          <td className="p-2 border bg-slate-50 text-xs font-bold text-center align-middle">Après-midi</td>
                          {days.map(d => (
                              <td key={`am-${d}`} className="p-2 border align-top h-auto">
                                  {renderSlot(d, Period.AFTERNOON)}
                              </td>
                          ))}
                      </tr>
                  </tbody>
              </table>
          )}
      </div>

      {/* ALERTS & WARNINGS SECTION */}
      <div className="bg-red-50 rounded-lg border border-red-100 p-4 mt-4 shrink-0">
          <h3 className="font-bold text-red-800 mb-3 text-sm flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Alertes & Avertissements ({currentActivity?.name})
          </h3>
          <div className="space-y-2 max-h-32 overflow-y-auto">
              {activityConflicts.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Aucun problème détecté pour cette activité cette semaine.</p>
              ) : (
                  activityConflicts.map(conf => {
                      const doc = doctors.find(d => d.id === conf.doctorId);
                      const slot = schedule.find(s => s.id === conf.slotId);
                      return (
                          <div key={conf.id} className="flex items-start bg-white p-2 rounded border border-red-100 text-xs text-slate-700">
                               <span className="font-bold text-red-600 mr-2 uppercase text-[10px] bg-red-50 px-1 rounded">
                                   {conf.type}
                               </span>
                               <span>
                                   <span className="font-bold">{doc?.name}</span> : {conf.description} 
                                   <span className="text-slate-400 ml-1">({slot?.day} {slot?.period})</span>
                               </span>
                          </div>
                      )
                  })
              )}
          </div>
      </div>

      {/* STATS TABLE with History */}
      <div className="bg-white rounded-lg shadow border border-slate-200 p-4 mt-4 shrink-0 transition-all">
          <h3 className="font-bold text-slate-800 mb-3 text-sm flex items-center justify-between cursor-pointer" onClick={() => setStatsSectionExpanded(!statsSectionExpanded)}>
              <span className="flex items-center">
                  Équité & Répartition (Activité : {currentActivity?.name})
              </span>
              <div className="flex items-center space-x-2">
                 <span className="text-xs font-normal text-slate-500">Total = Historique (Mois Précédents) + Actuel</span>
                 {statsSectionExpanded ? <Minimize2 className="w-4 h-4 text-slate-400" /> : <Maximize2 className="w-4 h-4 text-slate-400" />}
              </div>
          </h3>
          
          {statsSectionExpanded && (
              <div className="overflow-x-auto max-h-48 transition-all">
                  <table className="min-w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b sticky top-0 z-10">
                          <tr>
                              <th className="p-2 font-bold text-slate-600">Médecin</th>
                              <th className="p-2 font-bold text-slate-500">Historique (Cumul)</th>
                              <th className="p-2 font-bold text-blue-600">{viewMode === 'WEEK' ? 'Semaine' : 'Mois'} Actuel</th>
                              <th className="p-2 font-bold text-slate-800">Total</th>
                          </tr>
                      </thead>
                      <tbody>
                          {doctors.filter(d => d.name !== 'Pr BELKACEMI').map(d => {
                              const hist = historyStats[d.id] || 0;
                              const curr = currentStats[d.id] || 0;
                              return (
                                <tr key={d.id} className="border-b hover:bg-slate-50">
                                    <td className="p-2 font-medium text-slate-700 flex items-center">
                                        <div className={`w-5 h-5 rounded-full mr-2 ${d.color} flex items-center justify-center text-[8px]`}>
                                            {d.name.substring(0,2)}
                                        </div>
                                        {d.name}
                                    </td>
                                    <td className="p-2 text-slate-500">
                                        {hist}
                                    </td>
                                    <td className="p-2 font-bold text-blue-600">
                                        {curr}
                                    </td>
                                    <td className="p-2 font-bold text-slate-800">
                                        {hist + curr}
                                    </td>
                                </tr>
                              )
                          })}
                      </tbody>
                  </table>
              </div>
          )}
      </div>

    </div>
  );
};

export default Activities;