import { createFileRoute } from '@tanstack/react-router'
import { AccountApp } from '@/components/account-app'
export const Route = createFileRoute('/select-connection')({
  component: () => <AccountApp page="select-connection" />,
})
