import { useEffect, useMemo, useState } from 'react'
import { Archive, BookOpen, ChevronLeft, ChevronRight, Eye, Pencil, Plus, QrCode, Search } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiErrorMessage, assetUrl } from '@/api/client'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Toast from '@/components/ui/Toast'
import {
  useBook,
  useBookCopies,
  useBooks,
  useCategories,
  useCreateBook,
  useCreateBookCopy,
  useSetBookActive,
  useSetBookCopyArchived,
  useUpdateBook,
  useUpdateBookCopy,
  useUploadBookCover,
} from '@/hooks/useCatalog'
import type { AvailabilityStatus, BookCopy, BookFilters, BookInput } from '@/types/catalog'

function Cover({ title, url, className }: { title: string; url: string | null; className: string }) {
  const source = assetUrl(url)
  return source
    ? <img src={source} alt={`${title} cover`} className={`${className} object-cover bg-gray-100`} />
    : (
      <div className={`${className} bg-[#F5F5F5] text-gray-300 flex items-center justify-center`} aria-label="No cover uploaded">
        <BookOpen size={24} />
      </div>
    )
}

export function AllBooks() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [availability, setAvailability] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  const filters = useMemo<BookFilters>(() => ({
    search: search.trim() || undefined,
    category_id: categoryId ? Number(categoryId) : undefined,
    availability: (availability || undefined) as AvailabilityStatus | undefined,
    include_archived: includeArchived,
    sort: 'title',
    direction: 'asc',
    page,
    per_page: 10,
  }), [availability, categoryId, includeArchived, page, search])

  const booksQuery = useBooks(filters)
  const categoriesQuery = useCategories({ include_archived: false })
  const activeMutation = useSetBookActive()
  const books = booksQuery.data?.data ?? []
  const meta = booksQuery.data?.meta

  const updateSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const setActive = async (id: number, title: string, isActive: boolean) => {
    if (!window.confirm(`${isActive ? 'Restore' : 'Archive'} “${title}”?`)) return
    setError('')
    try {
      await activeMutation.mutateAsync({ id, isActive })
      setToast(`“${title}” ${isActive ? 'restored' : 'archived'} successfully.`)
    } catch (mutationError) {
      setError(apiErrorMessage(mutationError))
    }
  }

  return (
    <div className="p-6 space-y-5">
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-[#D9D9D9] shadow-sm">
        <div className="flex flex-col gap-3 px-5 py-4 border-b border-[#D9D9D9] sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex min-w-0 w-full items-center gap-2 rounded-lg border border-[#D9D9D9] bg-[#F5F5F5] px-3 py-2 sm:min-w-52 sm:flex-1">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input value={search} onChange={(event) => updateSearch(event.target.value)} className="bg-transparent text-sm outline-none w-full placeholder:text-gray-400" placeholder="Search title, author, or ISBN..." />
          </div>
          <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1) }} className="w-full shrink-0 rounded-lg border border-[#D9D9D9] bg-white px-3 py-2 text-sm outline-none sm:w-auto">
            <option value="">All categories</option>
            {(categoriesQuery.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select value={availability} onChange={(event) => { setAvailability(event.target.value); setPage(1) }} className="w-full shrink-0 rounded-lg border border-[#D9D9D9] bg-white px-3 py-2 text-sm outline-none sm:w-auto">
            <option value="">All availability</option>
            <option value="available">Available</option>
            <option value="limited">Limited</option>
            <option value="unavailable">Unavailable</option>
          </select>
          <label className="flex shrink-0 items-center gap-2 text-xs text-gray-600 whitespace-nowrap">
            <input type="checkbox" checked={includeArchived} onChange={(event) => { setIncludeArchived(event.target.checked); setPage(1) }} className="accent-[#C72C41]" />
            Include archived
          </label>
          <button onClick={() => navigate('/books/new')} className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#C72C41] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#A50034] sm:ml-auto sm:w-auto">
            <Plus size={15} /> Add Book
          </button>
        </div>

        <div className="overflow-x-auto min-h-56">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F5F5F5] text-xs text-gray-500">
                <th className="text-left px-5 py-3 font-medium">Cover</th>
                <th className="text-left px-5 py-3 font-medium">ISBN</th>
                <th className="text-left px-5 py-3 font-medium">Title / Author</th>
                <th className="text-left px-5 py-3 font-medium">Category</th>
                <th className="text-center px-5 py-3 font-medium">Total</th>
                <th className="text-center px-5 py-3 font-medium">Available</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book.id} className={`border-t border-[#F5F5F5] hover:bg-gray-50/50 ${!book.is_active ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-3"><Cover title={book.title} url={book.cover_url} className="w-9 h-12 rounded" /></td>
                  <td className="px-5 py-3 text-gray-500 text-xs font-mono">{book.isbn ?? '—'}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-[#1A1A2E]">{book.title}</p>
                    <p className="text-gray-400 text-xs">{book.author}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{book.category.name}</td>
                  <td className="px-5 py-3 text-center">{book.total_copies}</td>
                  <td className="px-5 py-3 text-center">{book.available_copies}</td>
                  <td className="px-5 py-3">
                    <Badge variant={book.is_active ? book.availability_status : 'inactive'} label={book.is_active ? undefined : 'Archived'} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => navigate(`/books/${book.id}`)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors" title="View"><Eye size={14} /></button>
                      <button onClick={() => navigate(`/books/${book.id}/edit`)} className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors" title="Edit"><Pencil size={14} /></button>
                      <button disabled={activeMutation.isPending} onClick={() => void setActive(book.id, book.title, !book.is_active)} className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${book.is_active ? 'hover:bg-red-50 text-red-500' : 'hover:bg-emerald-50 text-emerald-600'}`} title={book.is_active ? 'Archive' : 'Restore'}><Archive size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {booksQuery.isLoading && <div className="py-12 text-center text-sm text-gray-400">Loading catalog...</div>}
          {booksQuery.isError && <div className="py-12 text-center text-sm text-red-600">{apiErrorMessage(booksQuery.error)}</div>}
          {!booksQuery.isLoading && !booksQuery.isError && books.length === 0 && (
            <div className="py-12 text-center">
              <BookOpen size={30} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No books match these filters.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-[#D9D9D9] text-sm text-gray-500">
          <span>{meta?.total ? `Showing ${meta.from}–${meta.to} of ${meta.total} records` : 'No records'}</span>
          <div className="flex items-center gap-2">
            <button aria-label="Previous page" disabled={!meta || meta.current_page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1 bg-[#C72C41] text-white rounded-lg text-xs font-medium">{meta?.current_page ?? 1} / {meta?.last_page ?? 1}</span>
            <button aria-label="Next page" disabled={!meta || meta.current_page >= meta.last_page} onClick={() => setPage((current) => current + 1)} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface BookFormState {
  isbn: string
  title: string
  author: string
  publisher: string
  publication_year: string
  category_id: string
  initial_copies: string
  description: string
}

const emptyBookForm: BookFormState = {
  isbn: '',
  title: '',
  author: '',
  publisher: '',
  publication_year: String(new Date().getFullYear()),
  category_id: '',
  initial_copies: '1',
  description: '',
}

export function AddBook() {
  const navigate = useNavigate()
  const { bookId } = useParams()
  const id = bookId ? Number(bookId) : undefined
  const editing = Number.isInteger(id)
  const bookQuery = useBook(id)
  const categoriesQuery = useCategories()
  const createMutation = useCreateBook()
  const updateMutation = useUpdateBook()
  const coverMutation = useUploadBookCover()
  const [form, setForm] = useState<BookFormState>(emptyBookForm)
  const [cover, setCover] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bookQuery.data) return
    const book = bookQuery.data
    setForm({
      isbn: book.isbn ?? '',
      title: book.title,
      author: book.author,
      publisher: book.publisher ?? '',
      publication_year: book.publication_year?.toString() ?? '',
      category_id: book.category.id.toString(),
      initial_copies: '0',
      description: book.description ?? '',
    })
    setPreview(assetUrl(book.cover_url))
  }, [bookQuery.data])

  useEffect(() => {
    if (!form.category_id && categoriesQuery.data?.length) {
      setForm((current) => ({ ...current, category_id: String(categoriesQuery.data![0].id) }))
    }
  }, [categoriesQuery.data, form.category_id])

  const setField = (key: keyof BookFormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }))
  }

  const chooseCover = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setCover(file)
    if (file) setPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.category_id) {
      setError('Create or select an active category before saving the book.')
      return
    }

    const input: BookInput = {
      category_id: Number(form.category_id),
      isbn: form.isbn.trim() || null,
      title: form.title.trim(),
      author: form.author.trim(),
      publisher: form.publisher.trim() || null,
      publication_year: form.publication_year ? Number(form.publication_year) : null,
      description: form.description.trim() || null,
      ...(!editing && { initial_copies: Number(form.initial_copies) }),
    }

    setError('')
    try {
      const saved = editing
        ? await updateMutation.mutateAsync({ id: id!, input })
        : await createMutation.mutateAsync(input)
      if (cover) await coverMutation.mutateAsync({ id: saved.id, cover })
      navigate(`/books/${saved.id}`, { replace: true })
    } catch (mutationError) {
      setError(apiErrorMessage(mutationError))
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending || coverMutation.isPending

  if (editing && bookQuery.isLoading) return <div className="p-12 text-center text-sm text-gray-500">Loading book...</div>
  if (editing && bookQuery.isError) return <div className="p-12 text-center text-sm text-red-600">{apiErrorMessage(bookQuery.error)}</div>

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl border border-[#D9D9D9] shadow-sm">
        <div className="px-6 py-5 border-b border-[#D9D9D9]">
          <h3 className="font-semibold text-[#1A1A2E]">{editing ? 'Edit Book' : 'Add New Book'}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Catalog metadata and inventory are saved through the Laravel API.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          {error && <div role="alert" className="mb-5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center">
              <label className="w-full aspect-[3/4] bg-[#F5F5F5] border-2 border-dashed border-[#D9D9D9] rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#C72C41] transition-colors overflow-hidden">
                {preview
                  ? <img src={preview} alt="Selected cover preview" className="w-full h-full object-cover" />
                  : <div className="text-center p-4"><Plus size={22} className="text-gray-400 mx-auto mb-2" /><p className="text-xs text-gray-500">Upload Cover</p><p className="text-xs text-gray-400">JPG, PNG up to 2MB</p></div>}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseCover} className="sr-only" />
              </label>
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="block text-xs font-medium text-[#1A1A2E] mb-1.5">ISBN</label><input value={form.isbn} onChange={setField('isbn')} className="form-input" placeholder="978-0-xxx-xxxxx-x" /></div>
              <div className="col-span-2"><label className="block text-xs font-medium text-[#1A1A2E] mb-1.5">Book Title *</label><input required value={form.title} onChange={setField('title')} className="form-input" placeholder="Enter book title" /></div>
              <div><label className="block text-xs font-medium text-[#1A1A2E] mb-1.5">Author *</label><input required value={form.author} onChange={setField('author')} className="form-input" placeholder="Author name" /></div>
              <div><label className="block text-xs font-medium text-[#1A1A2E] mb-1.5">Publisher</label><input value={form.publisher} onChange={setField('publisher')} className="form-input" placeholder="Publisher name" /></div>
              <div><label className="block text-xs font-medium text-[#1A1A2E] mb-1.5">Publication Year</label><input type="number" min="1000" max={new Date().getFullYear() + 1} value={form.publication_year} onChange={setField('publication_year')} className="form-input" /></div>
              {!editing && <div><label className="block text-xs font-medium text-[#1A1A2E] mb-1.5">Initial Copies *</label><input required type="number" min="0" max="100" value={form.initial_copies} onChange={setField('initial_copies')} className="form-input" /></div>}
              <div className={editing ? 'col-span-1' : ''}><label className="block text-xs font-medium text-[#1A1A2E] mb-1.5">Category *</label><select required value={form.category_id} onChange={setField('category_id')} className="form-input"><option value="">Select category</option>{(categoriesQuery.data ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div className="col-span-2"><label className="block text-xs font-medium text-[#1A1A2E] mb-1.5">Description</label><textarea value={form.description} onChange={setField('description')} rows={3} className="form-input resize-none" placeholder="Book description..." /></div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-[#D9D9D9]">
            <button type="button" onClick={() => navigate(editing ? `/books/${id}` : '/books')} className="px-5 py-2 border border-[#D9D9D9] rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-[#C72C41] hover:bg-[#A50034] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">{saving ? 'Saving...' : 'Save Book'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface CopyFormState {
  accession_number: string
  barcode: string
  status: 'available' | 'lost' | 'damaged'
  condition_notes: string
}

const emptyCopyForm: CopyFormState = { accession_number: '', barcode: '', status: 'available', condition_notes: '' }

export function BookDetails() {
  const navigate = useNavigate()
  const { bookId } = useParams()
  const id = Number(bookId)
  const bookQuery = useBook(id)
  const copiesQuery = useBookCopies(id)
  const createCopy = useCreateBookCopy()
  const updateCopy = useUpdateBookCopy()
  const archiveCopy = useSetBookCopyArchived()
  const [editingCopy, setEditingCopy] = useState<BookCopy | null | undefined>(undefined)
  const [qrCopy, setQrCopy] = useState<BookCopy | null>(null)
  const [copyForm, setCopyForm] = useState<CopyFormState>(emptyCopyForm)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const book = bookQuery.data

  const openCopyModal = (copy: BookCopy | null) => {
    setEditingCopy(copy)
    setCopyForm(copy ? {
      accession_number: copy.accession_number,
      barcode: copy.barcode ?? '',
      status: ['lost', 'damaged'].includes(copy.status) ? copy.status as 'lost' | 'damaged' : 'available',
      condition_notes: copy.condition_notes ?? '',
    } : emptyCopyForm)
    setError('')
  }

  const saveCopy = async () => {
    setError('')
    try {
      if (editingCopy) {
        await updateCopy.mutateAsync({ id: editingCopy.id, input: {
          accession_number: copyForm.accession_number,
          barcode: copyForm.barcode || null,
          status: copyForm.status,
          condition_notes: copyForm.condition_notes || null,
        } })
      } else {
        await createCopy.mutateAsync({ bookId: id, input: {
          accession_number: copyForm.accession_number || null,
          barcode: copyForm.barcode || null,
          condition_notes: copyForm.condition_notes || null,
        } })
      }
      setEditingCopy(undefined)
      setToast(`Book copy ${editingCopy ? 'updated' : 'added'} successfully.`)
    } catch (mutationError) {
      setError(apiErrorMessage(mutationError))
    }
  }

  const setCopyArchived = async (copy: BookCopy, archived: boolean) => {
    if (!window.confirm(`${archived ? 'Archive' : 'Restore'} copy ${copy.accession_number}?`)) return
    setError('')
    try {
      await archiveCopy.mutateAsync({ id: copy.id, archived })
      setToast(`Copy ${archived ? 'archived' : 'restored'} successfully.`)
    } catch (mutationError) {
      setError(apiErrorMessage(mutationError))
    }
  }

  if (!Number.isInteger(id)) return <div className="p-12 text-center text-red-600">Invalid book ID.</div>
  if (bookQuery.isLoading) return <div className="p-12 text-center text-sm text-gray-500">Loading book details...</div>
  if (!book || bookQuery.isError) return <div className="p-12 text-center text-sm text-red-600">{apiErrorMessage(bookQuery.error)}</div>

  return (
    <div className="p-6">
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      {editingCopy !== undefined && (
        <Modal title={editingCopy ? 'Edit Book Copy' : 'Add Book Copy'} onClose={() => setEditingCopy(undefined)} footer={<><button onClick={() => setEditingCopy(undefined)} className="px-4 py-2 border border-[#D9D9D9] rounded-lg text-sm text-gray-600">Cancel</button><button disabled={createCopy.isPending || updateCopy.isPending} onClick={() => void saveCopy()} className="px-4 py-2 bg-[#C72C41] text-white rounded-lg text-sm font-medium disabled:opacity-60">Save Copy</button></>}>
          {error && <div role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
          <div className="space-y-4">
            <div><label className="field-label">Accession Number {editingCopy && '*'}</label><input required={Boolean(editingCopy)} value={copyForm.accession_number} onChange={(event) => setCopyForm((current) => ({ ...current, accession_number: event.target.value }))} className="form-input" placeholder="Leave blank to auto-generate" /></div>
            <div><label className="field-label">Barcode</label><input value={copyForm.barcode} onChange={(event) => setCopyForm((current) => ({ ...current, barcode: event.target.value }))} className="form-input" /></div>
            {editingCopy && <div><label className="field-label">Status</label><select value={copyForm.status} onChange={(event) => setCopyForm((current) => ({ ...current, status: event.target.value as CopyFormState['status'] }))} className="form-input"><option value="available">Available</option><option value="lost">Lost</option><option value="damaged">Damaged</option></select></div>}
            <div><label className="field-label">Condition Notes</label><textarea rows={3} value={copyForm.condition_notes} onChange={(event) => setCopyForm((current) => ({ ...current, condition_notes: event.target.value }))} className="form-input resize-none" /></div>
          </div>
        </Modal>
      )}
      {qrCopy && (
        <Modal title="Book Copy QR Label" onClose={() => setQrCopy(null)} footer={<button onClick={() => setQrCopy(null)} className="px-4 py-2 bg-[#C72C41] text-white rounded-lg text-sm font-medium">Done</button>}>
          <div className="text-center space-y-4">
            <div className="inline-flex rounded-xl border border-[#D9D9D9] bg-white p-4">
              <QRCodeSVG value={qrCopy.qr_code} size={220} level="M" includeMargin title={`QR code for ${qrCopy.accession_number}`} />
            </div>
            <div>
              <p className="font-semibold text-[#1A1A2E]">{book.title}</p>
              <p className="text-sm text-gray-500">Copy: {qrCopy.accession_number}</p>
              <p className="mt-2 font-mono text-xs text-gray-500 break-all">{qrCopy.qr_code}</p>
            </div>
            <p className="text-xs text-gray-400">Print this label and attach it to this physical copy. The code identifies the copy only and contains no borrower data.</p>
          </div>
        </Modal>
      )}

      <div className="max-w-5xl mx-auto space-y-5">
        {error && editingCopy === undefined && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
        <div className="bg-white rounded-xl border border-[#D9D9D9] shadow-sm p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <Cover title={book.title} url={book.cover_url} className="w-40 h-52 rounded-xl shadow-md shrink-0" />
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                <div><h2 className="text-xl font-bold text-[#1A1A2E]">{book.title}</h2><p className="text-gray-500 mt-0.5">by {book.author}</p></div>
                <button onClick={() => navigate(`/books/${book.id}/edit`)} className="flex items-center gap-2 bg-[#C72C41] hover:bg-[#A50034] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"><Pencil size={14} /> Edit Book</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                {[
                  ['ISBN', book.isbn ?? '—'],
                  ['Publisher', book.publisher ?? '—'],
                  ['Year', book.publication_year ?? '—'],
                  ['Category', book.category.name],
                  ['Total Copies', book.total_copies],
                  ['Available Copies', book.available_copies],
                ].map(([key, value]) => <div key={key}><p className="text-xs text-gray-400">{key}</p><p className="text-sm font-medium text-[#1A1A2E] mt-0.5">{value}</p></div>)}
                <div><p className="text-xs text-gray-400">Availability</p><div className="mt-1"><Badge variant={book.availability_status} /></div></div>
                <div><p className="text-xs text-gray-400">Record</p><div className="mt-1"><Badge variant={book.is_active ? 'active' : 'inactive'} label={book.is_active ? 'Active' : 'Archived'} /></div></div>
              </div>
              <p className="text-sm text-gray-500 mt-4 leading-relaxed">{book.description || 'No description provided.'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#D9D9D9] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#D9D9D9] flex items-center justify-between">
            <div><h3 className="font-semibold text-[#1A1A2E] text-sm">Inventory Copies</h3><p className="text-xs text-gray-400 mt-0.5">Each physical copy has its own accession number and status.</p></div>
            <button onClick={() => openCopyModal(null)} className="flex items-center gap-2 bg-[#C72C41] hover:bg-[#A50034] text-white px-3 py-2 rounded-lg text-sm font-medium"><Plus size={14} /> Add Copy</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-[#F5F5F5] text-xs text-gray-500"><th className="text-left px-5 py-3 font-medium">Accession Number</th><th className="text-left px-5 py-3 font-medium">QR Code</th><th className="text-left px-5 py-3 font-medium">Barcode</th><th className="text-left px-5 py-3 font-medium">Condition</th><th className="text-left px-5 py-3 font-medium">Status</th><th className="text-left px-5 py-3 font-medium">Actions</th></tr></thead>
              <tbody>{(copiesQuery.data ?? []).map((copy) => (
                <tr key={copy.id} className={`border-t border-[#F5F5F5] ${copy.status === 'archived' ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-3 font-mono text-xs text-[#1A1A2E]">{copy.accession_number}</td><td className="px-5 py-3"><button onClick={() => setQrCopy(copy)} className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-600 hover:text-blue-800" title="View QR label"><QrCode size={15} /> View label</button></td><td className="px-5 py-3 text-gray-500">{copy.barcode ?? '—'}</td><td className="px-5 py-3 text-gray-500 max-w-xs">{copy.condition_notes ?? '—'}</td><td className="px-5 py-3"><Badge variant={copy.status} /></td>
                  <td className="px-5 py-3"><div className="flex gap-2"><button onClick={() => setQrCopy(copy)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="View QR label"><QrCode size={14} /></button><button disabled={['borrowed', 'archived'].includes(copy.status)} onClick={() => openCopyModal(copy)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-30" title="Edit"><Pencil size={14} /></button><button disabled={copy.status === 'borrowed'} onClick={() => void setCopyArchived(copy, copy.status !== 'archived')} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30" title={copy.status === 'archived' ? 'Restore' : 'Archive'}><Archive size={14} /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
            {copiesQuery.isLoading && <div className="py-8 text-center text-sm text-gray-400">Loading copies...</div>}
            {!copiesQuery.isLoading && (copiesQuery.data?.length ?? 0) === 0 && <div className="py-8 text-center text-sm text-gray-400">No physical copies have been added.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
