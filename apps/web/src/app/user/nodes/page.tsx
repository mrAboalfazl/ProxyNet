'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Globe2,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Terminal,
} from 'lucide-react';
import { api, Country, Node } from '../../../lib/api';
import {
  Alert,
  Button,
  Card,
  Modal,
  PageHeader,
  Spinner,
} from '../../../components/user-ui';
import { useLang } from '../../../lib/lang-context';
import { t } from '../../../lib/i18n';

const INSTALL_COMMAND =
  'curl -fsSL https://raw.githubusercontent.com/mrAboalfazl/ProxyNet/master/scripts/install.sh | sudo bash -s -- --panel https://panel.civonex.ir --token';
const DOCS_URL = 'https://github.com/mrAboalfazl/ProxyNet#readme';
const faCountryNames: Record<string, string> = {
  DE: 'آلمان',
  FR: 'فرانسه',
  NL: 'هلند',
  TR: 'ترکیه',
  GB: 'بریتانیا',
  US: 'ایالات متحده',
};

function displayCountry(country: Country, lang: string) {
  return lang === 'fa'
    ? (faCountryNames[country.code] ?? country.name)
    : country.name;
}

function statusColor(status: string) {
  if (status === 'healthy')
    return { bg: '#dcfce7', color: '#166534', icon: CheckCircle2 };
  if (status === 'active')
    return { bg: '#dbeafe', color: '#1d4ed8', icon: CheckCircle2 };
  if (status === 'degraded')
    return { bg: '#fef3c7', color: '#92400e', icon: Info };
  if (status === 'pending')
    return { bg: '#f3f4f6', color: '#6b7280', icon: Clock3 };
  if (
    status === 'disabled' ||
    status === 'unhealthy' ||
    status === 'quarantined'
  )
    return { bg: '#fee2e2', color: '#991b1b', icon: Info };
  if (status === 'draining')
    return { bg: '#fef3c7', color: '#92400e', icon: Clock3 };
  return { bg: '#f3f4f6', color: '#374151', icon: Info };
}

function formatDate(value: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : 'en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export default function UserNodesPage() {
  const { lang, isRTL } = useLang();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{
    nodeId: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await api.myNodes.list();
      setNodes(result);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load nodes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    api.countries
      .list()
      .then(setCountries)
      .catch(() => setCountries([]));
  }, []);

  const stats = useMemo(
    () => ({
      total: nodes.length,
      healthy: nodes.filter((node) => node.status === 'healthy').length,
      pending: nodes.filter(
        (node) => node.status === 'pending' || !node.nodeSecretHash,
      ).length,
    }),
    [nodes],
  );

  const installCommand = newToken ? `${INSTALL_COMMAND} ${newToken.token}` : '';

  async function addNode() {
    if (!label.trim() || !countryCode) return;
    setCreating(true);
    setError('');
    try {
      const res = await api.myNodes.create({
        label: label.trim(),
        countryCode,
      });
      setNewToken({
        nodeId: res.node.id,
        token: res.token,
        expiresAt: res.expiresAt,
      });
      setShowAdd(false);
      setLabel('');
      setCountryCode('');
      await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add node');
    } finally {
      setCreating(false);
    }
  }

  async function copyInstallCommand() {
    if (!installCommand) return;
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError(
        lang === 'fa'
          ? 'کپی خودکار انجام نشد؛ دستور را دستی کپی کنید.'
          : 'Could not copy automatically; copy the command manually.',
      );
    }
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="nodes-page">
      <PageHeader
        title={t(lang, 'nodes.title')}
        action={
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={17} />
            {t(lang, 'nodes.add')}
          </Button>
        }
      />

      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert message={error} />
        </div>
      )}

      <section
        className="nodes-hero user-card"
        aria-labelledby="nodes-hero-title"
      >
        <div className="nodes-hero__icon">
          <Server size={24} />
        </div>
        <div className="nodes-hero__body">
          <span className="nodes-eyebrow">{t(lang, 'nodes.kicker')}</span>
          <h2 id="nodes-hero-title">{t(lang, 'nodes.hero_title')}</h2>
          <p>{t(lang, 'nodes.hero_desc')}</p>
          <div className="nodes-hero__actions">
            <Button onClick={() => setShowAdd(true)}>
              <Plus size={17} />
              {t(lang, 'nodes.add')}
            </Button>
            <a
              className="nodes-text-link"
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
            >
              {t(lang, 'nodes.view_guide')} <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>

      <section className="nodes-stats" aria-label={t(lang, 'nodes.title')}>
        <Card className="nodes-stat">
          <span>{t(lang, 'nodes.total')}</span>
          <strong>{stats.total}</strong>
        </Card>
        <Card className="nodes-stat">
          <span>{t(lang, 'nodes.healthy_count')}</span>
          <strong className="nodes-stat--green">{stats.healthy}</strong>
        </Card>
        <Card className="nodes-stat">
          <span>{t(lang, 'nodes.pending_count')}</span>
          <strong className="nodes-stat--amber">{stats.pending}</strong>
        </Card>
      </section>

      {newToken && (
        <section
          className="nodes-install user-card"
          aria-labelledby="nodes-install-title"
        >
          <div className="nodes-install__top">
            <div className="nodes-install__icon">
              <Terminal size={20} />
            </div>
            <div>
              <span className="nodes-eyebrow">
                {t(lang, 'nodes.next_step')}
              </span>
              <h2 id="nodes-install-title">{t(lang, 'nodes.install_title')}</h2>
            </div>
            <button
              className="user-icon-button"
              type="button"
              onClick={() => setNewToken(null)}
              aria-label={t(lang, 'nodes.dismiss')}
            >
              ×
            </button>
          </div>
          <p className="nodes-install__hint">{t(lang, 'nodes.install_hint')}</p>
          <div className="nodes-steps nodes-steps--compact">
            <div>
              <span>1</span>
              <p>{t(lang, 'nodes.install_step1')}</p>
            </div>
            <div>
              <span>2</span>
              <p>{t(lang, 'nodes.install_step2')}</p>
            </div>
            <div>
              <span>3</span>
              <p>{t(lang, 'nodes.install_step3')}</p>
            </div>
          </div>
          <div className="nodes-command" dir="ltr">
            <code>{installCommand}</code>
            <button
              type="button"
              onClick={copyInstallCommand}
              className="nodes-command__copy"
            >
              <Copy size={15} />
              {copied ? t(lang, 'nodes.copied') : t(lang, 'nodes.copy_cmd')}
            </button>
          </div>
          <div className="nodes-install__footer">
            <span>
              <Clock3 size={14} />
              {t(lang, 'nodes.expires')} {formatDate(newToken.expiresAt, lang)}
            </span>
            <span>
              <Info size={14} />
              {t(lang, 'nodes.approval_hint')}
            </span>
          </div>
        </section>
      )}

      <section className="nodes-how user-card">
        <div className="nodes-section-heading">
          <div>
            <span className="nodes-eyebrow">
              {t(lang, 'nodes.get_started')}
            </span>
            <h2>{t(lang, 'nodes.how_title')}</h2>
          </div>
          <div className="nodes-section-heading__badge">
            <CheckCircle2 size={15} />
            {t(lang, 'nodes.secure_setup')}
          </div>
        </div>
        <div className="nodes-steps">
          <div>
            <span>1</span>
            <h3>{t(lang, 'nodes.step_one_title')}</h3>
            <p>{t(lang, 'nodes.step_one_desc')}</p>
          </div>
          <div>
            <span>2</span>
            <h3>{t(lang, 'nodes.step_two_title')}</h3>
            <p>{t(lang, 'nodes.step_two_desc')}</p>
          </div>
          <div>
            <span>3</span>
            <h3>{t(lang, 'nodes.step_three_title')}</h3>
            <p>{t(lang, 'nodes.step_three_desc')}</p>
          </div>
        </div>
      </section>

      <section className="nodes-list-section">
        <div className="nodes-section-heading">
          <div>
            <span className="nodes-eyebrow">{t(lang, 'nodes.inventory')}</span>
            <h2>{t(lang, 'nodes.your_nodes')}</h2>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => load(false)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 size={15} className="nodes-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            {t(lang, 'nodes.refresh')}
          </Button>
        </div>
        {loading ? (
          <Spinner />
        ) : nodes.length === 0 ? (
          <Card className="nodes-empty">
            <div className="nodes-empty__icon">
              <Server size={24} />
            </div>
            <h3>{t(lang, 'nodes.empty')}</h3>
            <p>{t(lang, 'nodes.empty_msg')}</p>
            <Button onClick={() => setShowAdd(true)}>
              <Plus size={17} />
              {t(lang, 'nodes.add')}
            </Button>
          </Card>
        ) : (
          <div className="nodes-grid">
            {nodes.map((node) => {
              const status = statusColor(node.status);
              const StatusIcon = status.icon;
              const enrolled = !!node.nodeSecretHash;
              return (
                <Card className="node-card" key={node.id}>
                  <div className="node-card__top">
                    <div className="node-card__identity">
                      <div className="node-card__icon">
                        <Server size={18} />
                      </div>
                      <div>
                        <h3>{node.label}</h3>
                        <span>
                          {t(lang, 'nodes.created')}{' '}
                          {formatDate(node.createdAt, lang)}
                        </span>
                      </div>
                    </div>
                    <span
                      className="node-status"
                      style={{ background: status.bg, color: status.color }}
                    >
                      <StatusIcon size={13} />
                      {t(lang, `nodes.status.${node.status}`) || node.status}
                    </span>
                  </div>
                  <div className="node-card__details">
                    <div>
                      <Globe2 size={15} />
                      <span>{t(lang, 'nodes.country')}</span>
                      <strong dir="ltr">{node.countryCode}</strong>
                    </div>
                    <div>
                      <Terminal size={15} />
                      <span>{t(lang, 'nodes.agent')}</span>
                      <strong
                        className={
                          enrolled ? 'node-value--green' : 'node-value--muted'
                        }
                      >
                        {enrolled
                          ? t(lang, 'nodes.enrolled')
                          : t(lang, 'nodes.not_enrolled')}
                      </strong>
                    </div>
                  </div>
                  {node.ipv4Address && (
                    <div className="node-card__ip" dir="ltr">
                      {node.ipv4Address}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {showAdd && (
        <Modal title={t(lang, 'nodes.add')} onClose={() => setShowAdd(false)}>
          <div className="node-add-modal">
            <div className="node-add-modal__intro">
              <div className="node-add-modal__icon">
                <Plus size={19} />
              </div>
              <div>
                <h3>{t(lang, 'nodes.add_intro_title')}</h3>
                <p>{t(lang, 'nodes.add_intro')}</p>
              </div>
            </div>
            <label className="node-form-field">
              <span>
                {t(lang, 'nodes.label')}
                <small>{t(lang, 'nodes.required')}</small>
              </span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t(lang, 'nodes.label.placeholder')}
                autoFocus
              />
            </label>
            <label className="node-form-field">
              <span>
                {t(lang, 'nodes.country')}
                <small>{t(lang, 'nodes.required')}</small>
              </span>
              <select
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
              >
                <option value="">{t(lang, 'nodes.country_select')}</option>
                {countries.map((country) => (
                  <option value={country.code} key={country.code}>
                    {displayCountry(country, lang)} ({country.code})
                  </option>
                ))}
              </select>
              <small className="node-form-help">
                {t(lang, 'nodes.country_help')}
              </small>
            </label>
            {!countries.length && (
              <div className="node-form-notice">
                <Info size={15} />
                {t(lang, 'nodes.no_countries')}
              </div>
            )}
            <div className="node-add-modal__actions">
              <Button onClick={() => setShowAdd(false)} variant="secondary">
                {t(lang, 'cancel')}
              </Button>
              <Button
                onClick={addNode}
                disabled={creating || !label.trim() || !countryCode}
              >
                {creating ? (
                  <>
                    <Loader2 size={16} className="nodes-spin" />
                    {t(lang, 'nodes.creating')}
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    {t(lang, 'nodes.create')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
