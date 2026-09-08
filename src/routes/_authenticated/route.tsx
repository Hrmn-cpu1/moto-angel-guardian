import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapNativeAuth } from "@/lib/native-auth";
import { ProtectionRuntime } from "@/components/ProtectionRuntime";
import { setProtectionOwner } from "@/lib/protection-session";
import { resetTripRuntime } from "@/hooks/useTrip";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location, context }) => {
    await bootstrapNativeAuth();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login", search: { next: location.href } });
    }
    if (setProtectionOwner(data.user.id)) {
      resetTripRuntime();
      context.queryClient.clear();
    }
    return { authUser: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { authUser } = Route.useRouteContext();
  return (
    <ProtectionRuntime key={authUser.id}>
      <Outlet />
    </ProtectionRuntime>
  );
}
