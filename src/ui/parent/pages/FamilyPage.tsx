import { useState } from 'react';
import { useLiveQuery, useServices } from '../../../app/services';
import type { Child, Parent } from '../../../domain/types';
import { ageAt, ageLabel, toDay } from '../../../domain/util/time';
import { addChild, updateChild } from '../../../services/householdService';
import { AvatarPortrait } from '../../shared/AvatarPortrait';
import { Icon } from '../../shared/Icon';
import { Card, PageHeader } from '../components';
import { parentStore, type ParentData } from '../ParentApp';

/**
 * Household management. Each child has completely separate books, evidence,
 * mastery, rewards and school — nothing is shared or compared between them.
 */
export function FamilyPage({ data }: { data: ParentData }) {
  const { ctx } = useServices();
  const { household } = data;
  const parents = useLiveQuery(() => ctx.repos.parents.all(), [], ['parents']) ?? [];
  const avatars = useLiveQuery(() => ctx.repos.avatars.all(), [], ['avatars']) ?? [];
  const [name, setName] = useState(household.name);
  const [adding, setAdding] = useState(false);
  const [newChild, setNewChild] = useState({ name: '', birthDate: '' });
  const [newParent, setNewParent] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const saveHousehold = async () => {
    await ctx.repos.households.put({ ...household, name: name.trim() || household.name });
    setMsg('Saved.');
  };

  const createChild = async () => {
    if (!newChild.name.trim()) return;
    const c = await addChild(ctx, { name: newChild.name, ...(newChild.birthDate ? { birthDate: newChild.birthDate } : {}) });
    setNewChild({ name: '', birthDate: '' });
    setAdding(false);
    setMsg(`${c.name} has her own school now. Customize her avatar next!`);
  };

  const addParent = async () => {
    if (!newParent.trim()) return;
    const p: Parent = {
      id: ctx.ids('parent'),
      householdId: household.id,
      displayName: newParent.trim(),
      role: 'caregiver',
      createdAt: new Date().toISOString(),
    };
    await ctx.repos.parents.put(p);
    setNewParent('');
  };

  return (
    <div className="page">
      <PageHeader title="Family" subtitle="Each learner has a completely separate school, bookshelf, progress and portfolio." />
      {msg && (
        <div className="notice success" role="status">
          <Icon name="check" size={16} /> {msg}
        </div>
      )}
      <Card title="Our school" icon="home">
        <div className="inline-form">
          <label htmlFor="hh-name">School name</label>
          <input id="hh-name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="btn" onClick={() => void saveHousehold()}>
            Save
          </button>
        </div>
      </Card>

      <Card
        title="Learners"
        icon="users"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(!adding)}>
            <Icon name="plus" size={16} /> Add a learner
          </button>
        }
      >
        {adding && (
          <form
            className="form-grid add-child"
            onSubmit={(e) => {
              e.preventDefault();
              void createChild();
            }}
          >
            <label>
              First name
              <input value={newChild.name} onChange={(e) => setNewChild({ ...newChild, name: e.target.value })} required />
            </label>
            <label>
              Birthday <span className="muted small">(optional — only used for parent notes)</span>
              <input type="date" value={newChild.birthDate} max={toDay(new Date())} onChange={(e) => setNewChild({ ...newChild, birthDate: e.target.value })} />
            </label>
            <div className="span-2 form-actions">
              <button type="submit" className="btn btn-primary">
                Create school
              </button>
            </div>
          </form>
        )}
        <div className="child-cards">
          {data.children.map((c) => (
            <ChildCard key={c.id} child={c} avatar={avatars.find((a) => a.childId === c.id)} selected={c.id === data.child.id} />
          ))}
        </div>
      </Card>

      <Card title="Grown-ups" icon="user">
        <ul className="parent-list">
          {parents.map((p) => (
            <li key={p.id}>
              <strong>{p.displayName}</strong> <span className="muted small">{p.role === 'admin' ? 'Admin' : 'Caregiver'}</span>
            </li>
          ))}
        </ul>
        <div className="inline-form">
          <label htmlFor="new-parent">Add a grown-up</label>
          <input id="new-parent" value={newParent} onChange={(e) => setNewParent(e.target.value)} placeholder="Grandma" />
          <button type="button" className="btn" onClick={() => void addParent()} disabled={!newParent.trim()}>
            Add
          </button>
        </div>
        <p className="muted small">Grown-ups share the parent PIN on this device. There are no online accounts, profiles or social features.</p>
      </Card>
    </div>
  );
}

function ChildCard({ child, avatar, selected }: { child: Child; avatar: import('../../../domain/types').Avatar | undefined; selected: boolean }) {
  const { ctx } = useServices();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ name: child.name, birthDate: child.birthDate ?? '' });
  const age = child.birthDate ? ageAt(child.birthDate, toDay(new Date())) : null;
  const save = async () => {
    const { birthDate: _b, sayName, ...rest } = child;
    const name = form.name.trim() || child.name;
    // A respelling was for the old name; a new name starts from its own spelling.
    const keepSay = sayName && name === child.name ? { sayName } : {};
    await updateChild(ctx, { ...rest, ...keepSay, name, ...(form.birthDate ? { birthDate: form.birthDate } : {}) });
    setEdit(false);
  };
  const toggleStatus = async () => {
    await updateChild(ctx, { ...child, status: child.status === 'active' ? 'inactive' : 'active' });
  };
  return (
    <div className={`child-card ${selected ? 'selected' : ''} ${child.status}`}>
      <AvatarPortrait avatar={avatar} size={72} />
      <div className="child-card-body">
        {edit ? (
          <div className="form-grid">
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Birthday
              <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
            </label>
            <p className="span-2 muted small">
              Voices saying her name wrong? Keep the name as you write it and fix how it sounds in{' '}
              <a href="#/parent/settings" onClick={() => parentStore.set({ childId: child.id })}>
                Settings → Voice
              </a>
              .
            </p>
            <div className="span-2 form-actions">
              <button type="button" className="btn btn-primary" onClick={() => void save()}>
                Save
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEdit(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="child-card-title">
              <strong>{child.name}</strong>
              {child.isDemo && <span className="demo-tag">demo</span>}
              <span className={`status-pill ${child.status}`}>{child.status === 'active' ? 'Active' : 'Not started yet'}</span>
            </div>
            <div className="muted small">{age ? ageLabel(age) : 'No birthday set'}</div>
            <div className="child-card-actions">
              <button type="button" className="btn btn-small" onClick={() => parentStore.set({ childId: child.id })} disabled={selected}>
                {selected ? 'Viewing' : 'View records'}
              </button>
              <a className="btn btn-small" href={`#/parent/avatar`} onClick={() => parentStore.set({ childId: child.id })}>
                Avatar
              </a>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setEdit(true)}>
                Edit
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => void toggleStatus()}>
                {child.status === 'active' ? 'Pause' : 'Activate'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
