import { Link } from 'react-router-dom'
import { Button, EmptyState } from '../components/ui'

export default function NotFound() {
  return (
    <div className="rise mx-auto max-w-lg pt-10">
      <EmptyState
        title="No such page"
        body="Nothing is filed here. The board lists every engagement on this network."
        action={
          <Link to="/jobs">
            <Button>Go to the board</Button>
          </Link>
        }
      />
    </div>
  )
}
