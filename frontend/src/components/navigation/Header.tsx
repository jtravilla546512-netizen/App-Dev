import { useState } from 'react'
import { Search, Bell, ChevronDown, LogOut, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useMarkAllNotificationsRead, useNotifications } from '@/hooks/useNotifications'

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  circulation: 'Circulation desk',
  'all-books': 'All Books',
  'add-book': 'Add Book',
  'book-details': 'Book Details',
  categories: 'Categories',
  pending: 'Pending Requests',
  approved: 'Approved Requests',
  borrowed: 'Currently Borrowed',
  returned: 'Returned Books',
  overdue: 'Overdue Books',
  transactions: 'All Transactions',
  users: 'User Management',
  reports: 'Reports',
  notifications: 'Notifications',
  profile: 'Profile',
}

export default function Header({ page, onPage, onLogout }: { page: string; onPage: (p: string) => void; onLogout: () => void }) {
  const { user } = useAuth()
  const [showProfile, setShowProfile] = useState(false)
  const [showNotif, setShowNotif] = useState(false)
  const notificationsQuery = useNotifications(5)
  const markAll = useMarkAllNotificationsRead()
  const notifications = notificationsQuery.data?.data ?? []
  const unread = notificationsQuery.data?.meta?.unread_count ?? 0

  return (
    <header className="bg-white border-b border-[#D9D9D9] px-6 py-3.5 flex items-center gap-4 sticky top-0 z-30">
      {/* Title & breadcrumb */}
      <div className="flex-1 pl-8 lg:pl-0">
        <h2 className="text-base font-semibold text-[#1A1A2E]">{pageTitles[page] ?? page}</h2>
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <span>Home</span>
          <span>/</span>
          <span className="text-[#C72C41]">{pageTitles[page] ?? page}</span>
        </div>
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-[#F5F5F5] border border-[#D9D9D9] rounded-lg px-3 py-2 w-56">
        <Search size={15} className="text-gray-400 shrink-0" />
        <input className="bg-transparent text-sm outline-none w-full placeholder:text-gray-400" placeholder="Search..." />
      </div>

      {/* Notifications */}
      <div className="relative">
        <button aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={showNotif} onClick={() => { setShowNotif(v => !v); setShowProfile(false) }} className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <Bell size={18} className="text-gray-600" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-[#C72C41] text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unread}</span>
          )}
        </button>
        {showNotif && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-[#D9D9D9] rounded-xl shadow-xl z-50">
            <div className="px-4 py-3 border-b border-[#D9D9D9] flex items-center justify-between">
              <span className="font-semibold text-sm">Notifications</span>
              <button disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()} className="text-xs text-[#C72C41] font-medium disabled:opacity-40">Mark all read</button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 border-b border-gray-50 last:border-0 text-sm ${!n.is_read ? 'bg-red-50/30' : ''}`}>
                  <p className="text-[#1A1A2E] leading-snug">{n.message}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(n.created_at))}</p>
                </div>
              ))}
              {!notificationsQuery.isLoading && notifications.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">No notifications.</p>}
            </div>
            <div className="px-4 py-2.5 text-center">
              <button onClick={() => { onPage('notifications'); setShowNotif(false) }} className="text-xs text-[#C72C41] font-medium">View all notifications</button>
            </div>
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="relative">
        <button aria-label="Open account menu" aria-expanded={showProfile} onClick={() => { setShowProfile(v => !v); setShowNotif(false) }} className="flex items-center gap-2.5 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors">
          <div className="w-8 h-8 rounded-full bg-[#A50034] text-white flex items-center justify-center text-xs font-semibold" aria-hidden="true">
            {user?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() ?? 'AD'}
          </div>
          <div className="hidden md:block text-left">
            <div className="text-sm font-medium text-[#1A1A2E] leading-tight">{user?.name ?? 'Administrator'}</div>
            <div className="text-xs text-gray-400">Admin / Librarian</div>
          </div>
          <ChevronDown size={14} className="text-gray-400" />
        </button>
        {showProfile && (
          <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-[#D9D9D9] rounded-xl shadow-xl z-50 py-1">
            <button onClick={() => { onPage('profile'); setShowProfile(false) }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              <User size={15} /> View Profile
            </button>
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                <LogOut size={15} /> Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
