'use client';

import { useEffect, useState } from 'react';
import { api, Node } from '../../../lib/api';
import {
  PageHeader, Card, Table, Tr, Td, Badge, Button, Input,
  Alert, Spinner, Modal, colors,
} from '../../../lib/ui';

export default function AdminNodesPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [enrollmentToken, setEnrollmentToken] = useState<{
    nodeId: string; token: string; expiresAt: string;
  } | null>(null);

  const [label, setLabel] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [roles, setRoles] = useState('edge,exit');
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setNodes(await api.nodes.list());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load nodes');
    } finally {
      setLoading(false);
    }
  }

  async function createNode() {
    setCreating(true);
    try {
      const node = await api.nodes.create({
        label, countryCode: countryCode.toUpperCase(),
        roles: roles.split(',').map((r) => r.trim()),
      });
      const n = node as Node & { token: string; expiresAt: string };
      setEnrollmentToken({ nodeId: n.id, token: n.token, expiresAt: n.expiresAt });
      setShowCreate(false);
      setLabel(''); setCountryCode(''); setRoles('edge,exit');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create node');
    } finally {
      setCreating(false);
    }
  }

  async function genToken(nodeId: string) {
    try {
      const t = await api.nodes.enrollmentToken(nodeId);
      setEnrollmentToken({ nodeId, token: t.token, expiresAt: t.expiresAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate token');
    }
  }

  async function setStatus(nodeId: string, status: string) {
    try {
      await api.nodes.setStatus(nodeId, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Nodes" action={<Button onClick={() => setShowCreate(true)}>+ Add Node</Button>} />

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {enrollmentToken && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="success" message={`Token for node ${enrollmentToken.nodeId}: ${enrollmentToken.token}`} />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.textMuted }}>
            Run: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>
              {'./agent -enroll -endpoint http://<control-plane> -token ' + enrollmentToken.token}
            </code>
          </p>
          <Button onClick={() => setEnrollmentToken(null)} variant="ghost" size="sm" style={{ marginTop: 8 }}>
            Dismiss
          </Button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <Card>
          <Table headers={['Label', 'Country', 'Roles', 'Status', 'Actions']}>
            {nodes.length === 0 ? (
              <Tr>
                <td colSpan={5} style={{ padding: '32px 16px', color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
                  No nodes yet.
                </td>
              </Tr>
            ) : nodes.map((node) => (
              <Tr key={node.id}>
                <Td style={{ fontWeight: 600 }}>{node.label}</Td>
                <Td><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{node.countryCode}</span></Td>
                <Td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {node.roles.map((r) => (
                      <span key={r} style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', borderRadius: 4, padding: '2px 8px', fontWeight: 500 }}>
                        {r}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td><Badge label={node.status} /></Td>
                <Td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button onClick={() => genToken(node.id)} variant="ghost" size="sm">Get Token</Button>
                    {node.status !== 'inactive' ? (
                      <Button onClick={() => setStatus(node.id, 'inactive')} variant="secondary" size="sm">Disable</Button>
                    ) : (
                      <Button onClick={() => setStatus(node.id, 'active')} variant="primary" size="sm">Enable</Button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      )}

      {showCreate && (
        <Modal title="Add Node" onClose={() => setShowCreate(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="Label" value={label} onChange={setLabel} placeholder="frankfurt-01" required />
            <Input label="Country Code (ISO 2)" value={countryCode} onChange={setCountryCode} placeholder="DE" required />
            <Input label="Roles (comma-separated)" value={roles} onChange={setRoles} placeholder="edge, relay, exit" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button onClick={() => setShowCreate(false)} variant="secondary">Cancel</Button>
              <Button onClick={createNode} disabled={creating || !label || !countryCode}>
                {creating ? 'Creating…' : 'Create & Get Token'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
