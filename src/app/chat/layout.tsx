import ChatSidebar from '@/components/ChatSidebar'

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <ChatSidebar />
      <main className="flex-1 flex flex-col h-full overflow-hidden">{children}</main>
    </div>
  )
}
