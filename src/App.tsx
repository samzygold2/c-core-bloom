import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AdminLogin from "./pages/AdminLogin";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import TestTaking from "./pages/TestTaking";
import Results from "./pages/Results";
import ResultDetail from "./pages/ResultDetail";
import Admin from "./pages/Admin";
import SuperAdminLogin from "./pages/SuperAdminLogin";
import JambPractice from "./pages/JambPractice";
import SuperAdmin from "./pages/SuperAdmin";
import GoogleDrive from "./pages/GoogleDrive";
import { SiteAccessGate } from "./components/SiteAccessGate";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<SiteAccessGate area="user"><Auth /></SiteAccessGate>} />
            <Route path="/admin-login" element={<SiteAccessGate area="admin"><AdminLogin /></SiteAccessGate>} />
            <Route path="/super-admin-login" element={<SuperAdminLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/dashboard" element={<SiteAccessGate area="user"><Dashboard /></SiteAccessGate>} />
            <Route path="/test/:testId" element={<SiteAccessGate area="user"><TestTaking /></SiteAccessGate>} />
            <Route path="/results" element={<SiteAccessGate area="user"><Results /></SiteAccessGate>} />
            <Route path="/results/:resultId" element={<SiteAccessGate area="user"><ResultDetail /></SiteAccessGate>} />
            <Route path="/admin" element={<SiteAccessGate area="admin"><Admin /></SiteAccessGate>} />
            <Route path="/jamb" element={<SiteAccessGate area="user"><JambPractice /></SiteAccessGate>} />
            <Route path="/super-admin" element={<SuperAdmin />} />
            <Route path="/drive" element={<GoogleDrive />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
