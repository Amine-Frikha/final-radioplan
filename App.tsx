
import React, { useState, useMemo, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Planning from './pages/Planning';
import Profile from './pages/Profile';
import Configuration from './pages/Configuration';
import Activities from './pages/Activities';
import Sidebar from './components/Sidebar';
import { DEFAULT_TEMPLATE, INITIAL_DOCTORS, INITIAL_ACTIVITIES } from './constants';
import { ScheduleSlot, Unavailability, Conflict, Doctor, ScheduleTemplateSlot, ActivityDefinition, RcpDefinition, AppContextType, ShiftHistory, ManualOverrides, RcpAttendance, RcpException } from './types';
import { detectConflicts, generateScheduleForWeek } from './services/scheduleService';

export const AppContext = React.createContext<AppContextType>({} as AppContextType);

// Persistence Helpers
const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
    try {
        const stored = localStorage.getItem(key);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error(`Error loading ${key}`, e);
    }
    return defaultValue;
};

const App: React.FC = () => {
  // Global "Current Week" is removed in favor of local page state.
  const [currentReferenceDate] = useState<Date>(new Date()); 

  const [currentUser, setCurrentUser] = useState<Doctor | null>(null);
  
  // Persistent State
  const [doctors, setDoctors] = useState<Doctor[]>(() => loadFromStorage('radioplan_doctors', INITIAL_DOCTORS));
  const [template, setTemplate] = useState<ScheduleTemplateSlot[]>(() => loadFromStorage('radioplan_template', DEFAULT_TEMPLATE));
  const [postes, setPostes] = useState<string[]>(() => loadFromStorage('radioplan_postes', ['Box 1', 'Box 2', 'Box 3']));
  const [rcpTypes, setRcpTypes] = useState<RcpDefinition[]>(() => loadFromStorage('radioplan_rcpTypes', []));
  const [activityDefinitions, setActivityDefinitions] = useState<ActivityDefinition[]>(() => loadFromStorage('radioplan_activities', INITIAL_ACTIVITIES));
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>(() => loadFromStorage('radioplan_unavailabilities', [
      { 
        id: 'u1', 
        doctorId: 'd10', 
        startDate: new Date().toISOString().split('T')[0], 
        endDate: new Date(new Date().getTime() + 86400000 * 2).toISOString().split('T')[0],
        reason: 'CONGRES',
        period: 'ALL_DAY'
      } 
  ]));

  const [manualOverrides, setManualOverrides] = useState<ManualOverrides>(() => loadFromStorage('radioplan_overrides', {}));
  const [rcpAttendance, setRcpAttendance] = useState<RcpAttendance>(() => loadFromStorage('radioplan_rcpAttendance', {}));
  const [rcpExceptions, setRcpExceptions] = useState<RcpException[]>(() => loadFromStorage('radioplan_rcpExceptions', []));
  
  // Schedule state (computed)
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);

  // Mock History for Equity (Simulation of previous months)
  const [shiftHistory, setShiftHistory] = useState<ShiftHistory>(() => {
      const stored = localStorage.getItem('radioplan_shiftHistory');
      if (stored) return JSON.parse(stored);
      
      const hist: ShiftHistory = {};
      INITIAL_DOCTORS.forEach(d => {
          hist[d.id] = {
              'act_astreinte': Math.floor(Math.random() * 2),
              'act_unity': Math.floor(Math.random() * 2),
              'act_workflow': Math.floor(Math.random() * 1)
          };
      });
      return hist;
  });

  // --- PERSISTENCE EFFECTS ---
  useEffect(() => { localStorage.setItem('radioplan_doctors', JSON.stringify(doctors)); }, [doctors]);
  useEffect(() => { localStorage.setItem('radioplan_template', JSON.stringify(template)); }, [template]);
  useEffect(() => { localStorage.setItem('radioplan_postes', JSON.stringify(postes)); }, [postes]);
  useEffect(() => { localStorage.setItem('radioplan_rcpTypes', JSON.stringify(rcpTypes)); }, [rcpTypes]);
  useEffect(() => { localStorage.setItem('radioplan_activities', JSON.stringify(activityDefinitions)); }, [activityDefinitions]);
  useEffect(() => { localStorage.setItem('radioplan_unavailabilities', JSON.stringify(unavailabilities)); }, [unavailabilities]);
  useEffect(() => { localStorage.setItem('radioplan_overrides', JSON.stringify(manualOverrides)); }, [manualOverrides]);
  useEffect(() => { localStorage.setItem('radioplan_rcpAttendance', JSON.stringify(rcpAttendance)); }, [rcpAttendance]);
  useEffect(() => { localStorage.setItem('radioplan_rcpExceptions', JSON.stringify(rcpExceptions)); }, [rcpExceptions]);
  useEffect(() => { localStorage.setItem('radioplan_shiftHistory', JSON.stringify(shiftHistory)); }, [shiftHistory]);

  // Generate schedule automatically and APPLY OVERRIDES (For global context consumption if any)
  useEffect(() => {
    const generated = generateScheduleForWeek(
        currentReferenceDate, 
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

    const finalSchedule = generated.map(slot => {
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

    setSchedule(finalSchedule);
  }, [currentReferenceDate, template, unavailabilities, doctors, activityDefinitions, rcpTypes, shiftHistory, manualOverrides, rcpAttendance, rcpExceptions]);

  // Real-time conflict detection
  const conflicts = useMemo(() => {
    return detectConflicts(schedule, unavailabilities, doctors, activityDefinitions);
  }, [schedule, unavailabilities, doctors, activityDefinitions]);

  const updateSchedule = (newSchedule: ScheduleSlot[]) => {
    setSchedule(newSchedule);
  };

  const updateTemplate = (newTemplate: ScheduleTemplateSlot[]) => {
    setTemplate(newTemplate);
  };

  const addUnavailability = (u: Unavailability) => {
    setUnavailabilities([...unavailabilities, u]);
  };

  const removeUnavailability = (id: string) => {
      setUnavailabilities(unavailabilities.filter(u => u.id !== id));
  }

  const addRcpType = (name: string) => {
    const trimmedName = name.trim();
    if (!rcpTypes.find(r => r.name === trimmedName)) {
      setRcpTypes([...rcpTypes, { id: `rcp_${Date.now()}`, name: trimmedName, frequency: 'WEEKLY' }]);
    }
  }

  const removeRcpType = (id: string) => {
      const targetRcp = rcpTypes.find(r => r.id === id);
      if (!targetRcp) return;

      setRcpTypes(prev => prev.filter(r => r.id !== id));
      setTemplate(prev => prev.filter(t => t.location !== targetRcp.name && t.subType !== targetRcp.name));
      setSchedule(prev => prev.filter(s => s.location !== targetRcp.name && s.subType !== targetRcp.name));
      
      setManualOverrides(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(key => {
              if (key.includes(targetRcp.name)) delete next[key];
          });
          return next;
      });
  }

  const updateRcpDefinition = (def: RcpDefinition) => {
      setRcpTypes(rcpTypes.map(r => r.id === def.id ? def : r));
  }

  const renameRcpType = (oldName: string, newName: string) => {
      setRcpTypes(rcpTypes.map(r => r.name === oldName ? { ...r, name: newName } : r));
      setTemplate(template.map(t => t.location === oldName ? { ...t, location: newName } : t));
      setSchedule(schedule.map(s => s.location === oldName ? { ...s, location: newName } : s));
  }

  const addDoctor = (d: Doctor) => {
      setDoctors([...doctors, d]);
  }

  const updateDoctor = (updatedDoc: Doctor) => {
      setDoctors(doctors.map(d => d.id === updatedDoc.id ? updatedDoc : d));
      if (currentUser && currentUser.id === updatedDoc.id) {
          setCurrentUser(updatedDoc);
      }
  }

  const removeDoctor = (id: string) => {
      try {
          console.log(`Suppression du médecin ${id} initiée...`);

          // 1. Remove from doctors list
          setDoctors(prev => prev.filter(d => d.id !== id));

          // 2. Clean up Template Assignments (Future rules)
          setTemplate(prev => prev.map(t => ({
              ...t,
              defaultDoctorId: t.defaultDoctorId === id ? null : t.defaultDoctorId,
              doctorIds: t.doctorIds ? t.doctorIds.filter(dId => dId !== id) : [],
              secondaryDoctorIds: t.secondaryDoctorIds ? t.secondaryDoctorIds.filter(dId => dId !== id) : [],
              backupDoctorId: t.backupDoctorId === id ? null : t.backupDoctorId
          })));

          // 3. Clean up Unavailabilities
          setUnavailabilities(prev => prev.filter(u => u.doctorId !== id));

          // 4. Clean up Manual Overrides (Persistent assignments)
          setManualOverrides(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(key => {
                  if (next[key] === id) delete next[key];
              });
              return next;
          });

          // 5. Clean up RCP Attendance (Past/Future decisions)
          setRcpAttendance(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(key => {
                  if (next[key] && next[key][id]) {
                      const inner = { ...next[key] };
                      delete inner[id];
                      next[key] = inner;
                  }
              });
              return next;
          });

          // 6. Clean up History
          setShiftHistory(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
          });

          // 7. Log out if it was the current user
          if (currentUser && currentUser.id === id) {
              setCurrentUser(null);
          }
          
          console.log(`Médecin ${id} supprimé avec succès.`);
      } catch (err) {
          console.error("Erreur critique lors de la suppression du médecin :", err);
          alert("Une erreur est survenue lors de la suppression.");
      }
  }

  const addActivityDefinition = (act: ActivityDefinition) => {
      setActivityDefinitions([...activityDefinitions, act]);
  }

  const addPoste = (name: string) => {
      const trimmed = name.trim();
      if(!postes.includes(trimmed)) setPostes([...postes, trimmed]);
  }

  const removePoste = (name: string) => {
      setPostes(postes.filter(p => p !== name));
      setTemplate(template.filter(t => t.location !== name));
      setSchedule(schedule.filter(s => s.location !== name));
  }

  const addRcpException = (ex: RcpException) => {
      const filtered = rcpExceptions.filter(e => !(e.rcpTemplateId === ex.rcpTemplateId && e.originalDate === ex.originalDate));
      setRcpExceptions([...filtered, ex]);
  }

  const removeRcpException = (templateId: string, originalDate: string) => {
      setRcpExceptions(prev => prev.filter(e => !(e.rcpTemplateId === templateId && e.originalDate === originalDate)));
  }

  const importConfiguration = (data: any) => {
      try {
          if (data.doctors) setDoctors(data.doctors);
          if (data.template) setTemplate(data.template);
          if (data.rcpTypes) setRcpTypes(data.rcpTypes);
          if (data.postes) setPostes(data.postes);
          if (data.activityDefinitions) setActivityDefinitions(data.activityDefinitions);
          if (data.unavailabilities) setUnavailabilities(data.unavailabilities);
          if (data.shiftHistory) setShiftHistory(data.shiftHistory);
          if (data.manualOverrides) setManualOverrides(data.manualOverrides);
          if (data.rcpAttendance) setRcpAttendance(data.rcpAttendance);
          if (data.rcpExceptions) setRcpExceptions(data.rcpExceptions);
          alert('Configuration importée avec succès !');
      } catch (e) {
          console.error("Import failed", e);
          alert("Erreur lors de l'importation du fichier.");
      }
  };

  return (
    <AppContext.Provider value={{ 
        doctors, 
        addDoctor, 
        updateDoctor, 
        removeDoctor, 
        currentUser, 
        schedule, 
        template, 
        unavailabilities, 
        conflicts, 
        rcpTypes, 
        postes, 
        addPoste, 
        removePoste, 
        activityDefinitions, 
        addActivityDefinition, 
        updateSchedule, 
        updateTemplate, 
        addUnavailability, 
        removeUnavailability, 
        setCurrentUser, 
        addRcpType, 
        updateRcpDefinition, 
        removeRcpType, 
        renameRcpType, 
        shiftHistory, 
        manualOverrides, 
        setManualOverrides, 
        importConfiguration, 
        rcpAttendance, 
        setRcpAttendance, 
        rcpExceptions, 
        addRcpException, 
        removeRcpException
    }}>
      <Router>
        <div className="flex h-screen overflow-hidden print:overflow-visible print:h-auto print:block">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:h-auto print:block">
            <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-6 print:overflow-visible print:h-auto print:bg-white print:p-0">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/planning" element={<Planning />} />
                <Route path="/activities" element={<Activities />} />
                <Route path="/configuration" element={<Configuration />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </Router>
    </AppContext.Provider>
  );
};

export default App;
