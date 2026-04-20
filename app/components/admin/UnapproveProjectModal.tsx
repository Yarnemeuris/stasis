'use client'

import { useEffect, useState } from 'react'

export interface UnapproveResult {
  designStatus?: string
  buildStatus?: string
  balanceBefore?: number
  balanceAfter?: number
  partialFailures?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

interface NegativeBalanceDetail {
  currentBalance?: number
  projectedBalance?: number
  shortfall?: number
  reversalTotal?: number
}

interface Props {
  isOpen: boolean
  stage: 'design' | 'build' | null
  projectId: string
  onClose: () => void
  onSuccess: (result: UnapproveResult) => void
}

export function UnapproveProjectModal({ isOpen, stage, projectId, onClose, onSuccess }: Readonly<Props>) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmingEmptyReason, setConfirmingEmptyReason] = useState(false)
  const [negativeBalance, setNegativeBalance] = useState<NegativeBalanceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setReason('')
    setConfirmingEmptyReason(false)
    setNegativeBalance(null)
    setError(null)
    setSubmitting(false)
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen || !stage) return null

  const title = stage === 'design' ? 'Unapprove Design' : 'Unapprove Build'
  const description = stage === 'design'
    ? 'Resets design to in_review and build to draft, reverses any pending bits, deletes the local YSWS Airtable row, and removes the linked unified-DB row.'
    : 'Resets build to in_review, reverses the bits awarded at build approval, deletes the local YSWS Airtable Build row, restores pending design bits, and removes the linked unified-DB row.'

  const submit = async (opts: { reasonConfirmedEmpty?: boolean; allowNegativeBalance?: boolean }) => {
    setError(null)
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        action: stage === 'design' ? 'unapprove_design' : 'unapprove_build',
      }
      const trimmed = reason.trim()
      if (trimmed) payload.reason = trimmed
      if (opts.reasonConfirmedEmpty) payload.reasonConfirmedEmpty = true
      if (opts.allowNegativeBalance) payload.allowNegativeBalance = true

      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 409) {
        const data = await res.json()
        if (data?.error === 'negative_balance') {
          setNegativeBalance(data.detail || {})
          return
        }
        setError(data?.message || data?.error || 'Conflict')
        return
      }

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.message || data?.error || 'Action failed')
        return
      }
      onSuccess(data)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirm = () => {
    if (!reason.trim() && !confirmingEmptyReason) {
      setConfirmingEmptyReason(true)
      return
    }
    submit({
      reasonConfirmedEmpty: !reason.trim(),
      allowNegativeBalance: negativeBalance !== null,
    })
  }

  const { currentBalance, projectedBalance, shortfall } = negativeBalance ?? {}

  const confirmLabel = submitting
    ? 'Working…'
    : (confirmingEmptyReason || negativeBalance ? 'Un-approve anyway' : 'Un-approve')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => !submitting && onClose()} />
      <div className="relative bg-brown-800 border-2 border-cream-500/20 max-w-xl w-full mx-4 font-mono max-h-[90vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-cream-500/20 flex items-center justify-between sticky top-0 bg-brown-800 z-10">
          <h2 className="text-yellow-600 text-lg uppercase tracking-wide">{title}</h2>
          <button onClick={onClose} disabled={submitting} className="text-cream-50 hover:text-orange-500 transition-colors cursor-pointer disabled:opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-cream-50 text-sm leading-relaxed">{description}</p>

          <div>
            <label htmlFor="unapprove-reason" className="text-cream-50 text-xs uppercase tracking-wider block mb-2">
              Reason (recorded in audit log)
            </label>
            <textarea
              id="unapprove-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (confirmingEmptyReason && e.target.value.trim()) setConfirmingEmptyReason(false)
              }}
              rows={4}
              className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-y"
              placeholder="Why are you un-approving this?"
              disabled={submitting}
              autoFocus
            />
          </div>

          {confirmingEmptyReason && !negativeBalance && (
            <div className="bg-yellow-600/10 border border-yellow-600 p-3 text-sm text-yellow-600">
              No reason entered — the audit log won&apos;t have context. Click <b>Un-approve anyway</b> to proceed, or type a reason above.
            </div>
          )}

          {negativeBalance && (
            <div className="bg-red-600/10 border border-red-600 p-3 text-sm text-red-500 space-y-1">
              <p className="font-bold uppercase tracking-wider text-xs">Will drive balance negative</p>
              <p>Current balance: <b>{currentBalance}</b> bits</p>
              <p>After reversal: <b>{projectedBalance}</b> bits</p>
              <p>Shortfall: <b>{shortfall}</b> bits</p>
              <p className="pt-1">Some of the bits being reversed have already been spent. Click <b>Un-approve anyway</b> to continue.</p>
            </div>
          )}

          {error && (
            <div className="bg-red-600/10 border border-red-600 p-3 text-sm text-red-500">{error}</div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="px-4 py-2 text-sm uppercase tracking-wider border border-yellow-600 bg-yellow-600/10 text-yellow-600 hover:bg-yellow-600/20 transition-colors cursor-pointer disabled:opacity-50"
            >
              {confirmLabel}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm uppercase tracking-wider border border-cream-500/20 bg-brown-900 text-cream-50 hover:bg-cream-500/10 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
