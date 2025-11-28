
import React, { useContext, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, UserCircle, Database, LogOut, Activity } from 'lucide-react';
import { AppContext } from '../App';
import { getDateForDayOfWeek } from '../services/scheduleService';

const Sidebar: React.FC = () => {
  const { currentUser, setCurrentUser, template, rcpAttendance } = useContext(AppContext);

  // Calculate Notification Count for RCPs (Strictly Next Week + My Decision Pending)
  const notificationCount = useMemo(() => {
    if (!currentUser) return 0;
    
    let pendingCount = 0;
    const today = new Date();
    const currentMonday = new Date(today);
    const day = currentMonday.getDay();
    const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
    currentMonday.setDate(diff);
    currentMonday.setHours(0,0,0,0);

    // ONLY Check Next Week (Week +1)
    const targetMonday = new Date(currentMonday);
    targetMonday.setDate(targetMonday.getDate() + 7);

    template.forEach(t => {
        if (t.type === 'RCP') {
            // Am I involved?
            const isInvolved = 
                (t.doctorIds && t.doctorIds.includes(currentUser.id)) ||
                (t.defaultDoctorId === currentUser.id) ||
                (t.secondaryDoctorIds && t.secondaryDoctorIds.includes(currentUser.id)) ||
                (t.backupDoctorId === currentUser.id);

            if (isInvolved) {
                const slotDate = getDateForDayOfWeek(targetMonday, t.day);
                const generatedId = `${t.id}-${slotDate}`;
                
                // Check if *I* have made a decision
                const myDecision = rcpAttendance[generatedId]?.[currentUser.id];
                
                // If I haven't decided (Present or Absent), it counts
                if (!myDecision) {
                    pendingCount++;
                }
            }
        }
    });

    return pendingCount;
  }, [currentUser, template, rcpAttendance]);

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
    { to: '/planning', icon: CalendarDays, label: 'Planning Global' },
    { to: '/activities', icon: Activity, label: 'Activités' },
    { to: '/configuration', icon: Database, label: 'Règles & Postes' },
    { to: '/profile', icon: UserCircle, label: 'Mon Profil & Dispo', badge: notificationCount },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col print:hidden">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-wider text-blue-400">RadioPlan AI</h1>
        <p className="text-xs text-slate-400 mt-1">Oncologie & Radiothérapie</p>
      </div>
      
      <nav className="flex-1 py-6 space-y-2 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center px-4 py-3 rounded-lg transition-colors relative ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5 mr-3" />
            <span className="font-medium">{item.label}</span>
            {item.badge && item.badge > 0 && (
                <span className="absolute right-3 top-3 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {item.badge}
                </span>
            )}
          </NavLink>
        ))}
      </nav>

      {currentUser && (
        <div className="p-4 bg-slate-800 border-t border-slate-700">
            <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mr-3 ${currentUser.color}`}>
                    {currentUser.name.substring(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{currentUser.name}</p>
                    <button 
                        onClick={() => setCurrentUser(null)}
                        className="text-xs text-slate-400 hover:text-white flex items-center mt-1"
                    >
                        <LogOut className="w-3 h-3 mr-1" />
                        Déconnexion
                    </button>
                </div>
            </div>
        </div>
      )}

      {!currentUser && (
         <div className="p-4 border-t border-slate-800">
             <div className="text-xs text-slate-500 text-center">
                 Non connecté
             </div>
         </div>
      )}
    </aside>
  );
};

export default Sidebar;
