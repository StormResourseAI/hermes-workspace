import { createFileRoute } from '@tanstack/react-router'

const claw3dUrl = (import.meta.env.VITE_CLAW3D_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')

function WorkroomRoute() {
  return (
    <iframe
      src={`${claw3dUrl}/office`}
      title="FRAMES Workroom"
      className="h-full min-h-[640px] w-full border-0"
      allow="fullscreen"
    />
  )
}

export const Route = createFileRoute('/workroom')({
  component: WorkroomRoute,
})
