
import { FRENCH_HOLIDAYS } from '../constants';
import { ActivityDefinition, Conflict, DayOfWeek, Doctor, Holiday, Period, RcpDefinition, ReplacementSuggestion, ScheduleSlot, ScheduleTemplateSlot, ShiftHistory, SlotType, Unavailability, RcpAttendance, RcpException } from '../types';

export const isDateInRange = (dateStr: string, startStr: string, endStr: string) => {
  const d = new Date(dateStr);
  const s = new Date(startStr);
  const e = new Date(endStr);
  return d >= s && d <= e;
};

// New Helper: Check if doctor is absent for a specific period
export const isAbsent = (doctor: Doctor, dateStr: string, period: Period, unavailabilities: Unavailability[]): boolean => {
    return unavailabilities.some(u => {
        if (u.doctorId !== doctor.id) return false;
        if (!isDateInRange(dateStr, u.startDate, u.endDate)) return false;
        
        // Granularity check
        if (!u.period || u.period === 'ALL_DAY') return true;
        return u.period === period;
    });
};

export const isFrenchHoliday = (dateStr: string): Holiday | undefined => {
    return FRENCH_HOLIDAYS.find(h => h.date === dateStr);
};

export const getDateForDayOfWeek = (mondayDate: Date, day: DayOfWeek): string => {
  const map: Record<DayOfWeek, number> = {
    [DayOfWeek.MONDAY]: 0,
    [DayOfWeek.TUESDAY]: 1,
    [DayOfWeek.WEDNESDAY]: 2,
    [DayOfWeek.THURSDAY]: 3,
    [DayOfWeek.FRIDAY]: 4
  };
  
  const result = new Date(mondayDate);
  result.setDate(mondayDate.getDate() + map[day]);
  
  // Use local time components to avoid UTC shift which causes date to be off by 1
  const year = result.getFullYear();
  const month = String(result.getMonth() + 1).padStart(2, '0');
  const d = String(result.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${d}`;
};

export const getWeekNumber = (d: Date): number => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
};

// --- SMART SCRIPT: REPLACEMENT ALGORITHM ---
export const getAlgorithmicReplacementSuggestion = (
    conflictSlot: ScheduleSlot,
    unavailableDoc: Doctor,
    availableDocs: Doctor[],
    schedule: ScheduleSlot[] // Current schedule context for load balancing
): ReplacementSuggestion[] => {
    
    return availableDocs
    .filter(candidate => {
        // 0. HARD EXCLUSIONS
        // Check if candidate is excluded from this SPECIFIC Slot Type (Consultation / RCP)
        if (candidate.excludedSlotTypes?.includes(conflictSlot.type)) return false;

        // Check if candidate is excluded from this Activity
        if (conflictSlot.activityId && candidate.excludedActivities.includes(conflictSlot.activityId)) return false;

        return true;
    })
    .map(candidate => {
        let score = 50; // Base score
        const reasons: string[] = [];

        // 1. Specialty Match (High Importance)
        const sharedSpecialties = candidate.specialty.filter(s => unavailableDoc.specialty.includes(s));
        if (sharedSpecialties.length > 0) {
            score += 30;
            reasons.push(`Même spécialité (${sharedSpecialties.join(', ')})`);
        }

        // 2. Load Balancing (Equity)
        const candidateShifts = schedule.filter(s => 
            s.assignedDoctorId === candidate.id && s.id !== conflictSlot.id
        ).length;

        // 3. AUTO-CHOICE PRIORITY
        if (conflictSlot.activityId) {
             if (candidateShifts <= 2) { 
                 score += 40; 
                 reasons.push("Choix équitable (Recommandé)");
             }
        }

        if (candidateShifts === 0) {
            score += 15;
            reasons.push("Aucune charge cette semaine");
        } else if (candidateShifts > 6) {
            score -= (candidateShifts * 5); // Penalize if already busy
            reasons.push("Planning chargé");
        }

        // 4. Slot Type Match / Affinities
        const locationLower = conflictSlot.location.toLowerCase();
        const relevantSpecialty = candidate.specialty.find(s => locationLower.includes(s.toLowerCase()));
        if (relevantSpecialty) {
            score += 20;
            reasons.push(`Expertise pertinente (${relevantSpecialty})`);
        }

        // Normalize Score 0-100
        const finalScore = Math.max(0, Math.min(100, score));

        if (reasons.length === 0) reasons.push("Disponible");

        return {
            originalDoctorId: unavailableDoc.id,
            suggestedDoctorId: candidate.id,
            reasoning: reasons.join(" • "),
            score: finalScore
        };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};


// --- ACTIVITY DISTRIBUTION LOGIC ---

// Helper: Check if a doctor is eligible for a specific activity/day
const isDoctorEligible = (
    doc: Doctor, 
    activityId: string, 
    day: DayOfWeek, 
    dateStr: string,
    unavailabilities: Unavailability[],
    period: Period // Activity usually spans a period or whole day, need to check specific period
): boolean => {
    // 1. Check Profile Exclusions
    if (doc.excludedActivities.includes(activityId)) return false;
    if (doc.excludedDays.includes(day)) return false;
    
    // 2. Check Absences (Granular)
    if (isAbsent(doc, dateStr, period, unavailabilities)) return false;

    return true;
};

const fillAutoActivities = (
  slots: ScheduleSlot[],
  activities: ActivityDefinition[],
  allDoctors: Doctor[],
  unavailabilities: Unavailability[],
  shiftHistory: ShiftHistory
): ScheduleSlot[] => {
  const filledSlots = [...slots];
  
  const currentShiftCounts: Record<string, number> = {};
  allDoctors.forEach(d => {
      let hCount = 0;
      if (shiftHistory[d.id]) {
          Object.values(shiftHistory[d.id]).forEach(c => hCount += c);
      }
      currentShiftCounts[d.id] = hCount;
  });

  activities.forEach(act => {
      const actSlots = filledSlots.filter(s => s.activityId === act.id);

      if (act.granularity === 'WEEKLY') {
          let assignedId: string | null = null;
          
          // Strict Eligibility for Weekly: Must be available for ALL slots of the activity
          // and not excluded via profile.
          const candidates = allDoctors.filter(doc => {
             // 1. Profile Exclusions
             if (doc.excludedActivities.includes(act.id)) return false;
             
             // 2. Absences (Strict: Cannot be absent during ANY slot of the activity)
             const isAbsentForAnySlot = actSlots.some(slot => 
                 isAbsent(doc, slot.date, slot.period, unavailabilities)
             );
             if (isAbsentForAnySlot) return false;
             
             // 3. Day Exclusions
             const isDayExcluded = actSlots.some(slot => doc.excludedDays.includes(slot.day));
             if (isDayExcluded) return false;

             return true;
          });

          // Sort by LEAST shifts (Equity)
          candidates.sort((a, b) => currentShiftCounts[a.id] - currentShiftCounts[b.id]);
                 
          if (candidates.length > 0) {
              assignedId = candidates[0].id;
          }

          if (assignedId) {
              // ZOMBIE CHECK: Ensure assignedId is still in allDoctors (though candidates come from allDoctors, safe here)
              actSlots.forEach(s => {
                  if (!s.assignedDoctorId) {
                      s.assignedDoctorId = assignedId;
                  }
              });
              currentShiftCounts[assignedId!] = (currentShiftCounts[assignedId!] || 0) + actSlots.length;
          }

      } else {
          // Half-Day Granularity
          actSlots.forEach(slot => {
              if (slot.assignedDoctorId) {
                  currentShiftCounts[slot.assignedDoctorId] = (currentShiftCounts[slot.assignedDoctorId] || 0) + 1;
                  return;
              }

              const candidates = allDoctors.filter(doc => {
                  if (!isDoctorEligible(doc, act.id, slot.day, slot.date, unavailabilities, slot.period)) return false;
                  
                  if (!act.allowDoubleBooking) {
                      const concurrentSlots = filledSlots.filter(s => 
                          s.date === slot.date && 
                          s.period === slot.period && 
                          s.assignedDoctorId === doc.id &&
                          s.id !== slot.id
                      );

                      if (concurrentSlots.length > 0) return false; 
                  }

                  return true;
              });

              if (candidates.length > 0) {
                  // Sort by LEAST shifts (Equity)
                  candidates.sort((a, b) => currentShiftCounts[a.id] - currentShiftCounts[b.id]);
                  const chosen = candidates[0];
                  slot.assignedDoctorId = chosen.id;
                  currentShiftCounts[chosen.id]++;
              }
          });
      }
  });

  return filledSlots;
};

export const generateScheduleForWeek = (
  mondayDate: Date,
  template: ScheduleTemplateSlot[],
  unavailabilities: Unavailability[],
  doctors: Doctor[],
  activities: ActivityDefinition[],
  rcpDefinitions: RcpDefinition[],
  forceRegenerateActivities: boolean = true,
  shiftHistory: ShiftHistory = {},
  rcpAttendance: RcpAttendance = {},
  rcpExceptions: RcpException[] = [] 
): ScheduleSlot[] => {
  
  const slots: ScheduleSlot[] = [];
  const currentWeekNum = getWeekNumber(mondayDate);

  // 1. FIXED TEMPLATE (Consultations / RCP)
  template.forEach(t => {
    // Check RCP Definition for specific bi-weekly logic
    const rcpDef = rcpDefinitions.find(r => r.name === t.location);
    
    if (rcpDef && rcpDef.frequency === 'BIWEEKLY') {
        if (rcpDef.weekParity === 'ODD' && currentWeekNum % 2 === 0) return; 
        if (rcpDef.weekParity === 'EVEN' && currentWeekNum % 2 !== 0) return; 
        if (!rcpDef.weekParity && currentWeekNum % 2 === 0) return;
    } else if (t.frequency === 'BIWEEKLY') {
        if (currentWeekNum % 2 === 0) return;
    }

    const standardDate = getDateForDayOfWeek(mondayDate, t.day);
    let finalDate = standardDate;
    let finalPeriod = t.period;
    let isCancelled = false;

    // CHECK EXCEPTIONS (RCP Moved/Cancelled)
    if (t.type === SlotType.RCP) {
        const exception = rcpExceptions.find(ex => ex.rcpTemplateId === t.id && ex.originalDate === standardDate);
        if (exception) {
            if (exception.isCancelled) {
                isCancelled = true;
            } else if (exception.newDate) {
                finalDate = exception.newDate;
                if (exception.newPeriod) finalPeriod = exception.newPeriod;
            }
        }
    }

    if (isCancelled) return; // Skip generating this slot

    const generatedId = `${t.id}-${standardDate}`; 
    
    // Resolve primary and secondary doctors
    let assignedId: string | null = null;
    let secondaryIds: string[] = [];
    let isUnconfirmed = false;

    if (t.type === SlotType.RCP) {
        // --- RCP LOGIC: Confirmation > Random/Default > Unconfirmed Flag ---
        const attendanceMap = rcpAttendance[generatedId];
        const confirmedDocs = attendanceMap ? Object.keys(attendanceMap).filter(id => attendanceMap[id] === 'PRESENT') : [];

        if (confirmedDocs.length > 0) {
            // Priority 1: User Explicitly Confirmed
            assignedId = confirmedDocs[0];
            secondaryIds = confirmedDocs.slice(1);
            isUnconfirmed = false;
        } else {
            // Priority 2: No confirmation yet -> Pick pseudo-random from eligible list or default
            isUnconfirmed = true;
            
            // "Au pif" (Random) Logic:
            // Use the date to pick an index deterministically so it doesn't flicker on re-render
            const eligibleIds = (t.doctorIds && t.doctorIds.length > 0) 
                                ? t.doctorIds 
                                : (t.defaultDoctorId ? [t.defaultDoctorId, ...(t.secondaryDoctorIds || [])] : []);
            
            if (eligibleIds.length > 0) {
                 const dayIndex = new Date(finalDate).getDate();
                 // Simple deterministic index
                 const index = dayIndex % eligibleIds.length;
                 assignedId = eligibleIds[index];
                 // secondaryIds could be others in list? Let's just assign primary for now.
            } else {
                assignedId = null;
            }
        }
    } else {
        // --- STANDARD LOGIC (Consultations) ---
        if (t.doctorIds && t.doctorIds.length > 0) {
            assignedId = t.doctorIds[0];
            secondaryIds = t.doctorIds.slice(1);
        } else {
            assignedId = t.defaultDoctorId;
            secondaryIds = t.secondaryDoctorIds || [];
        }
    }

    // --- ZOMBIE PROTECTION ---
    // Critical Fix: Ensure that assigned doctors actually exist in the current doctor list.
    // This prevents a deleted doctor (who might still be referenced in the template) from appearing.
    if (assignedId && !doctors.some(d => d.id === assignedId)) {
        assignedId = null;
    }
    secondaryIds = secondaryIds.filter(sid => doctors.some(d => d.id === sid));
    
    // Also check backup doctor existence
    let backupDoctorId = t.backupDoctorId;
    if (backupDoctorId && !doctors.some(d => d.id === backupDoctorId)) {
        backupDoctorId = null;
    }
    // -------------------------

    slots.push({
      id: generatedId,
      date: finalDate, // Use the potentially moved date
      day: t.day,
      period: finalPeriod,
      time: t.time,
      location: t.location,
      type: t.type,
      subType: t.subType, // Name of RCP
      assignedDoctorId: assignedId,
      secondaryDoctorIds: secondaryIds,
      backupDoctorId: backupDoctorId, 
      isGenerated: true,
      isBlocking: t.isBlocking !== undefined ? t.isBlocking : true,
      isUnconfirmed: isUnconfirmed
    });
  });

  // 2. GENERATE ACTIVITY SLOTS
  activities.forEach(act => {
      const days = Object.values(DayOfWeek);
      const periods = [Period.MORNING, Period.AFTERNOON];

      days.forEach(day => {
          const date = getDateForDayOfWeek(mondayDate, day);
          periods.forEach(p => {
              slots.push({
                  id: `act-${act.id}-${date}-${p}`,
                  date: date,
                  day: day,
                  period: p,
                  location: act.name,
                  type: SlotType.ACTIVITY,
                  subType: act.name,
                  activityId: act.id, 
                  assignedDoctorId: null,
                  isBlocking: !act.allowDoubleBooking
              });
          });
      });
  });

  // 3. FILL AUTO-ACTIVITIES
  if (forceRegenerateActivities) {
      return fillAutoActivities(slots, activities, doctors, unavailabilities, shiftHistory);
  }

  return slots;
};

// HELPER: Generate full month
export const generateMonthSchedule = (
    startOfMonth: Date, 
    template: ScheduleTemplateSlot[], 
    unavailabilities: Unavailability[], 
    doctors: Doctor[],
    activities: ActivityDefinition[],
    rcpDefinitions: RcpDefinition[],
    shiftHistory: ShiftHistory,
    rcpAttendance: RcpAttendance
): ScheduleSlot[] => {
    let allSlots: ScheduleSlot[] = [];
    const current = new Date(startOfMonth);
    
    for (let i = 0; i < 5; i++) {
        const weekSlots = generateScheduleForWeek(
            new Date(current), 
            template, 
            unavailabilities, 
            doctors, 
            activities, 
            rcpDefinitions, 
            true, 
            shiftHistory,
            rcpAttendance,
            [] // Exceptions not typically rendered in full month view for now, or could pass
        );
        allSlots = [...allSlots, ...weekSlots];
        current.setDate(current.getDate() + 7);
    }
    return allSlots;
};

export const detectConflicts = (
  slots: ScheduleSlot[],
  unavailabilities: Unavailability[],
  doctors: Doctor[],
  activities: ActivityDefinition[]
): Conflict[] => {
  const conflicts: Conflict[] = [];
  const doctorSlots: Record<string, ScheduleSlot[]> = {};

  // Map slots to doctors (including secondary doctors!)
  slots.forEach(slot => {
    const docs = [slot.assignedDoctorId, ...(slot.secondaryDoctorIds || [])].filter(Boolean) as string[];
    docs.forEach(dId => {
        if (!doctorSlots[dId]) doctorSlots[dId] = [];
        doctorSlots[dId].push(slot);
    });
  });

  // 1. Unavailability
  unavailabilities.forEach(absence => {
    const docSlots = doctorSlots[absence.doctorId] || [];
    docSlots.forEach(slot => {
      // Check granular absence
      if (isAbsent({ id: absence.doctorId } as Doctor, slot.date, slot.period, [absence])) {
         conflicts.push({
           id: `conflict-abs-${slot.id}-${absence.doctorId}`,
           slotId: slot.id,
           doctorId: absence.doctorId,
           type: 'UNAVAILABLE',
           description: `Absent (${absence.reason}${absence.period && absence.period !== 'ALL_DAY' ? ' - ' + absence.period : ''})`,
           severity: 'HIGH'
         });
      }
    });
  });

  // 2. Double Booking & Exclusions
  Object.keys(doctorSlots).forEach(doctorId => {
    const doc = doctors.find(d => d.id === doctorId);
    const mySlots = doctorSlots[doctorId];
    
    // Check Profile Exclusions
    if (doc) {
        mySlots.forEach(slot => {
            if (doc.excludedDays.includes(slot.day)) {
                conflicts.push({
                    id: `conflict-day-excl-${slot.id}-${doctorId}`,
                    slotId: slot.id,
                    doctorId,
                    type: 'UNAVAILABLE',
                    description: `Ne travaille pas le ${slot.day}`,
                    severity: 'MEDIUM'
                });
            }
            if (slot.activityId && doc.excludedActivities.includes(slot.activityId)) {
                conflicts.push({
                    id: `conflict-act-excl-${slot.id}-${doctorId}`,
                    slotId: slot.id,
                    doctorId,
                    type: 'COMPETENCE_MISMATCH',
                    description: `Exclu de l'activité : ${slot.subType}`,
                    severity: 'HIGH'
                });
            }
        });
    }

    // Check Double Booking
    for (let i = 0; i < mySlots.length; i++) {
      for (let j = i + 1; j < mySlots.length; j++) {
        const s1 = mySlots[i];
        const s2 = mySlots[j];

        if (s1.date === s2.date && s1.period === s2.period) {
             const isS1Blocking = s1.isBlocking !== false; 
             const isS2Blocking = s2.isBlocking !== false;
             
             if (isS1Blocking && isS2Blocking && s1.id !== s2.id) {
                conflicts.push({
                  id: `conflict-db-${s1.id}-${s2.id}-${doctorId}`,
                  slotId: s1.id,
                  doctorId: doctorId,
                  type: 'DOUBLE_BOOKING',
                  description: `Double réservation`,
                  severity: 'HIGH'
                });
             }
        }
      }
    }
  });

  return conflicts;
};

export const getAvailableDoctors = (
  allDoctors: Doctor[],
  slots: ScheduleSlot[],
  unavailabilities: Unavailability[],
  targetDay: DayOfWeek,
  targetPeriod: Period,
  targetDate?: string,
  targetSlotType?: SlotType
): Doctor[] => {
  return allDoctors.filter(doc => {
    if (targetDate) {
      if (isAbsent(doc, targetDate, targetPeriod, unavailabilities)) return false;
      if (doc.excludedDays.includes(targetDay)) return false;
      if (targetSlotType && doc.excludedSlotTypes?.includes(targetSlotType)) return false;

      const isBusy = slots.some(s => 
          s.date === targetDate &&
          s.period === targetPeriod && 
          (s.assignedDoctorId === doc.id || s.secondaryDoctorIds?.includes(doc.id)) &&
          s.isBlocking !== false
      );
      if (isBusy) return false;
    }
    return true;
  });
};
