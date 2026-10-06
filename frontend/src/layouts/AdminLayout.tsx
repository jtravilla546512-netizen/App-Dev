import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from '@/components/navigation/Sidebar'
import Header from '@/components/navigation/Header'
import RequiredPasswordChange from '@/components/auth/RequiredPasswordChange'
import { useAuth } from '@/contexts/AuthContext'
import Dashboard from '@/pages/Admin/Dashboard'
import { AllBooks, AddBook, BookDetails } from '@/pages/Admin/Books'
import Categories from '@/pages/Admin/Categories'
import { AllTransactions, BorrowedBooks, OverdueBooks, ReturnedBooks } from '@/pages/Admin/BorrowManagement'
import { ApprovedRequests, PendingRequests } from '@/pages/Admin/BorrowRequests'
import Users from '@/pages/Admin/Users'
import Reports from '@/pages/Admin/Reports'
import Notifications from '@/pages/Admin/Notifications'
import Profile from '@/pages/Admin/Profile'
import Circulation from '@/pages/Admin/Circulation'

const pageRoutes: Record<string, string> = {
  dashboard: '/',
  circulation: '/circulation',
  'all-books': '/books',
  'add-book': '/books/new',
  categories: '/categories',
  pending: '/borrowing/pending',
  approved: '/borrowing/approved',
  borrowed: '/borrowing/current',
  returned: '/borrowing/returned',
  overdue: '/borrowing/overdue',
  transactions: '/borrowing/transactions',
  users: '/users',
  reports: '/reports',
  notifications: '/notifications',
  profile: '/profile',
}

function pageFromPath(pathname: string): string {
  if (/^\/books\/\d+\/edit$/.test(pathname)) return 'add-book'
  if (/^\/books\/\d+$/.test(pathname)) return 'book-details'
  return Object.entries(pageRoutes).find(([, path]) => path === pathname)?.[0] ?? 'dashboard'
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, user } = useAuth()
  const page = pageFromPath(location.pathname)
  const onPage = (target: string) => navigate(pageRoutes[target] ?? '/')
  const onLogout = () => void logout().finally(() => navigate('/login', { replace: true }))

  return (
    <div className="flex h-screen bg-[#F5F5F5] overflow-hidden">
      {user?.must_change_password && <RequiredPasswordChange />}
      <Sidebar page={page} onPage={onPage} onLogout={onLogout} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header page={page} onPage={onPage} onLogout={onLogout} />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route index element={<Dashboard onPage={onPage} />} />
            <Route path="circulation" element={<Circulation />} />
            <Route path="books" element={<AllBooks />} />
            <Route path="books/new" element={<AddBook />} />
            <Route path="books/:bookId" element={<BookDetails />} />
            <Route path="books/:bookId/edit" element={<AddBook />} />
            <Route path="categories" element={<Categories />} />
            <Route path="borrowing/pending" element={<PendingRequests />} />
            <Route path="borrowing/current" element={<BorrowedBooks />} />
            <Route path="borrowing/overdue" element={<OverdueBooks />} />
            <Route path="borrowing/approved" element={<ApprovedRequests />} />
            <Route path="borrowing/returned" element={<ReturnedBooks />} />
            <Route path="borrowing/transactions" element={<AllTransactions />} />
            <Route path="users" element={<Users />} />
            <Route path="reports" element={<Reports />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile onLogout={onLogout} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
