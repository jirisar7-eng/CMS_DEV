'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Key,
  Users,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Lock,
  UserCheck,
  CheckCircle2,
  Info,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { CapabilityShell } from '@/components/admin/capability-shell';
import {
  PERMISSION_KEYS,
  PermissionKey,
  isRoleGrantExcludedPermission,
} from '@/lib/auth/permissions';

// --- Typy pro RBAC ---

interface Role {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
  permissions?: string[] | { permission: string }[];
}

interface UserSummary {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
  isSystemAdmin?: boolean;
}

interface ProjectSummary {
  id: string;
  name: string;
  slug?: string;
  key?: string;
}

interface UserRoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  role?: Role;
  projectId?: string | null;
  project?: ProjectSummary | null;
  createdAt?: string;
}

interface UserOverride {
  id?: string;
  userId: string;
  permission: string;
  effect: 'ALLOW' | 'DENY';
  projectId?: string | null;
  project?: ProjectSummary | null;
  createdAt?: string;
}

// Mapování chybových kódů API na české zprávy
function mapApiError(error: unknown, defaultMsg: string): string {
  if (!error) return defaultMsg;
  if (typeof error === 'string') return error;

  const errObj = error as { code?: string; message?: string; error?: string };
  const code = errObj.code || errObj.error || '';
  const msg = errObj.message || '';

  if (code === 'UNAUTHORIZED' || msg.includes('401')) {
    return 'Nejste přihlášen(a) nebo relace vypršela.';
  }
  if (code === 'FORBIDDEN' || msg.includes('403')) {
    return 'Nemáte dostatečná oprávnění pro tuto operaci (vyžadováno roles:manage nebo users:manage).';
  }
  if (code === 'ROLE_NOT_FOUND' || msg.includes('404')) {
    return 'Požadovaná role nebo uživatel nebyl nalezen.';
  }
  if (code === 'ROLE_NAME_EXISTS' || code === 'ROLE_EXISTS' || msg.includes('409')) {
    return 'Role se zadaným názvem již existuje.';
  }
  if (code === 'SYSTEM_ROLE_PROTECTED' || msg.includes('system role')) {
    return 'Systémové role jsou chráněny a nelze je upravovat ani mazat.';
  }
  if (code === 'CANNOT_MUTATE_SELF' || code === 'SELF_MUTATION_PROTECTED') {
    return 'Z bezpečnostních důvodů nelze upravovat vlastní role nebo výjimky.';
  }
  if (code === 'INVALID_PERMISSION' || code === 'EXCLUDED_PERMISSION') {
    return 'Zadané oprávnění je neplatné nebo je vyřazeno z přidělování rolím.';
  }
  if (code === 'VALIDATION_ERROR' || msg.includes('400')) {
    return `Neplatná data: ${msg || 'Zkontrolujte zadané hodnoty formuláře.'}`;
  }

  return msg || defaultMsg;
}

// Skupiny oprávnění podle prefixu pro přehledné zobrazení
function groupPermissions(permissions: readonly string[]) {
  const groups: Record<string, string[]> = {};
  for (const perm of permissions) {
    const parts = perm.split(':');
    const groupName = parts[0] ? parts[0].toUpperCase() : 'OSTATNÍ';
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(perm);
  }
  return groups;
}

export default function RolesAdminPage() {
  // Aktivní záložka
  const [activeTab, setActiveTab] = useState<'roles' | 'assignments' | 'catalog'>('roles');

  // Globální data
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  // Stavy načítání
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Globální chybové a stavové hlášky
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --- Správa rolí & Oprávnění ---
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [loadingRoleDetails, setLoadingRoleDetails] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Modály pro Role CRUD
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);

  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleDesc, setEditRoleDesc] = useState('');
  const [updatingRole, setUpdatingRole] = useState(false);

  const [isDeleteRoleOpen, setIsDeleteRoleOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);

  // --- Správa přiřazení uživatelům & Overrides ---
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userAssignments, setUserAssignments] = useState<UserRoleAssignment[]>([]);
  const [userOverrides, setUserOverrides] = useState<UserOverride[]>([]);
  const [loadingUserData, setLoadingUserData] = useState(false);

  // Formulář pro přiřazení role uživateli
  const [assignRoleId, setAssignRoleId] = useState<string>('');
  const [assignProjectId, setAssignProjectId] = useState<string>('');
  const [submittingAssignment, setSubmittingAssignment] = useState(false);

  // Formulář pro nastavení přímé výjimky (Override)
  const [overridePermission, setOverridePermission] = useState<string>('');
  const [overrideEffect, setOverrideEffect] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [overrideProjectId, setOverrideProjectId] = useState<string>('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Filtry
  const [permissionSearch, setPermissionSearch] = useState('');

  // Vyčištění flash hlášek
  const showFeedback = useCallback((type: 'error' | 'success', text: string) => {
    if (type === 'error') {
      setErrorMessage(text);
      setSuccessMessage(null);
    } else {
      setSuccessMessage(text);
      setErrorMessage(null);
    }
  }, []);

  // --- API načítání: Role ---
  const fetchRoles = useCallback(async () => {
    setLoadingRoles(true);
    try {
      const res = await fetch('/api/admin/roles', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba načítání rolí (${res.status})`);
      }
      const data = await res.json();
      const loadedRoles: Role[] = Array.isArray(data) ? data : data.roles || [];
      setRoles(loadedRoles);

      // Pokud byla vybraná role, aktualizujeme její referenci
      if (selectedRole) {
        const found = loadedRoles.find((r) => r.id === selectedRole.id);
        if (found) {
          setSelectedRole(found);
        } else if (loadedRoles.length > 0) {
          setSelectedRole(loadedRoles[0]);
        }
      } else if (loadedRoles.length > 0) {
        setSelectedRole(loadedRoles[0]);
      }
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Nepodařilo se načíst seznam rolí.'));
    } finally {
      setLoadingRoles(false);
    }
  }, [selectedRole, showFeedback]);

  // --- API načítání: Uživatelé a Projekty ---
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/users?page=1&limit=50', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba načítání uživatelů (${res.status})`);
      }
      const data = await res.json();
      const loadedUsers: UserSummary[] = Array.isArray(data) ? data : data.users || [];
      setUsers(loadedUsers);
      if (!selectedUserId && loadedUsers.length > 0) {
        setSelectedUserId(loadedUsers[0].id);
      }
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Nepodařilo se načíst uživatele.'));
    } finally {
      setLoadingUsers(false);
    }
  }, [selectedUserId, showFeedback]);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/admin/projects', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba načítání projektů (${res.status})`);
      }
      const data = await res.json();
      const loadedProjects: ProjectSummary[] = Array.isArray(data) ? data : data.projects || [];
      setProjects(loadedProjects);
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Nepodařilo se načíst projekty.'));
    } finally {
      setLoadingProjects(false);
    }
  }, [showFeedback]);

  // Inicializace
  useEffect(() => {
    fetchRoles();
    fetchProjects();
    fetchUsers();
  }, [fetchRoles, fetchProjects, fetchUsers]);

  // --- API: Načtení detailu a oprávnění vybrané role ---
  const fetchRoleDetails = useCallback(
    async (roleId: string) => {
      setLoadingRoleDetails(true);
      try {
        const res = await fetch(`/api/admin/roles/${encodeURIComponent(roleId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Chyba načítání role (${res.status})`);
        }
        const data: Role = await res.json();
        setSelectedRole(data);

        // Extrahujeme seznam oprávnění
        const perms = new Set<string>();
        if (Array.isArray(data.permissions)) {
          data.permissions.forEach((p) => {
            if (typeof p === 'string') {
              perms.add(p);
            } else if (p && typeof p === 'object' && 'permission' in p) {
              perms.add(p.permission);
            }
          });
        }
        setRolePermissions(perms);
      } catch (err) {
        showFeedback('error', mapApiError(err, 'Nepodařilo se načíst detail role.'));
      } finally {
        setLoadingRoleDetails(false);
      }
    },
    [showFeedback]
  );

  useEffect(() => {
    if (selectedRole?.id) {
      fetchRoleDetails(selectedRole.id);
    }
  }, [selectedRole?.id, fetchRoleDetails]);

  // --- API: Uložení oprávnění role ---
  const handleSaveRolePermissions = async () => {
    if (!selectedRole) return;
    if (selectedRole.isSystem) {
      showFeedback('error', 'Systémové role mají neměnná oprávnění definovaná v systému.');
      return;
    }

    setSavingPermissions(true);
    setErrorMessage(null);
    try {
      const allowedPerms = Array.from(rolePermissions).filter(
        (p) => !isRoleGrantExcludedPermission(p as PermissionKey)
      );

      const res = await fetch(
        `/api/admin/roles/${encodeURIComponent(selectedRole.id)}/permissions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: allowedPerms }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba při ukládání oprávnění (${res.status})`);
      }

      showFeedback('success', `Oprávnění pro roli „${selectedRole.name}“ byla úspěšně uložena.`);
      await fetchRoleDetails(selectedRole.id);
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Uložení oprávnění role selhalo.'));
    } finally {
      setSavingPermissions(false);
    }
  };

  // Přepnutí jednoho oprávnění pro vybranou roli
  const togglePermission = (permKey: string) => {
    if (!selectedRole || selectedRole.isSystem) return;
    if (isRoleGrantExcludedPermission(permKey as PermissionKey)) return;

    setRolePermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permKey)) {
        next.delete(permKey);
      } else {
        next.add(permKey);
      }
      return next;
    });
  };

  // --- API: Vytvoření role ---
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) {
      showFeedback('error', 'Zadejte prosím název role.');
      return;
    }

    setCreatingRole(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoleName.trim(),
          description: newRoleDesc.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba při vytváření role (${res.status})`);
      }

      const created: Role = await res.json();
      showFeedback('success', `Role „${created.name}“ byla úspěšně vytvořena.`);
      setIsCreateRoleOpen(false);
      setNewRoleName('');
      setNewRoleDesc('');
      await fetchRoles();
      setSelectedRole(created);
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Vytvoření role selhalo.'));
    } finally {
      setCreatingRole(false);
    }
  };

  // --- API: Editace role ---
  const handleOpenEditRole = (role: Role) => {
    if (role.isSystem) {
      showFeedback('error', 'Systémové role nelze upravovat.');
      return;
    }
    setEditRoleName(role.name);
    setEditRoleDesc(role.description || '');
    setIsEditRoleOpen(true);
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole || selectedRole.isSystem) return;
    if (!editRoleName.trim()) {
      showFeedback('error', 'Název role nesmí být prázdný.');
      return;
    }

    setUpdatingRole(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/roles/${encodeURIComponent(selectedRole.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editRoleName.trim(),
          description: editRoleDesc.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba při úpravě role (${res.status})`);
      }

      const updated: Role = await res.json();
      showFeedback('success', `Role „${updated.name}“ byla úspěšně upravena.`);
      setIsEditRoleOpen(false);
      await fetchRoles();
      setSelectedRole(updated);
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Úprava role selhala.'));
    } finally {
      setUpdatingRole(false);
    }
  };

  // --- API: Smazání role ---
  const handleOpenDeleteRole = (role: Role) => {
    if (role.isSystem) {
      showFeedback('error', 'Systémové role nelze smazat.');
      return;
    }
    setRoleToDelete(role);
    setIsDeleteRoleOpen(true);
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete || roleToDelete.isSystem) return;

    setDeletingRole(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/roles/${encodeURIComponent(roleToDelete.id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba při mazání role (${res.status})`);
      }

      showFeedback('success', `Role „${roleToDelete.name}“ byla úspěšně odstraněna.`);
      setIsDeleteRoleOpen(false);
      setRoleToDelete(null);
      await fetchRoles();
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Smazání role selhalo.'));
    } finally {
      setDeletingRole(false);
    }
  };

  // --- API: Načtení dat pro vybraného uživatele (Assignments & Overrides) ---
  const fetchUserData = useCallback(
    async (userId: string) => {
      if (!userId) return;
      setLoadingUserData(true);
      try {
        const [rolesRes, overridesRes] = await Promise.all([
          fetch(`/api/admin/users/${encodeURIComponent(userId)}/roles`, { cache: 'no-store' }),
          fetch(`/api/admin/users/${encodeURIComponent(userId)}/overrides`, { cache: 'no-store' }),
        ]);

        if (rolesRes.ok) {
          const rolesData = await rolesRes.json();
          setUserAssignments(Array.isArray(rolesData) ? rolesData : rolesData.assignments || []);
        } else {
          setUserAssignments([]);
        }

        if (overridesRes.ok) {
          const overridesData = await overridesRes.json();
          setUserOverrides(
            Array.isArray(overridesData) ? overridesData : overridesData.overrides || []
          );
        } else {
          setUserOverrides([]);
        }
      } catch (err) {
        showFeedback('error', mapApiError(err, 'Nepodařilo se načíst přiřazení a výjimky uživatele.'));
      } finally {
        setLoadingUserData(false);
      }
    },
    [showFeedback]
  );

  useEffect(() => {
    if (selectedUserId && activeTab === 'assignments') {
      fetchUserData(selectedUserId);
    }
  }, [selectedUserId, activeTab, fetchUserData]);

  // --- API: Přiřazení role uživateli ---
  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      showFeedback('error', 'Vyberte uživatele.');
      return;
    }
    if (!assignRoleId) {
      showFeedback('error', 'Vyberte roli k přiřazení.');
      return;
    }

    setSubmittingAssignment(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(selectedUserId)}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: assignRoleId,
          projectId: assignProjectId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba při přiřazování role (${res.status})`);
      }

      showFeedback('success', 'Role byla uživateli úspěšně přiřazena.');
      setAssignRoleId('');
      await fetchUserData(selectedUserId);
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Přiřazení role selhalo.'));
    } finally {
      setSubmittingAssignment(false);
    }
  };

  // --- API: Odebrání přiřazené role uživateli ---
  const handleRemoveAssignment = async (assignment: UserRoleAssignment) => {
    if (!selectedUserId) return;
    setErrorMessage(null);
    try {
      const queryParam = assignment.id
        ? `assignmentId=${encodeURIComponent(assignment.id)}`
        : `roleId=${encodeURIComponent(assignment.roleId)}&projectId=${encodeURIComponent(
            assignment.projectId || ''
          )}`;

      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(selectedUserId)}/roles?${queryParam}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba při odebírání role (${res.status})`);
      }

      showFeedback('success', 'Přiřazení role bylo odebráno.');
      await fetchUserData(selectedUserId);
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Odebrání role uživateli selhalo.'));
    }
  };

  // --- API: Uložení přímé výjimky (Override) pro uživatele ---
  const handleSetOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      showFeedback('error', 'Vyberte uživatele.');
      return;
    }
    if (!overridePermission) {
      showFeedback('error', 'Vyberte oprávnění pro výjimku.');
      return;
    }

    setSubmittingOverride(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(selectedUserId)}/overrides`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permission: overridePermission,
            effect: overrideEffect,
            projectId: overrideProjectId || null,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba při ukládání výjimky (${res.status})`);
      }

      showFeedback('success', `Výjimka (${overrideEffect}) byla úspěšně nastavena.`);
      setOverridePermission('');
      await fetchUserData(selectedUserId);
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Nastavení výjimky selhalo.'));
    } finally {
      setSubmittingOverride(false);
    }
  };

  // --- API: Smazání přímé výjimky (Override) ---
  const handleRemoveOverride = async (override: UserOverride) => {
    if (!selectedUserId) return;
    setErrorMessage(null);
    try {
      const queryParam = `permission=${encodeURIComponent(override.permission)}${
        override.projectId ? `&projectId=${encodeURIComponent(override.projectId)}` : ''
      }`;

      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(selectedUserId)}/overrides?${queryParam}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Chyba při odebírání výjimky (${res.status})`);
      }

      showFeedback('success', 'Výjimka byla odstraněna.');
      await fetchUserData(selectedUserId);
    } catch (err) {
      showFeedback('error', mapApiError(err, 'Smazání výjimky selhalo.'));
    }
  };

  // Filtrovaná oprávnění
  const filteredPermissions = useMemo(() => {
    return PERMISSION_KEYS.filter((p) =>
      p.toLowerCase().includes(permissionSearch.toLowerCase().trim())
    );
  }, [permissionSearch]);

  const permissionGroups = useMemo(() => {
    return groupPermissions(filteredPermissions);
  }, [filteredPermissions]);

  // Filtrovaní uživatelé pro dropdown / search
  const filteredUsers = useMemo(() => {
    if (!userSearchTerm.trim()) return users;
    const term = userSearchTerm.toLowerCase();
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(term) || (u.name && u.name.toLowerCase().includes(term))
    );
  }, [users, userSearchTerm]);

  const selectedUserObj = useMemo(() => {
    return users.find((u) => u.id === selectedUserId);
  }, [users, selectedUserId]);

  return (
    <CapabilityShell
      title="Správa rolí a oprávnění"
      description="Centrální RBAC workspace pro konfiguraci systémových i vlastních rolí, matic oprávnění, přiřazení uživatelům a přímých bezpečnostních výjimek."
      status="FUNKČNÍ"
    >
      <div className="space-y-6">
        {/* Flash zprávy */}
        {errorMessage && (
          <div className="flex items-start justify-between gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
              <div>
                <p className="font-semibold">Došlo k chybě</p>
                <p className="mt-0.5 text-red-300/90">{errorMessage}</p>
              </div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-red-500/20 rounded-md transition-colors"
              aria-label="Zavřít"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="flex items-start justify-between gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <p className="font-semibold">Úspěch</p>
                <p className="mt-0.5 text-emerald-300/90">{successMessage}</p>
              </div>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="p-1 hover:bg-emerald-500/20 rounded-md transition-colors"
              aria-label="Zavřít"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Hlavní přepínač záložek */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'roles'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Role a matice oprávnění</span>
              <span className="px-1.5 py-0.5 text-xs bg-zinc-700/60 text-zinc-300 rounded-full">
                {roles.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('assignments')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'assignments'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Users className="w-4 h-4 text-blue-400" />
              <span>Přiřazení uživatelům & výjimky</span>
            </button>

            <button
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'catalog'
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              <Key className="w-4 h-4 text-amber-400" />
              <span>Katalog oprávnění</span>
              <span className="px-1.5 py-0.5 text-xs bg-zinc-700/60 text-zinc-300 rounded-full">
                {PERMISSION_KEYS.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchRoles();
                if (selectedUserId) fetchUserData(selectedUserId);
              }}
              disabled={loadingRoles || loadingUserData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors disabled:opacity-50"
              title="Obnovit data"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingRoles || loadingUserData ? 'animate-spin' : ''}`}
              />
              <span>Obnovit</span>
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* ZÁLOŽKA 1: ROLE A MATICE OPRÁVNĚNÍ                        */}
        {/* ======================================================== */}
        {activeTab === 'roles' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Levý sloupec: Seznam rolí */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  Dostupné role
                </h3>
                <button
                  onClick={() => setIsCreateRoleOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Vytvořit roli</span>
                </button>
              </div>

              {loadingRoles ? (
                <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-zinc-500" />
                  <p className="mt-2 text-xs text-zinc-400">Načítání rolí ze serveru...</p>
                </div>
              ) : roles.length === 0 ? (
                <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800/80 rounded-xl">
                  <ShieldAlert className="w-8 h-8 mx-auto text-zinc-500" />
                  <p className="mt-2 text-sm text-zinc-300 font-medium">Žádné role nebyly nalezeny</p>
                  <p className="text-xs text-zinc-500 mt-1">Vytvořte první vlastní roli.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {roles.map((role) => {
                    const isSelected = selectedRole?.id === role.id;
                    return (
                      <div
                        key={role.id}
                        onClick={() => setSelectedRole(role)}
                        className={`group cursor-pointer p-3.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-zinc-800/90 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20'
                            : 'bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-850 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            {role.isSystem ? (
                              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Lock className="w-4 h-4" />
                              </div>
                            ) : (
                              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <Shield className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-zinc-100">
                                  {role.name}
                                </span>
                                {role.isSystem && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded">
                                    Systémová
                                  </span>
                                )}
                              </div>
                              {role.description && (
                                <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                                  {role.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {!role.isSystem && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRole(role);
                                  handleOpenEditRole(role);
                                }}
                                className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 rounded"
                                title="Upravit název/popis"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDeleteRole(role);
                                }}
                                className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded"
                                title="Smazat roli"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pravý sloupec: Matice oprávnění vybrané role */}
            <div className="lg:col-span-8 space-y-4">
              {selectedRole ? (
                <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-5">
                  {/* Hlavička vybrané role */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-bold text-white">{selectedRole.name}</h2>
                        {selectedRole.isSystem ? (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-full flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Pouze pro čtení (systémová)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full">
                            Vlastní role
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        {selectedRole.description || 'Bez dodatečného popisu.'}
                      </p>
                    </div>

                    {!selectedRole.isSystem && (
                      <button
                        onClick={handleSaveRolePermissions}
                        disabled={savingPermissions || loadingRoleDetails}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-md disabled:opacity-50"
                      >
                        {savingPermissions ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        <span>Uložit oprávnění role</span>
                      </button>
                    )}
                  </div>

                  {/* Bezpečnostní upozornění pro systémové role */}
                  {selectedRole.isSystem && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300/90 text-xs flex items-start gap-2.5">
                      <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <p className="font-semibold">Chráněná systémová role</p>
                        <p className="mt-0.5 text-amber-300/80">
                          Tato role je nedílnou součástí jádra Synthesis CMS. Její oprávnění jsou
                          spravována systémem a nelze je v uživatelském rozhraní modifikovat.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Vyhledávání v oprávněních */}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Filtrovat oprávnění (např. users, roles, content)..."
                        value={permissionSearch}
                        onChange={(e) => setPermissionSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-950/80 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                      />
                    </div>
                    <div className="text-xs text-zinc-400">
                      Přiřazeno:{' '}
                      <span className="font-semibold text-emerald-400">
                        {rolePermissions.size}
                      </span>{' '}
                      / {PERMISSION_KEYS.length}
                    </div>
                  </div>

                  {/* Matice oprávnění */}
                  {loadingRoleDetails ? (
                    <div className="p-12 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-zinc-500" />
                      <p className="mt-2 text-xs text-zinc-400">Načítání oprávnění role...</p>
                    </div>
                  ) : (
                    <div className="space-y-6 max-h-[520px] overflow-y-auto pr-2">
                      {Object.entries(permissionGroups).map(([groupName, groupPerms]) => (
                        <div key={groupName} className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider pb-1 border-b border-zinc-800/60">
                            <span>Modul: {groupName}</span>
                            <span>{groupPerms.length} klíčů</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {groupPerms.map((perm) => {
                              const isGranted = rolePermissions.has(perm);
                              const isExcluded = isRoleGrantExcludedPermission(
                                perm as PermissionKey
                              );
                              const isReadOnly = selectedRole.isSystem || isExcluded;

                              return (
                                <div
                                  key={perm}
                                  onClick={() => {
                                    if (!isReadOnly) togglePermission(perm);
                                  }}
                                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                                    isReadOnly
                                      ? 'cursor-not-allowed opacity-75'
                                      : 'cursor-pointer hover:border-zinc-700'
                                  } ${
                                    isGranted
                                      ? 'bg-emerald-500/10 border-emerald-500/30'
                                      : 'bg-zinc-950/40 border-zinc-800/80'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isGranted}
                                    disabled={isReadOnly}
                                    onChange={() => {
                                      if (!isReadOnly) togglePermission(perm);
                                    }}
                                    className="mt-0.5 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        className={`text-xs font-mono font-medium truncate ${
                                          isGranted ? 'text-emerald-300' : 'text-zinc-300'
                                        }`}
                                      >
                                        {perm}
                                      </span>
                                      {isExcluded && (
                                        <span
                                          className="px-1.5 py-0.2 text-[9px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30 rounded"
                                          title="Vyřazeno z přidělování rolím (vyhrazeno pro Super Admin)"
                                        >
                                          Vyřazeno z rolí
                                        </span>
                                      )}
                                    </div>
                                    {isExcluded && (
                                      <p className="text-[10px] text-zinc-500 mt-0.5">
                                        Toto oprávnění nelze přidělit běžným rolím.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center bg-zinc-900/40 border border-zinc-800 rounded-2xl">
                  <Shield className="w-10 h-10 mx-auto text-zinc-600" />
                  <p className="mt-3 text-sm text-zinc-300 font-medium">Vyberte roli ze seznamu vlevo</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Zobrazí se detail role a možnost správy oprávnění.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ZÁLOŽKA 2: PŘIŘAZENÍ UŽIVATELŮM & PŘÍMÉ VÝJIMKY (OVERRIDES) */}
        {/* ======================================================== */}
        {activeTab === 'assignments' && (
          <div className="space-y-6">
            {/* Výběr uživatele */}
            <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-400" />
                    <span>Výběr uživatele pro správu oprávnění</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Spravujte přiřazené role a přímé výjimky (ALLOW/DENY) pro konkrétního uživatele.
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Vyhledat uživatele podle emailu..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-950/80 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>
              </div>

              {loadingUsers ? (
                <div className="p-4 text-center text-xs text-zinc-400">Načítání uživatelů...</div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-2">
                  {filteredUsers.slice(0, 15).map((user) => {
                    const isSelected = selectedUserId === user.id;
                    return (
                      <button
                        key={user.id}
                        onClick={() => setSelectedUserId(user.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                            : 'bg-zinc-950/70 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        <span className="truncate max-w-[160px]">{user.email}</span>
                        {user.isSystemAdmin && (
                          <span className="px-1 py-0.2 text-[9px] bg-amber-500/20 text-amber-300 rounded font-semibold">
                            Admin
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <p className="text-xs text-zinc-500">Žádný uživatel neodpovídá vyhledávání.</p>
                  )}
                </div>
              )}
            </div>

            {selectedUserObj && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Přiřazené role uživateli */}
                <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div>
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span>Přiřazené role</span>
                      </h4>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Uživatel:{' '}
                        <span className="text-zinc-200 font-mono font-medium">
                          {selectedUserObj.email}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Formulář pro přiřazení nové role */}
                  <form
                    onSubmit={handleAssignRole}
                    className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-3"
                  >
                    <p className="text-xs font-semibold text-zinc-300">Přiřadit novou roli:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={assignRoleId}
                        onChange={(e) => setAssignRoleId(e.target.value)}
                        className="px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-500"
                        required
                      >
                        <option value="">-- Vyberte roli --</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} {r.isSystem ? '(Systémová)' : ''}
                          </option>
                        ))}
                      </select>

                      <select
                        value={assignProjectId}
                        onChange={(e) => setAssignProjectId(e.target.value)}
                        className="px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-500"
                      >
                        <option value="">Globální rozsah (všechny projekty)</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            Projekt: {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingAssignment || !assignRoleId}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {submittingAssignment ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>Přiřadit roli</span>
                    </button>
                  </form>

                  {/* Seznam existujících přiřazení */}
                  {loadingUserData ? (
                    <div className="p-6 text-center text-xs text-zinc-400">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto text-zinc-500 mb-1" />
                      Načítání přiřazení...
                    </div>
                  ) : userAssignments.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
                      Uživatel nemá explicitně přiřazeny žádné role.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {userAssignments.map((assignment) => {
                        const roleName = assignment.role?.name || assignment.roleId;
                        const projectName =
                          assignment.project?.name || (assignment.projectId ? 'Projekt' : 'Globální');

                        return (
                          <div
                            key={assignment.id || `${assignment.roleId}-${assignment.projectId}`}
                            className="flex items-center justify-between p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-zinc-100">
                                  {roleName}
                                </span>
                                <span className="px-1.5 py-0.2 text-[10px] bg-zinc-800 text-zinc-300 rounded border border-zinc-700">
                                  {assignment.projectId ? `Projekt: ${projectName}` : 'Globální'}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleRemoveAssignment(assignment)}
                              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Odebrat přiřazení"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. Přímé výjimky (Direct ALLOW / DENY Overrides) */}
                <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div>
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                        <span>Přímé výjimky (Overrides)</span>
                      </h4>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Explicitní <span className="text-emerald-400 font-semibold">ALLOW</span>{' '}
                        nebo <span className="text-red-400 font-semibold">DENY</span> oprávnění pro
                        uživatele.
                      </p>
                    </div>
                  </div>

                  {/* Bezpečnostní pravidlo precedence DENY */}
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-300/90 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-200">Pravidlo bezpečnostní precedence:</p>
                      <p className="mt-0.5">
                        <strong>DENY má absolutní přednost</strong> před ALLOW i před oprávněními
                        pocházejícími z rolí.
                      </p>
                    </div>
                  </div>

                  {/* Formulář pro novou výjimku */}
                  <form
                    onSubmit={handleSetOverride}
                    className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-3"
                  >
                    <p className="text-xs font-semibold text-zinc-300">Nastavit novou výjimku:</p>
                    <div className="space-y-2">
                      <select
                        value={overridePermission}
                        onChange={(e) => setOverridePermission(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-500"
                        required
                      >
                        <option value="">-- Vyberte oprávnění --</option>
                        {PERMISSION_KEYS.map((pk) => (
                          <option key={pk} value={pk}>
                            {pk}
                          </option>
                        ))}
                      </select>

                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={overrideEffect}
                          onChange={(e) => setOverrideEffect(e.target.value as 'ALLOW' | 'DENY')}
                          className={`px-3 py-2 text-xs font-semibold rounded-lg border focus:outline-none ${
                            overrideEffect === 'DENY'
                              ? 'bg-red-500/20 border-red-500/50 text-red-300'
                              : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          }`}
                        >
                          <option value="ALLOW">ALLOW (Povolit)</option>
                          <option value="DENY">DENY (Zakázat)</option>
                        </select>

                        <select
                          value={overrideProjectId}
                          onChange={(e) => setOverrideProjectId(e.target.value)}
                          className="px-3 py-2 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 focus:outline-none focus:border-zinc-500"
                        >
                          <option value="">Globální rozsah</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              Projekt: {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingOverride || !overridePermission}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {submittingOverride ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>Uložit výjimku</span>
                    </button>
                  </form>

                  {/* Seznam existujících výjimek */}
                  {loadingUserData ? (
                    <div className="p-6 text-center text-xs text-zinc-400">
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto text-zinc-500 mb-1" />
                      Načítání výjimek...
                    </div>
                  ) : userOverrides.length === 0 ? (
                    <div className="p-6 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
                      Uživatel nemá nastaveny žádné přímé výjimky.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {userOverrides.map((override) => {
                        const isDeny = override.effect === 'DENY';
                        const projectName =
                          override.project?.name || (override.projectId ? 'Projekt' : 'Globální');

                        return (
                          <div
                            key={
                              override.id ||
                              `${override.permission}-${override.projectId}-${override.effect}`
                            }
                            className={`flex items-center justify-between p-3 rounded-xl border ${
                              isDeny
                                ? 'bg-red-500/10 border-red-500/30'
                                : 'bg-emerald-500/10 border-emerald-500/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isDeny ? (
                                <ShieldX className="w-4 h-4 text-red-400" />
                              ) : (
                                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                              )}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs font-mono font-semibold ${
                                      isDeny ? 'text-red-300' : 'text-emerald-300'
                                    }`}
                                  >
                                    {override.permission}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.2 text-[9px] font-bold rounded ${
                                      isDeny
                                        ? 'bg-red-500/30 text-red-200'
                                        : 'bg-emerald-500/30 text-emerald-200'
                                    }`}
                                  >
                                    {override.effect}
                                  </span>
                                </div>
                                <span className="text-[10px] text-zinc-400">
                                  Rozsah: {override.projectId ? `Projekt: ${projectName}` : 'Globální'}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleRemoveOverride(override)}
                              className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Odstranit výjimku"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* ZÁLOŽKA 3: KATALOG OPRÁVNĚNÍ                             */}
        {/* ======================================================== */}
        {activeTab === 'catalog' && (
          <div className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-400" />
                  <span>Katalog všech oprávnění v systému</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Kanonický seznam oprávnění definovaný v jádře systému Synthesis CMS (@/lib/auth/permissions).
                </p>
              </div>

              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filtrovat klíče oprávnění..."
                  value={permissionSearch}
                  onChange={(e) => setPermissionSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-950/80 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>

            <div className="space-y-6">
              {Object.entries(permissionGroups).map(([groupName, perms]) => (
                <div key={groupName} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Modul: {groupName}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 rounded-full">
                      {perms.length} oprávnění
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {perms.map((perm) => {
                      const isExcluded = isRoleGrantExcludedPermission(perm as PermissionKey);
                      return (
                        <div
                          key={perm}
                          className="p-3.5 bg-zinc-950/50 border border-zinc-800/80 rounded-xl space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-semibold text-zinc-200">
                              {perm}
                            </span>
                            {isExcluded && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/15 text-red-300 border border-red-500/30 rounded">
                                Exkluzivní
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-400">
                            {isExcluded
                              ? 'Vyřazeno z rolí – vyžaduje přímý systémový Super Admin přístup.'
                              : 'Standardní oprávnění přiřaditelné vlastním i systémovým rolím.'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODÁLY                                                   */}
      {/* ======================================================== */}

      {/* Modál: Vytvořit roli */}
      {isCreateRoleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>Vytvořit novou roli</span>
              </h3>
              <button
                onClick={() => setIsCreateRoleOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Název role *</label>
                <input
                  type="text"
                  placeholder="např. PROJECT_MANAGER"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Popis (volitelné)</label>
                <textarea
                  placeholder="Stručný popis účelu této role..."
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateRoleOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 rounded-lg"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={creatingRole || !newRoleName.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {creatingRole ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Vytvořit roli</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modál: Upravit roli */}
      {isEditRoleOpen && selectedRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-emerald-400" />
                <span>Upravit roli</span>
              </h3>
              <button
                onClick={() => setIsEditRoleOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateRole} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Název role *</label>
                <input
                  type="text"
                  value={editRoleName}
                  onChange={(e) => setEditRoleName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Popis</label>
                <textarea
                  value={editRoleDesc}
                  onChange={(e) => setEditRoleDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditRoleOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 rounded-lg"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={updatingRole || !editRoleName.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {updatingRole ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Uložit změny</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modál: Potvrzení smazání role */}
      {isDeleteRoleOpen && roleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 bg-zinc-900 border border-red-500/30 rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white">Smazat roli „{roleToDelete.name}“?</h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Tato akce je nevratná. Všechna přiřazení této role uživatelům v projektech i globálně
              budou zrušena.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteRoleOpen(false);
                  setRoleToDelete(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 rounded-lg"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleDeleteRole}
                disabled={deletingRole}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {deletingRole ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Trvale smazat</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
