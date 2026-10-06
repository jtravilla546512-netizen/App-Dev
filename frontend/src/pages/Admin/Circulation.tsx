import { lazy, Suspense, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiErrorMessage } from '@/api/client'
import { circulationService, type MemberLookup, type CopyLookup } from '@/services/circulationService'

const field = 'w-full border rounded-lg px-3 py-2 bg-white'
const button = 'rounded-lg bg-[#A50034] text-white px-4 py-2 disabled:opacity-50'
const QrScanner = lazy(() => import('@/components/ui/QrScanner'))

export default function Circulation() {
  const cache = useQueryClient()
  const [mode, setMode] = useState<'borrow' | 'return'>('borrow')
  const [memberCode, setMemberCode] = useState('')
  const [copyCode, setCopyCode] = useState('')
  const [member, setMember] = useState<MemberLookup | null>(null)
  const [copy, setCopy] = useState<CopyLookup | null>(null)
  const [scanner, setScanner] = useState<'member' | 'copy' | null>(null)
  const [due, setDue] = useState('')
  const [condition, setCondition] = useState<'good' | 'damaged'>('good')
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const busyRef = useRef(false)

  const lookup = async (kind: 'member' | 'copy', code: string) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setMessage(''); setConfirmed(false); setScanner(null)
    if (kind === 'member') { setMember(null); setMemberCode(code) } else { setCopy(null); setCopyCode(code) }
    try {
      if (kind === 'member') setMember((await circulationService.member(code.trim())).data)
      else setCopy((await circulationService.copy(code.trim())).data)
    } catch (error) { setError(apiErrorMessage(error)) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const blocked = !member || !copy ? 'Look up a member and a physical book copy first.'
    : mode === 'borrow'
      ? (!member.eligibility.can_borrow ? member.eligibility.reason : copy.copy.status !== 'available' ? 'This copy is not available.' : !due || new Date(due).getTime() <= Date.now() ? 'Choose a future return date and time.' : null)
      : (!copy.loan || copy.loan.user.id !== member.member.id ? 'This copy is not currently borrowed by the selected member.' : null)

  const submit = async () => {
    if (blocked || !member || !copy || !confirmed || busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const common = { member_id: member.member.id, copy_id: copy.copy.id, notes }
      const result = mode === 'borrow'
        ? await circulationService.borrow({ ...common, due_at: new Date(due).toISOString() })
        : await circulationService.returnCopy({ ...common, loan_id: copy.loan!.id, return_condition: condition })
      setMessage(result.message); setCopy(null); setCopyCode(''); setMember(null); setMemberCode(''); setConfirmed(false); setNotes(''); setDue('')
      await cache.invalidateQueries()
    } catch (error) {
      setError(apiErrorMessage(error))
      // A timeout may follow a committed transaction. Force a fresh lookup
      // instead of blindly repeating a borrow/return with stale details.
      setCopy(null); setMember(null); setConfirmed(false)
    } finally { busyRef.current = false; setBusy(false) }
  }
  return <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
    <h1 className="text-2xl font-bold">Circulation desk</h1>
    <p className="text-gray-600">Verify the member, identify the physical copy, then confirm borrowing or return. A printed member QR or manual ID works without the member’s phone or Wi-Fi. The librarian’s computer needs internet.</p>
    <div className="flex gap-3" aria-label="Transaction type">{(['borrow', 'return'] as const).map(value => <button key={value} disabled={busy} aria-pressed={mode === value} className={mode === value ? button : 'border rounded-lg px-4 py-2'} onClick={() => { setMode(value); setConfirmed(false); setMessage('') }}>{value === 'borrow' ? 'Borrow a book' : 'Return a book'}</button>)}</div>
    {message && <p role="status" className="p-4 bg-green-50 text-green-800 rounded-lg">{message}</p>}
    {error && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded-lg">{error}</p>}
    <fieldset disabled={busy} className="space-y-5">
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-bold">1. Identify the member</h2>
        <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void lookup('member', memberCode) }}>
          <label className="flex-1 min-w-48">Member ID or member QR value<input className={field} value={memberCode} onChange={event => { setMemberCode(event.target.value); setMember(null); setConfirmed(false) }} required /></label>
          <button className={button}>Look up member</button><button type="button" className="border rounded-lg px-4 py-2" onClick={() => setScanner('member')}>Scan member QR</button>
        </form>
        {member && <div><p className="font-semibold">{member.member.name} — {member.member.member_id}</p><p>Status: {member.member.status}</p><p className={member.eligibility.can_borrow ? 'text-green-700' : 'text-red-700'}>{member.eligibility.reason ?? 'Eligible to borrow'}</p></div>}
      </section>
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-bold">2. Identify the physical copy</h2>
        <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void lookup('copy', copyCode) }}>
          <label className="flex-1 min-w-48">Accession number or copy QR value<input className={field} value={copyCode} onChange={event => { setCopyCode(event.target.value); setCopy(null); setConfirmed(false) }} required /></label>
          <button className={button}>Look up copy</button><button type="button" className="border rounded-lg px-4 py-2" onClick={() => setScanner('copy')}>Scan copy QR</button>
        </form>
        {copy && <div><p className="font-semibold">{copy.title} — {copy.copy.accession_number}</p><p>Copy status: {copy.copy.status}</p>{copy.loan && <p>Borrower: {copy.loan.user.name}. Due: {new Date(copy.loan.due_at).toLocaleString()}</p>}</div>}
      </section>
      {scanner && <Suspense fallback={<p>Loading camera scanner…</p>}><QrScanner key={scanner} onScan={value => void lookup(scanner, value)} onClose={() => setScanner(null)} /></Suspense>}
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="font-bold">3. Confirm {mode === 'borrow' ? 'issue and due date' : 'physical return'}</h2>
        {mode === 'borrow' ? <label className="block">Return due date and time (your local time)<input type="datetime-local" className={field} value={due} onChange={e => { setDue(e.target.value); setConfirmed(false) }} /></label>
          : <label className="block">Returned copy condition<select className={field} value={condition} onChange={e => { setCondition(e.target.value as 'good' | 'damaged'); setConfirmed(false) }}><option value="good">Good — available for borrowing</option><option value="damaged">Damaged — remove from availability</option></select></label>}
        <label className="block">Librarian notes<textarea className={field} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I verified the member’s identity and the physical book being {mode === 'borrow' ? 'issued' : 'returned'}.</label>
        {blocked && <p className="text-amber-800">{blocked}</p>}
        <button className={button} disabled={!!blocked || !confirmed || busy} onClick={() => void submit()}>{busy ? 'Processing…' : mode === 'borrow' ? 'Confirm borrowing' : 'Confirm return'}</button>
      </section>
    </fieldset>
  </div>
}
