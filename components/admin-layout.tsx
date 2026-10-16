'use client';
import type {ReactNode} from 'react';
import {AdminContext} from '@/components/admin-context';
import {useAdminWorkspace} from '@/components/admin-workspace-state';
import AdminShell from '@/components/admin-shell';
import AdminAccessGate from '@/components/admin-access-gate';
function AuthorizedWorkspace({children}:{children:ReactNode}){const workspace=useAdminWorkspace();return <AdminContext.Provider value={workspace}><AdminShell>{children}</AdminShell></AdminContext.Provider>;}
export default function AdminLayout({children}:{children:ReactNode}){return <AdminAccessGate><AuthorizedWorkspace>{children}</AuthorizedWorkspace></AdminAccessGate>;}
