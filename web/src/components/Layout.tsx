import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  Contact,
  FileText,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  RussianRuble,
  Users,
} from 'lucide-react';
import { getLessons } from '../api/lessons';
import { getHomeworkQueue } from '../api/homework';
import { useConfirm } from './ConfirmDialog';
import { getTutorProfile } from '../api/tutor';
import { getTutorStudents } from '../api/tutorStudents';
import { useAuth } from '../context/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface LayoutProps {
  children: ReactNode;
}

const NAV_GROUPS = [
  {
    title: 'Главное',
    items: [
      { to: '/', label: 'Главная', icon: 'home', exact: true },
      { to: '/schedule', label: 'Расписание', icon: 'calendar' },
    ],
  },
  {
    title: 'Учебный процесс',
    items: [
      { to: '/students', label: 'Ученики', icon: 'users' },
      { to: '/assignments', label: 'Задания', icon: 'file' },
      { to: '/materials', label: 'Материалы', icon: 'book' },
    ],
  },
  {
    title: 'Структура',
    items: [{ to: '/contacts', label: 'Контакты', icon: 'contact' }],
  },
  {
    title: 'Финансы',
    items: [{ to: '/finance', label: 'Финансы', icon: 'ruble' }],
  },
] as const;

type NavIconName = (typeof NAV_GROUPS)[number]['items'][number]['icon'];

type NavItem = { to: string; label: string; icon: NavIconName; exact?: boolean };
const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item })),
);

const NAV_ICON_MAP = {
  home: Home,
  calendar: CalendarDays,
  users: Users,
  file: FileText,
  book: BookOpen,
  contact: Contact,
  ruble: RussianRuble,
} as const;

function NavIcon({ name }: { name: NavIconName }) {
  const Icon = NAV_ICON_MAP[name];
  return <Icon size={19} strokeWidth={2.1} aria-hidden />;
}

function getInitials(label: string) {
  return label
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const sidebarButtonBase = {
  borderRadius: '50%',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
} as const;

export default function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 820px)');
  const [tutorLabel, setTutorLabel] = useState('Репетитор');
  const [tutorSubtitle, setTutorSubtitle] = useState('Личный кабинет');
  const [lessonRequestCount, setLessonRequestCount] = useState(0);
  const [pendingStudentCount, setPendingStudentCount] = useState(0);
  const [homeworkCount, setHomeworkCount] = useState(0);
  const initials = useMemo(() => getInitials(tutorLabel), [tutorLabel]);
  const isProfileActive = location.pathname.startsWith('/profile');

  // SB2: сворачиваемый сайдбар. Состояние помним в localStorage.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      // localStorage недоступен — не критично
    }
  }, [collapsed]);

  // Рельса из иконок — только на десктопе/планшете (на мобиле сайдбар — верхняя плашка).
  const railMode = !isMobile && collapsed;

  const badgeFor = (to: string): { count: number; color: string } | null => {
    if (to === '/schedule' && lessonRequestCount > 0) return { count: lessonRequestCount, color: '#e53e3e' };
    if (to === '/students' && pendingStudentCount > 0) return { count: pendingStudentCount, color: '#d97706' };
    if (to === '/assignments' && homeworkCount > 0) return { count: homeworkCount, color: '#e53e3e' };
    return null;
  };

  const handleLogout = async () => {
    const confirmed = await confirm('Вы действительно хотите выйти из кабинета?');
    if (!confirmed) return;

    logout();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    let cancelled = false;

    const loadTutorProfile = async () => {
      try {
        const profile = await getTutorProfile();
        if (!cancelled) {
          setTutorLabel(profile.full_name || 'Репетитор');
          setTutorSubtitle('Личный кабинет');
        }
      } catch {
        if (!cancelled) {
          setTutorLabel('Репетитор');
          setTutorSubtitle('Личный кабинет');
        }
      }
    };

    const loadRequestCount = async () => {
      try {
        const [lessons, tutorStudents, homeworkQueue] = await Promise.all([
          getLessons(),
          getTutorStudents(),
          getHomeworkQueue(),
        ]);
        if (!cancelled) {
          const lessonCount = lessons.filter(
            (l) =>
              l.conduct_status === 'booking_pending' ||
              l.conduct_status === 'reschedule_pending' ||
              l.payment_status === 'payment_pending'
          ).length;
          const studentCount = tutorStudents.filter((ts) => ts.status === 'pending').length;
          setLessonRequestCount(lessonCount);
          setPendingStudentCount(studentCount);
          setHomeworkCount(homeworkQueue.length);
        }
      } catch {
        // не критично — бейджи просто не покажутся
      }
    };

    void loadTutorProfile();
    void loadRequestCount();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        height: isMobile ? 'auto' : '100dvh',
        minHeight: isMobile ? '100vh' : '100dvh',
        display: 'grid',
        gridTemplateColumns: isMobile
          ? '1fr'
          : railMode
            ? '76px minmax(0, 1fr)'
            : isTablet
              ? '208px minmax(0, 1fr)'
              : '232px minmax(0, 1fr)',
        background: 'transparent',
        overflow: isMobile ? 'visible' : 'hidden',
      }}
    >
      <aside
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(86,112,158,0.28), transparent 24%), linear-gradient(180deg, #152238 0%, #111d30 52%, #0d1728 100%)',
          color: '#f8fafc',
          padding: isMobile ? '14px 14px 12px' : railMode ? '18px 12px 16px' : '22px 18px 18px',
          borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
          borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none',
          boxShadow: isMobile
            ? '0 14px 32px rgba(18, 26, 38, 0.12)'
            : '18px 0 42px rgba(15, 23, 42, 0.16)',
          position: isMobile ? 'relative' : 'sticky',
          top: 0,
          height: isMobile ? 'auto' : '100dvh',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div
          style={{
            padding: railMode ? '0 0 12px' : '2px 8px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: railMode ? 'center' : 'space-between',
              gap: 8,
              marginBottom: railMode ? 14 : 16,
            }}
          >
            {!railMode && (
              <div
                style={{
                  fontSize: 13,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.72)',
                  fontWeight: 800,
                }}
              >
                Mentor App
              </div>
            )}
            {!isMobile && (
              <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                title={railMode ? 'Развернуть меню' : 'Свернуть меню'}
                aria-label={railMode ? 'Развернуть меню' : 'Свернуть меню'}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.78)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  flex: '0 0 auto',
                }}
              >
                {railMode ? <PanelLeftOpen size={18} strokeWidth={2.1} aria-hidden style={{ display: 'block' }} /> : <PanelLeftClose size={18} strokeWidth={2.1} aria-hidden style={{ display: 'block' }} />}
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: railMode ? 'center' : 'flex-start',
              gap: 10,
              marginBottom: railMode ? 0 : 10,
            }}
          >
            <button
              type="button"
              onClick={() => navigate('/profile')}
              title="Личный кабинет"
              style={{
                ...sidebarButtonBase,
                width: railMode ? 44 : 52,
                height: railMode ? 44 : 52,
                border: isProfileActive
                  ? '1px solid rgba(255,255,255,0.18)'
                  : '1px solid rgba(255,255,255,0.1)',
                background: isProfileActive
                  ? 'linear-gradient(180deg, rgba(42,171,238,0.96) 0%, rgba(34,158,217,0.96) 100%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                fontSize: railMode ? 16 : 18,
                fontWeight: 800,
                boxShadow: isProfileActive
                  ? '0 10px 24px rgba(42,171,238,0.24)'
                  : '0 8px 18px rgba(7, 11, 20, 0.18)',
              }}
            >
              {initials || 'Р'}
            </button>

            {!railMode && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.05 }}>{tutorLabel}</div>
                <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 13 }}>{tutorSubtitle}</div>
              </div>
            )}
          </div>
        </div>

        {railMode ? (
          <nav style={{ display: 'grid', gap: 8, overflowY: 'auto', justifyItems: 'center', minHeight: 0 }}>
            {ALL_NAV_ITEMS.map((item) => {
              const badge = badgeFor(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact ?? false}
                  title={item.label}
                  style={({ isActive }) => ({
                    position: 'relative',
                    display: 'grid',
                    placeItems: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.72)',
                    background: isActive
                      ? 'linear-gradient(180deg, #2AABEE 0%, #229ED9 100%)'
                      : 'rgba(255,255,255,0.04)',
                    border: isActive
                      ? '1px solid rgba(255,255,255,0.12)'
                      : '1px solid rgba(255,255,255,0.05)',
                    boxShadow: isActive ? '0 12px 26px rgba(42,171,238,0.28)' : 'none',
                  })}
                >
                  <NavIcon name={item.icon} />
                  {badge && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        minWidth: 9,
                        height: 9,
                        borderRadius: 999,
                        background: badge.color,
                        border: '2px solid #111d30',
                      }}
                    />
                  )}
                </NavLink>
              );
            })}
          </nav>
        ) : (
        <nav style={{ display: 'grid', gap: 16, overflowY: 'auto', paddingRight: 2, minHeight: 0 }}>
          {NAV_GROUPS.map((group) => (
            <div
              key={group.title}
              style={{
                display: 'grid',
                gap: 8,
                padding: '10px',
                borderRadius: 20,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.025) 100%)',
                border: '1px solid rgba(255,255,255,0.055)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <div
                style={{
                  padding: '0 10px',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.42)',
                  fontWeight: 700,
                }}
              >
                {group.title}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 6,
                  gridTemplateColumns: isMobile ? 'repeat(auto-fit, minmax(132px, 1fr))' : '1fr',
                }}
              >
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={'exact' in item ? item.exact : false}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      minHeight: 46,
                      padding: '0 14px',
                      borderRadius: 14,
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.72)',
                      background: isActive
                        ? 'linear-gradient(180deg, #2AABEE 0%, #229ED9 100%)'
                        : 'rgba(255,255,255,0.025)',
                      border: isActive
                        ? '1px solid rgba(255,255,255,0.12)'
                        : '1px solid rgba(255,255,255,0.04)',
                      boxShadow: isActive
                        ? '0 12px 26px rgba(42,171,238,0.28)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                      fontSize: 14,
                      fontWeight: 700,
                    })}
                  >
                    <span
                      style={{
                        width: 25,
                        height: 25,
                        borderRadius: 9,
                        display: 'inline-grid',
                        placeItems: 'center',
                        background: 'rgba(255,255,255,0.08)',
                        color: 'inherit',
                        flex: '0 0 auto',
                      }}
                    >
                      <NavIcon name={item.icon} />
                    </span>
                    <span>{item.label}</span>
                    {(() => {
                      const badge = badgeFor(item.to);
                      if (!badge) return null;
                      return (
                        <span
                          style={{
                            marginLeft: 'auto',
                            background: badge.color,
                            color: '#fff',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 800,
                            minWidth: 18,
                            height: 18,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 5px',
                            lineHeight: 1,
                          }}
                        >
                          {badge.count}
                        </span>
                      );
                    })()}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        )}

        <div
          style={{
            marginTop: 'auto',
            padding: '12px 8px 0',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            justifyContent: isMobile ? 'flex-start' : 'center',
          }}
        >
          <button
            type="button"
            title="Выйти из кабинета"
            onClick={handleLogout}
            style={{
              ...sidebarButtonBase,
              width: 44,
              height: 44,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
              boxShadow: '0 8px 18px rgba(7, 11, 20, 0.18)',
              fontSize: 20,
            }}
          >
            <LogOut size={21} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      </aside>

      <main
        style={{
          minWidth: 0,
          padding: isMobile ? '12px' : isTablet ? '14px' : '16px 18px 20px',
          height: isMobile ? 'auto' : '100dvh',
          minHeight: 0,
          overflow: isMobile ? 'visible' : 'hidden',
          display: 'grid',
        }}
      >
        <div
          style={{
            height: isMobile ? 'auto' : isTablet ? 'calc(100dvh - 28px)' : 'calc(100dvh - 36px)',
            minHeight: isMobile ? 'auto' : 0,
            borderRadius: isMobile ? 18 : 28,
            background: 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(255,255,255,0.78)',
            boxShadow: '0 26px 70px rgba(21, 32, 51, 0.08)',
            backdropFilter: 'blur(18px)',
            padding: isMobile ? 12 : isTablet ? 16 : 22,
            overflow: isMobile ? 'visible' : 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
