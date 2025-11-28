
import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../App';
import { DayOfWeek, Period, SlotType } from '../types';
import { Save, RefreshCw, LayoutTemplate, PlusCircle, Clock, Tag, Trash2, Edit2, Check, X, MapPin, AlertCircle, Users, Unlock, Lock, Download, Upload, Settings, Shield } from 'lucide-react';

const Configuration: React.FC = () => {
  const { 
      template, 
      doctors, 
      updateTemplate, 
      rcpTypes, 
      addRcpType, 
      removeRcpType, 
      updateRcpDefinition, 
      renameRcpType, 
      postes, 
      addPoste, 
      removePoste,
      activityDefinitions,
      unavailabilities,
      shiftHistory,
      manualOverrides,
      importConfiguration
  } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState<SlotType>(SlotType.CONSULTATION);
  const [editMode, setEditMode] = useState(false);
  const [tempTemplate, setTempTemplate] = useState(template);
  
  useEffect(() => {
      setTempTemplate(template);
  }, [template]);

  // RCP State
  const [newRcpName, setNewRcpName] = useState("");
  const [selectedRcpId, setSelectedRcpId] = useState<string>("");
  const [tempRcpName, setTempRcpName] = useState("");

  // Postes State
  const [newPosteName, setNewPosteName] = useState("");

  const days = Object.values(DayOfWeek);

  // --- EXPORT / IMPORT HANDLERS ---
  const handleExport = () => {
      const config = {
          doctors,
          template,
          rcpTypes,
          postes,
          activityDefinitions,
          unavailabilities,
          shiftHistory,
          manualOverrides,
          timestamp: new Date().toISOString()
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "radioplan_config.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const data = JSON.parse(evt.target?.result as string);
              importConfiguration(data);
          } catch (err) {
              alert("Fichier JSON invalide.");
              console.error(err);
          }
      };
      reader.readAsText(file);
      // Reset input
      e.target.value = '';
  }
  
  const handleUpdateSlot = (
    day: DayOfWeek, 
    period: Period, 
    location: string, 
    field: string, 
    value: any
  ) => {
    if (!editMode) return;

    setTempTemplate(prev => {
        const existingIndex = prev.findIndex(t => 
            t.day === day && 
            t.period === period && 
            t.location === location &&
            (activeTab === SlotType.CONSULTATION ? t.type === SlotType.CONSULTATION || t.type === SlotType.RCP : t.type === activeTab)
        );

        let newSlot: any;
        let newTemplate = [...prev];

        if (existingIndex >= 0) {
            newSlot = { ...newTemplate[existingIndex] };
            
            // Handle complex fields
            if (field === 'doctorIds') {
                newSlot.doctorIds = value; // expects array
                // Sync legacy fields for compatibility
                newSlot.defaultDoctorId = value[0] || null;
                newSlot.secondaryDoctorIds = value.slice(1);
            } else {
                newSlot[field] = value === "" ? null : value;
            }
            
            newTemplate[existingIndex] = newSlot;
        } else {
            // Create new slot
            if (value === "") return prev; 
            
            newSlot = {
                id: `temp_${Date.now()}_${Math.random()}`,
                day,
                period,
                location,
                type: activeTab,
                time: undefined,
                isRequired: true,
                isBlocking: true,
                frequency: 'WEEKLY',
                doctorIds: [],
                subType: activeTab === SlotType.RCP ? location : activeTab // Default subType to location name
            };

            if (field === 'doctorIds') {
                newSlot.doctorIds = value;
                newSlot.defaultDoctorId = value[0] || null;
                newSlot.secondaryDoctorIds = value.slice(1);
            } else {
                newSlot[field] = value;
            }

            newTemplate = [...prev, newSlot];
        }
        return newTemplate;
    });
  };

  const handleDeleteSlot = (day: DayOfWeek, period: Period, location: string) => {
      setTempTemplate(prev => prev.filter(t => !(
          t.day === day && 
          t.period === period && 
          t.location === location &&
          (activeTab === SlotType.CONSULTATION ? t.type === SlotType.CONSULTATION || t.type === SlotType.RCP : t.type === activeTab)
      )));
  };

  const saveChanges = () => {
    updateTemplate(tempTemplate);
    setEditMode(false);
  };

  const cancelChanges = () => {
    setTempTemplate(template);
    setEditMode(false);
  };

  // --- RCP HANDLERS ---
  const handleAddRcp = () => {
    if(newRcpName.trim()) {
        addRcpType(newRcpName.trim());
        setNewRcpName("");
    }
  }

  const saveEditRcp = (rcp: any) => {
      if (tempRcpName.trim() && tempRcpName !== rcp.name) {
          renameRcpType(rcp.name, tempRcpName.trim());
      }
  }

  const handleDeleteRcp = (id: string) => {
      removeRcpType(id);
      if (selectedRcpId === id) setSelectedRcpId("");
  }

  // --- POSTE HANDLERS ---
  const handleAddPoste = () => {
      if(newPosteName.trim()) {
          addPoste(newPosteName.trim());
          setNewPosteName("");
      }
  }

  const handleDeletePoste = (location: string) => {
      if (window.confirm(`Supprimer définitivement le poste "${location}" ?`)) {
          removePoste(location);
      }
  }

  const renderConfigCell = (day: DayOfWeek, period: Period, location: string) => {
    const isConsultTab = activeTab === SlotType.CONSULTATION;
    
    // Find specific slot in the TEMPORARY template
    const slot = tempTemplate.find(t => 
        t.day === day && 
        t.period === period && 
        t.location === location && 
        (isConsultTab ? (t.type === SlotType.CONSULTATION || t.type === SlotType.RCP) : t.type === activeTab)
    );

    const isMondayMorning = day === DayOfWeek.MONDAY && period === Period.MORNING;
    const isBox = location.startsWith('Box');
    
    if (isConsultTab && isMondayMorning && isBox) {
        return (
            <div className="bg-gray-100 h-full flex items-center justify-center p-2 text-center border border-gray-200">
                 <span className="text-[10px] text-gray-400 uppercase font-bold">Fermé (RCP Service)</span>
            </div>
        );
    }

    // Determine current assignments
    const currentDocIds = slot?.doctorIds || (slot?.defaultDoctorId ? [slot?.defaultDoctorId, ...(slot?.secondaryDoctorIds || [])] : []);
    
    // Time Check Helper
    const checkTimeValidity = (timeStr: string | undefined) => {
        if (!timeStr) return true;
        const hour = parseInt(timeStr.split(':')[0], 10);
        if (period === Period.MORNING && hour >= 13) return false; // Warning if afternoon time in morning slot
        if (period === Period.AFTERNOON && hour < 12) return false;
        return true;
    }
    const isTimeWarning = slot?.time && !checkTimeValidity(slot.time);

    if (editMode) {
        return (
            <div className={`p-2 h-full flex flex-col justify-start items-center space-y-2 border min-h-[160px] relative group ${slot ? 'bg-white border-blue-300' : 'bg-slate-50 border-dashed border-slate-300'}`}>
                
                {slot && (
                    <button 
                        onClick={() => handleDeleteSlot(day, period, location)}
                        className="absolute top-1 right-1 text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 z-20 bg-white rounded-full shadow-sm"
                        title="Supprimer ce créneau"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                )}

                {!slot && (
                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <span className="text-[9px] text-slate-300 font-medium">+ Ajouter</span>
                     </div>
                )}
                
                {activeTab === SlotType.RCP ? (
                    // RCP EDITOR (Multi-Doctor + Backup + Blocking + Time)
                    <div className="w-full space-y-2 pt-1 z-10">
                        {/* 3 Doctor Selectors (Primary/Secondary) */}
                        {[0, 1, 2].map(idx => (
                            <select 
                                key={idx}
                                value={currentDocIds[idx] || ''}
                                onChange={(e) => {
                                    const newIds = [...currentDocIds];
                                    newIds[idx] = e.target.value;
                                    handleUpdateSlot(day, period, location, 'doctorIds', newIds.filter(Boolean));
                                }}
                                className="w-full text-[10px] p-1 border rounded bg-white focus:ring-1 focus:ring-blue-500 h-6"
                            >
                                <option value="">{idx === 0 ? '-- Responsable --' : '-- Autre --'}</option>
                                {doctors.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        ))}

                        {/* BACKUP Doctor Selector */}
                         <div className="flex items-center space-x-1 border-t pt-1 border-slate-100">
                             <Shield className="w-3 h-3 text-slate-400" />
                             <select 
                                value={slot?.backupDoctorId || ''}
                                onChange={(e) => handleUpdateSlot(day, period, location, 'backupDoctorId', e.target.value)}
                                className="w-full text-[10px] p-1 border rounded bg-slate-50 focus:ring-1 focus:ring-blue-500 h-6 text-slate-600"
                            >
                                <option value="">-- Backup --</option>
                                {doctors.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Time Input */}
                        <div className="flex items-center space-x-1 pt-1">
                            <Clock className={`w-3 h-3 ${isTimeWarning ? 'text-orange-500' : 'text-slate-400'}`} />
                            <input 
                                type="time"
                                value={slot?.time || ''}
                                onChange={(e) => handleUpdateSlot(day, period, location, 'time', e.target.value)}
                                className={`w-full text-xs p-1 border rounded ${isTimeWarning ? 'border-orange-300 bg-orange-50' : ''}`}
                            />
                        </div>
                        {isTimeWarning && <span className="text-[9px] text-orange-600 leading-none">⚠️ Horaire incoh.</span>}

                        {/* Blocking Toggle */}
                        <div className="flex items-center space-x-2 pt-1">
                            <button 
                                onClick={() => handleUpdateSlot(day, period, location, 'isBlocking', slot?.isBlocking === false ? true : false)}
                                className={`flex items-center text-[9px] px-2 py-1 rounded border w-full justify-center transition-colors ${
                                    slot?.isBlocking !== false 
                                    ? 'bg-red-50 text-red-700 border-red-200 font-bold' 
                                    : 'bg-green-50 text-green-700 border-green-200'
                                }`}
                            >
                                {slot?.isBlocking !== false ? <Lock className="w-3 h-3 mr-1"/> : <Unlock className="w-3 h-3 mr-1"/>}
                                {slot?.isBlocking !== false ? 'Obligatoire' : 'Optionnel'}
                            </button>
                        </div>
                    </div>
                ) : (
                    // STANDARD POSTE EDITOR
                    <select 
                        value={currentDocIds[0] || ''}
                        onChange={(e) => handleUpdateSlot(day, period, location, 'defaultDoctorId', e.target.value)}
                        className="w-full text-xs p-1 border rounded bg-white focus:ring-2 focus:ring-blue-500 z-10"
                    >
                        <option value="">-- Libre --</option>
                        {doctors.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                )}
            </div>
        );
    }

    if (!slot) return <div className="text-[10px] text-slate-300 text-center py-4">--</div>;

    return (
        <div className="p-2 h-full flex flex-col justify-center items-center">
            {currentDocIds.length > 0 ? (
                <div className="flex flex-col space-y-1 w-full">
                    {currentDocIds.map((docId, idx) => {
                        const doc = doctors.find(d => d.id === docId);
                        if (!doc) return null;
                        return (
                             <div key={docId} className="flex items-center justify-center space-x-1">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${doc.color} shadow-sm`}>
                                    {doc.name.substring(0,2)}
                                </div>
                                <span className={`text-[10px] font-medium leading-tight truncate ${idx === 0 ? 'text-slate-800' : 'text-slate-500'}`}>
                                    {doc.name}
                                </span>
                             </div>
                        )
                    })}
                    
                    {slot.backupDoctorId && (
                         <div className="flex items-center justify-center space-x-1 mt-1 pt-1 border-t border-slate-100">
                             <Shield className="w-3 h-3 text-slate-300" />
                             <span className="text-[9px] text-slate-400 italic">
                                 {doctors.find(d => d.id === slot.backupDoctorId)?.name || '?'}
                             </span>
                         </div>
                    )}

                    {slot.type === SlotType.RCP && (
                         <div className="mt-1 flex flex-col items-center">
                             <span className="text-[9px] bg-purple-50 text-purple-700 px-1 rounded border border-purple-100 mb-0.5">
                                 {slot.time || 'N/A'}
                             </span>
                             {slot.isBlocking === false && (
                                 <span className="text-[8px] text-green-600 bg-green-50 px-1 rounded border border-green-100">
                                     (Optionnel)
                                 </span>
                             )}
                         </div>
                    )}
                </div>
            ) : (
                <span className="text-xs text-slate-400 italic">Libre</span>
            )}
        </div>
    );
  };

  const getRows = () => {
      if (activeTab === SlotType.CONSULTATION) {
          return postes.map(p => ({ id: p, name: p, type: 'POSTE' }));
      } else {
          return rcpTypes.map(r => ({ id: r.id, name: r.name, type: 'RCP' }));
      }
  }
  
  const rows = getRows();

  return (
    <div className="h-full flex flex-col space-y-4">
        {/* Header and Controls (Unchanged) */}
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center">
                    <LayoutTemplate className="w-6 h-6 mr-3 text-purple-600" />
                    Règles & Postes
                </h1>
                <p className="text-sm text-slate-500 mt-1 max-w-2xl">
                    Définissez les postes fixes (Consultations) et les RCP hebdomadaires.
                </p>
            </div>
            
            <div className="flex items-center space-x-2">
                 {/* EXPORT / IMPORT */}
                 <button onClick={handleExport} className="p-2 text-slate-600 hover:bg-slate-200 rounded" title="Exporter la configuration">
                     <Download className="w-5 h-5" />
                 </button>
                 <label className="p-2 text-slate-600 hover:bg-slate-200 rounded cursor-pointer" title="Importer la configuration">
                     <Upload className="w-5 h-5" />
                     <input type="file" className="hidden" accept=".json" onChange={handleImport} />
                 </label>

                 <div className="h-6 w-px bg-slate-300 mx-2"></div>

                {editMode ? (
                    <>
                        <button onClick={cancelChanges} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                            Annuler
                        </button>
                        <button onClick={saveChanges} className="px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 flex items-center text-sm font-medium">
                            <Save className="w-4 h-4 mr-2" />
                            Sauvegarder
                        </button>
                    </>
                ) : (
                    <button onClick={() => setEditMode(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 flex items-center text-sm font-medium">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Modifier la Semaine Type
                    </button>
                )}
            </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4 items-center">
             <button 
                onClick={() => setActiveTab(SlotType.CONSULTATION)}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${activeTab === SlotType.CONSULTATION ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
                Consultations & Postes
            </button>
            <button 
                onClick={() => setActiveTab(SlotType.RCP)}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${activeTab === SlotType.RCP ? 'bg-purple-100 text-purple-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
                RCP (Gestion)
            </button>
        </div>

        {/* --- POSTE MANAGEMENT PANEL --- */}
        {activeTab === SlotType.CONSULTATION && editMode && (
            <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 animate-in fade-in slide-in-from-top-2">
                 <h3 className="font-bold text-slate-700 mb-3 flex items-center">
                    <MapPin className="w-4 h-4 mr-2" />
                    Gestion des Lieux / Postes
                </h3>
                <div className="flex flex-wrap gap-2">
                    {postes.map(poste => (
                        <div key={poste} className="flex items-center bg-blue-50 px-3 py-1 rounded-full border border-blue-200 text-sm">
                            <span className="text-blue-800 font-medium mr-2">{poste}</span>
                            <button onClick={() => handleDeletePoste(poste)} className="text-blue-400 hover:text-red-600">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                    <div className="flex items-center">
                        <input 
                            type="text" 
                            value={newPosteName}
                            onChange={e => setNewPosteName(e.target.value)}
                            placeholder="Nouveau (ex: Scanner)" 
                            className="text-sm p-1 border rounded-l focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
                            onKeyDown={e => e.key === 'Enter' && handleAddPoste()}
                        />
                        <button onClick={handleAddPoste} disabled={!newPosteName} className="bg-blue-600 text-white p-1.5 rounded-r hover:bg-blue-700">
                            <PlusCircle className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- RCP MANAGEMENT PANEL (NEW COMPACT DESIGN) --- */}
        {activeTab === SlotType.RCP && (
            <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 shadow-sm">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-bold text-slate-700 flex items-center">
                        <Settings className="w-4 h-4 mr-2" />
                        Gestion des Lignes RCP
                    </h3>
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                    {/* ADD NEW */}
                    <div className="flex-1">
                         <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Ajouter une nouvelle ligne</h4>
                         <div className="flex items-center space-x-2">
                             <input 
                                 type="text" 
                                 placeholder="Nom de la RCP..."
                                 className="flex-1 text-sm p-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none"
                                 value={newRcpName}
                                 onChange={e => setNewRcpName(e.target.value)}
                                 onKeyDown={e => e.key === 'Enter' && handleAddRcp()}
                             />
                             <button onClick={handleAddRcp} disabled={!newRcpName} className="bg-purple-600 text-white p-2 rounded hover:bg-purple-700 disabled:opacity-50 transition-colors">
                                 <PlusCircle className="w-5 h-5" />
                             </button>
                         </div>
                    </div>

                    <div className="w-px bg-slate-200 hidden md:block"></div>

                    {/* EDIT PROPERTIES */}
                    <div className="flex-[2]">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Modifier les propriétés (Fréquence / Nom)</h4>
                        
                        <div className="flex items-start space-x-4">
                            {/* SELECTOR */}
                            <div className="flex-1 max-w-xs">
                                <select 
                                    value={selectedRcpId} 
                                    onChange={(e) => {
                                        setSelectedRcpId(e.target.value);
                                        const r = rcpTypes.find(x => x.id === e.target.value);
                                        if(r) setTempRcpName(r.name);
                                    }}
                                    className="w-full p-2 border rounded text-sm bg-slate-50 font-medium focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer"
                                >
                                    <option value="">-- Sélectionner une RCP à modifier --</option>
                                    {rcpTypes.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* EDIT FORM */}
                            {selectedRcpId && (() => {
                                const rcp = rcpTypes.find(r => r.id === selectedRcpId);
                                if (!rcp) return null;
                                return (
                                    <div className="flex-1 flex flex-wrap gap-3 items-end animate-in fade-in slide-in-from-left-2">
                                        {/* Name Edit */}
                                        <div>
                                            <label className="block text-[10px] text-slate-400 font-bold mb-1">Renommer</label>
                                            <div className="flex items-center space-x-1">
                                                <input 
                                                    type="text" 
                                                    value={tempRcpName}
                                                    onChange={e => setTempRcpName(e.target.value)}
                                                    className="w-32 text-sm p-1.5 border rounded"
                                                />
                                                <button onClick={() => saveEditRcp(rcp)} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200" title="Valider le nom"><Check className="w-4 h-4"/></button>
                                            </div>
                                        </div>

                                        {/* Frequency */}
                                        <div>
                                            <label className="block text-[10px] text-slate-400 font-bold mb-1">Fréquence</label>
                                            <select 
                                                value={rcp.frequency}
                                                onChange={(e) => updateRcpDefinition({...rcp, frequency: e.target.value as any})}
                                                className="text-xs p-2 border rounded bg-white w-32 cursor-pointer"
                                            >
                                                <option value="WEEKLY">Hebdomadaire</option>
                                                <option value="BIWEEKLY">1 Semaine sur 2</option>
                                            </select>
                                        </div>

                                        {/* Parity */}
                                        {rcp.frequency === 'BIWEEKLY' && (
                                            <div>
                                                <label className="block text-[10px] text-slate-400 font-bold mb-1">Parité</label>
                                                <div className="flex bg-slate-100 rounded p-1">
                                                    <button 
                                                        onClick={() => updateRcpDefinition({...rcp, weekParity: 'ODD'})}
                                                        className={`px-2 py-1 text-[10px] rounded ${rcp.weekParity === 'ODD' ? 'bg-white shadow text-purple-700 font-bold' : 'text-slate-500'}`}
                                                    >
                                                        Impaire
                                                    </button>
                                                    <button 
                                                        onClick={() => updateRcpDefinition({...rcp, weekParity: 'EVEN'})}
                                                        className={`px-2 py-1 text-[10px] rounded ${rcp.weekParity === 'EVEN' ? 'bg-white shadow text-purple-700 font-bold' : 'text-slate-500'}`}
                                                    >
                                                        Paire
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Delete */}
                                        <div className="ml-auto">
                                            <button 
                                                onClick={() => {
                                                    if(window.confirm(`Supprimer définitivement la RCP "${rcp.name}" et tout son historique ?`)) {
                                                        handleDeleteRcp(rcp.id);
                                                    }
                                                }} 
                                                className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded border border-transparent hover:border-red-200 transition-colors"
                                                title="Supprimer cette RCP"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                        {!selectedRcpId && (
                            <div className="text-xs text-slate-400 mt-2 italic">
                                Sélectionnez une RCP dans la liste pour modifier sa fréquence ou la supprimer.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* MAIN GRID */}
        <div className="flex-1 overflow-auto bg-white rounded-xl shadow border border-slate-200">
             {rows.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                     <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                     <p className="text-sm">Aucun élément à afficher.</p>
                     <p className="text-xs">Utilisez le panneau ci-dessus pour ajouter des RCP ou des Postes.</p>
                 </div>
             ) : (
                <table className="w-full border-collapse min-w-[800px]">
                    <thead>
                        <tr>
                            <th className="p-3 border-b border-r bg-slate-100 w-40 text-left text-xs font-bold text-slate-500 uppercase sticky left-0 z-20">Lieu / Période</th>
                            {days.map(day => (
                                <th key={day} className="p-3 border-b border-r bg-slate-50 text-slate-700 font-bold uppercase text-xs w-1/5 min-w-[150px]">
                                    {day}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map(row => (
                            <React.Fragment key={row.id}>
                                {/* Morning */}
                                <tr>
                                    <td className="p-3 border-r bg-slate-50 text-slate-700 font-bold text-xs sticky left-0 z-10 group relative border-b-0">
                                        <div className="flex justify-between items-start">
                                            <span>{row.name}</span>
                                            {editMode && row.type === 'RCP' && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if(window.confirm(`Supprimer la RCP "${row.name}" ?`)) handleDeleteRcp(row.id);
                                                    }}
                                                    className="text-slate-300 hover:text-red-600 p-1 z-50 relative bg-white rounded-full shadow-sm"
                                                    title={`Supprimer la ligne ${row.name}`}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                            {editMode && row.type === 'POSTE' && (
                                                 <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeletePoste(row.id);
                                                    }}
                                                    className="text-slate-300 hover:text-red-600 p-1 z-50 relative bg-white rounded-full shadow-sm"
                                                    title={`Supprimer la ligne ${row.name}`}
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                        <span className="block font-normal text-slate-400 mt-1">Matin</span>
                                    </td>
                                    {days.map(day => (
                                        <td key={`${day}-matin`} className="border-r p-0 h-16 relative">
                                            {renderConfigCell(day, Period.MORNING, row.name)}
                                        </td>
                                    ))}
                                </tr>
                                {/* Afternoon */}
                                <tr>
                                    <td className="p-3 border-r bg-slate-50 text-slate-400 text-xs sticky left-0 z-10 font-normal">
                                        A.Midi
                                    </td>
                                    {days.map(day => (
                                        <td key={`${day}-apres-midi`} className="border-r p-0 h-16 bg-slate-50/30 relative">
                                            {renderConfigCell(day, Period.AFTERNOON, row.name)}
                                        </td>
                                    ))}
                                </tr>
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
             )}
        </div>
    </div>
  );
};

export default Configuration;
