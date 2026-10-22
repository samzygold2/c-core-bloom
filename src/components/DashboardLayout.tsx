import { Menu, PanelLeft } from 'lucide-react';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Button } from '@/components/ui/button';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
}

// Lives inside SidebarProvider so it can open the sidebar. On phones the
// sidebar is an off-canvas sheet, so this button is the only way to reach it.
function SidebarToggle() {
  const { toggleSidebar, isMobile, openMobile, open } = useSidebar();
  const Icon = isMobile ? Menu : PanelLeft;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      aria-label={isMobile ? 'Open menu' : open ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-expanded={isMobile ? openMobile : open}
      className="-ml-2 h-11 w-11 shrink-0 md:h-9 md:w-9"
    >
      <Icon className="h-5 w-5" />
    </Button>
  );
}

export function DashboardLayout({ children, title, subtitle, headerActions }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
            <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 lg:px-8">
              <SidebarToggle />
              <div className="min-w-0 flex-1">
                {title && <h1 className="text-base sm:text-xl font-bold leading-tight truncate">{title}</h1>}
                {subtitle && <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>}
              </div>
              {headerActions && (
                <div className="flex items-center gap-2 shrink-0">
                  {headerActions}
                </div>
              )}
            </div>
          </header>
          <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
