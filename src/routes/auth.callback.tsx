import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: Outlet,
});
