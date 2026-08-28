import { redirect } from 'next/navigation';

// The connect flow now lives on the home dashboard.
export default function ContactsPage() {
  redirect('/dashboard');
}
