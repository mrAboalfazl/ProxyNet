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

  async function approveNode(nodeId: string) {
    try {
      await api.nodes.approve(nodeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve node');
    }
  }

  async function rejectNode(nodeId: string) {
    try {
      await api.nodes.reject(nodeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject node');
    }
  }

  useEffect(() => { load(); }, []);

  const pendingUserNodes = nodes.filter((n) => n.status === 'pending' && n.submittedById);
  const otherNodes = nodes.filter((n) => !(n.status === 'pending' && n.submittedById));

  return (
    <div>
      <PageHeader title="Nodes" action={<Button onClick={() => setShowCreate(true)}>+ Add Node</Button>} />

      {error && <div style={{ marginBottom: 16 }}><Alert message={error} /></div>}

      {enrollmentToken && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="success" message={`Token for node ${enrollmentToken.nodeId}: ${enrollmentToken.token}`} />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.textMuted }}>
            Run: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>
              {'./agent -enroll -endpoint https://panel.civonex.ir -token ' + enrollmentToken.token}
            </code>
          </p>
          <Button onClick={() => setEnrollmentToken(null)} variant="ghost" size="sm" style={{ marginTop: 8 }}>
            Dismiss
          </Button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <>
          {/* Pending approval queue */}
          {pendingUserNodes.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
              }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.text }}>
                  Pending Approval
                </h2>
                <span style={{
                  background: '#fef3c7', color: '#92400e', borderRadius: 12,
                  fontSize: 12, fontWeight: 700, padding: '2px 10px',
                }}>
                  {pendingUserNodes.length}
                </span>
              </div>
              <Card>
                <Table headers={['Label', 'Country', 'Submitted by', 'Agent', 'Actions']}>
                  {pendingUserNodes.map((node) => (
                    <Tr key={node.id}>
                      <Td style={{ fontWeight: 600 }}>{node.label}</Td>
                      <Td><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{node.countryCode}</span></Td>
                      <Td>
                        <span style={{ fontSize: 13, color: colors.textMuted }}>
                          {node.submittedBy?.displayName ?? `User #${node.submittedById}`}
                        </span>
                      </Td>
                      <Td>
                        <span style={{ fontSize: 12, color: node.nodeSecretHash ? '#166534' : '#6b7280' }}>
                          {node.nodeSecretHash ? '✓ Connected' : 'Not connected'}
                        </span>
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            onClick={() => approveNode(node.id)}
                            size="sm"
                            style={{ background: '#22c55e', color: '#fff', border: 'none' }}
                          >
                            Approve
                          </Button>
                          <Button
                            onClick={() => rejectNode(node.id)}
                            variant="secondary"
                            size="sm"
                            style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                          >
                            Reject
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Table>
              </Card>
            </div>
          )}

          {/* All other nodes */}
          <div>
            {pendingUserNodes.length > 0 && (
              <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: colors.text }}>
                All Nodes
              </h2>
            )}
            <Card>
              <Table headers={['Label', 'Country', 'Roles', 'Status', 'Actions']}>
                {otherNodes.length === 0 ? (
                  <Tr>
                    <td colSpan={5} style={{ padding: '32px 16px', color: colors.textMuted, textAlign: 'center', fontSize: 14 }}>
                      No nodes yet.
                    </td>
                  </Tr>
                ) : otherNodes.map((node) => (
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
                        {node.status !== 'disabled' ? (
                          <Button onClick={() => setStatus(node.id, 'disabled')} variant="secondary" size="sm">Disable</Button>
                        ) : (
                          <Button onClick={() => setStatus(node.id, 'active')} variant="primary" size="sm">Enable</Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
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
