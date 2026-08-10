import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapNativeAuth } from "@/lib/native-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    await bootstrapNativeAuth();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login", search: { next: location.href } });
    }
    return { authUser: data.user };
  },
  component: () => <Outlet />,
});
