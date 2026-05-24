import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
}

export function DashboardLayout({ children, title, subtitle, headerActions }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="flex items-center gap-3 p-3 sm:p-4">
              <div className="min-w-0 flex-1">
                {title && <h1 className="text-lg sm:text-xl font-bold truncate">{title}</h1>}
                {subtitle && <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>}
              </div>
              {headerActions && (
                <div className="flex items-center gap-2 shrink-0">
                  {headerActions}
                </div>
              )}
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
