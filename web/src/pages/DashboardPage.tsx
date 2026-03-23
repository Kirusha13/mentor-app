import { useMediaQuery } from '../hooks/useMediaQuery';

const panelStyle = {
  background: 'rgba(255,255,255,0.88)',
  padding: '24px',
  borderRadius: '22px',
  border: '1px solid rgba(24,33,47,0.08)',
  boxShadow: 'var(--shadow-card)',
} as const;

export default function DashboardPage() {
  const isMobile = useMediaQuery('(max-width: 720px)');

  return (
    <div>
      <section
        style={{
          ...panelStyle,
          padding: isMobile ? 18 : 28,
          background:
            'linear-gradient(140deg, rgba(255,249,242,0.98) 0%, rgba(255,255,255,0.9) 100%)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            padding: '8px 12px',
            borderRadius: 999,
            background: 'rgba(217,111,50,0.12)',
            color: '#b9551f',
            fontWeight: 700,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          Главная
        </div>

        <h1
          style={{
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            lineHeight: 0.98,
            letterSpacing: '-0.04em',
            marginBottom: 12,
          }}
        >
          Главная страница
          <br />
          пока без сводки
        </h1>

        <p style={{ color: '#5e6a7b', maxWidth: 760, fontSize: 16, marginBottom: 0 }}>
          Этот раздел пока оставлен как аккуратная заглушка. По мере разработки сюда можно
          будет добавить реальные метрики и сводную информацию из готовых модулей.
        </p>
      </section>
    </div>
  );
}
