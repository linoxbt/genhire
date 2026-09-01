import { Outlet, Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import Landing from './pages/Landing'
import Board from './pages/Board'
import PostBrief from './pages/PostBrief'
import JobDocument from './pages/JobDocument'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import About from './pages/About'
import NotFound from './pages/NotFound'

/**
 * The landing page is full-bleed - it runs edge to edge with its own dark
 * sections - so the shared container lives on this layout route rather than in
 * the shell, and every other page sits inside it.
 */
function Contained() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Outlet />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Landing />} />
        <Route element={<Contained />}>
          <Route path="/jobs" element={<Board />} />
          <Route path="/post" element={<PostBrief />} />
          <Route path="/job/:id" element={<JobDocument />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile/:address" element={<Profile />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  )
}
