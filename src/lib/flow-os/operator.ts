import { supabase } from "@/integrations/supabase/client";

export interface FlowOperatorIdentity {
  id: string;
  name: string;
  email?: string;
}

export async function getCurrentFlowOperator(): Promise<FlowOperatorIdentity> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in required to work a Flow OS customer");
  const user = data.user;
  return {
    id: user.id,
    name:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Operator",
    email: user.email ?? undefined,
  };
}
