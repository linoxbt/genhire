import { Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import Landing from './pages/Landing'
import Board from './pages/Board'
import PostBrief from './pages/PostBrief'
import JobDocument from './pages/JobDocument'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import About from './pages/About'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Landing />} />
        <Route path="/jobs" element={<Board />} />
        <Route path="/post" element={<PostBrief />} />
        <Route path="/job/:id" element={<JobDocument />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile/:address" element={<Profile />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
