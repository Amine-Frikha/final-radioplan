
import React, { useState, useEffect } from 'react';
import { Conflict, Doctor, ScheduleSlot, ReplacementSuggestion } from '../types';
import { getAvailableDoctors, getAlgorithmicReplacementSuggestion } from '../services/scheduleService';
import { X, Calculator, UserCheck, AlertTriangle, User, Lightbulb } from 'lucide-react';

interface Props {
  conflict: Conflict;
  slot: ScheduleSlot;
  doctors: Doctor[];
  slots: ScheduleSlot[];
  unavailabilities: any[];
  onClose: () => void;
  onResolve: (slotId: string, newDoctorId: string) => void;
}

const ConflictResolverModal: React.FC<Props> = ({ conflict, slot, doctors, slots, unavailabilities, onClose, onResolve }) => {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [manualDoctorId, setManualDoctorId] = useState<string>("");

  const unavailableDoctor = doctors.find(d => d.id === conflict.doctorId);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!unavailableDoctor) return;
      setLoading(true);
      setError(null);

      try {
        const availableDocs = getAvailableDoctors(doctors, slots, unavailabilities, slot.day, slot.period, slot.date);
        
        if (availableDocs.length === 0) {
           setError("Aucun médecin disponible sur ce créneau.");
           // Keep loading false so manual select works
        } else {
           // Use the new deterministic "Smart Script" instead of AI
           const smartSuggestions = getAlgorithmicReplacementSuggestion(slot, unavailableDoctor, availableDocs, slots);
           setSuggestions(smartSuggestions);
        }
      } catch (err) {
        setError("Erreur lors du calcul des suggestions.");
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center space-x-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="font-bold text-lg">Résolution de Conflit</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
            <div className="mb-6">
                <p className="text-sm text-slate-500 mb-1">Le problème :</p>
                <p className="font-medium text-slate-800 bg-red-50 p-3 rounded border border-red-100">
                    {conflict.description}
                </p>
            </div>

            {/* ALGORITHMIC SUGGESTIONS */}
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3 flex items-center">
                <Lightbulb className="w-4 h-4 mr-2 text-yellow-500" />
                Suggestions Intelligentes (Algorithme)
            </h3>

            {loading && (
                <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            )}

            {!loading && error && (
                <div className="text-center py-2 text-orange-500 text-sm mb-4 bg-orange-50 rounded">
                    {error} (Veuillez choisir manuellement)
                </div>
            )}

            {!loading && !error && suggestions.length > 0 && (
                <div className="space-y-3 mb-6">
                    {suggestions.map((sugg) => {
                        const doc = doctors.find(d => d.id === sugg.suggestedDoctorId);
                        if (!doc) return null;
                        return (
                            <div key={sugg.suggestedDoctorId} className="border border-slate-200 rounded-lg p-3 hover:border-blue-300 transition-colors">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 ${doc.color}`}>
                                            {doc.name.substring(0, 2)}
                                        </div>
                                        <span className="font-bold text-slate-800 text-sm">{doc.name}</span>
                                    </div>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800">
                                        {sugg.score}% Match
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 mb-2 italic">
                                    "{sugg.reasoning}"
                                </p>
                                <button
                                    onClick={() => onResolve(slot.id, doc.id)}
                                    className="w-full py-1.5 px-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-xs font-bold"
                                >
                                    Choisir {doc.name}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* MANUAL SELECTION */}
            <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider mb-3 flex items-center">
                    <User className="w-4 h-4 mr-2 text-slate-600" />
                    Sélection Manuelle
                </h3>
                <div className="flex gap-2">
                    <select 
                        className="flex-1 text-sm border-slate-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        value={manualDoctorId}
                        onChange={(e) => setManualDoctorId(e.target.value)}
                    >
                        <option value="">-- Choisir un médecin --</option>
                        {doctors.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    <button 
                        disabled={!manualDoctorId}
                        onClick={() => onResolve(slot.id, manualDoctorId)}
                        className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Valider
                    </button>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default ConflictResolverModal;