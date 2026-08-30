'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Card, Button, Input, Alert, Spinner, colors } from '../../../lib/ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';

interface Me {
  id: string;
  displayName: string | null;
  email: string | null;
  status: string;
  routingPreference?: { routingMode: string; preferredCountry: string | null };
}

export default function UserProfilePage() {
  const { lang } = useLang();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [routingMode, setRoutingMode] = useState('auto');
  const [preferredCountry, setPreferredCountry] = useState('');

  useEffect(() => {
    api.me()
      .then((data) => {
        const d = data as Me;
        setMe(d);
        setRoutingMode(d.routingPreference?.routingMode || 'auto');
        setPreferredCountry(d.routingPreference?.preferredCountry || '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  async function saveRouting() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateRoutingPreference(routingMode, routingMode === 'country' ? preferredCountry : undefined);
      setSuccess(t(lang, 'prof.saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 700, color: colors.navy }}>{t(lang, 'prof.title')}</h1>

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}
      {success && <div style={{ marginBottom: 16 }}><Alert message={success} type="success" /></div>}

      <Card style={{ padding: '24px', marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: colors.navy }}>{t(lang, 'prof.account')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t(lang, 'prof.name')}</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: colors.text }}>{me?.displayName || '—'}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t(lang, 'prof.email')}</p>
            <p style={{ margin: 0, fontSize: 15, color: colors.text }}>{me?.email || '—'}</p>
          </div>
        </div>
      </Card>

      <Card style={{ padding: '24px' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: colors.navy }}>{t(lang, 'prof.routing')}</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 8 }}>
              {t(lang, 'prof.mode')}
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(['auto', 'country'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setRoutingMode(mode)}
                  style={{
                    padding: '8px 20px', fontSize: 14, fontWeight: routingMode === mode ? 600 : 400,
                    borderRadius: 6, border: `2px solid ${routingMode === mode ? colors.primary : colors.border}`,
                    backgroundColor: routingMode === mode ? '#eff6ff' : '#fff',
                    color: routingMode === mode ? colors.primary : colors.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  {mode === 'auto' ? t(lang, 'prof.auto') : t(lang, 'prof.country')}
                </button>
              ))}
            </div>
          </div>

          {routingMode === 'country' && (
            <Input
              label={t(lang, 'prof.country_label')}
              value={preferredCountry}
              onChange={setPreferredCountry}
              placeholder="DE, NL, US..."
            />
          )}

          <div style={{ paddingTop: 4 }}>
            <Button onClick={saveRouting} disabled={saving}>
              {saving ? t(lang, 'prof.saving') : t(lang, 'prof.save')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
