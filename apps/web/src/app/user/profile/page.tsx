'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Globe2,
  Zap,
  Save,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import { api, Country, CountryStatus } from '../../../lib/api';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Alert,
  Spinner,
  Input,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';
import { toast } from 'sonner';

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
  return lang === 'fa' ? faCountryNames[country.code] ?? country.name : country.name;
}

export default function UserProfilePage() {
  const { lang } = useLang();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [me, setMe] = useState<Me | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryStatuses, setCountryStatuses] = useState<Record<string, CountryStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
            (statuses as CountryStatus[]).map((status) => [status.code, status])
          )
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
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
          lang === 'fa' ? 'fa' : 'en'
        )
      );
  }, [countries, countryQuery, lang]);

  async function saveRouting() {
    if (routingMode === 'country' && !preferredCountry) {
      toast.error(t(lang, 'prof.country_none'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.updateRoutingPreference(
        routingMode,
        routingMode === 'country' ? preferredCountry : undefined
      );
      toast.success(t(lang, 'prof.saved'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={t(lang, 'prof.title')}
        description={tx(
          'Manage your account profile, personal identity, and outbound proxy routing preferences.',
          'مدیریت اطلاعات کاربری، هویت و تنظیمات اولویت خروج ترافیک پروکسی از کشورها.'
        )}
      />

      {error && <Alert message={error} type="error" />}

      {/* Account Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t(lang, 'prof.account')}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {tx('Registered account credentials and role', 'اطلاعات هویت کاربری و نقش در سامانه')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t(lang, 'prof.name')}
              </span>
              <p className="text-sm font-medium">{me?.displayName || '—'}</p>
            </div>

            <div className="p-3.5 rounded-lg border bg-muted/20 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t(lang, 'prof.email')}
              </span>
              <p className="text-sm font-medium font-mono" dir="ltr">
                {me?.email || '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Routing Preferences Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t(lang, 'prof.routing')}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {t(lang, 'prof.country_help')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-0">
          {/* Mode Selection Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={() => setRoutingMode('auto')}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                routingMode === 'auto'
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border/80 hover:border-primary/40'
              }`}
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  routingMode === 'auto'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Zap className="h-5 w-5" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{t(lang, 'prof.auto')}</span>
                  {routingMode === 'auto' && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(lang, 'prof.auto_desc')}
                </p>
              </div>
            </div>

            <div
              onClick={() => setRoutingMode('country')}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                routingMode === 'country'
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border/80 hover:border-primary/40'
              }`}
            >
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  routingMode === 'country'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Globe2 className="h-5 w-5" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{t(lang, 'prof.country')}</span>
                  {routingMode === 'country' && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(lang, 'prof.country_desc')}
                </p>
              </div>
            </div>
          </div>

          {/* Country Picker Sub-section */}
          {routingMode === 'country' && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {t(lang, 'prof.country')}
                  {preferredCountry && (
                    <span className="font-mono text-primary mr-2 ml-2">
                      ({preferredCountry})
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {filteredCountries.length} {tx('locations available', 'موقعیت در دسترس')}
                </span>
              </div>

              <div className="relative">
                <Input
                  value={countryQuery}
                  onChange={setCountryQuery}
                  placeholder={t(lang, 'prof.country_search')}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto p-1 border rounded-lg bg-muted/20">
                {filteredCountries.map((country) => {
                  const status = countryStatuses[country.code];
                  const selected = preferredCountry === country.code;
                  return (
                    <div
                      key={country.code}
                      onClick={() => setPreferredCountry(country.code)}
                      className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between text-xs ${
                        selected
                          ? 'border-primary bg-primary/10 font-bold text-primary'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono px-1.5 py-0.5 rounded bg-muted text-[10px]">
                          {country.code}
                        </span>
                        <span>{countryName(country, lang)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {status && status.healthy > 0 && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-medium" title={`${status.healthy} healthy nodes`}>
                            {status.healthy}
                          </span>
                        )}
                        {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="pt-2 border-t border-border/50">
          <Button onClick={saveRouting} disabled={saving}>
            <Save className="h-4 w-4" />
            <span>{saving ? '...' : t(lang, 'prof.save')}</span>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
