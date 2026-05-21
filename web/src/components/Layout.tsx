import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getTutorProfile } from '../api/tutor';
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

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.1,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'home') {
    return (
      <svg {...common}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10.5V20h13v-9.5" />
        <path d="M9.5 20v-5h5v5" />
      </svg>
    );
  }

  if (name === 'calendar') {
    return (
      <svg {...common}>
        <path d="M7 3v4" />
        <path d="M17 3v4" />
        <path d="M4 8h16" />
        <path d="M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
      </svg>
    );
  }

  if (name === 'users') {
    return (
      <svg {...common}>
        <path d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4" />
        <circle cx="12" cy="8" r="3" />
        <path d="M4.5 18c.2-1.7 1.3-3.1 2.8-3.8" />
        <path d="M16.7 14.2c1.5.7 2.6 2.1 2.8 3.8" />
        <path d="M6.8 10.5a2.3 2.3 0 1 1 1.5-4" />
        <path d="M17.2 10.5a2.3 2.3 0 1 0-1.5-4" />
      </svg>
    );
  }

  if (name === 'file') {
    return (
      <svg {...common}>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h5" />
        <path d="M9.5 13h5" />
        <path d="M9.5 17h4" />
      </svg>
    );
  }

  if (name === 'book') {
    return (
      <svg {...common}>
        <path d="M5 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H5z" />
        <path d="M19 4h-5a3 3 0 0 0-3 3" />
        <path d="M19 4v13h-5a3 3 0 0 0-3 3" />
      </svg>
    );
  }

  if (name === 'contact') {
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5z" />
        <circle cx="12" cy="10" r="2.5" />
        <path d="M8.5 17c.6-2 2-3 3.5-3s2.9 1 3.5 3" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M8 4v16" />
      <path d="M16 4v16" />
      <path d="M6 8h10a3 3 0 1 1 0 6H6" />
      <path d="M6 14h12" />
    </svg>
  );
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
  const navigate = useNavigate();
  const location = useLocation();
  const isTablet = useMediaQuery('(max-width: 1100px)');
  const isMobile = useMediaQuery('(max-width: 820px)');
  const [tutorLabel, setTutorLabel] = useState('Репетитор');
  const [tutorSubtitle, setTutorSubtitle] = useState('Личный кабинет');
  const initials = useMemo(() => getInitials(tutorLabel), [tutorLabel]);
  const isProfileActive = location.pathname.startsWith('/profile');

  const handleLogout = () => {
    const confirmed = window.confirm('Вы действительно хотите выйти из кабинета?');
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

    void loadTutorProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: isMobile
          ? '1fr'
          : isTablet
            ? '238px minmax(0, 1fr)'
            : '286px minmax(0, 1fr)',
        background: 'transparent',
      }}
    >
      <aside
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(86,112,158,0.28), transparent 24%), linear-gradient(180deg, #152238 0%, #111d30 52%, #0d1728 100%)',
          color: '#f8fafc',
          padding: isMobile ? '14px 14px 12px' : '22px 18px 18px',
          borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
          borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none',
          boxShadow: isMobile
            ? '0 14px 32px rgba(18, 26, 38, 0.12)'
            : '18px 0 42px rgba(15, 23, 42, 0.16)',
          position: isMobile ? 'relative' : 'sticky',
          top: 0,
          height: isMobile ? 'auto' : '100vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div
          style={{
            padding: '2px 8px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              fontSize: 13,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.72)',
              marginBottom: 16,
              fontWeight: 800,
            }}
          >
            Mentor App
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              title="Личный кабинет"
              style={{
                ...sidebarButtonBase,
                width: 52,
                height: 52,
                border: isProfileActive
                  ? '1px solid rgba(255,255,255,0.18)'
                  : '1px solid rgba(255,255,255,0.1)',
                background: isProfileActive
                  ? 'linear-gradient(180deg, rgba(42,171,238,0.96) 0%, rgba(34,158,217,0.96) 100%)'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                fontSize: 18,
                fontWeight: 800,
                boxShadow: isProfileActive
                  ? '0 10px 24px rgba(42,171,238,0.24)'
                  : '0 8px 18px rgba(7, 11, 20, 0.18)',
              }}
            >
              {initials || 'Р'}
            </button>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.05 }}>{tutorLabel}</div>
              <div style={{ color: 'rgba(255,255,255,0.64)', fontSize: 13 }}>{tutorSubtitle}</div>
            </div>
          </div>
        </div>

        <nav style={{ display: 'grid', gap: 16, overflowY: 'auto', paddingRight: 2 }}>
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
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

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
            <svg
              aria-hidden="true"
              width="21"
              height="21"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M14 4h4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-4" />
            </svg>
          </button>
        </div>
      </aside>

      <main
        style={{
          minWidth: 0,
          padding: isMobile ? '12px' : isTablet ? '14px' : '16px 18px 20px',
        }}
      >
        <div
          style={{
            minHeight: isMobile ? 'auto' : 'calc(100vh - 36px)',
            borderRadius: isMobile ? 18 : 28,
            background: 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(255,255,255,0.78)',
            boxShadow: '0 26px 70px rgba(21, 32, 51, 0.08)',
            backdropFilter: 'blur(18px)',
            padding: isMobile ? 12 : isTablet ? 16 : 22,
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
