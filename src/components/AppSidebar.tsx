import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { ClipboardList, LibraryBig, ChartColumn, HardDrive, ShieldCheck, LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { UserSettingsDialog } from '@/components/UserSettingsDialog';

export function AppSidebar() {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  // The mobile sheet always shows labels, even if the desktop rail was collapsed.
  const collapsed = state === 'collapsed' && !isMobile;

  // Close the mobile sheet once a link has been followed.
  useEffect(() => {
    setOpenMobile(false);
  }, [location.pathname, setOpenMobile]);

  const [profile, setProfile] = useState<{ firstname: string; lastname: string; avatar_url: string | null }>({
    firstname: '',
    lastname: '',
    avatar_url: null,
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('firstname, lastname, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile({
            firstname: data.firstname ?? '',
            lastname: data.lastname ?? '',
            avatar_url: data.avatar_url ?? null,
          });
        }
      });
  }, [user]);

  const displayName =
    `${profile.firstname || ''} ${profile.lastname || ''}`.trim() || user?.email?.split('@')[0] || 'User';
  const initials =
    `${profile.firstname?.[0] || ''}${profile.lastname?.[0] || ''}`.toUpperCase() ||
    (user?.email?.[0] || 'U').toUpperCase();

  const mainItems = [
    { title: 'My tests', url: '/dashboard', icon: ClipboardList },
    { title: 'JAMB past questions', url: '/jamb', icon: LibraryBig },
    { title: 'My results', url: '/results', icon: ChartColumn },
    { title: 'Google Drive', url: '/drive', icon: HardDrive },
  ];

  const adminItems = [
    { title: 'Admin panel', url: '/admin', icon: ShieldCheck },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="shrink-0 rounded-full ring-offset-background transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Avatar className="h-9 w-9 border border-border">
              <AvatarImage src={profile.avatar_url || undefined} alt={displayName} />
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                {initials || <UserIcon className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
          </button>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight truncate">{displayName}</h2>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        {isAdmin && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground px-3 mb-1">
                Administration
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent max-md:h-11"
                        activeClassName="bg-primary/10 text-primary font-medium"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground px-3 mb-1">
              Study
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent max-md:h-11"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t space-y-2">
        {!collapsed && <UserSettingsDialog triggerVariant="sidebar" />}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
          onClick={signOut}
          title="Sign out"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
