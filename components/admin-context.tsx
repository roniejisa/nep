'use client';
import {createContext,useContext} from 'react';
import type {AdminWorkspaceState} from '@/components/admin-workspace-state';
export const AdminContext=createContext<AdminWorkspaceState|null>(null);
export function useAdmin(){const value=useContext(AdminContext);if(!value)throw new Error('Admin layout is missing.');return value;}
