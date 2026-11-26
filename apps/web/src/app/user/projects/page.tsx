'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FolderPlus,
  FolderOpen,
  Trash2,
  Pencil,
  Layers,
  Globe2,
  KeyRound,
} from 'lucide-react';
import { api, Project } from '../../../lib/api';
import { useLang } from '../../../lib/lang-context';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Modal,
  Badge,
  Alert,
  Spinner,
  formatDateTime,
} from '../../../components/user-ui';
import { toast } from 'sonner';

export default function ProjectsPage() {
  const { lang } = useLang();
  const router = useRouter();
  const tx = (en: string, fa: string) => (lang === 'fa' ? fa : en);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setProjects(await api.projects.list());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const query = new URLSearchParams(window.location.search);
    if (
      query.get('create') === '1' &&
      /^[1-9][0-9]*$/.test(query.get('node') ?? '')
    )
      setShowCreate(true);
  }, []);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const project = await api.projects.create({ name: newName.trim() });
      setNewName('');
      setShowCreate(false);
      toast.success(tx('Project created', 'پروژه ساخته شد'));
      const nodeId = new URLSearchParams(window.location.search).get('node');
      const suffix =
        nodeId && /^[1-9][0-9]*$/.test(nodeId) ? `?node=${nodeId}&add=1` : '';
      router.push(`/user/projects/${project.id}${suffix}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!editing || !editName.trim()) return;
    setSaving(true);
    try {
      await api.projects.update(editing.id, { name: editName.trim() });
      setEditing(null);
      toast.success(tx('Project updated', 'پروژه به‌روزرسانی شد'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update project');
    } finally {
      setSaving(false);
    }
  }

  async function remove(project: Project) {
    if (
      !confirm(
        tx(
          `Delete project "${project.name}"? Its records will be unassigned.`,
          `پروژه «${project.name}» حذف شود؟ رکوردهای آن بدون پروژه می‌شوند.`,
        ),
      )
    )
      return;
    try {
      await api.projects.remove(project.id);
      toast.success(tx('Project deleted', 'پروژه حذف شد'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete project');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={tx('Projects', 'پروژه‌ها')}
        description={tx(
          'Group your forwarders and proxy credentials into projects, like DNS zones.',
          'فوروادرها و اعتبارنامه‌های پراکسی را در قالب پروژه (مثل Zoneهای DNS) سازمان‌دهی کنید.',
        )}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <FolderPlus className="h-4 w-4" />
            <span>{tx('New project', 'پروژه جدید')}</span>
          </Button>
        }
      />

      {error && <Alert message={error} type="error" />}

      {loading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <Card className="p-10 text-center">
          <Layers className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h3 className="mt-3 text-base font-semibold">
            {tx('No projects yet', 'هنوز پروژه‌ای ندارید')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx(
              'Create a project to start adding forwarders and proxies.',
              'برای شروع، یک پروژه بسازید و فوروادر/پراکسی اضافه کنید.',
            )}
          </p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>
            <FolderPlus className="h-4 w-4" />
            <span>{tx('Create project', 'ساخت پروژه')}</span>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">
                      {project.name}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {tx('Created', 'ایجاد')}:{' '}
                      {formatDateTime(project.createdAt, lang)}
                    </p>
                  </div>
                  <Badge
                    label={
                      project.activeCount
                        ? tx('Active', 'فعال')
                        : tx('Idle', 'بی‌استفاده')
                    }
                    variant={project.activeCount ? 'success' : 'secondary'}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-border/70 p-2.5">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Globe2 className="h-3.5 w-3.5" />
                      {tx('Forwarders', 'فوروادرها')}
                    </div>
                    <div className="mt-1 text-lg font-bold">
                      {project.forwarderCount ?? 0}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 p-2.5">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <KeyRound className="h-3.5 w-3.5" />
                      {tx('Credentials', 'اعتبارنامه‌ها')}
                    </div>
                    <div className="mt-1 text-lg font-bold">
                      {project.credentialCount ?? 0}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/user/projects/${project.id}`}
                    className="flex-1"
                  >
                    <Button className="w-full" size="sm">
                      <FolderOpen className="h-4 w-4" />
                      <span>{tx('Open', 'باز کردن')}</span>
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(project);
                      setEditName(project.name);
                    }}
                    aria-label={tx('Rename', 'تغییر نام')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => remove(project)}
                    aria-label={tx('Delete', 'حذف')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal
          title={tx('New project', 'پروژه جدید')}
          description={tx(
            'A project groups related forwarders and proxies.',
            'پروژه، فوروادرها و پراکسی‌های مرتبط را کنار هم نگه می‌دارد.',
          )}
          onClose={() => setShowCreate(false)}
          open={showCreate}
        >
          <div className="space-y-4">
            <Input
              label={tx('Project name', 'نام پروژه')}
              placeholder={tx(
                'e.g. Telegram Bot, My App',
                'مثال: ربات تلگرام، اپلیکیشن من',
              )}
              value={newName}
              onChange={setNewName}
              required
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreate(false)}
              >
                {tx('Cancel', 'انصراف')}
              </Button>
              <Button
                size="sm"
                onClick={create}
                disabled={creating || !newName.trim()}
              >
                {creating ? '...' : tx('Create', 'ساخت')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          title={tx('Rename project', 'تغییر نام پروژه')}
          onClose={() => setEditing(null)}
          open={!!editing}
        >
          <div className="space-y-4">
            <Input
              label={tx('Project name', 'نام پروژه')}
              value={editName}
              onChange={setEditName}
              required
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
              >
                {tx('Cancel', 'انصراف')}
              </Button>
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={saving || !editName.trim()}
              >
                {saving ? '...' : tx('Save', 'ذخیره')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
