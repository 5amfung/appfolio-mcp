import { createFileRoute } from '@tanstack/react-router'
import { AccountApp } from '@/components/account-app'
export const Route = createFileRoute('/sign-in')({
  component: () => <AccountApp page="sign-in" />,
})
