import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import TzScreen from "./App";
import Home from "./Dashboard";
import ProjectsPage from "./pages/Projects";
import MeetingsPage from "./pages/Meetings";
import SpecificationsPage from "./pages/Specifications";
import SpecificationView from "./pages/SpecificationView";
import ProjectView from "./pages/ProjectView";
import AdminPage from "./pages/Admin";
import Settings from "./Settings";
import { AuthProvider, RequireAdmin, RequireAnon, RequireAuth } from "./auth";
import Login, { Register } from "./AuthPages";
import { ConfirmHost, ToastHost } from "./ui";
import { NewMeetingHost } from "./NewMeeting";
import { CookieBanner } from "./CookieBanner";
import { AppBackground } from "./chrome";
import { applyTheme } from "./theme";
import { useLocation } from "react-router-dom";

applyTheme();

function LegacyProject() {
  const loc = useLocation();
  const id = new URLSearchParams(loc.search).get("id");
  return id ? <Navigate to={`/tz/${id}`} replace /> : <ProjectsPage />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <AppBackground />
        <Routes>
          <Route path="/login" element={<RequireAnon><Login /></RequireAnon>} />
          <Route path="/register" element={<RequireAnon><Register /></RequireAnon>} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/projects" element={<RequireAuth><LegacyProject /></RequireAuth>} />
          <Route path="/projects/:projectId" element={<RequireAuth><ProjectView /></RequireAuth>} />
          <Route path="/projects/:projectId/meetings/:meetingId" element={<RequireAuth><TzScreen /></RequireAuth>} />
          <Route path="/meetings" element={<RequireAuth><MeetingsPage /></RequireAuth>} />
          <Route path="/meetings/:id" element={<RequireAuth><TzScreen /></RequireAuth>} />
          <Route path="/tz" element={<RequireAuth><SpecificationsPage /></RequireAuth>} />
          <Route path="/tz/:id" element={<RequireAuth><TzScreen /></RequireAuth>} />
          <Route path="/tz/:id/doc" element={<RequireAuth><SpecificationView /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminPage /></RequireAdmin></RequireAuth>} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
        <ToastHost />
        <ConfirmHost />
        <NewMeetingHost />
        <CookieBanner />
      </AuthProvider>
    </HashRouter>
  </StrictMode>
);
