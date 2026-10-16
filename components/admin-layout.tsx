'use client';
import type {ReactNode} from 'react';
import {AdminContext} from '@/components/admin-context';
import {useAdminWorkspace} from '@/components/admin-workspace-state';
import AdminShell from '@/components/admin-shell';
export default function AdminLayout({children}:{children:ReactNode}){const workspace=useAdminWorkspace();return <AdminContext.Provider value={workspace}><AdminShell>{children}</AdminShell></AdminContext.Provider>;}
