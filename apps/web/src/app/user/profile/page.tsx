'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Globe2, Search, Zap } from 'lucide-react';
import { api, Country, CountryStatus } from '../../../lib/api';
import {
  Card,
  Button,
  Alert,
  Spinner,
  colors,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';

interface Me {
  id: string;
  displayName: string | null;
  email: string | null;
  status: string;
  routingPreference?: { routingMode: string; preferredCountry: string | null };
}

const faCountryNames: Record<string, string> = {
  DE: 'آلمان',
  FR: 'فرانسه',
  NL: 'هلند',
  TR: 'ترکیه',
  GB: 'بریتانیا',
  US: 'ایالات متحده',
};

function countryName(country: Country, lang: string) {
  return lang === 'fa'
    ? (faCountryNames[country.code] ?? country.name)
    : country.name;
}

function withValues(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, String(value)),
    template,
  );
}

export default function UserProfilePage() {
  const { lang } = useLang();
  const [me, setMe] = useState<Me | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryStatuses, setCountryStatuses] = useState<
    Record<string, CountryStatus>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [routingMode, setRoutingMode] = useState('auto');
  const [preferredCountry, setPreferredCountry] = useState('');

  useEffect(() => {
    Promise.all([
      api.me(),
      api.countries.list(),
      api.countries.status().catch(() => []),
    ])
      .then(([profile, countryList, statuses]) => {
        const d = profile as Me;
        setMe(d);
        setRoutingMode(d.routingPreference?.routingMode || 'auto');
        setPreferredCountry(d.routingPreference?.preferredCountry || '');
        setCountries(countryList as Country[]);
        setCountryStatuses(
          Object.fromEntries(
            (statuses as CountryStatus[]).map((status) => [
              status.code,
              status,
            ]),
          ),
        );
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : 'Failed to load profile'),
      )
      .finally(() => setLoading(false));
  }, []);

  const filteredCountries = useMemo(() => {
    const query = countryQuery.trim().toLowerCase();
    return countries
      .filter((country) => {
        const label = countryName(country, lang);
        return (
          !query ||
          country.code.toLowerCase().includes(query) ||
          country.name.toLowerCase().includes(query) ||
          label.toLowerCase().includes(query)
        );
      })
      .sort((a, b) =>
        countryName(a, lang).localeCompare(
          countryName(b, lang),
          lang === 'fa' ? 'fa' : 'en',
        ),
      );
  }, [countries, countryQuery, lang]);

  async function saveRouting() {
    if (routingMode === 'country' && !preferredCountry) {
      setError(t(lang, 'prof.country_none'));
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateRoutingPreference(
        routingMode,
        routingMode === 'country' ? preferredCountry : undefined,
      );
      setSuccess(t(lang, 'prof.saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1
        style={{
          margin: '0 0 24px',
          fontSize: 24,
          fontWeight: 700,
          color: colors.navy,
        }}
      >
        {t(lang, 'prof.title')}
      </h1>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert message={error} />
        </div>
      )}
      {success && (
        <div style={{ marginBottom: 16 }}>
          <Alert message={success} type="success" />
        </div>
      )}

      <Card style={{ padding: '24px', marginBottom: 20 }}>
        <h2
          style={{
            margin: '0 0 16px',
            fontSize: 16,
            fontWeight: 700,
            color: colors.navy,
          }}
        >
          {t(lang, 'prof.account')}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p
              style={{
                margin: '0 0 4px',
                fontSize: 12,
                fontWeight: 600,
                color: colors.textMuted,
              }}
            >
              {t(lang, 'prof.name')}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 500,
                color: colors.text,
              }}
            >
              {me?.displayName || '—'}
            </p>
          </div>
          <div>
            <p
              style={{
                margin: '0 0 4px',
                fontSize: 12,
                fontWeight: 600,
                color: colors.textMuted,
              }}
            >
              {t(lang, 'prof.email')}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                color: colors.text,
                direction: 'ltr',
                textAlign: 'start',
              }}
            >
              {me?.email || '—'}
            </p>
          </div>
        </div>
      </Card>

      <Card style={{ padding: '24px' }}>
        <h2
          style={{
            margin: '0 0 6px',
            fontSize: 16,
            fontWeight: 700,
            color: colors.navy,
          }}
        >
          {t(lang, 'prof.routing')}
        </h2>
        <p
          style={{
            margin: '0 0 18px',
            color: colors.textMuted,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {t(lang, 'prof.country_help')}
        </p>

        <div style={{ display: 'grid', gap: 18 }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend
              style={{
                fontSize: 13,
                fontWeight: 650,
                color: '#334155',
                marginBottom: 8,
              }}
            >
              {t(lang, 'prof.mode')}
            </legend>
            <div className="routing-mode-grid">
              <button
                type="button"
                className="routing-mode-card"
                data-selected={routingMode === 'auto'}
                onClick={() => setRoutingMode('auto')}
                aria-pressed={routingMode === 'auto'}
              >
                <span className="routing-mode-card__icon">
                  <Zap size={17} />
                </span>
                <span>
                  <span className="routing-mode-card__title">
                    {t(lang, 'prof.auto')}
                  </span>
                  <span className="routing-mode-card__description">
                    {t(lang, 'prof.auto_desc')}
                  </span>
                </span>
                {routingMode === 'auto' && (
                  <Check
                    size={17}
                    className="routing-country-option__check"
                    aria-hidden="true"
                  />
                )}
              </button>
              <button
                type="button"
                className="routing-mode-card"
                data-selected={routingMode === 'country'}
                onClick={() => setRoutingMode('country')}
                aria-pressed={routingMode === 'country'}
              >
                <span className="routing-mode-card__icon">
                  <Globe2 size={17} />
                </span>
                <span>
                  <span className="routing-mode-card__title">
                    {t(lang, 'prof.country')}
                  </span>
                  <span className="routing-mode-card__description">
                    {t(lang, 'prof.country_desc')}
                  </span>
                </span>
                {routingMode === 'country' && (
                  <Check
                    size={17}
                    className="routing-country-option__check"
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>
          </fieldset>

          {routingMode === 'country' && (
            <div className="routing-country-picker">
              <div className="routing-country-picker__heading">
                <div>
                  <label
                    htmlFor="country-search"
                    style={{ fontSize: 13, fontWeight: 650, color: '#334155' }}
                  >
                    {t(lang, 'prof.country')}
                  </label>
                  {preferredCountry && (
                    <p className="routing-selected">
                      {t(lang, 'prof.country_selected').replace(
                        '{country}',
                        preferredCountry,
                      )}
                    </p>
                  )}
                </div>
              </div>
              <div className="routing-search">
                <Search size={16} aria-hidden="true" />
                <input
                  id="country-search"
                  value={countryQuery}
                  onChange={(event) => setCountryQuery(event.target.value)}
                  placeholder={t(lang, 'prof.country_search')}
                  autoComplete="off"
                />
              </div>
              {filteredCountries.length ? (
                <div
                  className="routing-country-list"
                  role="listbox"
                  aria-label={t(lang, 'prof.country')}
                >
                  {filteredCountries.map((country) => {
                    const status = countryStatuses[country.code];
                    const available = status
                      ? status.available !== false &&
                        (status.healthy > 0 || (status.active ?? 0) > 0)
                      : true;
                    const selected = preferredCountry === country.code;
                    return (
                      <button
                        type="button"
                        key={country.code}
                        className="routing-country-option"
                        data-selected={selected}
                        disabled={!available}
                        onClick={() => setPreferredCountry(country.code)}
                        role="option"
                        aria-selected={selected}
                        title={
                          !available
                            ? t(lang, 'prof.country_unavailable')
                            : undefined
                        }
                      >
                        <span className="routing-country-option__flag">
                          {country.code}
                        </span>
                        <span className="routing-country-option__body">
                          <span className="routing-country-option__name">
                            {countryName(country, lang)}
                          </span>
                          <span className="routing-country-option__meta">
                            {status
                              ? withValues(t(lang, 'prof.country_nodes'), {
                                  healthy: status.healthy,
                                  total: status.total,
                                })
                              : t(lang, 'prof.country')}
                            {!available &&
                              ` · ${t(lang, 'prof.country_unavailable')}`}
                          </span>
                        </span>
                        {selected && (
                          <Check
                            size={16}
                            className="routing-country-option__check"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="routing-country-empty">
                  {t(lang, 'prof.country_none')}
                </div>
              )}
            </div>
          )}

          <div style={{ paddingTop: 2 }}>
            <Button
              onClick={saveRouting}
              disabled={
                saving || (routingMode === 'country' && !preferredCountry)
              }
            >
              {saving ? t(lang, 'prof.saving') : t(lang, 'prof.save')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
