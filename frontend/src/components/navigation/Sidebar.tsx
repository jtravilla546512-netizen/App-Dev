import { useState } from 'react'
import {
  BookOpen, LayoutDashboard, BookMarked, PlusCircle, Tag,
  ClipboardList, CheckCircle, BookCopy, RotateCcw, AlertTriangle,
  FileText, Users, BarChart2, Bell, User, LogOut, ChevronDown, ChevronRight, Menu, X
} from 'lucide-react'

type Page = string

const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'circulation', label: 'Circulation desk', icon: BookOpen },
  {
    id: 'books', label: 'Book Management', icon: BookMarked, children: [
      { id: 'all-books', label: 'All Books', icon: BookCopy },
      { id: 'add-book', label: 'Add Book', icon: PlusCircle },
      { id: 'categories', label: 'Categories', icon: Tag },
    ]
  },
  {
    id: 'borrowing', label: 'Borrowing Management', icon: ClipboardList, children: [
      { id: 'pending', label: 'Pending Requests', icon: ClipboardList },
      { id: 'approved', label: 'Approved Requests', icon: CheckCircle },
      { id: 'borrowed', label: 'Currently Borrowed', icon: BookCopy },
      { id: 'returned', label: 'Returned Books', icon: RotateCcw },
      { id: 'overdue', label: 'Overdue Books', icon: AlertTriangle },
      { id: 'transactions', label: 'All Transactions', icon: FileText },
    ]
  },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'reports', label: 'Reports', icon: BarChart2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'Profile', icon: User },
]

export default function Sidebar({ page, onPage, onLogout }: { page: Page; onPage: (p: Page) => void; onLogout: () => void }) {
  const [expanded, setExpanded] = useState<string[]>(['books', 'borrowing'])
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggle = (id: string) => setExpanded(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id])
  const isActive = (id: string) => page === id

  const content = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-[#8B1A2C] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <BookOpen size={20} className="text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">LMS Admin</div>
            <div className="text-white/50 text-xs">Library System</div>
          </div>
        </div>
        <button className="lg:hidden text-white/60 hover:text-white" onClick={() => setMobileOpen(false)}>
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto sidebar-scroll py-4 px-2">
        {nav.map(item => (
          <div key={item.id}>
            <button
              onClick={() => item.children ? toggle(item.id) : (onPage(item.id), setMobileOpen(false))}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-0.5 ${
                isActive(item.id) && !item.children
                  ? 'bg-white/20 text-white font-semibold'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <item.icon size={17} className="shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.children && (
                expanded.includes(item.id)
                  ? <ChevronDown size={14} className="text-white/40" />
                  : <ChevronRight size={14} className="text-white/40" />
              )}
            </button>
            {item.children && expanded.includes(item.id) && (
              <div className="ml-4 pl-3 border-l border-white/10 mb-1">
                {item.children.map(child => (
                  <button
                    key={child.id}
                    onClick={() => { onPage(child.id); setMobileOpen(false) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all mb-0.5 ${
                      isActive(child.id)
                        ? 'bg-white/20 text-white font-semibold'
                        : 'text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <child.icon size={14} />
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[#8B1A2C]">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-all"
        >
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-4 left-4 z-40 w-9 h-9 bg-[#C72C41] rounded-lg flex items-center justify-center text-white shadow-lg"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={18} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-[#A50034] flex flex-col z-50 transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:flex shrink-0`}>
        {content}
      </aside>
    </>
  )
}
