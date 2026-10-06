import { apiClient } from '@/api/client'
import type { Loan } from '@/types/loan'

export interface MemberLookup {
  member: { id: number; name: string; member_id: string; status: string }
  eligibility: { can_borrow: boolean; reason: string | null; overdue_count: number }
}
export interface CopyLookup {
  copy: { id: number; accession_number: string; status: string }
  title: string
  loan: Loan | null
}
export const circulationService = {
  member: (code: string) => apiClient.get<MemberLookup>('/admin/circulation/member', { code }),
  copy: (code: string) => apiClient.get<CopyLookup>('/admin/circulation/copy', { code }),
  borrow: (body: { member_id: number; copy_id: number; due_at: string; notes: string }) => apiClient.post('/admin/circulation/borrow', body),
  returnCopy: (body: { member_id: number; copy_id: number; loan_id: number; return_condition: 'good' | 'damaged'; notes: string }) => apiClient.post('/admin/circulation/return', body),
}
